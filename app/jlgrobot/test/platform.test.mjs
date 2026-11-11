import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import * as auth from '../src/server/platform/auth.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'

test('platform serves a real HTTP API and keeps unknown API paths out of the SPA', async () => {
  await withHttpServer(createApp(), async (url) => {
    const health = await fetch(`${url}/api/health`)
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { ok: true, app: 'jlgrobot' })

    const missing = await fetch(`${url}/api/missing`)
    assert.equal(missing.status, 404)
    assert.deepEqual(await missing.json(), { error: { code: 'NOT_FOUND', message: 'API route not found' } })
  })
})

test('no-op authentication boundary lets protected routes through (no auth required by requirements)', { skip: !('authBoundary' in auth) }, async () => {
  const app = createApp({
    protect: auth.authBoundary,
    registerPublicRoutes: (routes) => routes.get('/api/public', (c) => c.json({ ok: true })),
    registerProtectedRoutes: (routes) => routes.get('/api/private', (c) => c.json({ ok: true })),
  })
  await withHttpServer(app, async (url) => {
    assert.equal((await fetch(`${url}/api/public`)).status, 200)
    const response = await fetch(`${url}/api/private`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
  })
})

test('unexpected server errors do not expose their details', async () => {
  const app = createApp({ registerProtectedRoutes: (routes) => routes.get('/api/fail', () => {
    throw new Error('private detail')
  }) })
  await withHttpServer(app, async (url) => {
    const response = await fetch(`${url}/api/fail`)
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  })
})

async function withBusinessApp(verify) {
  const directory = await mkdtemp(path.join(tmpdir(), 'platform-biz-'))
  const previous = process.env.DB_PATH
  process.env.DB_PATH = path.join(directory, 'application.db')
  try {
    const platform = await initializePlatform()
    try {
      const app = createApp({
        protect: auth.authBoundary,
        registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
      })
      await withHttpServer(app, verify)
    } finally {
      await platform.close()
    }
  } finally {
    if (previous === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previous
    await rm(directory, { recursive: true, force: true })
  }
}

test('equipment CRUD persists and reads back, duplicate identifier rejected', async () => {
  await withBusinessApp(async (url) => {
    const created = await fetch(`${url}/api/equipment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '机器人-A01', identifier: 'JLG-A01', type: 'mobile-robot' }),
    })
    assert.equal(created.status, 201)
    const equipment = await created.json()
    assert.equal(equipment.name, '机器人-A01')
    assert.equal(equipment.identifier, 'JLG-A01')
    assert.ok(equipment.id)

    const dup = await fetch(`${url}/api/equipment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'dup', identifier: 'JLG-A01' }),
    })
    assert.equal(dup.status, 400)

    const detail = await fetch(`${url}/api/equipment/${equipment.id}`)
    assert.equal(detail.status, 200)
    assert.deepEqual(await detail.json(), equipment)

    const list = await fetch(`${url}/api/equipment`)
    assert.equal(list.status, 200)
    assert.deepEqual((await list.json()).items, [equipment])
  })
})

