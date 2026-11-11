import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'

async function withApiEnvironment(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'k12-api-'))
  const previous = process.env.DB_PATH
  process.env.DB_PATH = path.join(directory, 'application.db')
  const platform = await initializePlatform()
  const app = createApp({
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  })
  try {
    await withHttpServer({ fetch: app.fetch, close: () => platform.close() }, async (baseUrl) => {
      await run(baseUrl)
    })
  } finally {
    if (previous === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previous
    await rm(directory, { recursive: true, force: true })
  }
}

async function json(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return { status: response.status, body: await response.json().catch(() => undefined) }
}

test('device CRUD and status update marks abnormal on error', async () => {
  await withApiEnvironment(async (baseUrl) => {
    const created = await json('POST', `${baseUrl}/api/devices`, { name: 'Robot-A', model: 'X1' })
    assert.equal(created.status, 201)
    assert.equal(created.body.name, 'Robot-A')
    assert.equal(created.body.model, 'X1')
    assert.equal(created.body.onlineStatus, 'offline')
    assert.equal(created.body.runningStatus, 'idle')
    assert.equal(created.body.isAbnormal, false)
    const deviceId = created.body.id

    const list = await json('GET', `${baseUrl}/api/devices`)
    assert.equal(list.status, 200)
    assert.equal(list.body.length, 1)
    assert.equal(list.body[0].id, deviceId)

    const one = await json('GET', `${baseUrl}/api/devices/${deviceId}`)
    assert.equal(one.status, 200)
    assert.equal(one.body.id, deviceId)

    const missing = await json('GET', `${baseUrl}/api/devices/00000000-0000-0000-0000-000000000000`)
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error.code, 'not_found')

    const updated = await json('PATCH', `${baseUrl}/api/devices/${deviceId}/status`, {
      onlineStatus: 'online',
      runningStatus: 'error',
    })
    assert.equal(updated.status, 200)
    assert.equal(updated.body.onlineStatus, 'online')
    assert.equal(updated.body.runningStatus, 'error')
    assert.equal(updated.body.isAbnormal, true)

    const recovered = await json('PATCH', `${baseUrl}/api/devices/${deviceId}/status`, {
      onlineStatus: 'online',
      runningStatus: 'running',
    })
    assert.equal(recovered.body.isAbnormal, false)

    const invalidStatus = await json('PATCH', `${baseUrl}/api/devices/${deviceId}/status`, {
      onlineStatus: 'unknown',
      runningStatus: 'running',
    })
    assert.equal(invalidStatus.status, 400)
    assert.equal(invalidStatus.body.error.code, 'bad_request')

    const missingDevice = await json('PATCH', `${baseUrl}/api/devices/00000000-0000-0000-0000-000000000000/status`, {
      onlineStatus: 'online',
      runningStatus: 'idle',
    })
    assert.equal(missingDevice.status, 404)
  })
})

test('fault records and filters by device', async () => {
  await withApiEnvironment(async (baseUrl) => {
    const device = await json('POST', `${baseUrl}/api/devices`, { name: 'Robot-B' })
    const deviceId = device.body.id
    const occurredAt = new Date().toISOString()
    const fault = await json('POST', `${baseUrl}/api/faults`, { deviceId, description: '轮组异响', occurredAt })
    assert.equal(fault.status, 201)
    assert.equal(fault.body.deviceId, deviceId)
    assert.equal(fault.body.description, '轮组异响')
    assert.equal(fault.body.occurredAt, occurredAt)

    const filtered = await json('GET', `${baseUrl}/api/faults?deviceId=${deviceId}`)
    assert.equal(filtered.status, 200)
    assert.equal(filtered.body.length, 1)
    assert.equal(filtered.body[0].deviceName, 'Robot-B')
    assert.equal(filtered.body[0].repairOrderId, null)

    const otherDevice = await json('POST', `${baseUrl}/api/devices`, { name: 'Robot-C' })
    const otherFaults = await json('GET', `${baseUrl}/api/faults?deviceId=${otherDevice.body.id}`)
    assert.equal(otherFaults.body.length, 0)

    const badDevice = await json('POST', `${baseUrl}/api/faults`, {
      deviceId: '00000000-0000-0000-0000-000000000000',
      description: 'x',
      occurredAt,
    })
    assert.equal(badDevice.status, 400)
    assert.equal(badDevice.body.error.code, 'bad_request')

    const missingField = await json('POST', `${baseUrl}/api/faults`, { deviceId, occurredAt })
    assert.equal(missingField.status, 400)
  })
})

