// 工单域行为测试：草稿、幂等提交、8 状态机、评分、列表筛选/分页、CSV、
// 时间线、可见性权限矩阵、嵌入工作台与仪表盘（契约 §3/§7/§8/§11）。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSubmittedTicket, jsonCall, loginAdmin, loginAs, seedScenario, withIsolatedPlatform } from './api-helpers.mjs'

async function tokensFor(app) {
  return {
    admin: await loginAdmin(app),
    manager: await loginAs(app, 'manager@corp.test'),
    agentA1: await loginAs(app, 'agent-a1@corp.test'),
    agentA2: await loginAs(app, 'agent-a2@corp.test'),
    agentB1: await loginAs(app, 'agent-b1@corp.test'),
    agentX: await loginAs(app, 'agent-x@corp.test'),
    requester: await loginAs(app, 'requester@corp.test'),
    requester2: await loginAs(app, 'other-requester@corp.test'),
  }
}

function tokenOfAgent(tokens, assigneeId) {
  const map = { 3: tokens.agentA1, 4: tokens.agentA2, 5: tokens.agentB1 }
  const token = map[assigneeId]
  if (!token) throw new Error(`no token for assignee ${assigneeId}`)
  return token
}

test('草稿生命周期：创建/更新/删除与字段校验', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const tokens = await tokensFor(app)

    const draft = await jsonCall(app, 'POST', '/api/tickets', {
      token: tokens.requester,
      body: { subjectZh: '草稿主题', description: '草稿描述', categoryId: 40, priority: 'low', idempotencyKey: 'draft-1' },
    })
    assert.equal(draft.status, 201)
    assert.equal(draft.json.status, 'draft')
    assert.equal(draft.json.ticketNo, null)
    assert.equal(draft.json.can.editDraft, true)
    assert.equal(draft.json.can.submit, true)

    const missingSubject = await jsonCall(app, 'POST', '/api/tickets', {
      token: tokens.requester,
      body: { description: 'x', categoryId: 40, priority: 'low', idempotencyKey: 'draft-2' },
    })
    assert.equal(missingSubject.status, 422)
    assert.equal(missingSubject.json.error.code, 'VALIDATION')
    assert.ok(missingSubject.json.error.details.fields.includes('subjectZh'))

    const badPriority = await jsonCall(app, 'POST', '/api/tickets', {
      token: tokens.requester,
      body: { subjectZh: 'x', description: 'y', categoryId: 40, priority: 'critical', idempotencyKey: 'draft-3' },
    })
    assert.equal(badPriority.status, 422)
    assert.ok(badPriority.json.error.details.fields.includes('priority'))

    const badCategory = await jsonCall(app, 'POST', '/api/tickets', {
      token: tokens.requester,
      body: { subjectZh: 'x', description: 'y', categoryId: 9999, priority: 'low', idempotencyKey: 'draft-4' },
    })
    assert.equal(badCategory.status, 422)
    assert.ok(badCategory.json.error.details.fields.includes('categoryId'))

    const patched = await jsonCall(app, 'PATCH', `/api/tickets/${draft.json.id}`, {
      token: tokens.requester,
      body: { subjectZh: '草稿主题改' },
    })
    assert.equal(patched.status, 200)
    assert.equal(patched.json.subjectZh, '草稿主题改')

    const deleted = await jsonCall(app, 'DELETE', `/api/tickets/${draft.json.id}`, { token: tokens.requester })
    assert.equal(deleted.status, 204)
    const gone = await jsonCall(app, 'GET', `/api/tickets/${draft.json.id}`, { token: tokens.requester })
    assert.equal(gone.status, 404)
  })
})

