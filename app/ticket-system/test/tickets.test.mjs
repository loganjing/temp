// 工单系统服务端业务集成测试：真实 HTTP 服务 + 隔离种子数据库，
// 按 docs/wi-t1000312/technical-contract.md 验证契约关键行为（公司隔离、
// 自动分配、状态流转、回复、评价、完成通知记录、统计口径、配置、日志）。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { api, apiJson, login, seed, withTicketApp } from './app-fixture.mjs'

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

async function loginAs(url, email) {
  const { response, body } = await login(url, email)
  assert.equal(response.status, 200, `login failed for ${email}`)
  return body.token
}

test('me returns session user with company and department', async () => {
  await withTicketApp(async (url) => {
    const token = await loginAs(url, seed.users.handlerA1)
    const { response, body } = await apiJson(url, token, '/api/me')
    assert.equal(response.status, 200)
    assert.equal(body.id, seed.ids.handlerA1)
    assert.equal(body.role, 'handler')
    assert.equal(body.companyId, seed.companies.a)
    assert.equal(body.companyName, '公司A')
    assert.equal(body.department, '技术部')
    assert.equal(body.status, 'active')
  })
})

test('ticket data is isolated per company with 404 non-disclosure', async () => {
  await withTicketApp(async (url) => {
    const submitterA = await loginAs(url, seed.users.submitterA1)
    const submitterB = await loginAs(url, seed.users.submitterB1)
    const handlerA = await loginAs(url, seed.users.handlerA1)

    // 公司A 提交人默认 ALL：仅本公司 8 张，不含公司B 工单。
    const listA = await apiJson(url, submitterA, '/api/tickets?status=ALL')
    assert.equal(listA.response.status, 200)
    assert.equal(listA.body.total, 8)
    assert.ok(listA.body.items.every((item) => item.companyId === seed.companies.a))

    // 关键词搜索公司B 工单号无结果。
    const searchB = await apiJson(url, submitterA, '/api/tickets?status=ALL&q=TK-000009')
    assert.equal(searchB.body.total, 0)

    // 打开公司B 工单详情与回复均 404，不泄露存在性。
    const detail = await apiJson(url, submitterA, '/api/tickets/TK-000009')
    assert.equal(detail.response.status, 404)
    assert.deepEqual(detail.body, { error: 'ticket_not_found' })
    const reply = await apiJson(url, submitterA, '/api/tickets/TK-000009/replies', {
      method: 'POST',
      body: JSON.stringify({ content: '越权回复' }),
    })
    assert.equal(reply.response.status, 404)
    assert.deepEqual(reply.body, { error: 'ticket_not_found' })

    // 公司B 提交人对公司A 工单同样 404。
    const detailB = await apiJson(url, submitterB, '/api/tickets/TK-000001')
    assert.equal(detailB.response.status, 404)
    const listB = await apiJson(url, submitterB, '/api/tickets')
    assert.equal(listB.body.total, 2)
    assert.ok(listB.body.items.every((item) => item.companyId === seed.companies.b))

    // handler 跨公司可见。
    const handlerDetail = await apiJson(url, handlerA, '/api/tickets/TK-000009')
    assert.equal(handlerDetail.response.status, 200)
    assert.equal(handlerDetail.body.companyName, '公司B')
  })
})

test('ticket creation auto-assigns by category rule and reads back all fields', async () => {
  await withTicketApp(async (url) => {
    const submitter = await loginAs(url, seed.users.submitterA1)
    const handler = await loginAs(url, seed.users.handlerA1)

    // 请求体携带 companyId 字段应被忽略：创建公司取当前用户。
    const { response, body } = await apiJson(url, submitter, '/api/tickets', {
      method: 'POST',
      body: JSON.stringify({
        title: '无法登录移动端',
        description: '移动端登录提示网络异常，桌面端正常。',
        category: '登录问题',
        priority: 'P2',
        companyId: seed.companies.b,
      }),
    })
    assert.equal(response.status, 201)
    assert.equal(body.id, 'TK-000011')
    assert.equal(body.status, 'PROCESSING')
    assert.equal(body.companyId, seed.companies.a)
    assert.equal(body.companyName, '公司A')
    assert.equal(body.title, '无法登录移动端')
    assert.equal(body.description, '移动端登录提示网络异常，桌面端正常。')
    assert.equal(body.category, '登录问题')
    assert.equal(body.priority, 'P2')
    assert.equal(body.submitter.id, seed.ids.submitterA1)
    assert.equal(body.submitter.name, '研发提交人一')
    assert.equal(body.submitter.email, seed.users.submitterA1)
    assert.equal(body.submitter.department, '研发部')
    assert.equal(body.assignedGroupId, seed.groups.a1)
    assert.equal(body.assignedGroupName, '技术支持组')
    assert.ok(ISO_TIMESTAMP.test(body.createdAt))
    assert.equal(body.rating, null)

    // 读回详情与创建响应一致（AC-01 持久化证据）。
    const detail = await apiJson(url, submitter, `/api/tickets/${body.id}`)
    assert.equal(detail.response.status, 200)
    assert.deepEqual(detail.body, body)

    // 未配置规则的分类保持待分配（AC-06 降级路径）。
    const unmatched = await apiJson(url, submitter, '/api/tickets', {
      method: 'POST',
      body: JSON.stringify({
        title: '新功能咨询',
        description: '请问报表模块是否支持自定义字段。',
        category: '未知分类',
        priority: 'P4',
      }),
    })
    assert.equal(unmatched.response.status, 201)
    assert.equal(unmatched.body.status, 'PENDING_ASSIGNMENT')
    assert.equal(unmatched.body.assignedGroupId, null)

    // 提交人以外角色不能创建。
    const forbidden = await apiJson(url, handler, '/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ title: 'x', description: 'y', category: '登录问题', priority: 'P3' }),
    })
    assert.equal(forbidden.response.status, 403)
    assert.deepEqual(forbidden.body, { error: 'forbidden' })

    // 字段校验：缺 title / 非法 priority。
    const missingTitle = await apiJson(url, submitter, '/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ description: 'y', category: '登录问题', priority: 'P3' }),
    })
    assert.equal(missingTitle.response.status, 400)
    assert.deepEqual(missingTitle.body, { error: 'invalid_request' })
    const badPriority = await apiJson(url, submitter, '/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ title: 'x', description: 'y', category: '登录问题', priority: 'P9' }),
    })
    assert.equal(badPriority.response.status, 400)
  })
})

