import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'
import { authBoundary } from '../src/server/platform/auth.ts'

async function setupApp() {
  const dir = await mkdtemp(path.join(tmpdir(), 'api-test-'))
  const previous = process.env.DB_PATH
  process.env.DB_PATH = path.join(dir, 'test.db')
  const platform = await initializePlatform()
  const app = createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    protect: authBoundary,
  })
  const cleanup = async () => {
    await platform.close()
    if (previous === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previous
    await rm(dir, { recursive: true, force: true })
  }
  return { app, platform, cleanup }
}

function req(url, options = {}) {
  return new Request(url, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } })
}

test('M1: list devices returns seed data', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const res = await app.fetch(req('http://localhost/api/devices'))
    assert.equal(res.status, 200)
    const devices = await res.json()
    assert.ok(Array.isArray(devices))
    assert.equal(devices.length, 3)
    assert.ok(devices.every((d) => typeof d.id === 'string' && typeof d.statusUpdatedAt === 'string'))
  } finally {
    await cleanup()
  }
})

test('M1: get device detail by id', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const list = await (await app.fetch(req('http://localhost/api/devices'))).json()
    const id = list[0].id
    const res = await app.fetch(req(`http://localhost/api/devices/${id}`))
    assert.equal(res.status, 200)
    const device = await res.json()
    assert.equal(device.id, id)
    assert.equal(device.name, list[0].name)
  } finally {
    await cleanup()
  }
})

test('M1: get non-existent device returns 404', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const res = await app.fetch(req('http://localhost/api/devices/nonexistent-id'))
    assert.equal(res.status, 404)
    const body = await res.json()
    assert.equal(body.error, 'not_found')
    assert.equal(body.message, '设备不存在')
  } finally {
    await cleanup()
  }
})

test('M1: update device status writes history', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const list = await (await app.fetch(req('http://localhost/api/devices'))).json()
    const id = list[0].id
    const res = await app.fetch(
      req(`http://localhost/api/devices/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'fault' }) }),
    )
    assert.equal(res.status, 200)
    const device = await res.json()
    assert.equal(device.status, 'fault')
    assert.notEqual(device.statusUpdatedAt, list[0].statusUpdatedAt)

    const histRes = await app.fetch(req(`http://localhost/api/devices/${id}/history`))
    const history = await histRes.json()
    assert.ok(history.some((h) => h.eventType === 'status_change'))
  } finally {
    await cleanup()
  }
})

test('M1: invalid status returns 400', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const list = await (await app.fetch(req('http://localhost/api/devices'))).json()
    const res = await app.fetch(
      req(`http://localhost/api/devices/${list[0].id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'bogus' }) }),
    )
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'invalid_status')
  } finally {
    await cleanup()
  }
})

test('M2: create fault diagnosis and list', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const list = await (await app.fetch(req('http://localhost/api/devices'))).json()
    const deviceId = list[0].id
    const createRes = await app.fetch(
      req(`http://localhost/api/devices/${deviceId}/fault-diagnoses`, {
        method: 'POST',
        body: JSON.stringify({ description: '主轴异响' }),
      }),
    )
    assert.equal(createRes.status, 201)
    const diagnosis = await createRes.json()
    assert.equal(diagnosis.deviceId, deviceId)
    assert.equal(diagnosis.description, '主轴异响')
    assert.ok(diagnosis.id)
    assert.ok(diagnosis.diagnosedAt)

    const listRes = await app.fetch(req(`http://localhost/api/devices/${deviceId}/fault-diagnoses`))
    assert.equal(listRes.status, 200)
    const diagnoses = await listRes.json()
    assert.equal(diagnoses.length, 1)
    assert.equal(diagnoses[0].id, diagnosis.id)
  } finally {
    await cleanup()
  }
})

test('M2: empty description returns 400', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const list = await (await app.fetch(req('http://localhost/api/devices'))).json()
    const res = await app.fetch(
      req(`http://localhost/api/devices/${list[0].id}/fault-diagnoses`, {
        method: 'POST',
        body: JSON.stringify({ description: '' }),
      }),
    )
    assert.equal(res.status, 400)
    assert.equal((await res.json()).error, 'invalid_input')
  } finally {
    await cleanup()
  }
})