test('草稿隐私：其他提交人访问返回 404（反枚举）', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const tokens = await tokensFor(app)
    const draft = await jsonCall(app, 'POST', '/api/tickets', {
      token: tokens.requester,
      body: { subjectZh: '私有草稿', description: 'x', categoryId: 40, priority: 'low', idempotencyKey: 'privacy-1' },
    })
    assert.equal(draft.status, 201)
    const stranger = await jsonCall(app, 'GET', `/api/tickets/${draft.json.id}`, { token: tokens.requester2 })
    assert.equal(stranger.status, 404)
    assert.equal(stranger.json.error.code, 'NOT_FOUND')
  })
})

test('幂等提交：同键重复提交返回原结果，异键提交返回 409', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const tokens = await tokensFor(app)
    const { submit, id, idempotencyKey } = await createSubmittedTicket(app, tokens.requester, { key: 'submit-idem-1' })
    assert.equal(submit.status, 200)
    assert.equal(submit.json.ticket.status, 'assigned')
    assert.match(submit.json.ticket.ticketNo, /^HD-\d{8}-\d{4}$/)
    assert.equal(submit.json.assignment.result, 'assigned')

    const replay = await jsonCall(app, 'POST', `/api/tickets/${id}/submit`, { token: tokens.requester, body: { idempotencyKey } })
    assert.equal(replay.status, 200)
    assert.equal(replay.json.ticket.id, id)
    assert.equal(replay.json.ticket.status, submit.json.ticket.status)
    assert.equal(replay.json.ticket.ticketNo, submit.json.ticket.ticketNo)

    const otherKey = await jsonCall(app, 'POST', `/api/tickets/${id}/submit`, {
      token: tokens.requester,
      body: { idempotencyKey: 'submit-idem-other' },
    })
    assert.equal(otherKey.status, 409)
    assert.equal(otherKey.json.error.code, 'TICKET_NOT_DRAFT')

    const draftReplay = await jsonCall(app, 'POST', '/api/tickets', {
      token: tokens.requester,
      body: { subjectZh: '幂等重放', description: 'x', categoryId: 40, priority: 'low', idempotencyKey },
    })
    assert.equal(draftReplay.status, 200)
    assert.equal(draftReplay.json.idempotentReplay, true)

    const crossUser = await jsonCall(app, 'POST', '/api/tickets', {
      token: tokens.requester2,
      body: { subjectZh: '跨用户', description: 'x', categoryId: 40, priority: 'low', idempotencyKey: 'submit-idem-2' },
    })
    assert.equal(crossUser.status, 201)
    const conflict = await jsonCall(app, 'POST', '/api/tickets', {
      token: tokens.requester,
      body: { subjectZh: '撞键', description: 'x', categoryId: 40, priority: 'low', idempotencyKey: 'submit-idem-2' },
    })
    assert.equal(conflict.status, 422)
    assert.equal(conflict.json.error.code, 'VALIDATION')
  })
})

test('状态机主路径：回复→处理中→解决→确认→评分', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const tokens = await tokensFor(app)
    const { submit, id } = await createSubmittedTicket(app, tokens.requester, { key: 'lifecycle-1' })
    const assigneeId = submit.json.assignment.assignee.id
    const agentToken = tokenOfAgent(tokens, assigneeId)
    assert.equal(submit.json.ticket.can.reply, true)
    assert.equal(submit.json.ticket.can.resolve, false)

    const reply = await jsonCall(app, 'POST', `/api/tickets/${id}/replies`, { token: agentToken, body: { body: '正在处理' } })
    assert.equal(reply.status, 201)
    assert.equal(reply.json.ticket.status, 'in_progress')
    assert.equal(reply.json.ticket.firstResponseAt, reply.json.reply.createdAt)
    assert.equal(reply.json.ticket.can.resolve, true)

    const resolve = await jsonCall(app, 'POST', `/api/tickets/${id}/resolve`, { token: agentToken, body: { resolutionNote: '已修复网络' } })
    assert.equal(resolve.status, 200)
    assert.equal(resolve.json.status, 'pending_confirm')
    assert.ok(resolve.json.resolvedAt)

    const requesterDetail = await jsonCall(app, 'GET', `/api/tickets/${id}`, { token: tokens.requester })
    assert.equal(requesterDetail.json.can.confirm, true)
    assert.equal(requesterDetail.json.can.reject, true)

    const confirm = await jsonCall(app, 'POST', `/api/tickets/${id}/confirm`, { token: tokens.requester })
    assert.equal(confirm.status, 200)
    assert.equal(confirm.json.status, 'closed')
    assert.ok(confirm.json.closedAt)

    const rate = await jsonCall(app, 'POST', `/api/tickets/${id}/rating`, { token: tokens.requester, body: { score: 5, comment: '很满意' } })
    assert.equal(rate.status, 201)
    assert.equal(rate.json.score, 5)
    assert.equal(rate.json.comment, '很满意')
    assert.ok(rate.json.createdAt)

    const duplicate = await jsonCall(app, 'POST', `/api/tickets/${id}/rating`, { token: tokens.requester, body: { score: 3 } })
    assert.equal(duplicate.status, 409)
    assert.equal(duplicate.json.error.code, 'RATING_EXISTS')

    const agentRate = await jsonCall(app, 'POST', `/api/tickets/${id}/rating`, { token: agentToken, body: { score: 4 } })
    assert.equal(agentRate.status, 404)
  })
})

