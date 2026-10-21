// 服务端集成测试（真实 HTTP）：登录、创建与分类自动分配、公司隔离 403、
// 多轮回复、人工分配兜底、接单、转派、完成、评价、取消与日志查询。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SEED_ACCOUNTS,
  getJson,
  login,
  postJson,
  withSeededApp,
} from './seeded-app.mjs'

test('登录与会话：业务档案返回、错误凭证与未认证的统一错误结构', async () => {
  await withSeededApp(async (url) => {
    const wrong = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: SEED_ACCOUNTS.alice, password: 'not-the-password' }),
    })
    assert.equal(wrong.status, 401)
    assert.deepEqual(await wrong.json(), { error: { code: 'AUTH_INVALID', message: '用户名或密码错误' } })

    const anonymous = await fetch(`${url}/api/tickets`)
    assert.equal(anonymous.status, 401)
    assert.equal((await anonymous.json()).error.code, 'AUTH_REQUIRED')

    const { response, body } = await login(url, SEED_ACCOUNTS.alice)
    assert.equal(response.status, 200)
    assert.ok(typeof body.token === 'string' && body.token.length > 0)
    assert.equal(body.user.displayName, '李雅')
    assert.equal(body.user.email, SEED_ACCOUNTS.alice)
    assert.equal(body.user.companyId, 1)
    assert.equal(body.user.companyName, '宏图科技')
    assert.equal(body.user.departmentName, '技术部')
    assert.equal(body.user.crossCompanyView, false)

    const me = await getJson(url, body.token, '/api/auth/me')
    assert.equal(me.response.status, 200)
    assert.deepEqual(me.body, body.user)

    const logout = await fetch(`${url}/api/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${body.token}` },
    })
    assert.equal(logout.status, 204)

    const invalidToken = await fetch(`${url}/api/auth/me`, { headers: { authorization: 'Bearer invalid-token' } })
    assert.equal(invalidToken.status, 401)
    assert.equal((await invalidToken.json()).error.code, 'AUTH_REQUIRED')
  })
})

test('创建工单：命中分类规则自动分配，未命中停留待分配，非法字段 400', async () => {
  await withSeededApp(async (url) => {
    const alice = (await login(url, SEED_ACCOUNTS.alice)).body

    const created = await postJson(url, alice.token, '/api/tickets', {
      subject: '登录后无法提交表单',
      description: '点击提交按钮无响应，控制台有报错',
      category: 'bug',
      priority: 'P2',
    })
    assert.equal(created.response.status, 201)
    assert.equal(created.body.status, 'pending_processing')
    assert.equal(created.body.assignedGroupId, 1)
    assert.equal(created.body.priority, 'P2')
    assert.equal(created.body.category, 'bug')
    assert.ok(created.body.id >= 1)
    assert.ok(created.body.createdAt)
    assert.equal(created.body.companyId, 1)
    assert.equal(created.body.submitter.displayName, '李雅')
    assert.equal(created.body.submitter.email, SEED_ACCOUNTS.alice)
    assert.equal(created.body.currentAssignee, null)
    assert.equal(created.body.assignedGroupId, 1)

    const unmatched = await postJson(url, alice.token, '/api/tickets', {
      subject: '其他杂项问题',
      description: '无法归类的问题',
      category: 'other',
      priority: 'P4',
    })
    assert.equal(unmatched.response.status, 201)
    assert.equal(unmatched.body.status, 'pending_assignment')
    assert.equal(unmatched.body.assignedGroupId, null)

    for (const payload of [
      { subject: '', description: 'x', category: 'bug', priority: 'P1' },
      { subject: 's', description: '', category: 'bug', priority: 'P1' },
      { subject: 's', description: 'd', category: 'not-a-category', priority: 'P1' },
      { subject: 's', description: 'd', category: 'bug', priority: 'P9' },
      { subject: 's', description: 'd', category: 'bug' },
      { description: 'd', category: 'bug', priority: 'P1' },
    ]) {
      const invalid = await postJson(url, alice.token, '/api/tickets', payload)
      assert.equal(invalid.response.status, 400, JSON.stringify(payload))
      assert.equal(invalid.body.error.code, 'VALIDATION_ERROR')
    }
    const tooLong = await postJson(url, alice.token, '/api/tickets', {
      subject: 'a'.repeat(201),
      description: 'd',
      category: 'bug',
      priority: 'P1',
    })
    assert.equal(tooLong.response.status, 400)
  })
})

