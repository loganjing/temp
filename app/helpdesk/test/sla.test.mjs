// SLA 双时钟行为测试：提交/开始处理时的截止时间、超时徽章与告警对账、
// 挂起顺延与恢复补记、在线切换分类重算、解决超时（需求 §6.4 / 契约 §7）。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addWorkingMinutes, loadCalendar } from '../src/server/core/calendar.ts'
import { createSubmittedTicket, jsonCall, loginAs, seedScenario, withIsolatedPlatform } from './api-helpers.mjs'

const NOW = new Date().toISOString()

function hoursAgoIso(hours) {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

async function insertCategoryWithPolicy(db, id, code, firstResponseMinutes, resolutionMinutes) {
  await db.run({
    text: `INSERT INTO categories (id, code, name_zh, name_en, department_id, ticket_type, sort_order, status, is_skeleton, created_at, updated_at)
           VALUES (?, ?, ?, 'X', 20, 'incident', 9, 1, 0, ?, ?)`,
    params: [id, code, `分类${id}`, NOW, NOW],
  })
  await db.run({
    text: `INSERT INTO sla_policies (category_id, first_response_minutes, resolution_minutes, warn_threshold_percent, created_at, updated_at)
           VALUES (?, ?, ?, 80, ?, ?)`,
    params: [id, firstResponseMinutes, resolutionMinutes, NOW, NOW],
  })
}

test('提交即起算首次响应时钟，解决时钟未开始', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const requester = await loginAs(app, 'requester@corp.test')
    const { submit, id } = await createSubmittedTicket(app, requester, { key: 'sla-submit-1' })
    assert.equal(submit.json.ticket.slaFirstResponse.state, 'normal')
    assert.ok(submit.json.ticket.slaFirstResponseDeadline)
    assert.equal(submit.json.ticket.slaResolution.state, 'normal')
    assert.equal(submit.json.ticket.slaResolutionDeadline, null)

    const calendar = await loadCalendar(platform.db)
    const detail = await jsonCall(app, 'GET', `/api/tickets/${id}`, { token: requester })
    assert.equal(detail.json.slaFirstResponseDeadline, addWorkingMinutes(detail.json.submittedAt, 60, calendar))
  })
})

test('开始处理：仅当前处理人可开始，解决时钟起算', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const requester = await loginAs(app, 'requester@corp.test')
    const agentA2 = await loginAs(app, 'agent-a2@corp.test')
    const { id } = await createSubmittedTicket(app, requester, { key: 'sla-start-1' })

    const requesterDenied = await jsonCall(app, 'POST', `/api/tickets/${id}/start`, { token: requester })
    assert.equal(requesterDenied.status, 403)
    const notAssignee = await jsonCall(app, 'POST', `/api/tickets/${id}/start`, { token: agentA2 })
    assert.equal(notAssignee.status, 403)

    const agentA1 = await loginAs(app, 'agent-a1@corp.test')
    const started = await jsonCall(app, 'POST', `/api/tickets/${id}/start`, { token: agentA1 })
    assert.equal(started.status, 200)
    assert.equal(started.json.status, 'in_progress')
    assert.ok(started.json.firstResponseAt)
    assert.ok(started.json.slaResolutionDeadline)
    assert.equal(started.json.slaResolution.state, 'normal')

    const calendar = await loadCalendar(platform.db)
    assert.equal(started.json.slaResolutionDeadline, addWorkingMinutes(started.json.firstResponseAt, 120, calendar))
  })
})

test('超时徽章与告警对账：列表、仪表盘与详情口径一致', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const requester = await loginAs(app, 'requester@corp.test')
    const agentA1 = await loginAs(app, 'agent-a1@corp.test')
    const { id } = await createSubmittedTicket(app, requester, { key: 'sla-breach-1' })

    await platform.db.run({
      text: "UPDATE tickets SET sla_first_response_deadline = '2000-01-01T00:00:00.000Z' WHERE id = ?",
      params: [id],
    })

    const detail = await jsonCall(app, 'GET', `/api/tickets/${id}`, { token: requester })
    assert.equal(detail.json.slaFirstResponse.state, 'breached')

    const alerts = await jsonCall(app, 'GET', '/api/tickets', { token: requester, query: { sla: 'alert' } })
    assert.equal(alerts.json.total, 1)

    const dashboard = await jsonCall(app, 'GET', '/api/dashboard/summary', { token: requester })
    assert.equal(dashboard.json.slaAlerts.count, 1)

    const reply = await jsonCall(app, 'POST', `/api/tickets/${id}/replies`, { token: agentA1, body: { body: '回复了' } })
    assert.equal(reply.status, 201)
    assert.equal(reply.json.ticket.slaFirstResponse.state, 'missed')

    const dashboardAfter = await jsonCall(app, 'GET', '/api/dashboard/summary', { token: requester })
    assert.equal(dashboardAfter.json.slaAlerts.count, 0)
  })
})