test('M3: create upgrade task and transition pending→executing→success', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const list = await (await app.fetch(req('http://localhost/api/devices'))).json()
    const deviceId = list[0].id
    const createRes = await app.fetch(
      req(`http://localhost/api/devices/${deviceId}/upgrade-tasks`, {
        method: 'POST',
        body: JSON.stringify({ packageId: 'firmware-v2.1' }),
      }),
    )
    assert.equal(createRes.status, 201)
    const task = await createRes.json()
    assert.equal(task.status, 'pending')
    assert.equal(task.completedAt, null)

    const execRes = await app.fetch(
      req(`http://localhost/api/upgrade-tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'executing' }) }),
    )
    assert.equal(execRes.status, 200)
    assert.equal((await execRes.json()).status, 'executing')

    const successRes = await app.fetch(
      req(`http://localhost/api/upgrade-tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'success' }) }),
    )
    assert.equal(successRes.status, 200)
    const final = await successRes.json()
    assert.equal(final.status, 'success')
    assert.ok(final.completedAt)
  } finally {
    await cleanup()
  }
})

test('M3: cannot skip executing (pending→success rejected)', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const list = await (await app.fetch(req('http://localhost/api/devices'))).json()
    const createRes = await app.fetch(
      req(`http://localhost/api/devices/${list[0].id}/upgrade-tasks`, {
        method: 'POST',
        body: JSON.stringify({ packageId: 'fw-1.0' }),
      }),
    )
    const task = await createRes.json()
    const res = await app.fetch(
      req(`http://localhost/api/upgrade-tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'success' }) }),
    )
    assert.equal(res.status, 400)
    assert.equal((await res.json()).error, 'invalid_status')
  } finally {
    await cleanup()
  }
})

test('M3: terminal state cannot regress (success→executing rejected)', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const list = await (await app.fetch(req('http://localhost/api/devices'))).json()
    const createRes = await app.fetch(
      req(`http://localhost/api/devices/${list[0].id}/upgrade-tasks`, {
        method: 'POST',
        body: JSON.stringify({ packageId: 'fw-1.0' }),
      }),
    )
    const task = await createRes.json()
    await app.fetch(req(`http://localhost/api/upgrade-tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'executing' }) }))
    await app.fetch(req(`http://localhost/api/upgrade-tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'success' }) }))
    const res = await app.fetch(
      req(`http://localhost/api/upgrade-tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'executing' }) }),
    )
    assert.equal(res.status, 400)
  } finally {
    await cleanup()
  }
})

test('M4: create maintenance order and transition pending→processing→completed', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const list = await (await app.fetch(req('http://localhost/api/devices'))).json()
    const deviceId = list[0].id
    const createRes = await app.fetch(
      req('http://localhost/api/maintenance-orders', {
        method: 'POST',
        body: JSON.stringify({ deviceId, faultDescription: '传送带卡顿', technician: '张三' }),
      }),
    )
    assert.equal(createRes.status, 201)
    const order = await createRes.json()
    assert.equal(order.status, 'pending')
    assert.equal(order.technician, '张三')

    const procRes = await app.fetch(
      req(`http://localhost/api/maintenance-orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'processing' }) }),
    )
    assert.equal(procRes.status, 200)
    assert.equal((await procRes.json()).status, 'processing')

    const doneRes = await app.fetch(
      req(`http://localhost/api/maintenance-orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) }),
    )
    assert.equal(doneRes.status, 200)
    assert.equal((await doneRes.json()).status, 'completed')
  } finally {
    await cleanup()
  }
})

test('M4: completed order cannot regress', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const list = await (await app.fetch(req('http://localhost/api/devices'))).json()
    const createRes = await app.fetch(
      req('http://localhost/api/maintenance-orders', {
        method: 'POST',
        body: JSON.stringify({ deviceId: list[0].id, faultDescription: '测试' }),
      }),
    )
    const order = await createRes.json()
    await app.fetch(req(`http://localhost/api/maintenance-orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'processing' }) }))
    await app.fetch(req(`http://localhost/api/maintenance-orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) }))
    const res = await app.fetch(
      req(`http://localhost/api/maintenance-orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'processing' }) }),
    )
    assert.equal(res.status, 400)
  } finally {
    await cleanup()
  }
})

test('M4: list maintenance orders with deviceId filter', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const list = await (await app.fetch(req('http://localhost/api/devices'))).json()
    const deviceId = list[0].id
    await app.fetch(
      req('http://localhost/api/maintenance-orders', {
        method: 'POST',
        body: JSON.stringify({ deviceId, faultDescription: '工单1' }),
      }),
    )
    const filterRes = await app.fetch(req(`http://localhost/api/maintenance-orders?deviceId=${deviceId}`))
    assert.equal(filterRes.status, 200)
    const orders = await filterRes.json()
    assert.equal(orders.length, 1)
    assert.equal(orders[0].deviceId, deviceId)
  } finally {
    await cleanup()
  }
})

test('M4: get non-existent order returns 404', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const res = await app.fetch(req('http://localhost/api/maintenance-orders/nonexistent'))
    assert.equal(res.status, 404)
    assert.equal((await res.json()).error, 'not_found')
  } finally {
    await cleanup()
  }
})