test('lifecycle transitions persist and reject invalid repeats', async () => {
  await withTicketApp(async (url) => {
    const submitter = await loginAs(url, seed.users.submitterA1)
    const handler = await loginAs(url, seed.users.handlerA1)

    const created = await apiJson(url, submitter, '/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ title: '待分配工单', description: '等待人工处理。', category: '未知分类', priority: 'P2' }),
    })
    const ticketId = created.body.id
    assert.equal(created.body.status, 'PENDING_ASSIGNMENT')

    // 人工分配 → PROCESSING。
    const assigned = await apiJson(url, handler, `/api/tickets/${ticketId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ groupId: seed.groups.a1, assigneeId: seed.ids.handlerA1 }),
    })
    assert.equal(assigned.response.status, 200)
    assert.equal(assigned.body.status, 'PROCESSING')
    assert.equal(assigned.body.assignedGroupId, seed.groups.a1)
    assert.equal(assigned.body.assigneeId, seed.ids.handlerA1)
    assert.equal(assigned.body.assigneeName, '处理人甲')

    // 重复分配 → 409 invalid_state。
    const reAssign = await apiJson(url, handler, `/api/tickets/${ticketId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ groupId: seed.groups.a1 }),
    })
    assert.equal(reAssign.response.status, 409)
    assert.deepEqual(reAssign.body, { error: 'invalid_state' })

    // 完成 → COMPLETED，记录处理人与处理时间（AC-09）。
    const completed = await apiJson(url, handler, `/api/tickets/${ticketId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ resolution: '已修复配置问题。' }),
    })
    assert.equal(completed.response.status, 200)
    assert.equal(completed.body.status, 'COMPLETED')
    assert.equal(completed.body.completedById, seed.ids.handlerA1)
    assert.ok(ISO_TIMESTAMP.test(completed.body.completedAt))

    // 关闭后再次查看状态保持（AC-02 持久化证据）。
    const reopened = await apiJson(url, submitter, `/api/tickets/${ticketId}`)
    assert.equal(reopened.body.status, 'COMPLETED')
    assert.equal(reopened.body.completedAt, completed.body.completedAt)
    const reComplete = await apiJson(url, handler, `/api/tickets/${ticketId}/complete`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    assert.equal(reComplete.response.status, 409)

    // 另一张工单：提交人取消 → CANCELLED 保持；handler 取消被拒。
    const another = await apiJson(url, submitter, '/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ title: '误提交工单', description: '重复提交，作废。', category: '未知分类', priority: 'P4' }),
    })
    const handlerCancel = await apiJson(url, handler, `/api/tickets/${another.body.id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'x' }),
    })
    assert.equal(handlerCancel.response.status, 403)
    const cancelled = await apiJson(url, submitter, `/api/tickets/${another.body.id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: '重复提交' }),
    })
    assert.equal(cancelled.response.status, 200)
    assert.equal(cancelled.body.status, 'CANCELLED')
    const cancelledAgain = await apiJson(url, submitter, `/api/tickets/${another.body.id}`)
    assert.equal(cancelledAgain.body.status, 'CANCELLED')
    const reCancel = await apiJson(url, submitter, `/api/tickets/${another.body.id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    assert.equal(reCancel.response.status, 409)
    assert.deepEqual(reCancel.body, { error: 'invalid_state' })

    // 提交人只能取消本人提交的工单（本公司他人工单 → 403）。
    const foreignCancel = await apiJson(url, submitter, '/api/tickets/TK-000007/cancel', {
      method: 'POST',
      body: JSON.stringify({ reason: 'x' }),
    })
    assert.equal(foreignCancel.response.status, 403)
    assert.deepEqual(foreignCancel.body, { error: 'forbidden' })

    // 未知工单 → 404。
    const unknown = await apiJson(url, handler, '/api/tickets/TK-999999/complete', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    assert.equal(unknown.response.status, 404)
    assert.deepEqual(unknown.body, { error: 'ticket_not_found' })
  })
})

