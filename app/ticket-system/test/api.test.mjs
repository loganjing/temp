// 服务端 API 集成测试：以隔离 DB_PATH 启动真实 HTTP 服务，覆盖 AC-01..AC-08 的服务端行为
// 与 technical-contract.md 规定的错误语义。每项测试使用独立数据库与独立 HTTP 监听。
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'
import { authBoundary } from '../src/server/platform/auth.ts'
import { withHttpServer } from './with-http-server.mjs'

async function withTicketApi(verify) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ticket-api-'))
  const previous = process.env.DB_PATH
  process.env.DB_PATH = path.join(directory, 'application.db')
  try {
    const platform = await initializePlatform()
    const app = createApp({
      registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
      registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
      protect: authBoundary,
    })
    await withHttpServer({ fetch: app.fetch, close: () => platform.close() }, async (baseUrl) => {
      const call = async (method, requestPath, body) => {
        const response = await fetch(`${baseUrl}${requestPath}`, {
          method,
          headers: body === undefined ? undefined : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        return { status: response.status, body: await response.json() }
      }
      await verify({
        db: platform.db,
        get: (requestPath) => call('GET', requestPath),
        post: (requestPath, body) => call('POST', requestPath, body),
        put: (requestPath, body) => call('PUT', requestPath, body),
      })
    })
  } finally {
    if (previous === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previous
    await rm(directory, { recursive: true, force: true })
  }
}

// 迁移初始数据：公司 c_1、用户 u_1（张三）/ u_2（王五）、业务组 g_1（网络组，成员 u_2）。
const COMPANY = 'c_1'
const ZHANGSAN = 'u_1'
const WANGWU = 'u_2'
const NETWORK_GROUP = 'g_1'

function ticketPayload(overrides = {}) {
  return {
    operatorId: ZHANGSAN,
    subject: '无法登录邮箱',
    description: '今天早上开始无法登录',
    category: '网络故障',
    priority: 'P2',
    submitter: { name: '张三', email: 'zhangsan@example.com', department: 'IT部' },
    ...overrides,
  }
}

test('bootstrap 返回初始公司、用户与业务组数据', async () => {
  await withTicketApi(async (api) => {
    const bootstrap = await api.get('/api/bootstrap')
    assert.equal(bootstrap.status, 200)
    assert.deepEqual(bootstrap.body.companies, [{ id: COMPANY, name: '示例公司' }])
    const zhangsan = bootstrap.body.users.find((user) => user.id === ZHANGSAN)
    assert.equal(zhangsan.email, 'zhangsan@example.com')
    assert.equal(zhangsan.companyId, COMPANY)
    assert.equal(zhangsan.department, 'IT部')
    const networkGroup = bootstrap.body.groups.find((group) => group.id === NETWORK_GROUP)
    assert.equal(networkGroup.companyId, COMPANY)
    assert.deepEqual(networkGroup.memberIds, [WANGWU])
  })
})

test('AC-01 提交人可创建工单并读回完整信息', async () => {
  await withTicketApi(async (api) => {
    const created = await api.post('/api/tickets', ticketPayload())
    assert.equal(created.status, 201)
    assert.ok(created.body.id.startsWith('TCK-'))
    assert.equal(created.body.status, 'pending_assignment')
    assert.ok(created.body.createdAt)

    const detail = await api.get(`/api/tickets/${created.body.id}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.ticket.id, created.body.id)
    assert.equal(detail.body.ticket.subject, '无法登录邮箱')
    assert.equal(detail.body.ticket.description, '今天早上开始无法登录')
    assert.equal(detail.body.ticket.category, '网络故障')
    assert.equal(detail.body.ticket.priority, 'P2')
    assert.equal(detail.body.ticket.submitter.name, '张三')
    assert.equal(detail.body.ticket.submitter.email, 'zhangsan@example.com')
    assert.equal(detail.body.ticket.submitter.companyId, COMPANY)
    assert.equal(detail.body.ticket.submitter.department, 'IT部')
    assert.equal(detail.body.ticket.createdAt, created.body.createdAt)
    assert.deepEqual(detail.body.replies, [])
    assert.deepEqual(detail.body.transfers, [])
    assert.equal(detail.body.evaluation, null)
  })
})

test('AC-02 工单状态流转、处理记录与取消', async () => {
  await withTicketApi(async (api) => {
    const created = await api.post('/api/tickets', ticketPayload({ category: '软件故障', priority: 'P1' }))
    assert.equal(created.body.status, 'pending_assignment')

    const assigned = await api.post(`/api/tickets/${created.body.id}/assign`, { operatorId: WANGWU, groupId: NETWORK_GROUP })
    assert.equal(assigned.status, 200)
    assert.equal(assigned.body.status, 'pending_handling')
    assert.equal(assigned.body.assignedGroupId, NETWORK_GROUP)

    const completed = await api.post(`/api/tickets/${created.body.id}/complete`, { operatorId: WANGWU })
    assert.equal(completed.status, 200)
    assert.equal(completed.body.status, 'completed')
    assert.equal(completed.body.handlerId, WANGWU)
    assert.ok(completed.body.handledAt)

    // 非法流转：已完成工单再次分配/完成 → 409 且无副作用
    const reassign = await api.post(`/api/tickets/${created.body.id}/assign`, { operatorId: WANGWU, groupId: NETWORK_GROUP })
    assert.equal(reassign.status, 409)
    assert.deepEqual(reassign.body, { error: { code: 'INVALID_STATE', message: '仅待分配工单可以分配' } })
    const recomplete = await api.post(`/api/tickets/${created.body.id}/complete`, { operatorId: WANGWU })
    assert.equal(recomplete.body.error.code, 'INVALID_STATE')
    const cancelCompleted = await api.post(`/api/tickets/${created.body.id}/cancel`, { operatorId: ZHANGSAN })
    assert.equal(cancelCompleted.body.error.code, 'INVALID_STATE')
    const after = await api.get(`/api/tickets/${created.body.id}`)
    assert.equal(after.body.ticket.status, 'completed')
    assert.equal(after.body.ticket.handlerId, WANGWU)

    // 待分配工单不能直接完成
    const pending = await api.post('/api/tickets', ticketPayload({ category: '硬件故障' }))
    const earlyComplete = await api.post(`/api/tickets/${pending.body.id}/complete`, { operatorId: WANGWU })
    assert.equal(earlyComplete.status, 409)
    assert.equal(earlyComplete.body.error.code, 'INVALID_STATE')

    // 完成前任一状态可取消，取消后不再进入处理流程
    const cancelled = await api.post(`/api/tickets/${pending.body.id}/cancel`, { operatorId: ZHANGSAN, note: null })
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.body.status, 'cancelled')
    assert.ok(cancelled.body.cancelledAt)
    const reCancel = await api.post(`/api/tickets/${pending.body.id}/cancel`, { operatorId: ZHANGSAN })
    assert.equal(reCancel.body.error.code, 'INVALID_STATE')
    const replyOnCancelled = await api.post(`/api/tickets/${pending.body.id}/replies`, { operatorId: WANGWU, content: '还能处理吗' })
    assert.equal(replyOnCancelled.status, 409)
    assert.equal(replyOnCancelled.body.error.code, 'INVALID_STATE')
  })
})

test('AC-03 工单支持多轮回复并按时间排序', async () => {
  await withTicketApi(async (api) => {
    const created = await api.post('/api/tickets', ticketPayload())
    await api.post(`/api/tickets/${created.body.id}/assign`, { operatorId: WANGWU, groupId: NETWORK_GROUP })

    const handlerReply = await api.post(`/api/tickets/${created.body.id}/replies`, { operatorId: WANGWU, content: '请重启路由器' })
    assert.equal(handlerReply.status, 201)
    assert.equal(handlerReply.body.ticketId, created.body.id)
    assert.equal(handlerReply.body.authorId, WANGWU)
    assert.equal(handlerReply.body.content, '请重启路由器')
    assert.ok(handlerReply.body.createdAt)

    const submitterReply = await api.post(`/api/tickets/${created.body.id}/replies`, { operatorId: ZHANGSAN, content: '重启后仍然无法登录' })
    assert.equal(submitterReply.status, 201)

    const detail = await api.get(`/api/tickets/${created.body.id}`)
    assert.equal(detail.body.replies.length, 2)
    assert.equal(detail.body.replies[0].authorId, WANGWU)
    assert.equal(detail.body.replies[0].authorName, '王五')
    assert.equal(detail.body.replies[0].content, '请重启路由器')
    assert.equal(detail.body.replies[1].authorId, ZHANGSAN)
    assert.equal(detail.body.replies[1].authorName, '张三')
    assert.equal(detail.body.replies[1].content, '重启后仍然无法登录')
    assert.ok(detail.body.replies[0].createdAt <= detail.body.replies[1].createdAt)
  })
})

test('AC-04 公司可维护多个业务组及其成员', async () => {
  await withTicketApi(async (api) => {
    const accounting = await api.post(`/api/companies/${COMPANY}/groups`, { name: '账务组' })
    assert.equal(accounting.status, 201)
    assert.equal(accounting.body.companyId, COMPANY)
    assert.deepEqual(accounting.body.memberIds, [])
    const hr = await api.post(`/api/companies/${COMPANY}/groups`, { name: '人事组' })

    const lisi = await api.post('/api/users', { name: '李四', email: 'lisi@example.com', companyId: COMPANY, department: '财务部' })
    assert.equal(lisi.status, 201)
    assert.equal(lisi.body.companyId, COMPANY)
    const zhaoliu = await api.post('/api/users', { name: '赵六', email: 'zhaoliu@example.com', companyId: COMPANY, department: null })

    const setAccounting = await api.post(`/api/groups/${accounting.body.id}/members`, { userIds: [lisi.body.id] })
    assert.equal(setAccounting.status, 200)
    assert.deepEqual(setAccounting.body.memberIds, [lisi.body.id])
    await api.post(`/api/groups/${hr.body.id}/members`, { userIds: [zhaoliu.body.id] })

    // 全量替换成员集合
    const replaced = await api.post(`/api/groups/${accounting.body.id}/members`, { userIds: [lisi.body.id, zhaoliu.body.id] })
    assert.deepEqual(replaced.body.memberIds, [lisi.body.id, zhaoliu.body.id])

    const groups = await api.get(`/api/companies/${COMPANY}/groups`)
    const names = groups.body.groups.map((group) => group.name)
    assert.ok(names.includes('网络组'))
    assert.ok(names.includes('账务组'))
    assert.ok(names.includes('人事组'))
    const accountingGroup = groups.body.groups.find((group) => group.name === '账务组')
    assert.deepEqual(accountingGroup.memberIds, [lisi.body.id, zhaoliu.body.id])
    const hrGroup = groups.body.groups.find((group) => group.name === '人事组')
    assert.deepEqual(hrGroup.memberIds, [zhaoliu.body.id])

    // 邮箱重复 → 409 CONFLICT
    const duplicate = await api.post('/api/users', { name: '李四重复', email: 'lisi@example.com', companyId: COMPANY })
    assert.equal(duplicate.status, 409)
    assert.equal(duplicate.body.error.code, 'CONFLICT')

    // 跨公司成员须被拒绝：契约未提供公司创建端点，第二家公司由测试直接写入隔离库
    await api.db.run({
      text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)',
      params: ['c_2', '另一家公司', new Date().toISOString()],
    })
    const otherCompanyGroup = await api.post('/api/companies/c_2/groups', { name: '外部组' })
    const crossCompany = await api.post(`/api/groups/${otherCompanyGroup.body.id}/members`, { userIds: [ZHANGSAN] })
    assert.equal(crossCompany.status, 422)
    assert.equal(crossCompany.body.error.code, 'VALIDATION_ERROR')
  })
})

test('AC-05 工单按分类自动分配到业务组', async () => {
  await withTicketApi(async (api) => {
    const rule = await api.post(`/api/companies/${COMPANY}/assignment-rules`, { category: '网络故障', groupId: NETWORK_GROUP })
    assert.equal(rule.status, 201)
    assert.equal(rule.body.companyId, COMPANY)
    assert.equal(rule.body.groupId, NETWORK_GROUP)

    const duplicate = await api.post(`/api/companies/${COMPANY}/assignment-rules`, { category: '网络故障', groupId: NETWORK_GROUP })
    assert.equal(duplicate.status, 409)
    assert.equal(duplicate.body.error.code, 'CONFLICT')

    const rules = await api.get(`/api/companies/${COMPANY}/assignment-rules`)
    const networkRule = rules.body.rules.find((item) => item.category === '网络故障')
    assert.equal(networkRule.groupId, NETWORK_GROUP)
    assert.equal(networkRule.groupName, '网络组')

    const created = await api.post('/api/tickets', ticketPayload({ priority: 'P0' }))
    assert.equal(created.status, 201)
    assert.equal(created.body.status, 'pending_handling')
    assert.equal(created.body.assignedGroupId, NETWORK_GROUP)

    // 未配置规则的分类仍停留待分配
    const unmatched = await api.post('/api/tickets', ticketPayload({ category: '会议室预订' }))
    assert.equal(unmatched.body.status, 'pending_assignment')
    assert.equal(unmatched.body.assignedGroupId, null)
  })
})

test('AC-06 待处理工单可转派并留有记录', async () => {
  await withTicketApi(async (api) => {
    await api.post(`/api/companies/${COMPANY}/assignment-rules`, { category: '网络故障', groupId: NETWORK_GROUP })
    const accounting = await api.post(`/api/companies/${COMPANY}/groups`, { name: '账务组' })
    const lisi = await api.post('/api/users', { name: '李四', email: 'lisi@example.com', companyId: COMPANY, department: '财务部' })
    await api.post(`/api/groups/${accounting.body.id}/members`, { userIds: [lisi.body.id] })

    const created = await api.post('/api/tickets', ticketPayload())
    assert.equal(created.body.status, 'pending_handling')
    assert.equal(created.body.assignedGroupId, NETWORK_GROUP)

    // 转派到其他业务组：状态保持待处理，归属变更，留转派记录
    const transferred = await api.post(`/api/tickets/${created.body.id}/transfer`, {
      operatorId: WANGWU,
      toGroupId: accounting.body.id,
      note: '需要账务组协助',
    })
    assert.equal(transferred.status, 200)
    assert.equal(transferred.body.ticket.status, 'pending_handling')
    assert.equal(transferred.body.ticket.assignedGroupId, accounting.body.id)
    assert.equal(transferred.body.transfer.ticketId, created.body.id)
    assert.equal(transferred.body.transfer.fromGroupId, NETWORK_GROUP)
    assert.equal(transferred.body.transfer.toGroupId, accounting.body.id)
    assert.equal(transferred.body.transfer.toUserId, null)
    assert.equal(transferred.body.transfer.operatorId, WANGWU)
    assert.equal(transferred.body.transfer.note, '需要账务组协助')
    assert.ok(transferred.body.transfer.createdAt)

    // 转派给成员：以其所属业务组为归属组
    const toMember = await api.post(`/api/tickets/${created.body.id}/transfer`, { operatorId: WANGWU, toUserId: WANGWU })
    assert.equal(toMember.body.ticket.assignedGroupId, NETWORK_GROUP)
    assert.equal(toMember.body.transfer.toUserId, WANGWU)
    assert.equal(toMember.body.transfer.toGroupId, NETWORK_GROUP)

    const detail = await api.get(`/api/tickets/${created.body.id}`)
    assert.equal(detail.body.transfers.length, 2)
    assert.equal(detail.body.transfers[0].fromGroupId, NETWORK_GROUP)
    assert.equal(detail.body.transfers[0].toGroupId, accounting.body.id)
    assert.equal(detail.body.transfers[1].toUserId, WANGWU)
    assert.ok(detail.body.transfers[0].createdAt <= detail.body.transfers[1].createdAt)

    // 非待处理工单转派 → 409
    await api.post(`/api/tickets/${created.body.id}/complete`, { operatorId: WANGWU })
    const invalid = await api.post(`/api/tickets/${created.body.id}/transfer`, { operatorId: WANGWU, toGroupId: accounting.body.id })
    assert.equal(invalid.status, 409)
    assert.equal(invalid.body.error.code, 'INVALID_STATE')

    // 未填写转派目标 → 422
    const pending = await api.post('/api/tickets', ticketPayload())
    const noTarget = await api.post(`/api/tickets/${pending.body.id}/transfer`, { operatorId: WANGWU })
    assert.equal(noTarget.status, 422)
    assert.equal(noTarget.body.error.code, 'VALIDATION_ERROR')

    // 跨公司转派目标须被拒绝
    await api.db.run({
      text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)',
      params: ['c_2', '另一家公司', new Date().toISOString()],
    })
    const foreignGroup = await api.post('/api/companies/c_2/groups', { name: '外部组' })
    const crossCompany = await api.post(`/api/tickets/${pending.body.id}/transfer`, { operatorId: WANGWU, toGroupId: foreignGroup.body.id })
    assert.equal(crossCompany.status, 422)
    assert.equal(crossCompany.body.error.code, 'VALIDATION_ERROR')
  })
})

test('AC-07 处理人可查看提交人完整信息与历史工单', async () => {
  await withTicketApi(async (api) => {
    const first = await api.post('/api/tickets', ticketPayload({ subject: '无法登录邮箱' }))
    // 提交人按邮箱归并：同名同邮箱不同部门更新既有用户记录
    const second = await api.post('/api/tickets', ticketPayload({
      subject: '邮箱附件发送失败',
      submitter: { name: '张三丰', email: 'zhangsan@example.com', department: '安全部' },
    }))
    const detail = await api.get(`/api/tickets/${second.body.id}`)
    assert.equal(detail.body.ticket.submitter.id, ZHANGSAN)
    assert.equal(detail.body.ticket.submitter.name, '张三丰')
    assert.equal(detail.body.ticket.submitter.email, 'zhangsan@example.com')
    assert.equal(detail.body.ticket.submitter.companyId, COMPANY)
    assert.equal(detail.body.ticket.submitter.department, '安全部')

    const history = await api.get(`/api/users/${ZHANGSAN}/tickets`)
    assert.equal(history.status, 200)
    assert.equal(history.body.tickets.length, 2)
    const createdTimes = history.body.tickets.map((ticket) => ticket.createdAt)
    assert.deepEqual(createdTimes, [...createdTimes].sort().reverse())
    for (const ticket of history.body.tickets) {
      assert.ok('id' in ticket && 'subject' in ticket && 'status' in ticket && 'priority' in ticket && 'createdAt' in ticket)
    }
    assert.ok(history.body.tickets.some((ticket) => ticket.id === first.body.id))
    assert.ok(history.body.tickets.some((ticket) => ticket.id === second.body.id))
  })
})

test('AC-08 工单完成后提交人可进行满意度评价', async () => {
  await withTicketApi(async (api) => {
    await api.post(`/api/companies/${COMPANY}/assignment-rules`, { category: '网络故障', groupId: NETWORK_GROUP })
    const created = await api.post('/api/tickets', ticketPayload())
    assert.equal(created.body.status, 'pending_handling')

    // 未完成不能评价
    const early = await api.put(`/api/tickets/${created.body.id}/evaluation`, { operatorId: ZHANGSAN, rating: 5 })
    assert.equal(early.status, 409)
    assert.equal(early.body.error.code, 'INVALID_STATE')

    await api.post(`/api/tickets/${created.body.id}/complete`, { operatorId: WANGWU })

    // 非提交人评价 → 409 CONFLICT
    const wrongOperator = await api.put(`/api/tickets/${created.body.id}/evaluation`, { operatorId: WANGWU, rating: 4 })
    assert.equal(wrongOperator.status, 409)
    assert.equal(wrongOperator.body.error.code, 'CONFLICT')

    const evaluation = await api.put(`/api/tickets/${created.body.id}/evaluation`, { operatorId: ZHANGSAN, rating: 5, comment: '处理很快' })
    assert.equal(evaluation.status, 200)
    assert.equal(evaluation.body.ticketId, created.body.id)
    assert.equal(evaluation.body.rating, 5)
    assert.equal(evaluation.body.comment, '处理很快')
    assert.ok(evaluation.body.createdAt)
    assert.ok(evaluation.body.updatedAt)

    const detail = await api.get(`/api/tickets/${created.body.id}`)
    assert.equal(detail.body.evaluation.id, evaluation.body.id)
    assert.equal(detail.body.evaluation.rating, 5)
    assert.equal(detail.body.evaluation.comment, '处理很快')

    // 每工单一条，允许覆盖更新
    const updated = await api.put(`/api/tickets/${created.body.id}/evaluation`, { operatorId: ZHANGSAN, rating: 3, comment: null })
    assert.equal(updated.body.id, evaluation.body.id)
    assert.equal(updated.body.rating, 3)
    assert.equal(updated.body.comment, null)
    assert.equal(updated.body.createdAt, evaluation.body.createdAt)
    assert.ok(updated.body.updatedAt >= evaluation.body.updatedAt)

    // 评分越界 → 422
    const invalid = await api.put(`/api/tickets/${created.body.id}/evaluation`, { operatorId: ZHANGSAN, rating: 6 })
    assert.equal(invalid.status, 422)
    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR')
  })
})

test('工单列表筛选、关键字与排序', async () => {
  await withTicketApi(async (api) => {
    await api.post(`/api/companies/${COMPANY}/assignment-rules`, { category: '网络故障', groupId: NETWORK_GROUP })
    await api.post('/api/tickets', ticketPayload({ subject: '无法登录邮箱', priority: 'P2' }))
    await api.post('/api/tickets', ticketPayload({ subject: '打印机脱机', category: '硬件故障', priority: 'P3' }))

    const all = await api.get(`/api/tickets?companyId=${COMPANY}`)
    assert.equal(all.body.tickets.length, 2)
    for (const ticket of all.body.tickets) {
      assert.ok('submitterName' in ticket)
      assert.equal(ticket.submitterName, '张三')
    }
    const createdTimes = all.body.tickets.map((ticket) => ticket.createdAt)
    assert.deepEqual(createdTimes, [...createdTimes].sort().reverse())

    const byStatus = await api.get('/api/tickets?status=pending_handling')
    assert.equal(byStatus.body.tickets.length, 1)
    assert.equal(byStatus.body.tickets[0].category, '网络故障')

    const byCategory = await api.get('/api/tickets?category=硬件故障')
    assert.equal(byCategory.body.tickets.length, 1)
    assert.equal(byCategory.body.tickets[0].status, 'pending_assignment')

    const byKeyword = await api.get('/api/tickets?keyword=打印机')
    assert.equal(byKeyword.body.tickets.length, 1)
    assert.ok(byKeyword.body.tickets[0].subject.includes('打印机'))

    const bySubmitter = await api.get(`/api/tickets?submitterId=${ZHANGSAN}`)
    assert.equal(bySubmitter.body.tickets.length, 2)

    const byGroup = await api.get(`/api/tickets?groupId=${NETWORK_GROUP}`)
    assert.equal(byGroup.body.tickets.length, 1)
    assert.equal(byGroup.body.tickets[0].assignedGroupId, NETWORK_GROUP)
  })
})

test('接口错误形状、404 与参数校验', async () => {
  await withTicketApi(async (api) => {
    const missing = await api.get('/api/tickets/TCK-not-exist')
    assert.equal(missing.status, 404)
    assert.deepEqual(missing.body, { error: { code: 'NOT_FOUND', message: '工单不存在' } })

    const missingCompany = await api.get('/api/companies/c_missing/groups')
    assert.equal(missingCompany.body.error.code, 'NOT_FOUND')

    const missingUser = await api.get('/api/users/u_missing/tickets')
    assert.equal(missingUser.body.error.code, 'NOT_FOUND')

    const unknownOperator = await api.post('/api/tickets', ticketPayload({ operatorId: 'u_missing' }))
    assert.equal(unknownOperator.status, 404)
    assert.equal(unknownOperator.body.error.code, 'NOT_FOUND')

    const invalidPriority = await api.post('/api/tickets', ticketPayload({ priority: 'P9' }))
    assert.equal(invalidPriority.status, 422)
    assert.equal(invalidPriority.body.error.code, 'VALIDATION_ERROR')

    const longSubject = await api.post('/api/tickets', ticketPayload({ subject: 'x'.repeat(201) }))
    assert.equal(longSubject.status, 422)
    assert.equal(longSubject.body.error.code, 'VALIDATION_ERROR')

    const missingFields = await api.post('/api/tickets', { operatorId: ZHANGSAN })
    assert.equal(missingFields.status, 422)
    assert.equal(missingFields.body.error.code, 'VALIDATION_ERROR')

    const missingSubmitter = await api.post('/api/tickets', {
      operatorId: ZHANGSAN, subject: '主题', description: '描述', category: '分类', priority: 'P2',
    })
    assert.equal(missingSubmitter.status, 422)
    assert.equal(missingSubmitter.body.error.code, 'VALIDATION_ERROR')

    const missingGroupName = await api.post(`/api/companies/${COMPANY}/groups`, {})
    assert.equal(missingGroupName.status, 422)
    assert.equal(missingGroupName.body.error.code, 'VALIDATION_ERROR')

    const invalidMembers = await api.post(`/api/groups/${NETWORK_GROUP}/members`, { userIds: 'u_1' })
    assert.equal(invalidMembers.status, 422)
    assert.equal(invalidMembers.body.error.code, 'VALIDATION_ERROR')

    const missingRuleGroup = await api.post(`/api/companies/${COMPANY}/assignment-rules`, { category: '网络故障' })
    assert.equal(missingRuleGroup.status, 422)
    assert.equal(missingRuleGroup.body.error.code, 'VALIDATION_ERROR')
  })
})