test('驳回路径：驳回回到处理中并记录驳回回复，可再次解决', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const tokens = await tokensFor(app)
    const { submit, id } = await createSubmittedTicket(app, tokens.requester, { key: 'reject-flow-1' })
    const agentToken = tokenOfAgent(tokens, submit.json.assignment.assignee.id)
    await jsonCall(app, 'POST', `/api/tickets/${id}/replies`, { token: agentToken, body: { body: '处理中' } })
    await jsonCall(app, 'POST', `/api/tickets/${id}/resolve`, { token: agentToken, body: { resolutionNote: '已处理' } })

    const reject = await jsonCall(app, 'POST', `/api/tickets/${id}/reject`, { token: tokens.requester, body: { reason: '问题仍存在' } })
    assert.equal(reject.status, 200)
    assert.equal(reject.json.status, 'in_progress')

    const timeline = await jsonCall(app, 'GET', `/api/tickets/${id}/timeline`, { token: tokens.requester })
    assert.equal(timeline.status, 200)
    const rejectionReply = timeline.json.items.find((item) => item.kind === 'reply' && item.replyKind === 'rejection')
    assert.ok(rejectionReply)
    assert.equal(rejectionReply.body, '问题仍存在')
    assert.ok(timeline.json.items.some((item) => item.kind === 'activity' && item.action === 'reject'))

    await jsonCall(app, 'POST', `/api/tickets/${id}/resolve`, { token: agentToken, body: { resolutionNote: '彻底修复' } })
    const confirm = await jsonCall(app, 'POST', `/api/tickets/${id}/confirm`, { token: tokens.requester })
    assert.equal(confirm.json.status, 'closed')
  })
})

test('挂起与恢复：仅处理侧可挂起，恢复回到处理中', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const tokens = await tokensFor(app)
    const { submit, id } = await createSubmittedTicket(app, tokens.requester, { key: 'hold-flow-1' })
    const agentToken = tokenOfAgent(tokens, submit.json.assignment.assignee.id)

    const requesterHold = await jsonCall(app, 'POST', `/api/tickets/${id}/hold`, { token: tokens.requester, body: { reason: '等待' } })
    assert.equal(requesterHold.status, 403)

    const hold = await jsonCall(app, 'POST', `/api/tickets/${id}/hold`, { token: agentToken, body: { reason: '等待外部供应商', note: '已发邮件' } })
    assert.equal(hold.status, 200)
    assert.equal(hold.json.status, 'on_hold')
    assert.equal(hold.json.slaFirstResponse.state, 'paused')

    const resume = await jsonCall(app, 'POST', `/api/tickets/${id}/resume`, { token: agentToken })
    assert.equal(resume.status, 200)
    assert.equal(resume.json.status, 'in_progress')
    assert.ok(resume.json.firstResponseAt)
  })
})

