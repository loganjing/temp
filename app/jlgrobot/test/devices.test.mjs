import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerPublicRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'
import { withQaEnvironment } from './fixtures/qa-environment.mjs'

// 业务 API 验证：使用隔离数据库、真实 Hono app 与真实 HTTP 监听。
async function withBusinessApp(verify) {
  await withQaEnvironment(async () => {
    const platform = await initializePlatform()
    try {
      const app = createApp({
        registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
      })
      await withHttpServer(app, verify)
    } finally {
      await platform.close()
    }
  })
}

test('devices: create, list, get, update status persist across reads', async () => {
  await withBusinessApp(async (url) => {
    const created = await fetch(`${url}/api/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Robot-A', model: 'RX-1' }),
    })
    assert.equal(created.status, 201)
    const device = await created.json()
    assert.equal(device.name, 'Robot-A')
    assert.equal(device.model, 'RX-1')
    assert.equal(device.current_status, 'unknown')
    assert.ok(device.id)

    const list = await fetch(`${url}/api/devices`)
    assert.equal(list.status, 200)
    const { devices } = await list.json()
    assert.equal(devices.length, 1)
    assert.equal(devices[0].id, device.id)

    const detail = await fetch(`${url}/api/devices/${device.id}`)
    assert.equal(detail.status, 200)
    assert.deepEqual(await detail.json(), device)

    const patched = await fetch(`${url}/api/devices/${device.id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current_status: 'running' }),
    })
    assert.equal(patched.status, 200)
    const updated = await patched.json()
    assert.equal(updated.current_status, 'running')
    assert.notEqual(updated.updated_at, device.updated_at)
  })
})

test('devices: validation and not-found errors', async () => {
  await withBusinessApp(async (url) => {
    const noName = await fetch(`${url}/api/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    })
    assert.equal(noName.status, 400)
    assert.deepEqual(await noName.json(), { error: { code: 'VALIDATION_ERROR', message: 'name is required' } })

    const missing = await fetch(`${url}/api/devices/no-such-id`)
    assert.equal(missing.status, 404)
    assert.deepEqual(await missing.json(), { error: { code: 'NOT_FOUND', message: 'device not found' } })

    const emptyStatus = await fetch(`${url}/api/devices/no-such-id/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(emptyStatus.status, 404)
  })
})

test('faults: create and list for a device, with 404 on unknown device', async () => {
  await withBusinessApp(async (url) => {
    const device = await (await fetch(`${url}/api/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Robot-B' }),
    })).json()

    const created = await fetch(`${url}/api/devices/${device.id}/faults`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fault_description: '轮轴异响', diagnosis_result: '轴承磨损' }),
    })
    assert.equal(created.status, 201)
    const fault = await created.json()
    assert.equal(fault.device_id, device.id)
    assert.equal(fault.fault_description, '轮轴异响')
    assert.equal(fault.diagnosis_result, '轴承磨损')

    const list = await fetch(`${url}/api/devices/${device.id}/faults`)
    assert.equal(list.status, 200)
    const { faults } = await list.json()
    assert.equal(faults.length, 1)
    assert.equal(faults[0].id, fault.id)

    const missingDevice = await fetch(`${url}/api/devices/unknown/faults`)
    assert.equal(missingDevice.status, 404)

    const badBody = await fetch(`${url}/api/devices/${device.id}/faults`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(badBody.status, 400)
  })
})

test('upgrades: create defaults to pending and lists', async () => {
  await withBusinessApp(async (url) => {
    const device = await (await fetch(`${url}/api/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Robot-C' }),
    })).json()

    const created = await fetch(`${url}/api/devices/${device.id}/upgrades`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target_version: '2.4.0' }),
    })
    assert.equal(created.status, 201)
    const upgrade = await created.json()
    assert.equal(upgrade.target_version, '2.4.0')
    assert.equal(upgrade.status, 'pending')
    assert.equal(upgrade.result, null)
    assert.equal(upgrade.completed_at, null)

    const list = await fetch(`${url}/api/devices/${device.id}/upgrades`)
    assert.equal(list.status, 200)
    const { upgrades } = await list.json()
    assert.equal(upgrades.length, 1)

    const bad = await fetch(`${url}/api/devices/${device.id}/upgrades`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target_version: '' }),
    })
    assert.equal(bad.status, 400)
  })
})

test('work-orders: create defaults to open and lists', async () => {
  await withBusinessApp(async (url) => {
    const device = await (await fetch(`${url}/api/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Robot-D' }),
    })).json()

    const created = await fetch(`${url}/api/devices/${device.id}/work-orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '更换伺服电机', result: '恢复正常' }),
    })
    assert.equal(created.status, 201)
    const order = await created.json()
    assert.equal(order.content, '更换伺服电机')
    assert.equal(order.status, 'open')

    const list = await fetch(`${url}/api/devices/${device.id}/work-orders`)
    assert.equal(list.status, 200)
    const { work_orders } = await list.json()
    assert.equal(work_orders.length, 1)

    const bad = await fetch(`${url}/api/devices/${device.id}/work-orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '' }),
    })
    assert.equal(bad.status, 400)
  })
})

test('history: aggregates fault, upgrade, work_order and status events sorted desc', async () => {
  await withBusinessApp(async (url) => {
    const device = await (await fetch(`${url}/api/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Robot-E', current_status: 'standby' }),
    })).json()

    await fetch(`${url}/api/devices/${device.id}/faults`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fault_description: '过热告警' }),
    })
    await fetch(`${url}/api/devices/${device.id}/upgrades`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target_version: '3.0.0' }),
    })
    await fetch(`${url}/api/devices/${device.id}/work-orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '校准传感器' }),
    })
    await fetch(`${url}/api/devices/${device.id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current_status: 'fault' }),
    })

    const res = await fetch(`${url}/api/devices/${device.id}/history`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.device.id, device.id)
    const types = body.events.map((e) => e.event_type).sort()
    assert.deepEqual(types, ['fault', 'status', 'upgrade', 'work_order'])

    // 按 timestamp 降序
    for (let i = 1; i < body.events.length; i++) {
      assert.ok(body.events[i - 1].timestamp >= body.events[i].timestamp)
    }

    const statusEvent = body.events.find((e) => e.event_type === 'status')
    assert.ok(statusEvent.summary.includes('fault'))

    const missing = await fetch(`${url}/api/devices/unknown/history`)
    assert.equal(missing.status, 404)
  })
})

test('history: empty device returns only the status event', async () => {
  await withBusinessApp(async (url) => {
    const device = await (await fetch(`${url}/api/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Robot-F' }),
    })).json()
    const res = await fetch(`${url}/api/devices/${device.id}/history`)
    const body = await res.json()
    assert.equal(body.events.length, 1)
    assert.equal(body.events[0].event_type, 'status')
  })
})