test('multi-round replies record author and time and backfill first reply', async () => {
  await withTicketApp(async (url) => {
    const handler = await loginAs(url, seed.users.handlerA1)
    const submitter3 = await loginAs(url, seed.users.submitterA3)
    const submitter1 = await loginAs(url, seed.users.submitterA1)

    // 处理人回复 + 提交人回复（AC-04）。
    const handlerReply = await apiJson(url, handler, '/api/tickets/TK-000003/replies', {
      method: 'POST',
      body: JSON.stringify({ content: '正在与财务核对上月账单。' }),
    })
    assert.equal(handlerReply.response.status, 201)
    assert.equal(handlerReply.body.authorId, seed.ids.handlerA1)
    assert.equal(handlerReply.body.authorName, '处理人甲')
    assert.equal(handlerReply.body.authorRole, 'handler')
    assert.ok(ISO_TIMESTAMP.test(handlerReply.body.createdAt))

    const submitterReply = await apiJson(url, submitter3, '/api/tickets/TK-000003/replies', {
      method: 'POST',
      body: JSON.stringify({ content: '好的，请尽快回复。' }),
    })
    assert.equal(submitterReply.response.status, 201)
    assert.equal(submitterReply.body.authorRole, 'submitter')
    // 契约时间为毫秒精度：两次回复可能落在同一毫秒，只断言时间不回退。
    assert.ok(submitterReply.body.createdAt >= handlerReply.body.createdAt)

    // 回复按时间升序、种子里已有一条，共 3 条且可区分回复人与时间。
    const replies = await apiJson(url, submitter3, '/api/tickets/TK-000003/replies')
    assert.equal(replies.response.status, 200)
    assert.equal(replies.body.items.length, 3)
    for (let i = 1; i < replies.body.items.length; i++) {
      assert.ok(replies.body.items[i].createdAt >= replies.body.items[i - 1].createdAt)
    }
    // 同毫秒内两轮回复按 (createdAt, id) 稳定排序，回复人与顺序仍可确定区分。
    assert.equal(replies.body.items[1].id, handlerReply.body.id)
    assert.equal(replies.body.items[1].authorId, seed.ids.handlerA1)
    assert.equal(replies.body.items[2].id, submitterReply.body.id)
    assert.equal(replies.body.items[2].authorId, seed.ids.submitterA3)

    // 首条回复回填 firstReplyAt：种子单已带回复，新建单验证回填与不覆盖。
    const created = await apiJson(url, submitter1, '/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ title: '首回测试', description: '验证首回时间回填。', category: '未知分类', priority: 'P3' }),
    })
    assert.equal(created.body.firstReplyAt, null)
    const firstReply = await apiJson(url, handler, `/api/tickets/${created.body.id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content: '收到，处理中。' }),
    })
    const afterFirst = await apiJson(url, submitter1, `/api/tickets/${created.body.id}`)
    assert.equal(afterFirst.body.firstReplyAt, firstReply.body.createdAt)
    await apiJson(url, handler, `/api/tickets/${created.body.id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content: '再回复一次。' }),
    })
    const afterSecond = await apiJson(url, submitter1, `/api/tickets/${created.body.id}`)
    assert.equal(afterSecond.body.firstReplyAt, firstReply.body.createdAt)

    // 提交人只能回复本人提交的工单（同公司他人工单 → 403；跨公司 → 404）。
    const foreignReply = await apiJson(url, submitter1, '/api/tickets/TK-000003/replies', {
      method: 'POST',
      body: JSON.stringify({ content: 'x' }),
    })
    assert.equal(foreignReply.response.status, 403)
    assert.deepEqual(foreignReply.body, { error: 'forbidden' })
    const crossCompanyReply = await apiJson(url, await loginAs(url, seed.users.submitterB1), '/api/tickets/TK-000003/replies', {
      method: 'POST',
      body: JSON.stringify({ content: 'x' }),
    })
    assert.equal(crossCompanyReply.response.status, 404)

    // 终态工单关闭回复（AC-02/契约 §5.2）。
    const closedReply = await apiJson(url, handler, '/api/tickets/TK-000001/replies', {
      method: 'POST',
      body: JSON.stringify({ content: 'x' }),
    })
    assert.equal(closedReply.response.status, 409)
    assert.deepEqual(closedReply.body, { error: 'invalid_state' })
  })
})