test('取消：处理侧可取消已分配工单', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const tokens = await tokensFor(app)
    const { submit, id } = await createSubmittedTicket(app, tokens.requester, { key: 'cancel-flow-1' })
    const agentToken = tokenOfAgent(tokens, submit.json.assignment.assignee.id)

    const requesterCancel = await jsonCall(app, 'POST', `/api/tickets/${id}/cancel`, { token: tokens.requester, body: { reason: '提交人取消' } })
    assert.equal(requesterCancel.status, 403)

    const cancel = await jsonCall(app, 'POST', `/api/tickets/${id}/cancel`, { token: agentToken, body: { reason: '重复工单' } })
    assert.equal(cancel.status, 200)
    assert.equal(cancel.json.status, 'cancelled')

    const replyAfterCancel = await jsonCall(app, 'POST', `/api/tickets/${id}/replies`, { token: agentToken, body: { body: '再见' } })
    assert.equal(replyAfterCancel.status, 409)
  })
})

test('非法状态迁移返回 409 STATE_CONFLICT / TICKET_NOT_DRAFT', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const tokens = await tokensFor(app)
    const { submit, id } = await createSubmittedTicket(app, tokens.requester, { key: 'conflict-1' })
    const agentToken = tokenOfAgent(tokens, submit.json.assignment.assignee.id)

    const earlyResolve = await jsonCall(app, 'POST', `/api/tickets/${id}/resolve`, { token: agentToken, body: { resolutionNote: 'x' } })
    assert.equal(earlyResolve.status, 409)
    assert.equal(earlyResolve.json.error.code, 'STATE_CONFLICT')

    const earlyConfirm = await jsonCall(app, 'POST', `/api/tickets/${id}/confirm`, { token: tokens.requester })
    assert.equal(earlyConfirm.status, 409)

    const earlyRate = await jsonCall(app, 'POST', `/api/tickets/${id}/rating`, { token: tokens.requester, body: { score: 5 } })
    assert.equal(earlyRate.status, 409)

    const emptyReason = await jsonCall(app, 'POST', `/api/tickets/${id}/cancel`, { token: agentToken, body: { reason: '' } })
    assert.equal(emptyReason.status, 422)
    assert.ok(emptyReason.json.error.details.fields.includes('reason'))
  })
})

test('可见性矩阵：请求人/处理人/范围经理/管理员；越权读返回 404', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const tokens = await tokensFor(app)
    const { id } = await createSubmittedTicket(app, tokens.requester, { key: 'visibility-1' })

    const asRequester = await jsonCall(app, 'GET', `/api/tickets/${id}`, { token: tokens.requester })
    assert.equal(asRequester.status, 200)
    const asRequester2 = await jsonCall(app, 'GET', `/api/tickets/${id}`, { token: tokens.requester2 })
    assert.equal(asRequester2.status, 404)
    const asAgentX = await jsonCall(app, 'GET', `/api/tickets/${id}`, { token: tokens.agentX })
    assert.equal(asAgentX.status, 404)
    const asManager = await jsonCall(app, 'GET', `/api/tickets/${id}`, { token: tokens.manager })
    assert.equal(asManager.status, 200)
    const asAdmin = await jsonCall(app, 'GET', `/api/tickets/${id}`, { token: tokens.admin })
    assert.equal(asAdmin.status, 200)

    const activities = await jsonCall(app, 'GET', `/api/tickets/${id}/activities`, { token: tokens.requester2 })
    assert.equal(activities.status, 404)
    const activitiesOwner = await jsonCall(app, 'GET', `/api/tickets/${id}/activities`, { token: tokens.requester })
    assert.equal(activitiesOwner.status, 200)
    assert.ok(activitiesOwner.json.items.some((item) => item.action === 'submit'))
  })
})