test('upgrade task state machine enforces transitions', async () => {
  await withApiEnvironment(async (baseUrl) => {
    const device = await json('POST', `${baseUrl}/api/devices`, { name: 'Robot-D' })
    const deviceId = device.body.id
    const created = await json('POST', `${baseUrl}/api/upgrades`, { deviceId })
    assert.equal(created.status, 201)
    assert.equal(created.body.status, 'pending')
    assert.equal(created.body.result, null)
    const taskId = created.body.id

    const illegalToSuccess = await json('PATCH', `${baseUrl}/api/upgrades/${taskId}/status`, { status: 'success' })
    assert.equal(illegalToSuccess.status, 400)

    const started = await json('PATCH', `${baseUrl}/api/upgrades/${taskId}/status`, { status: 'in_progress' })
    assert.equal(started.status, 200)
    assert.equal(started.body.status, 'in_progress')

    const succeeded = await json('PATCH', `${baseUrl}/api/upgrades/${taskId}/status`, {
      status: 'success',
      result: '升级到 v2.1.0',
    })
    assert.equal(succeeded.status, 200)
    assert.equal(succeeded.body.status, 'success')
    assert.equal(succeeded.body.result, '升级到 v2.1.0')

    const afterTerminal = await json('PATCH', `${baseUrl}/api/upgrades/${taskId}/status`, { status: 'failed' })
    assert.equal(afterTerminal.status, 400)

    const missing = await json('PATCH', `${baseUrl}/api/upgrades/00000000-0000-0000-0000-000000000000/status`, {
      status: 'in_progress',
    })
    assert.equal(missing.status, 404)

    const list = await json('GET', `${baseUrl}/api/upgrades?deviceId=${deviceId}`)
    assert.equal(list.status, 200)
    assert.equal(list.body.length, 1)
    assert.equal(list.body[0].deviceName, 'Robot-D')
  })
})

test('repair order state machine enforces transitions', async () => {
  await withApiEnvironment(async (baseUrl) => {
    const device = await json('POST', `${baseUrl}/api/devices`, { name: 'Robot-E' })
    const deviceId = device.body.id
    const created = await json('POST', `${baseUrl}/api/repair-orders`, {
      deviceId,
      description: '电池续航下降',
      requirement: '更换电池模组',
    })
    assert.equal(created.status, 201)
    assert.equal(created.body.status, 'created')
    assert.equal(created.body.requirement, '更换电池模组')
    const orderId = created.body.id

    const illegalToCompleted = await json('PATCH', `${baseUrl}/api/repair-orders/${orderId}/status`, {
      status: 'completed',
    })
    assert.equal(illegalToCompleted.status, 400)

    const started = await json('PATCH', `${baseUrl}/api/repair-orders/${orderId}/status`, { status: 'in_progress' })
    assert.equal(started.status, 200)
    assert.equal(started.body.status, 'in_progress')

    const completed = await json('PATCH', `${baseUrl}/api/repair-orders/${orderId}/status`, {
      status: 'completed',
      result: '已更换电池，续航恢复',
    })
    assert.equal(completed.status, 200)
    assert.equal(completed.body.status, 'completed')
    assert.equal(completed.body.result, '已更换电池，续航恢复')

    const afterTerminal = await json('PATCH', `${baseUrl}/api/repair-orders/${orderId}/status`, {
      status: 'in_progress',
    })
    assert.equal(afterTerminal.status, 400)

    const filtered = await json('GET', `${baseUrl}/api/repair-orders?status=completed`)
    assert.equal(filtered.status, 200)
    assert.equal(filtered.body.length, 1)
    assert.equal(filtered.body[0].deviceName, 'Robot-E')

    const badDevice = await json('POST', `${baseUrl}/api/repair-orders`, {
      deviceId: '00000000-0000-0000-0000-000000000000',
      description: 'x',
    })
    assert.equal(badDevice.status, 400)
  })
})

test('device history aggregates timeline in descending order', async () => {
  await withApiEnvironment(async (baseUrl) => {
    const device = await json('POST', `${baseUrl}/api/devices`, { name: 'Robot-F' })
    const deviceId = device.body.id

    await json('PATCH', `${baseUrl}/api/devices/${deviceId}/status`, {
      onlineStatus: 'online',
      runningStatus: 'running',
    })
    await json('POST', `${baseUrl}/api/faults`, {
      deviceId,
      description: '传感器失灵',
      occurredAt: new Date().toISOString(),
    })
    const upgrade = await json('POST', `${baseUrl}/api/upgrades`, { deviceId })
    await json('PATCH', `${baseUrl}/api/upgrades/${upgrade.body.id}/status`, { status: 'in_progress' })
    await json('PATCH', `${baseUrl}/api/upgrades/${upgrade.body.id}/status`, { status: 'failed', result: '中断' })
    const order = await json('POST', `${baseUrl}/api/repair-orders`, { deviceId, description: '更换传感器' })

    const history = await json('GET', `${baseUrl}/api/devices/${deviceId}/history`)
    assert.equal(history.status, 200)
    assert.equal(history.body.device.id, deviceId)
    const types = history.body.timeline.map((entry) => entry.type)
    assert.ok(types.includes('status_change'))
    assert.ok(types.includes('fault'))
    assert.ok(types.includes('upgrade'))
    assert.ok(types.includes('repair_order'))
    for (let i = 1; i < history.body.timeline.length; i++) {
      assert.ok(history.body.timeline[i - 1].timestamp >= history.body.timeline[i].timestamp)
    }

    const missingHistory = await json(
      'GET',
      `${baseUrl}/api/devices/00000000-0000-0000-0000-000000000000/history`,
    )
    assert.equal(missingHistory.status, 404)
    assert.equal(missingHistory.body.error.code, 'not_found')
  })
})