test('挂起恢复顺延：已响应工单按挂起时长顺延双时钟', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const requester = await loginAs(app, 'requester@corp.test')
    const agentA1 = await loginAs(app, 'agent-a1@corp.test')
    const { id } = await createSubmittedTicket(app, requester, { key: 'sla-hold-1' })
    const before = await jsonCall(app, 'POST', `/api/tickets/${id}/replies`, { token: agentA1, body: { body: '处理中' } })
    assert.equal(before.status, 201)

    const hold = await jsonCall(app, 'POST', `/api/tickets/${id}/hold`, { token: agentA1, body: { reason: '等待供应商' } })
    assert.equal(hold.status, 200)
    assert.equal(hold.json.slaResolution.state, 'paused')

    await platform.db.run({
      text: 'UPDATE ticket_sla_pauses SET started_at = ? WHERE ticket_id = ? AND ended_at IS NULL',
      params: [hoursAgoIso(2), id],
    })

    const resume = await jsonCall(app, 'POST', `/api/tickets/${id}/resume`, { token: agentA1 })
    assert.equal(resume.status, 200)
    assert.equal(resume.json.status, 'in_progress')

    const frShift = new Date(resume.json.slaFirstResponseDeadline).getTime() - new Date(before.json.ticket.slaFirstResponseDeadline).getTime()
    assert.ok(Math.abs(frShift - 2 * 3_600_000) < 3 * 60_000, `first-response deadline shifted by ${frShift}ms`)
    const resShift = new Date(resume.json.slaResolutionDeadline).getTime() - new Date(before.json.ticket.slaResolutionDeadline).getTime()
    assert.ok(Math.abs(resShift - 2 * 3_600_000) < 3 * 60_000, `resolution deadline shifted by ${resShift}ms`)
  })
})

test('恢复补记：未响应即挂起的工单按恢复时刻补记首次响应并重算', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const requester = await loginAs(app, 'requester@corp.test')
    const agentA1 = await loginAs(app, 'agent-a1@corp.test')
    const { id } = await createSubmittedTicket(app, requester, { key: 'sla-backfill-1' })

    const hold = await jsonCall(app, 'POST', `/api/tickets/${id}/hold`, { token: agentA1, body: { reason: '等待信息' } })
    assert.equal(hold.status, 200)
    assert.equal(hold.json.slaFirstResponse.state, 'paused')

    await platform.db.run({
      text: 'UPDATE ticket_sla_pauses SET started_at = ? WHERE ticket_id = ? AND ended_at IS NULL',
      params: [hoursAgoIso(1), id],
    })

    const resume = await jsonCall(app, 'POST', `/api/tickets/${id}/resume`, { token: agentA1 })
    assert.equal(resume.status, 200)
    assert.equal(resume.json.status, 'in_progress')
    assert.ok(resume.json.firstResponseAt)
    assert.ok(resume.json.slaFirstResponseDeadline)
    assert.ok(resume.json.slaResolutionDeadline)
    assert.equal(resume.json.slaFirstResponse.state, 'met')
    assert.equal(resume.json.slaResolution.state, 'normal')
  })
})

test('在线切换分类：按新分类策略重算，无策略则清零', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    await insertCategoryWithPolicy(platform.db, 43, 'CAT-SLA2', 5, 10)
    const requester = await loginAs(app, 'requester@corp.test')
    const agentA1 = await loginAs(app, 'agent-a1@corp.test')
    const { submit, id } = await createSubmittedTicket(app, requester, { key: 'sla-category-1' })
    const submittedAt = submit.json.ticket.submittedAt

    const toNoPolicy = await jsonCall(app, 'PATCH', `/api/tickets/${id}/category`, { token: agentA1, body: { categoryId: 41 } })
    assert.equal(toNoPolicy.status, 200)
    assert.equal(toNoPolicy.json.category.id, 41)
    assert.equal(toNoPolicy.json.slaFirstResponseDeadline, null)
    assert.equal(toNoPolicy.json.slaResolutionDeadline, null)

    const activities = await jsonCall(app, 'GET', `/api/tickets/${id}/activities`, { token: requester })
    assert.ok(activities.json.items.some((item) => item.action === 'change_category'))

    const toNewPolicy = await jsonCall(app, 'PATCH', `/api/tickets/${id}/category`, { token: agentA1, body: { categoryId: 43 } })
    assert.equal(toNewPolicy.status, 200)
    const calendar = await loadCalendar(platform.db)
    assert.equal(toNewPolicy.json.slaFirstResponseDeadline, addWorkingMinutes(submittedAt, 5, calendar))
    assert.equal(toNewPolicy.json.slaResolutionDeadline, null)
  })
})

test('解决超时：关闭后解决时钟显示 missed，首次响应 met', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const requester = await loginAs(app, 'requester@corp.test')
    const agentA1 = await loginAs(app, 'agent-a1@corp.test')
    const { id } = await createSubmittedTicket(app, requester, { key: 'sla-missed-1' })
    const started = await jsonCall(app, 'POST', `/api/tickets/${id}/start`, { token: agentA1 })
    assert.equal(started.status, 200)

    await platform.db.run({
      text: "UPDATE tickets SET sla_resolution_deadline = '2000-01-01T00:00:00.000Z' WHERE id = ?",
      params: [id],
    })
    const resolve = await jsonCall(app, 'POST', `/api/tickets/${id}/resolve`, { token: agentA1, body: { resolutionNote: '已修复' } })
    assert.equal(resolve.status, 200)
    const confirm = await jsonCall(app, 'POST', `/api/tickets/${id}/confirm`, { token: requester })
    assert.equal(confirm.status, 200)

    const detail = await jsonCall(app, 'GET', `/api/tickets/${id}`, { token: requester })
    assert.equal(detail.json.slaResolution.state, 'missed')
    assert.equal(detail.json.slaFirstResponse.state, 'met')
  })
})