test('M5: equipment history aggregates all event types', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const list = await (await app.fetch(req('http://localhost/api/devices'))).json()
    const deviceId = list[0].id

    // status change
    await app.fetch(req(`http://localhost/api/devices/${deviceId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'fault' }) }))
    // fault diagnosis
    await app.fetch(req(`http://localhost/api/devices/${deviceId}/fault-diagnoses`, { method: 'POST', body: JSON.stringify({ description: '异响' }) }))
    // upgrade task create + transition
    const utRes = await app.fetch(req(`http://localhost/api/devices/${deviceId}/upgrade-tasks`, { method: 'POST', body: JSON.stringify({ packageId: 'fw-1' }) }))
    const ut = await utRes.json()
    await app.fetch(req(`http://localhost/api/upgrade-tasks/${ut.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'executing' }) }))
    // maintenance order create + transition
    const moRes = await app.fetch(req('http://localhost/api/maintenance-orders', { method: 'POST', body: JSON.stringify({ deviceId, faultDescription: '维修' }) }))
    const mo = await moRes.json()
    await app.fetch(req(`http://localhost/api/maintenance-orders/${mo.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'processing' }) }))

    const histRes = await app.fetch(req(`http://localhost/api/devices/${deviceId}/history`))
    assert.equal(histRes.status, 200)
    const history = await histRes.json()
    assert.ok(Array.isArray(history))
    const types = new Set(history.map((h) => h.eventType))
    assert.ok(types.has('status_change'))
    assert.ok(types.has('fault_diagnosis'))
    assert.ok(types.has('remote_upgrade'))
    assert.ok(types.has('maintenance_order'))

    // verify descending order
    for (let i = 1; i < history.length; i++) {
      assert.ok(history[i - 1].occurredAt >= history[i].occurredAt, 'history should be descending by occurredAt')
    }
  } finally {
    await cleanup()
  }
})

test('M5: history for non-existent device returns 404', async () => {
  const { app, cleanup } = await setupApp()
  try {
    const res = await app.fetch(req('http://localhost/api/devices/nonexistent/history'))
    assert.equal(res.status, 404)
  } finally {
    await cleanup()
  }
})

test('AC-06: data persists across platform restart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'persist-test-'))
  const dbPath = path.join(dir, 'persist.db')
  const previous = process.env.DB_PATH
  process.env.DB_PATH = dbPath
  try {
    // First boot: create a fault diagnosis
    const p1 = await initializePlatform()
    const app1 = createApp({
      registerPublicRoutes: (routes) => registerPublicRoutes(routes, p1),
      registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, p1),
      protect: authBoundary,
    })
    const list = await (await app1.fetch(req('http://localhost/api/devices'))).json()
    const deviceId = list[0].id
    const createRes = await app1.fetch(
      req(`http://localhost/api/devices/${deviceId}/fault-diagnoses`, {
        method: 'POST',
        body: JSON.stringify({ description: '重启前记录' }),
      }),
    )
    assert.equal(createRes.status, 201)
    const created = await createRes.json()
    await p1.close()

    // Second boot: verify data survives
    const p2 = await initializePlatform()
    const app2 = createApp({
      registerPublicRoutes: (routes) => registerPublicRoutes(routes, p2),
      registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, p2),
      protect: authBoundary,
    })
    const listRes = await app2.fetch(req(`http://localhost/api/devices/${deviceId}/fault-diagnoses`))
    assert.equal(listRes.status, 200)
    const diagnoses = await listRes.json()
    assert.equal(diagnoses.length, 1)
    assert.equal(diagnoses[0].id, created.id)
    assert.equal(diagnoses[0].description, '重启前记录')
    await p2.close()
  } finally {
    if (previous === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previous
    await rm(dir, { recursive: true, force: true })
  }
})