test('列表：分页/筛选/排序校验与请求人数据范围', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const tokens = await tokensFor(app)
    const first = await createSubmittedTicket(app, tokens.requester, { key: 'list-1', priority: 'urgent' })
    const second = await createSubmittedTicket(app, tokens.requester, { key: 'list-2', priority: 'low' })
    await createSubmittedTicket(app, tokens.requester, { key: 'list-3', priority: 'high', categoryId: 41 })
    await createSubmittedTicket(app, tokens.requester2, { key: 'list-4', priority: 'high' })

    const list = await jsonCall(app, 'GET', '/api/tickets', { token: tokens.requester })
    assert.equal(list.status, 200)
    assert.equal(list.json.total, 3)
    assert.equal(list.json.pageSize, 20)
    assert.equal(list.json.page, 1)
    assert.ok(list.json.items.every((item) => item.requester.id === 6))

    const otherList = await jsonCall(app, 'GET', '/api/tickets', { token: tokens.requester2 })
    assert.equal(otherList.json.total, 1)
    assert.equal(otherList.json.items[0].subjectZh, '测试工单')

    const urgent = await jsonCall(app, 'GET', '/api/tickets', { token: tokens.requester, query: { priority: 'urgent' } })
    assert.equal(urgent.json.total, 1)
    assert.equal(urgent.json.items[0].id, first.id)

    const noRule = await jsonCall(app, 'GET', '/api/tickets', { token: tokens.requester, query: { status: 'pending_assign' } })
    assert.equal(noRule.status, 200)
    assert.equal(noRule.json.total, 1)
    assert.equal(noRule.json.items[0].id, second.id + 1)

    const badPageSize = await jsonCall(app, 'GET', '/api/tickets', { token: tokens.requester, query: { pageSize: '15' } })
    assert.equal(badPageSize.status, 422)
    assert.ok(badPageSize.json.error.details.fields.includes('pageSize'))

    const badSort = await jsonCall(app, 'GET', '/api/tickets', { token: tokens.requester, query: { sort: 'nonsense:desc' } })
    assert.equal(badSort.status, 422)

    const badStatus = await jsonCall(app, 'GET', '/api/tickets', { token: tokens.requester, query: { status: 'paused' } })
    assert.equal(badStatus.status, 422)

    const paged = await jsonCall(app, 'GET', '/api/tickets', { token: tokens.requester, query: { pageSize: '10', page: '2' } })
    assert.equal(paged.status, 200)
    assert.equal(paged.json.page, 2)
    assert.equal(paged.json.items.length, 0)

    const search = await jsonCall(app, 'GET', '/api/tickets', { token: tokens.requester, query: { q: '测试工单' } })
    assert.equal(search.json.total, 3)
  })
})

test('CSV 导出：提交人 403，处理人 200 且内容含表头与单号', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const tokens = await tokensFor(app)
    const { submit, id } = await createSubmittedTicket(app, tokens.requester, { key: 'csv-1' })
    const agentToken = tokenOfAgent(tokens, submit.json.assignment.assignee.id)

    const denied = await jsonCall(app, 'GET', '/api/tickets/export.csv', { token: tokens.requester })
    assert.equal(denied.status, 403)
    assert.equal(denied.json.error.code, 'FORBIDDEN')

    const rawExport = await app.request('/api/tickets/export.csv', {
      headers: { Authorization: `Bearer ${agentToken}`, 'Accept-Language': 'zh' },
    })
    assert.equal(rawExport.status, 200)
    assert.ok((rawExport.headers.get('content-type') ?? '').startsWith('text/csv'))
    // fetch 的 response.text() 按 WHATWG 规范剥离前导 BOM，这里用原始字节验证 UTF-8 BOM（契约 §14）。
    const exportBytes = Buffer.from(await rawExport.arrayBuffer())
    assert.equal(exportBytes.subarray(0, 3).toString('hex'), 'efbbbf')
    const exportText = exportBytes.toString('utf8')
    assert.ok(exportText.startsWith('\uFEFF'))
    assert.ok(exportText.includes('ticketNo'))
    assert.ok(exportText.includes(submit.json.ticket.ticketNo))

    const emptyScope = await jsonCall(app, 'GET', '/api/tickets/export.csv', { token: tokens.agentX })
    assert.equal(emptyScope.status, 200)
    assert.ok(emptyScope.text.includes('ticketNo'))
    assert.equal(emptyScope.text.split('\r\n').filter((line) => line.length > 0).length, 1)
  })
})