test('reassign changes ownership with traceable logs', async () => {
  await withTicketApp(async (url) => {
    const handler = await loginAs(url, seed.users.handlerA1)
    const submitter = await loginAs(url, seed.users.submitterA1)

    const created = await apiJson(url, submitter, '/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ title: '转派测试', description: '验证转派归属变更。', category: '登录问题', priority: 'P2' }),
    })
    const ticketId = created.body.id
    assert.equal(created.body.assignedGroupId, seed.groups.a1)

    // 组转派 → 归属变更，状态保持 PROCESSING（AC-07）。
    const toGroup = await apiJson(url, handler, `/api/tickets/${ticketId}/reassign`, {
      method: 'POST',
      body: JSON.stringify({ groupId: seed.groups.a2 }),
    })
    assert.equal(toGroup.response.status, 200)
    assert.equal(toGroup.body.assignedGroupId, seed.groups.a2)
    assert.equal(toGroup.body.assignedGroupName, '售后服务组')
    assert.equal(toGroup.body.status, 'PROCESSING')

    // 处理人转派。
    const toAssignee = await apiJson(url, handler, `/api/tickets/${ticketId}/reassign`, {
      method: 'POST',
      body: JSON.stringify({ assigneeId: seed.ids.handlerA2 }),
    })
    assert.equal(toAssignee.body.assigneeId, seed.ids.handlerA2)
    assert.equal(toAssignee.body.assigneeName, '处理人乙')

    // 转派日志可追溯（目标组名与处理人姓名）。
    const logs = await apiJson(url, handler, `/api/tickets/${ticketId}/logs`)
    const reassignedLogs = logs.body.items.filter((item) => item.action === 'ticket.reassigned')
    assert.equal(reassignedLogs.length, 2)
    assert.ok(reassignedLogs[0].detail.includes('售后服务组'))
    assert.ok(reassignedLogs[1].detail.includes('处理人乙'))

    // 参数校验与公司匹配。
    const empty = await apiJson(url, handler, `/api/tickets/${ticketId}/reassign`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    assert.equal(empty.response.status, 400)
    const crossCompanyGroup = await apiJson(url, handler, `/api/tickets/${ticketId}/reassign`, {
      method: 'POST',
      body: JSON.stringify({ groupId: seed.groups.b1 }),
    })
    assert.equal(crossCompanyGroup.response.status, 400)
    assert.deepEqual(crossCompanyGroup.body, { error: 'group_company_mismatch' })

    // 待分配工单不可转派。
    const pending = await apiJson(url, submitter, '/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ title: '未分配单', description: '等待分配。', category: '未知分类', priority: 'P3' }),
    })
    const pendingReassign = await apiJson(url, handler, `/api/tickets/${pending.body.id}/reassign`, {
      method: 'POST',
      body: JSON.stringify({ groupId: seed.groups.a1 }),
    })
    assert.equal(pendingReassign.response.status, 409)

    // 提交人不可转派。
    const forbidden = await apiJson(url, submitter, `/api/tickets/${ticketId}/reassign`, {
      method: 'POST',
      body: JSON.stringify({ groupId: seed.groups.a1 }),
    })
    assert.equal(forbidden.response.status, 403)
  })
})