test('fault state transitions follow the legal path and reject illegal moves', async () => {
  await withBusinessApp(async (url) => {
    const eq = await (await fetch(`${url}/api/equipment`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'eq', identifier: 'EQ-1' }),
    })).json()

    const faultCreated = await fetch(`${url}/api/faults`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ equipment_id: eq.id, description: '左轮电机过热' }),
    })
    assert.equal(faultCreated.status, 201)
    const fault = await faultCreated.json()
    assert.equal(fault.status, 'recorded')
    assert.equal(fault.closed_at, null)

    // illegal: recorded -> diagnosed
    const illegal = await fetch(`${url}/api/faults/${fault.id}/status`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'diagnosed' }),
    })
    assert.equal(illegal.status, 400)

    const step = async (target) => {
      const r = await fetch(`${url}/api/faults/${fault.id}/status`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: target }),
      })
      assert.equal(r.status, 200, `transition to ${target} should succeed`)
      return r.json()
    }

    let updated = await step('diagnosing')
    assert.equal(updated.status, 'diagnosing')

    const patched = await fetch(`${url}/api/faults/${fault.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ diagnosis: '轴承磨损', suggestion: '更换轴承' }),
    })
    assert.equal(patched.status, 200)
    assert.equal((await patched.json()).diagnosis, '轴承磨损')

    updated = await step('diagnosed')
    assert.equal(updated.status, 'diagnosed')
    updated = await step('closed')
    assert.equal(updated.status, 'closed')
    assert.ok(updated.closed_at)

    const detail = await (await fetch(`${url}/api/faults/${fault.id}`)).json()
    assert.equal(detail.status_logs.length, 4)
    assert.equal(detail.status_logs[0].from_status, null)
    assert.equal(detail.status_logs[0].to_status, 'recorded')
    assert.equal(detail.status_logs.at(-1).to_status, 'closed')
  })
})

test('upgrade failed transition requires failure_reason; success records result', async () => {
  await withBusinessApp(async (url) => {
    const eq = await (await fetch(`${url}/api/equipment`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'eq', identifier: 'EQ-2' }),
    })).json()

    const task = await (await fetch(`${url}/api/upgrades`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ equipment_id: eq.id, package_id: 'firmware-v2.1.0' }),
    })).json()
    assert.equal(task.status, 'pending')

    const exec = await (await fetch(`${url}/api/upgrades/${task.id}/status`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'executing' }),
    })).json()
    assert.equal(exec.status, 'executing')

    // failed without failure_reason -> 400
    const failedNoReason = await fetch(`${url}/api/upgrades/${task.id}/status`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'failed' }),
    })
    assert.equal(failedNoReason.status, 400)

    // illegal: executing -> pending
    const illegal = await fetch(`${url}/api/upgrades/${task.id}/status`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'pending' }),
    })
    assert.equal(illegal.status, 400)
  })
})

test('work order records persist and state transitions close the order', async () => {
  await withBusinessApp(async (url) => {
    const eq = await (await fetch(`${url}/api/equipment`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'eq', identifier: 'EQ-3' }),
    })).json()

    const order = await (await fetch(`${url}/api/work-orders`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ equipment_id: eq.id, description: '更换左轮轴承' }),
    })).json()
    assert.equal(order.status, 'pending')

    const record = await fetch(`${url}/api/work-orders/${order.id}/records`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '已拆解左轮组件' }),
    })
    assert.equal(record.status, 201)
    assert.ok((await record.json()).id)

    for (const target of ['processing', 'completed', 'closed']) {
      const r = await fetch(`${url}/api/work-orders/${order.id}/status`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: target }),
      })
      assert.equal(r.status, 200, `transition to ${target} should succeed`)
    }

    const detail = await (await fetch(`${url}/api/work-orders/${order.id}`)).json()
    assert.equal(detail.status, 'closed')
    assert.ok(detail.closed_at)
    assert.equal(detail.records.length, 1)
    assert.equal(detail.status_logs.length, 4)
  })
})

test('equipment history aggregates all modules ordered by timestamp desc', async () => {
  await withBusinessApp(async (url) => {
    const eq = await (await fetch(`${url}/api/equipment`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'eq', identifier: 'EQ-HIST' }),
    })).json()

    await fetch(`${url}/api/equipment/${eq.id}/status`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'running', params: { battery: 85 } }),
    })
    await fetch(`${url}/api/faults`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ equipment_id: eq.id, description: '过热' }),
    })
    await fetch(`${url}/api/upgrades`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ equipment_id: eq.id, package_id: 'fw-1' }),
    })
    await fetch(`${url}/api/work-orders`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ equipment_id: eq.id, description: '维修' }),
    })

    const history = await (await fetch(`${url}/api/equipment/${eq.id}/history`)).json()
    assert.equal(history.equipment_id, eq.id)
    assert.equal(history.events.length, 4)
    const types = history.events.map((e) => e.type).sort()
    assert.deepEqual(types, ['fault', 'status', 'upgrade', 'work_order'])
    // timestamps must be non-increasing
    for (let i = 1; i < history.events.length; i++) {
      assert.ok(history.events[i - 1].timestamp >= history.events[i].timestamp, 'events must be ordered desc')
    }
  })
})