test('嵌入工作台：仅提交人可用，代理 403', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const tokens = await tokensFor(app)
    await createSubmittedTicket(app, tokens.requester, { key: 'embed-1' })
    await createSubmittedTicket(app, tokens.requester2, { key: 'embed-2' })

    const summary = await jsonCall(app, 'GET', '/api/embed/summary', { token: tokens.requester })
    assert.equal(summary.status, 200)
    assert.ok(summary.json.kpis.inProgress >= 1)
    assert.equal(typeof summary.json.kpis.completed, 'number')
    assert.equal(typeof summary.json.kpis.avgResolutionHours, 'number')

    const kanban = await jsonCall(app, 'GET', '/api/embed/kanban', { token: tokens.requester })
    assert.equal(kanban.status, 200)
    assert.ok(Array.isArray(kanban.json.columns.teamProcessing))
    assert.ok(kanban.json.columns.teamProcessing.every((card) => card.requester.id === 6))

    const denied = await jsonCall(app, 'GET', '/api/embed/summary', { token: tokens.agentA1 })
    assert.equal(denied.status, 403)
    const deniedKanban = await jsonCall(app, 'GET', '/api/embed/kanban', { token: tokens.manager })
    assert.equal(deniedKanban.status, 403)
  })
})

test('仪表盘：角色范围 KPI 与分组维度校验', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const tokens = await tokensFor(app)
    await createSubmittedTicket(app, tokens.requester, { key: 'dash-1', priority: 'urgent' })
    await createSubmittedTicket(app, tokens.requester2, { key: 'dash-2', priority: 'low' })

    const summary = await jsonCall(app, 'GET', '/api/dashboard/summary', { token: tokens.requester })
    assert.equal(summary.status, 200)
    assert.equal(summary.json.kpis.total, 1)
    assert.equal(summary.json.slaAlerts.count, 0)

    const breakdown = await jsonCall(app, 'GET', '/api/dashboard/breakdown', { token: tokens.requester, query: { dimension: 'priority' } })
    assert.equal(breakdown.status, 200)
    const urgent = breakdown.json.find((item) => item.key === 'urgent')
    assert.equal(urgent.count, 1)

    const badDimension = await jsonCall(app, 'GET', '/api/dashboard/breakdown', { token: tokens.requester, query: { dimension: 'owner' } })
    assert.equal(badDimension.status, 422)

    const managerSummary = await jsonCall(app, 'GET', '/api/dashboard/summary', { token: tokens.manager })
    assert.equal(managerSummary.json.kpis.total, 2)
  })
})

test('在线调整优先级：处理侧 200，请求人 403，非法值 422', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const tokens = await tokensFor(app)
    const { submit, id } = await createSubmittedTicket(app, tokens.requester, { key: 'priority-1' })
    const agentToken = tokenOfAgent(tokens, submit.json.assignment.assignee.id)

    const denied = await jsonCall(app, 'PATCH', `/api/tickets/${id}/priority`, { token: tokens.requester, body: { priority: 'urgent' } })
    assert.equal(denied.status, 403)

    const invalid = await jsonCall(app, 'PATCH', `/api/tickets/${id}/priority`, { token: agentToken, body: { priority: 'asap' } })
    assert.equal(invalid.status, 422)

    const changed = await jsonCall(app, 'PATCH', `/api/tickets/${id}/priority`, { token: agentToken, body: { priority: 'urgent' } })
    assert.equal(changed.status, 200)
    assert.equal(changed.json.priority, 'urgent')
    assert.equal(changed.json.status, 'assigned')
  })
})