test('completion records handler, notification and rating flow', async () => {
  await withTicketApp(async (url) => {
    const handler = await loginAs(url, seed.users.handlerA1)
    const submitter = await loginAs(url, seed.users.submitterA1)
    const submitter2 = await loginAs(url, seed.users.submitterA2)

    const created = await apiJson(url, submitter, '/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ title: '完成通知测试', description: '验证完成邮件与评价。', category: '登录问题', priority: 'P1' }),
    })
    const ticketId = created.body.id

    // 评价仅限已完成工单（AC-10 前置）。
    const prematureRating = await apiJson(url, submitter, `/api/tickets/${ticketId}/rating`, {
      method: 'POST',
      body: JSON.stringify({ score: 5 }),
    })
    assert.equal(prematureRating.response.status, 409)
    assert.deepEqual(prematureRating.body, { error: 'invalid_state' })

    const completed = await apiJson(url, handler, `/api/tickets/${ticketId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ resolution: '已重置账号并通知。' }),
    })
    assert.equal(completed.response.status, 200)
    assert.equal(completed.body.status, 'COMPLETED')

    // 通知记录：SMTP 未配置 → skipped，主题含工单号（AC-09）。
    const notifications = await apiJson(url, submitter, `/api/tickets/${ticketId}/notifications`)
    assert.equal(notifications.response.status, 200)
    assert.equal(notifications.body.items.length, 1)
    const record = notifications.body.items[0]
    assert.equal(record.status, 'skipped')
    assert.equal(record.toEmail, seed.users.submitterA1)
    assert.ok(record.subject.includes(ticketId))
    assert.ok(record.subject.includes('完成通知测试'))
    assert.equal(record.error, null)

    // 重复完成不再发送邮件（幂等）。
    await apiJson(url, handler, `/api/tickets/${ticketId}/complete`, { method: 'POST', body: JSON.stringify({}) })
    const notificationsAfterRepeat = await apiJson(url, submitter, `/api/tickets/${ticketId}/notifications`)
    assert.equal(notificationsAfterRepeat.body.items.length, 1)

    // handler 也能查看通知记录；其他提交人（同公司非本人）→ 403。
    const handlerNotifications = await apiJson(url, handler, `/api/tickets/${ticketId}/notifications`)
    assert.equal(handlerNotifications.response.status, 200)
    const foreignNotifications = await apiJson(url, submitter2, `/api/tickets/${ticketId}/notifications`)
    assert.equal(foreignNotifications.response.status, 403)
    assert.deepEqual(foreignNotifications.body, { error: 'forbidden' })

    // 提交人评价 → 读回（AC-10）。
    const rating = await apiJson(url, submitter, `/api/tickets/${ticketId}/rating`, {
      method: 'POST',
      body: JSON.stringify({ score: 5, comment: '处理很及时。' }),
    })
    assert.equal(rating.response.status, 201)
    assert.equal(rating.body.score, 5)
    assert.equal(rating.body.comment, '处理很及时。')
    assert.ok(ISO_TIMESTAMP.test(rating.body.ratedAt))
    const detail = await apiJson(url, submitter, `/api/tickets/${ticketId}`)
    assert.equal(detail.body.rating.score, 5)
    assert.equal(detail.body.rating.comment, '处理很及时。')
    assert.equal(detail.body.rating.ratedAt, rating.body.ratedAt)

    // 重复评价 → 409 rating_exists。
    const duplicate = await apiJson(url, submitter, `/api/tickets/${ticketId}/rating`, {
      method: 'POST',
      body: JSON.stringify({ score: 4 }),
    })
    assert.equal(duplicate.response.status, 409)
    assert.deepEqual(duplicate.body, { error: 'rating_exists' })

    // 非提交人评价 → 403（其他 submitter 与 handler）。
    const foreignRating = await apiJson(url, submitter2, `/api/tickets/${ticketId}/rating`, {
      method: 'POST',
      body: JSON.stringify({ score: 3 }),
    })
    assert.equal(foreignRating.response.status, 403)
    const handlerRating = await apiJson(url, handler, `/api/tickets/${ticketId}/rating`, {
      method: 'POST',
      body: JSON.stringify({ score: 3 }),
    })
    assert.equal(handlerRating.response.status, 403)
    assert.deepEqual(handlerRating.body, { error: 'forbidden' })

    // 非法分数 → 400。
    const badScore = await apiJson(url, submitter, `/api/tickets/${ticketId}/rating`, {
      method: 'POST',
      body: JSON.stringify({ score: 0 }),
    })
    assert.equal(badScore.response.status, 400)
  })
})

test('handler sees submitter full info with history tickets', async () => {
  await withTicketApp(async (url) => {
    const handler = await loginAs(url, seed.users.handlerA1)
    const submitter = await loginAs(url, seed.users.submitterA1)

    const { response, body } = await apiJson(url, handler, '/api/tickets/TK-000001/submitter')
    assert.equal(response.status, 200)
    assert.equal(body.user.id, seed.ids.submitterA1)
    assert.equal(body.user.name, '研发提交人一')
    assert.equal(body.user.email, seed.users.submitterA1)
    assert.equal(body.user.companyName, '公司A')
    assert.equal(body.user.department, '研发部')
    // 历史工单按 createdAt desc：TK-000004（10-03）→ TK-000002（10-02）→ TK-000001（10-01）。
    assert.deepEqual(
      body.historyTickets.map((ticket) => ticket.id),
      ['TK-000004', 'TK-000002', 'TK-000001'],
    )
    assert.ok(body.historyTickets.every((ticket) => ticket.submitter.id === seed.ids.submitterA1))
    assert.equal(body.historyTickets.find((ticket) => ticket.id === 'TK-000001').replyCount, 2)
    assert.equal(body.historyTickets.find((ticket) => ticket.id === 'TK-000001').unreadHint, false)

    // submitter 无处理视角。
    const forbidden = await apiJson(url, submitter, '/api/tickets/TK-000001/submitter')
    assert.equal(forbidden.response.status, 403)
  })
})

test('workbench supports filters, search, sort, company scope and pagination', async () => {
  await withTicketApp(async (url) => {
    const handler = await loginAs(url, seed.users.handlerA1)
    const submitter = await loginAs(url, seed.users.submitterA1)

    // handler 默认待处理队列（PROCESSING）。
    const defaults = await apiJson(url, handler, '/api/tickets')
    assert.equal(defaults.body.total, 1)
    assert.equal(defaults.body.items[0].id, 'TK-000003')

    // 待分配队列。
    const pending = await apiJson(url, handler, '/api/tickets?status=PENDING_ASSIGNMENT')
    assert.equal(pending.body.total, 3)

    // 公司维度筛选（AC-11）。
    const companyB = await apiJson(url, handler, '/api/tickets?status=ALL&company=c-b')
    assert.equal(companyB.body.total, 2)
    assert.ok(companyB.body.items.every((item) => item.companyId === seed.companies.b))

    // 分类 + 公司组合。
    const category = await apiJson(url, handler, '/api/tickets?status=ALL&company=c-a&category=登录问题')
    assert.equal(category.body.total, 4)

    // 优先级等值筛选。
    const priority = await apiJson(url, handler, '/api/tickets?status=ALL&priority=P0')
    assert.equal(priority.body.total, 1)
    assert.equal(priority.body.items[0].id, 'TK-000003')

    // 关键词搜索（工单号/主题/描述，大小写不敏感）。
    const byId = await apiJson(url, handler, '/api/tickets?status=ALL&q=tk-000009')
    assert.equal(byId.body.total, 1)
    const byKeyword = await apiJson(url, handler, '/api/tickets?status=ALL&q=账单')
    assert.equal(byKeyword.body.total, 1)
    assert.equal(byKeyword.body.items[0].id, 'TK-000003')
    const byDescription = await apiJson(url, handler, '/api/tickets?status=ALL&q=凭证')
    assert.equal(byDescription.body.total, 1)
    assert.equal(byDescription.body.items[0].id, 'TK-000001')

    // 优先级排序：P0 最紧急在前（升序）。
    const byPriority = await apiJson(url, handler, '/api/tickets?status=ALL&sort=priority&order=asc')
    assert.equal(byPriority.body.items[0].id, 'TK-000003')
    const priorities = byPriority.body.items.map((item) => item.priority)
    assert.deepEqual([...priorities].sort((a, b) => a.localeCompare(b)), priorities)

    // 创建时间降序默认 + 分页。
    const page1 = await apiJson(url, handler, '/api/tickets?status=ALL&page=1&pageSize=2')
    assert.equal(page1.body.page, 1)
    assert.equal(page1.body.pageSize, 2)
    assert.equal(page1.body.total, 10)
    assert.equal(page1.body.items[0].id, 'TK-000010')
    assert.equal(page1.body.items[1].id, 'TK-000008')
    const page2 = await apiJson(url, handler, '/api/tickets?status=ALL&page=2&pageSize=2')
    assert.equal(page2.body.items.length, 2)

    // submitter 传入 company 参数被忽略并强制本公司。
    const submitterScoped = await apiJson(url, submitter, '/api/tickets?status=ALL&company=c-b')
    assert.equal(submitterScoped.body.total, 8)
    assert.ok(submitterScoped.body.items.every((item) => item.companyId === seed.companies.a))

    // 非法参数 → 400。
    const badStatus = await apiJson(url, handler, '/api/tickets?status=INVALID')
    assert.equal(badStatus.response.status, 400)
    assert.deepEqual(badStatus.body, { error: 'invalid_request' })
    const badPageSize = await apiJson(url, handler, '/api/tickets?status=ALL&pageSize=101')
    assert.equal(badPageSize.response.status, 400)
    const badSort = await apiJson(url, handler, '/api/tickets?sort=unknown')
    assert.equal(badSort.response.status, 400)
  })
})

test('stats distribution and dashboard match seeded data', async () => {
  await withTicketApp(async (url) => {
    const handler = await loginAs(url, seed.users.handlerA1)
    const submitter = await loginAs(url, seed.users.submitterA1)

    // 按公司分布（AC-12）。
    const byCompany = await apiJson(url, handler, '/api/stats/distribution?dimension=company')
    assert.equal(byCompany.response.status, 200)
    assert.deepEqual(byCompany.body, {
      dimension: 'company',
      items: [
        { key: '公司A', companyId: seed.companies.a, count: 8 },
        { key: '公司B', companyId: seed.companies.b, count: 2 },
      ],
    })

    // 按部门分布（含 null 部门）。
    const byDepartment = await apiJson(url, handler, '/api/stats/distribution?dimension=department')
    assert.deepEqual(byDepartment.body, {
      dimension: 'department',
      items: [
        { key: '研发部', count: 5 },
        { key: '市场部', count: 2 },
        { key: '运营部', count: 2 },
        { key: null, count: 1 },
      ],
    })

    // 限定公司后的部门分布。
    const departmentInA = await apiJson(url, handler, '/api/stats/distribution?dimension=department&company=c-a')
    assert.deepEqual(departmentInA.body.items, [
      { key: '研发部', count: 5 },
      { key: '市场部', count: 2 },
      { key: null, count: 1 },
    ])

    // 仪表盘四类指标。
    const dashboard = await apiJson(url, handler, '/api/stats/dashboard')
    assert.equal(dashboard.response.status, 200)
    assert.equal(dashboard.body.totalTickets, 10)
    assert.equal(dashboard.body.avgResponseMinutes, 66)
    assert.deepEqual(dashboard.body.satisfaction, { avgScore: 3.5, ratedCount: 4 })
    assert.deepEqual(
      dashboard.body.hotCategories.map((item) => item.category),
      ['登录问题', '数据问题', '账单问题', '其他问题', '网络问题'],
    )
    assert.deepEqual(
      dashboard.body.hotCategories.map((item) => item.count),
      [4, 2, 2, 1, 1],
    )

    // 限定公司的仪表盘。
    const dashboardB = await apiJson(url, handler, '/api/stats/dashboard?company=c-b')
    assert.equal(dashboardB.body.totalTickets, 2)
    assert.equal(dashboardB.body.avgResponseMinutes, 30)
    assert.deepEqual(dashboardB.body.satisfaction, { avgScore: 2, ratedCount: 1 })
    assert.equal(dashboardB.body.hotCategories.length, 2)

    // submitter 无统计权限。
    const forbidden = await apiJson(url, submitter, '/api/stats/dashboard')
    assert.equal(forbidden.response.status, 403)
    assert.deepEqual(forbidden.body, { error: 'forbidden' })

    // 非法维度 → 400 invalid_dimension。
    const badDimension = await apiJson(url, handler, '/api/stats/distribution?dimension=foo')
    assert.equal(badDimension.response.status, 400)
    assert.deepEqual(badDimension.body, { error: 'invalid_dimension' })
  })
})

test('ticket logs record all operations in time order', async () => {
  await withTicketApp(async (url) => {
    const handler = await loginAs(url, seed.users.handlerA1)
    const submitter = await loginAs(url, seed.users.submitterA1)

    const created = await apiJson(url, submitter, '/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ title: '日志链路测试', description: '验证完整操作日志。', category: '登录问题', priority: 'P2' }),
    })
    const ticketId = created.body.id

    await apiJson(url, handler, `/api/tickets/${ticketId}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content: '已接收工单。' }),
    })
    await apiJson(url, handler, `/api/tickets/${ticketId}/reassign`, {
      method: 'POST',
      body: JSON.stringify({ assigneeId: seed.ids.handlerA2 }),
    })
    await apiJson(url, handler, `/api/tickets/${ticketId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ resolution: '处理完毕。' }),
    })
    await apiJson(url, submitter, `/api/tickets/${ticketId}/rating`, {
      method: 'POST',
      body: JSON.stringify({ score: 4, comment: '满意' }),
    })

    // 顺序：创建（提交人）→ 自动分配（系统）→ 回复 → 转派 → 完成 → 评价。
    const { response, body } = await apiJson(url, submitter, `/api/tickets/${ticketId}/logs`)
    assert.equal(response.status, 200)
    assert.deepEqual(
      body.items.map((item) => item.action),
      [
        'ticket.created',
        'ticket.assigned',
        'ticket.replied',
        'ticket.reassigned',
        'ticket.completed',
        'ticket.rated',
      ],
    )
    assert.equal(body.items[0].actorId, seed.ids.submitterA1)
    assert.equal(body.items[0].actorName, '研发提交人一')
    assert.equal(body.items[0].detail, null)
    assert.equal(body.items[1].actorId, null)
    assert.equal(body.items[1].actorName, null)
    assert.ok(body.items[1].detail.includes('技术支持组'))
    assert.equal(body.items[2].actorId, seed.ids.handlerA1)
    assert.ok(body.items[4].detail.includes('处理完毕'))
    assert.ok(body.items[5].detail.includes('满意'))
    for (let i = 1; i < body.items.length; i++) {
      assert.ok(body.items[i].createdAt >= body.items[i - 1].createdAt)
    }

    // 工单可见者可读日志（submitter 本人）。
    const asSubmitter = await apiJson(url, submitter, `/api/tickets/${ticketId}/logs`)
    assert.equal(asSubmitter.response.status, 200)
    const asForeignSubmitter = await apiJson(url, await loginAs(url, seed.users.submitterB1), `/api/tickets/${ticketId}/logs`)
    assert.equal(asForeignSubmitter.response.status, 404)
  })
})

test('companies, groups, members and category rules are manageable', async () => {
  await withTicketApp(async (url) => {
    const admin = await loginAs(url, seed.users.adminA)
    const handler = await loginAs(url, seed.users.handlerA1)
    const submitter = await loginAs(url, seed.users.submitterA1)

    // 公司列表（handler/admin）。
    const companies = await apiJson(url, handler, '/api/companies')
    assert.equal(companies.response.status, 200)
    assert.equal(companies.body.items.length, 2)
    const submitterCompanies = await apiJson(url, submitter, '/api/companies')
    assert.equal(submitterCompanies.response.status, 403)

    // 创建业务组并设置成员（AC-05）。
    const created = await apiJson(url, admin, '/api/groups', {
      method: 'POST',
      body: JSON.stringify({ companyId: seed.companies.a, name: '测试支持组', memberIds: [seed.ids.handlerA1] }),
    })
    assert.equal(created.response.status, 201)
    assert.equal(created.body.companyId, seed.companies.a)
    assert.equal(created.body.name, '测试支持组')
    assert.deepEqual(created.body.members, [{ userId: seed.ids.handlerA1, userName: '处理人甲' }])
    const groupId = created.body.id

    // 重复组名 → 409；跨公司成员 → 400；公司不存在 → 404；非 admin → 403。
    const conflict = await apiJson(url, admin, '/api/groups', {
      method: 'POST',
      body: JSON.stringify({ companyId: seed.companies.a, name: '测试支持组' }),
    })
    assert.equal(conflict.response.status, 409)
    assert.deepEqual(conflict.body, { error: 'group_name_conflict' })
    const foreignMember = await apiJson(url, admin, '/api/groups', {
      method: 'POST',
      body: JSON.stringify({ companyId: seed.companies.a, name: '另一个组', memberIds: [seed.ids.handlerB1] }),
    })
    assert.equal(foreignMember.response.status, 400)
    assert.deepEqual(foreignMember.body, { error: 'invalid_member' })
    const unknownCompany = await apiJson(url, admin, '/api/groups', {
      method: 'POST',
      body: JSON.stringify({ companyId: 'c-x', name: '无效组' }),
    })
    assert.equal(unknownCompany.response.status, 404)
    assert.deepEqual(unknownCompany.body, { error: 'company_not_found' })
    const forbiddenCreate = await apiJson(url, handler, '/api/groups', {
      method: 'POST',
      body: JSON.stringify({ companyId: seed.companies.a, name: 'handler建的组' }),
    })
    assert.equal(forbiddenCreate.response.status, 403)

    // 组列表（含新组与成员）。
    const groups = await apiJson(url, handler, `/api/groups?companyId=${seed.companies.a}`)
    assert.equal(groups.response.status, 200)
    assert.equal(groups.body.items.length, 3)
    const newGroup = groups.body.items.find((item) => item.id === groupId)
    assert.equal(newGroup.companyName, '公司A')
    assert.deepEqual(newGroup.members, [{ userId: seed.ids.handlerA1, userName: '处理人甲' }])
    const groupsMissingParam = await apiJson(url, admin, '/api/groups')
    assert.equal(groupsMissingParam.response.status, 400)
    const groupsForbidden = await apiJson(url, submitter, `/api/groups?companyId=${seed.companies.a}`)
    assert.equal(groupsForbidden.response.status, 403)

    // 更新组：改名 + 成员全量覆盖。
    const updated = await apiJson(url, admin, `/api/groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: '测试支持组二', memberIds: [seed.ids.handlerA2] }),
    })
    assert.equal(updated.response.status, 200)
    assert.equal(updated.body.name, '测试支持组二')
    assert.deepEqual(updated.body.members, [{ userId: seed.ids.handlerA2, userName: '处理人乙' }])
    const updatedReadback = await apiJson(url, handler, `/api/groups?companyId=${seed.companies.a}`)
    assert.equal(
      updatedReadback.body.items.find((item) => item.id === groupId).members.length,
      1,
    )
    const unknownGroup = await apiJson(url, admin, '/api/groups/g-none', {
      method: 'PUT',
      body: JSON.stringify({ name: 'x' }),
    })
    assert.equal(unknownGroup.response.status, 404)
    assert.deepEqual(unknownGroup.body, { error: 'group_not_found' })

    // 分类规则：创建、冲突、公司不匹配。
    const rule = await apiJson(url, admin, '/api/category-rules', {
      method: 'POST',
      body: JSON.stringify({ companyId: seed.companies.a, category: '权限问题', groupId }),
    })
    assert.equal(rule.response.status, 201)
    assert.equal(rule.body.category, '权限问题')
    assert.equal(rule.body.groupName, '测试支持组二')
    const ruleConflict = await apiJson(url, admin, '/api/category-rules', {
      method: 'POST',
      body: JSON.stringify({ companyId: seed.companies.a, category: '权限问题', groupId: seed.groups.a1 }),
    })
    assert.equal(ruleConflict.response.status, 409)
    assert.deepEqual(ruleConflict.body, { error: 'rule_conflict' })
    const ruleMismatch = await apiJson(url, admin, '/api/category-rules', {
      method: 'POST',
      body: JSON.stringify({ companyId: seed.companies.a, category: '网络问题', groupId: seed.groups.b1 }),
    })
    assert.equal(ruleMismatch.response.status, 400)
    assert.deepEqual(ruleMismatch.body, { error: 'group_company_mismatch' })

    // 规则列表（公司A 种子 2 + 新 1）。
    const rules = await apiJson(url, handler, `/api/category-rules?companyId=${seed.companies.a}`)
    assert.equal(rules.body.items.length, 3)
    const rulesForbidden = await apiJson(url, submitter, `/api/category-rules?companyId=${seed.companies.a}`)
    assert.equal(rulesForbidden.response.status, 403)

    // 新规则对创建生效：该分类自动分配到新组。
    const newTicket = await apiJson(url, submitter, '/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ title: '权限申请', description: '申请开通导出权限。', category: '权限问题', priority: 'P2' }),
    })
    assert.equal(newTicket.body.status, 'PROCESSING')
    assert.equal(newTicket.body.assignedGroupId, groupId)
    assert.equal(newTicket.body.assignedGroupName, '测试支持组二')

    // 删除规则 → 后续同分类创建回到待分配。
    const removed = await api(url, admin, `/api/category-rules/${rule.body.id}`, { method: 'DELETE' })
    assert.equal(removed.status, 204)
    const removedAgain = await apiJson(url, admin, `/api/category-rules/${rule.body.id}`, { method: 'DELETE' })
    assert.equal(removedAgain.response.status, 404)
    assert.deepEqual(removedAgain.body, { error: 'rule_not_found' })
    const afterRemoval = await apiJson(url, submitter, '/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ title: '权限申请二', description: '再次申请。', category: '权限问题', priority: 'P3' }),
    })
    assert.equal(afterRemoval.body.status, 'PENDING_ASSIGNMENT')
    assert.equal(afterRemoval.body.assignedGroupId, null)
  })
})

test('user listing is available to handlers with role and department', async () => {
  await withTicketApp(async (url) => {
    const handler = await loginAs(url, seed.users.handlerA1)
    const submitter = await loginAs(url, seed.users.submitterA1)

    // 默认当前用户公司（公司A 8 人）。
    const users = await apiJson(url, handler, '/api/users')
    assert.equal(users.response.status, 200)
    assert.equal(users.body.items.length, 8)
    const s1 = users.body.items.find((item) => item.id === seed.ids.submitterA1)
    assert.equal(s1.name, '研发提交人一')
    assert.equal(s1.role, 'submitter')
    assert.equal(s1.department, '研发部')
    assert.equal(s1.companyName, '公司A')
    assert.equal(s1.enabled, true)

    // 按公司过滤与搜索。
    const companyB = await apiJson(url, handler, '/api/users?companyId=c-b')
    assert.equal(companyB.body.items.length, 3)
    const search = await apiJson(url, handler, '/api/users?q=处理')
    assert.equal(search.body.items.length, 2)

    // submitter 无权限。
    const forbidden = await apiJson(url, submitter, '/api/users')
    assert.equal(forbidden.response.status, 403)
    assert.deepEqual(forbidden.body, { error: 'forbidden' })
  })
})