test('公司隔离：B 公司用户无法读写 A 公司工单，返回 403 COMPANY_FORBIDDEN', async () => {
  await withSeededApp(async (url) => {
    const alice = (await login(url, SEED_ACCOUNTS.alice)).body
    const dave = (await login(url, SEED_ACCOUNTS.dave)).body

    const created = await postJson(url, alice.token, '/api/tickets', {
      subject: '宏图内部工单',
      description: 'A 公司的工单',
      category: 'bug',
      priority: 'P1',
    })
    const ticket = created.body

    const mine = await getJson(url, dave.token, '/api/tickets?scope=mine')
    assert.equal(mine.body.total, 0)

    const workbench = await getJson(url, dave.token, '/api/tickets')
    assert.equal(workbench.body.items.length, 0)

    const detail = await fetch(`${url}/api/tickets/${ticket.id}`, { headers: { authorization: `Bearer ${dave.token}` } })
    assert.equal(detail.status, 403)
    assert.deepEqual(await detail.json(), { error: { code: 'COMPANY_FORBIDDEN', message: '无权访问其他公司的工单' } })

    for (const [path, payload] of [
      [`/api/tickets/${ticket.id}/replies`, { content: '越权回复' }],
      [`/api/tickets/${ticket.id}/cancel`, {}],
      [`/api/tickets/${ticket.id}/claim`, {}],
      [`/api/tickets/${ticket.id}/transfer`, { targetUserId: 6 }],
      [`/api/tickets/${ticket.id}/complete`, {}],
      [`/api/tickets/${ticket.id}/rating`, { score: 5 }],
      [`/api/tickets/${ticket.id}/assign`, { groupId: 1 }],
    ]) {
      const response = await fetch(`${url}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${dave.token}` },
        body: JSON.stringify(payload),
      })
      assert.equal(response.status, 403, path)
      assert.equal((await response.json()).error.code, 'COMPANY_FORBIDDEN', path)
    }

    const submitter = await fetch(`${url}/api/tickets/${ticket.id}/submitter`, { headers: { authorization: `Bearer ${dave.token}` } })
    assert.equal(submitter.status, 403)
    const logs = await fetch(`${url}/api/tickets/${ticket.id}/logs`, { headers: { authorization: `Bearer ${dave.token}` } })
    assert.equal(logs.status, 403)
    const filtered = await fetch(`${url}/api/tickets?companyId=1`, { headers: { authorization: `Bearer ${dave.token}` } })
    assert.equal(filtered.status, 403)
    const groupScope = await fetch(`${url}/api/groups?companyId=1`, { headers: { authorization: `Bearer ${dave.token}` } })
    assert.equal(groupScope.status, 403)
    const ruleScope = await fetch(`${url}/api/assignment-rules?companyId=1`, { headers: { authorization: `Bearer ${dave.token}` } })
    assert.equal(ruleScope.status, 403)

    // 跨公司视角用户（grace）读放行，写仍限本公司。
    const grace = (await login(url, SEED_ACCOUNTS.grace)).body
    const crossDetail = await getJson(url, grace.token, `/api/tickets/${ticket.id}`)
    assert.equal(crossDetail.response.status, 200)
    assert.equal(crossDetail.body.ticket.companyId, 1)
    const crossLogs = await getJson(url, grace.token, `/api/tickets/${ticket.id}/logs`)
    assert.equal(crossLogs.response.status, 200)
    assert.ok(crossLogs.body.length >= 1)
    const crossList = await getJson(url, grace.token, '/api/tickets?companyId=1&status=pending_assignment')
    assert.equal(crossList.response.status, 200)
    assert.equal(crossList.body.items.length, 0)
    const crossSubmitter = await getJson(url, grace.token, `/api/tickets/${ticket.id}/submitter`)
    assert.equal(crossSubmitter.response.status, 200)
    assert.equal(crossSubmitter.body.companyName, '宏图科技')
    // 跨公司读视角下的统计（R8）。
    const distribution = await getJson(url, grace.token, '/api/stats/distribution?dimension=company')
    assert.equal(distribution.response.status, 200)
    assert.equal(distribution.body.items.find((item) => item.label === '宏图科技').count, 1)

    // 非 cross 用户访问 company 维度统计被拒。
    const forbidden = await fetch(`${url}/api/stats/distribution?dimension=company`, {
      headers: { authorization: `Bearer ${alice.token}` },
    })
    assert.equal(forbidden.status, 403)
    assert.equal((await forbidden.json()).error.code, 'CROSS_COMPANY_REQUIRED')
  })
})

