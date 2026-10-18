// 自动关闭测试：待确认超时后系统关闭并补默认 5 星评分（需求 §6.9 / AC-15），
// 提交人仍可覆盖评分；未超时的工单不受影响。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { autoCloseOptionsFromEnv, scanPendingConfirmTimeouts } from '../src/server/jobs/autoClose.ts'
import { createSubmittedTicket, jsonCall, loginAs, seedScenario, withIsolatedPlatform } from './api-helpers.mjs'

const DAY_MS = 24 * 3_600_000

test('autoCloseOptionsFromEnv：默认 24h/5min，可覆盖，非法值回退默认', () => {
  assert.deepEqual(autoCloseOptionsFromEnv({}), { timeoutMs: DAY_MS, scanIntervalMs: 5 * 60_000 })
  assert.deepEqual(
    autoCloseOptionsFromEnv({ PENDING_CONFIRM_TIMEOUT_MS: '1234', AUTO_CLOSE_SCAN_INTERVAL_MS: '99' }),
    { timeoutMs: 1234, scanIntervalMs: 99 },
  )
  assert.deepEqual(
    autoCloseOptionsFromEnv({ PENDING_CONFIRM_TIMEOUT_MS: 'abc', AUTO_CLOSE_SCAN_INTERVAL_MS: 'xyz' }),
    { timeoutMs: DAY_MS, scanIntervalMs: 5 * 60_000 },
  )
})

async function preparePendingConfirm(app, key) {
  const requester = await loginAs(app, 'requester@corp.test')
  const agentA1 = await loginAs(app, 'agent-a1@corp.test')
  const { id } = await createSubmittedTicket(app, requester, { key })
  const started = await jsonCall(app, 'POST', `/api/tickets/${id}/start`, { token: agentA1 })
  assert.equal(started.status, 200)
  const resolved = await jsonCall(app, 'POST', `/api/tickets/${id}/resolve`, { token: agentA1, body: { resolutionNote: '已修复' } })
  assert.equal(resolved.status, 200)
  return { id, requester }
}

test('待确认超时：自动关闭、补系统默认 5 星、记录 auto_close 活动；提交人评分可覆盖', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const { id, requester } = await preparePendingConfirm(app, 'autoclose-stale')

    await platform.db.run({ text: "UPDATE tickets SET resolved_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", params: [id] })

    const closed = await scanPendingConfirmTimeouts(platform.db, DAY_MS)
    assert.equal(closed, 1)

    const detail = await jsonCall(app, 'GET', `/api/tickets/${id}`, { token: requester })
    assert.equal(detail.json.status, 'closed')

    const row = await platform.db.queryOne({ text: 'SELECT status, closed_at FROM tickets WHERE id = ?', params: [id] })
    assert.equal(row.status, 'closed')
    assert.ok(row.closed_at)

    const rating = await platform.db.queryOne({ text: 'SELECT score, is_system_default FROM ratings WHERE ticket_id = ?', params: [id] })
    assert.equal(rating.score, 5)
    assert.equal(rating.is_system_default, 1)

    const activities = await jsonCall(app, 'GET', `/api/tickets/${id}/activities`, { token: requester })
    assert.ok(activities.json.items.some((item) => item.action === 'auto_close' && item.source === 'system'))

    const rate = await jsonCall(app, 'POST', `/api/tickets/${id}/rating`, { token: requester, body: { score: 3 } })
    assert.equal(rate.status, 201)
    assert.equal(rate.json.score, 3)

    const after = await platform.db.queryOne({ text: 'SELECT score, is_system_default FROM ratings WHERE ticket_id = ?', params: [id] })
    assert.equal(after.score, 3)
    assert.equal(after.is_system_default, 0)
  })
})

test('未超时的待确认工单：扫描返回 0，状态与评分不受影响', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const { id, requester } = await preparePendingConfirm(app, 'autoclose-fresh')

    const closed = await scanPendingConfirmTimeouts(platform.db, DAY_MS)
    assert.equal(closed, 0)

    const detail = await jsonCall(app, 'GET', `/api/tickets/${id}`, { token: requester })
    assert.equal(detail.json.status, 'pending_confirm')
    const rating = await platform.db.queryOne({ text: 'SELECT id FROM ratings WHERE ticket_id = ?', params: [id] })
    assert.equal(rating, null)
  })
})