test('工单闭环：回复 → 接单 → 转派 → 完成（通知禁用）→ 评价 → 日志', async () => {
  await withSeededApp(async (url) => {
    const alice = (await login(url, SEED_ACCOUNTS.alice)).body
    const bob = (await login(url, SEED_ACCOUNTS.bob)).body
    const carol = (await login(url, SEED_ACCOUNTS.carol)).body

    const created = await postJson(url, alice.token, '/api/tickets', {
      subject: '支付页面偶发报错',
      description: '支付页偶发 500 错误',
      category: 'bug',
      priority: 'P1',
    })
    const ticket = created.body

    // 详情读回（含回复与评价结构）。
    const detail = await getJson(url, alice.token, `/api/tickets/${ticket.id}`)
    assert.equal(detail.response.status, 200)
    assert.equal(detail.body.ticket.id, ticket.id)
    assert.deepEqual(detail.body.replies, [])
    assert.equal(detail.body.rating, null)

    // 多轮回复：两轮按时间先后呈现，firstReplyAt 锚定首次回复。
    const firstReply = await postJson(url, alice.token, `/api/tickets/${ticket.id}/replies`, { content: '补充：控制台有 TypeError' })
    assert.equal(firstReply.response.status, 201)
    assert.equal(firstReply.body.replier.displayName, '李雅')
    const secondReply = await postJson(url, bob.token, `/api/tickets/${ticket.id}/replies`, { content: '收到，正在排查' })
    assert.equal(secondReply.response.status, 201)
    const afterReplies = await getJson(url, alice.token, `/api/tickets/${ticket.id}`)
    assert.equal(afterReplies.body.replies.length, 2)
    assert.equal(afterReplies.body.replies[0].replier.displayName, '李雅')
    assert.equal(afterReplies.body.replies[1].replier.displayName, '王斌')
    assert.ok(afterReplies.body.replies[0].createdAt <= afterReplies.body.replies[1].createdAt)
    assert.ok(afterReplies.body.ticket.firstReplyAt)
    assert.equal(afterReplies.body.ticket.firstReplyAt, afterReplies.body.replies[0].createdAt)
    const emptyReply = await postJson(url, alice.token, `/api/tickets/${ticket.id}/replies`, { content: '' })
    assert.equal(emptyReply.response.status, 400)

    // 工作台：组所在公司处理人可见待处理池（含提交人信息）。
    const workbench = await getJson(url, bob.token, '/api/tickets')
    assert.ok(workbench.body.items.some((item) => item.id === ticket.id))
    assert.equal(workbench.body.items.find((item) => item.id === ticket.id).submitter.email, SEED_ACCOUNTS.alice)

    // 接单：确立处理责任；重复接单 409。
    const claimed = await postJson(url, bob.token, `/api/tickets/${ticket.id}/claim`, {})
    assert.equal(claimed.response.status, 200)
    assert.equal(claimed.body.currentAssignee.displayName, '王斌')
    const doubleClaim = await postJson(url, carol.token, `/api/tickets/${ticket.id}/claim`, {})
    assert.equal(doubleClaim.response.status, 409)
    assert.equal(doubleClaim.body.error.code, 'STATE_CONFLICT')

    // 转派：非当前处理人 403 NOT_ASSIGNEE；转派目标不能是本人。
    const users = await getJson(url, bob.token, '/api/users')
    const carolBrief = users.body.find((user) => user.displayName === '陈芳')
    assert.ok(carolBrief)
    const notAssignee = await postJson(url, carol.token, `/api/tickets/${ticket.id}/transfer`, { targetUserId: carolBrief.id })
    assert.equal(notAssignee.response.status, 403)
    assert.deepEqual(notAssignee.body.error, { code: 'NOT_ASSIGNEE', message: '仅当前处理人可转派' })
    const transferred = await postJson(url, bob.token, `/api/tickets/${ticket.id}/transfer`, { targetUserId: carolBrief.id })
    assert.equal(transferred.response.status, 200)
    assert.equal(transferred.body.currentAssignee.displayName, '陈芳')
    const selfTransfer = await postJson(url, carol.token, `/api/tickets/${ticket.id}/transfer`, { targetUserId: carolBrief.id })
    assert.equal(selfTransfer.response.status, 400)
    const unknownTarget = await postJson(url, carol.token, `/api/tickets/${ticket.id}/transfer`, { targetUserId: 999 })
    assert.equal(unknownTarget.response.status, 400)

    // 处理上下文：提交人完整信息与历史工单（降序）。
    const another = await postJson(url, alice.token, '/api/tickets', {
      subject: '另一张工单',
      description: '历史工单验证',
      category: 'other',
      priority: 'P3',
    })
    const submitterView = await getJson(url, carol.token, `/api/tickets/${ticket.id}/submitter`)
    assert.equal(submitterView.response.status, 200)
    assert.equal(submitterView.body.name, '李雅')
    assert.equal(submitterView.body.email, SEED_ACCOUNTS.alice)
    assert.equal(submitterView.body.companyName, '宏图科技')
    assert.equal(submitterView.body.departmentName, '技术部')
    const historyIds = submitterView.body.historyTickets.map((item) => item.id)
    assert.ok(historyIds.includes(ticket.id))
    assert.ok(historyIds.includes(another.body.id))
    const createdAtList = submitterView.body.historyTickets.map((item) => item.createdAt)
    assert.deepEqual([...createdAtList].sort().reverse(), createdAtList)

    // 完成：记录处理人与时间；SMTP 未配置 → notification.sent=false。
    const completed = await postJson(url, carol.token, `/api/tickets/${ticket.id}/complete`, { resolution: '已修复前端脚本错误' })
    assert.equal(completed.response.status, 200)
    assert.equal(completed.body.ticket.status, 'completed')
    assert.equal(completed.body.ticket.completedBy.displayName, '陈芳')
    assert.ok(completed.body.ticket.completedAt)
    assert.deepEqual(completed.body.notification, { sent: false, error: 'SMTP 未配置，通知未发送' })

    // 已结束工单：回复 409、取消 409。
    const lateReply = await postJson(url, alice.token, `/api/tickets/${ticket.id}/replies`, { content: '收到通知' })
    assert.equal(lateReply.response.status, 409)
    assert.deepEqual(lateReply.body.error, { code: 'STATE_CONFLICT', message: '工单已结束，无法回复' })
    const lateCancel = await postJson(url, alice.token, `/api/tickets/${ticket.id}/cancel`, {})
    assert.equal(lateCancel.response.status, 409)

    // 评价：非法分值 400、非提交人 403、重复评价 409、成功 201 并可读回。
    const badScore = await postJson(url, alice.token, `/api/tickets/${ticket.id}/rating`, { score: 6 })
    assert.equal(badScore.response.status, 400)
    const notSubmitter = await postJson(url, bob.token, `/api/tickets/${ticket.id}/rating`, { score: 5 })
    assert.equal(notSubmitter.response.status, 403)
    assert.deepEqual(notSubmitter.body.error, { code: 'NOT_SUBMITTER', message: '仅提交人可评价' })
    const rated = await postJson(url, alice.token, `/api/tickets/${ticket.id}/rating`, { score: 4 })
    assert.equal(rated.response.status, 201)
    assert.equal(rated.body.ticketId, ticket.id)
    assert.equal(rated.body.score, 4)
    assert.ok(rated.body.createdAt)
    const rerate = await postJson(url, alice.token, `/api/tickets/${ticket.id}/rating`, { score: 5 })
    assert.equal(rerate.response.status, 409)
    const finalDetail = await getJson(url, alice.token, `/api/tickets/${ticket.id}`)
    assert.deepEqual(finalDetail.body.rating, { score: 4, createdAt: rated.body.createdAt })

    // 未完成工单不可评价。
    const pendingRating = await postJson(url, alice.token, `/api/tickets/${another.body.id}/rating`, { score: 5 })
    assert.equal(pendingRating.response.status, 409)

    // 取消：完成前任意活跃状态可取消，取消后不再进入处理流程。
    const cancelled = await postJson(url, alice.token, `/api/tickets/${another.body.id}/cancel`, {})
    assert.equal(cancelled.response.status, 200)
    assert.equal(cancelled.body.status, 'cancelled')
    assert.ok(cancelled.body.cancelledAt)
    const cancelledReply = await postJson(url, alice.token, `/api/tickets/${another.body.id}/replies`, { content: 'x' })
    assert.equal(cancelledReply.response.status, 409)
    const reCancel = await postJson(url, alice.token, `/api/tickets/${another.body.id}/cancel`, {})
    assert.equal(reCancel.response.status, 409)

    // 日志：关键操作按时间升序、按工单聚合、含操作人与中文摘要；全局日志支持过滤与分页。
    const logs = await getJson(url, alice.token, `/api/tickets/${ticket.id}/logs`)
    assert.equal(logs.response.status, 200)
    const actions = logs.body.map((entry) => entry.action)
    assert.deepEqual(actions, [
      'ticket_created',
      'ticket_assigned',
      'ticket_replied',
      'ticket_replied',
      'ticket_transferred',
      'ticket_completed',
      'ticket_rated',
    ])
    assert.ok(logs.body.every((entry) => entry.ticketId === ticket.id))
    assert.equal(logs.body[0].actor.displayName, '李雅')
    assert.ok(logs.body[5].actor.displayName, '陈芳')
    assert.ok(logs.body.every((entry) => typeof entry.detail === 'string' && entry.detail.length > 0))
    const createdAtKeys = logs.body.map((entry) => entry.createdAt)
    assert.deepEqual([...createdAtKeys].sort(), createdAtKeys)

    const globalLogs = await getJson(url, alice.token, `/api/logs?ticketId=${ticket.id}&action=ticket_completed`)
    assert.equal(globalLogs.body.total, 1)
    assert.equal(globalLogs.body.items[0].action, 'ticket_completed')
    assert.equal(globalLogs.body.items[0].detail, '完成工单 #' + ticket.id + '：已修复前端脚本错误')

    const paged = await getJson(url, alice.token, `/api/logs?ticketId=${ticket.id}&page=1&pageSize=3`)
    assert.equal(paged.body.total, 7)
    assert.equal(paged.body.items.length, 3)
    assert.equal(paged.body.page, 1)
    assert.equal(paged.body.pageSize, 3)
    const pageTwo = await getJson(url, alice.token, `/api/logs?ticketId=${ticket.id}&page=3&pageSize=3`)
    assert.equal(pageTwo.body.items.length, 1)

    // B 公司用户的全局日志只含本公司事件。
    const dave = (await login(url, SEED_ACCOUNTS.dave)).body
    const daveLogs = await getJson(url, dave.token, '/api/logs')
    assert.equal(daveLogs.body.total, 0)
  })
})

test('人工分配兜底：未命中规则的工单可人工分配到业务组（R1）', async () => {
  await withSeededApp(async (url) => {
    const alice = (await login(url, SEED_ACCOUNTS.alice)).body
    const bob = (await login(url, SEED_ACCOUNTS.bob)).body

    const created = await postJson(url, alice.token, '/api/tickets', {
      subject: '未命中分类的工单',
      description: '等待人工分配',
      category: 'feature',
      priority: 'P2',
    })
    const ticket = created.body
    assert.equal(ticket.status, 'pending_assignment')

    // 状态非待分配的工单（自动分配命中）不可再分配。
    const autoAssigned = await postJson(url, alice.token, '/api/tickets', {
      subject: '自动分配工单',
      description: 'bug 分类命中规则',
      category: 'bug',
      priority: 'P1',
    })
    const conflict = await postJson(url, bob.token, `/api/tickets/${autoAssigned.body.id}/assign`, { groupId: 1 })
    assert.equal(conflict.response.status, 409)
    assert.equal(conflict.body.error.code, 'STATE_CONFLICT')

    // 人工分配到本公司业务组 → 待处理。
    const assigned = await postJson(url, bob.token, `/api/tickets/${ticket.id}/assign`, { groupId: 1 })
    assert.equal(assigned.response.status, 200)
    assert.equal(assigned.body.status, 'pending_processing')
    assert.equal(assigned.body.assignedGroupId, 1)

    // 目标组非法 → 400。
    const pending2 = await postJson(url, alice.token, '/api/tickets', {
      subject: '第二张待分配工单',
      description: '验证非法目标组',
      category: 'other',
      priority: 'P3',
    })
    const invalidGroup = await postJson(url, bob.token, `/api/tickets/${pending2.body.id}/assign`, { groupId: 999 })
    assert.equal(invalidGroup.response.status, 400)
    const bGroup = await postJson(url, bob.token, `/api/tickets/${pending2.body.id}/assign`, { groupId: 3 })
    assert.equal(bGroup.response.status, 400)

    // 分配事件留痕。
    const logs = await getJson(url, alice.token, `/api/tickets/${ticket.id}/logs`)
    assert.deepEqual(
      logs.body.map((entry) => entry.action),
      ['ticket_created', 'ticket_assigned'],
    )
    assert.ok(logs.body[1].detail.includes('技术支持组'))
  })
})

test('用户列表：默认本公司，跨公司视角可按 companyId 查询', async () => {
  await withSeededApp(async (url) => {
    const alice = (await login(url, SEED_ACCOUNTS.alice)).body
    const grace = (await login(url, SEED_ACCOUNTS.grace)).body

    const users = await getJson(url, alice.token, '/api/users')
    assert.equal(users.response.status, 200)
    assert.deepEqual(
      users.body.map((user) => user.displayName),
      // SQL ORDER BY display_name 为 Unicode 码点序：李(674E) < 王(738B) < 陈(9648) < 高(9AD8)。
      ['李雅', '王斌', '陈芳', '高远'],
    )
    assert.ok(users.body.every((user) => user.companyName === '宏图科技'))
    assert.ok(users.body.every((user) => typeof user.id === 'number'))

    const cross = await getJson(url, grace.token, '/api/users?companyId=2')
    assert.deepEqual(
      cross.body.map((user) => user.displayName),
      ['刘强', '赵敏'],
    )

    const notFound = await fetch(`${url}/api/users?companyId=99`, { headers: { authorization: `Bearer ${grace.token}` } })
    assert.equal(notFound.status, 200)
    assert.deepEqual(await notFound.json(), [])
  })
})
