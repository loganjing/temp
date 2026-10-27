import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'
import { withQaEnvironment, seedQaTicketEnvironment, loginToken, apiRequest } from './fixtures/qa-environment.mjs'

function buildApp(platform) {
  return createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    protect: platform.auth.requireAnyAuth,
  })
}

test('工单创建后自动匹配分类规则并流转到待处理（AC-01, AC-05）', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedQaTicketEnvironment(platform, { qaRunId })
      await withHttpServer(buildApp(platform), async (url) => {
        const token = await loginToken(url, env.users.submitterA)
        const created = await apiRequest(url, 'POST', '/api/tickets', {
          token,
          body: {
            subject: `网络故障-${qaRunId}`,
            description: '办公区断网',
            categoryId: env.categories.network,
            slaPriority: 'P1',
          },
        })
        assert.equal(created.status, 201)
        assert.equal(created.body.status, 'pending_processing')
        assert.equal(created.body.assignedGroupId, env.groups.a1)
        assert.equal(created.body.companyId, env.companies.a)

        const detail = await apiRequest(url, 'GET', `/api/tickets/${created.body.id}`, { token })
        assert.equal(detail.status, 200)
        assert.equal(detail.body.status, 'pending_processing')
        assert.equal(detail.body.assignedGroupName, `网络组-${qaRunId}`)
        assert.equal(detail.body.replies.length, 0)
      })
    } finally {
      await platform.close()
    }
  })
})

test('无匹配规则时工单保持待分配状态', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedQaTicketEnvironment(platform, { qaRunId })
      await withHttpServer(buildApp(platform), async (url) => {
        const token = await loginToken(url, env.users.submitterA)
        const created = await apiRequest(url, 'POST', '/api/tickets', {
          token,
          body: { subject: '账号问题', description: '无法登录', categoryId: env.categories.account, slaPriority: 'P2' },
        })
        assert.equal(created.status, 201)
        assert.equal(created.body.status, 'pending_assignment')
        assert.equal(created.body.assignedGroupId, null)
      })
    } finally {
      await platform.close()
    }
  })
})

test('工单按公司隔离：A公司提交人不可见B公司工单（AC-03）', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedQaTicketEnvironment(platform, { qaRunId })
      await withHttpServer(buildApp(platform), async (url) => {
        const tokenA = await loginToken(url, env.users.submitterA)
        const tokenB = await loginToken(url, env.users.submitterB)

        const created = await apiRequest(url, 'POST', '/api/tickets', {
          token: tokenA,
          body: { subject: 'A公司工单', description: 'A', categoryId: env.categories.account, slaPriority: 'P3' },
        })
        assert.equal(created.status, 201)

        // B 公司列表看不到 A 公司工单
        const listB = await apiRequest(url, 'GET', '/api/tickets', { token: tokenB })
        assert.equal(listB.status, 200)
        assert.equal(listB.body.items.find((t) => t.id === created.body.id), undefined)

        // B 公司直接访问 A 公司工单详情返回 404（公司隔离）
        const detailB = await apiRequest(url, 'GET', `/api/tickets/${created.body.id}`, { token: tokenB })
        assert.equal(detailB.status, 404)
        assert.equal(detailB.body.error.code, 'TICKET_NOT_FOUND')
      })
    } finally {
      await platform.close()
    }
  })
})

test('工单支持多轮回复并按时间顺序展示（AC-02）', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedQaTicketEnvironment(platform, { qaRunId })
      await withHttpServer(buildApp(platform), async (url) => {
        const submitterToken = await loginToken(url, env.users.submitterA)
        const handlerToken = await loginToken(url, env.users.handlerA)

        const created = await apiRequest(url, 'POST', '/api/tickets', {
          token: submitterToken,
          body: { subject: '回复测试', description: '需要协助', categoryId: env.categories.account, slaPriority: 'P2' },
        })
        const ticketId = created.body.id

        const reply1 = await apiRequest(url, 'POST', `/api/tickets/${ticketId}/replies`, { token: submitterToken, body: { content: '提交人第一条回复' } })
        assert.equal(reply1.status, 201)
        assert.equal(reply1.body.replierName, env.users.submitterA.displayName)

        const reply2 = await apiRequest(url, 'POST', `/api/tickets/${ticketId}/replies`, { token: handlerToken, body: { content: '处理人回复' } })
        assert.equal(reply2.status, 201)
        assert.equal(reply2.body.replierName, env.users.handlerA.displayName)

        const detail = await apiRequest(url, 'GET', `/api/tickets/${ticketId}`, { token: submitterToken })
        assert.equal(detail.body.replies.length, 2)
        assert.equal(detail.body.replies[0].content, '提交人第一条回复')
        assert.equal(detail.body.replies[1].content, '处理人回复')
      })
    } finally {
      await platform.close()
    }
  })
})

test('待处理工单可转派到其他业务组并记录审计（AC-06）', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedQaTicketEnvironment(platform, { qaRunId })
      // 新建第二个业务组作为转派目标
      await platform.db.run({
        text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
        params: [`grp-${qaRunId}-a2`, env.companies.a, `账号组-${qaRunId}`, new Date().toISOString()],
      })
      await withHttpServer(buildApp(platform), async (url) => {
        const handlerToken = await loginToken(url, env.users.handlerA)
        const adminToken = await loginToken(url, env.users.adminA)

        // 自动分配到网络组的待处理工单
        const created = await apiRequest(url, 'POST', '/api/tickets', {
          token: await loginToken(url, env.users.submitterA),
          body: { subject: '转派工单', description: '需转派', categoryId: env.categories.network, slaPriority: 'P2' },
        })
        const ticketId = created.body.id

        const transfer = await apiRequest(url, 'POST', `/api/tickets/${ticketId}/transfer`, {
          token: handlerToken,
          body: { toGroupId: `grp-${qaRunId}-a2`, reason: '归属调整' },
        })
        assert.equal(transfer.status, 200)
        assert.equal(transfer.body.toGroupId, `grp-${qaRunId}-a2`)
        assert.equal(transfer.body.fromGroupId, env.groups.a1)

        const detail = await apiRequest(url, 'GET', `/api/tickets/${ticketId}`, { token: handlerToken })
        assert.equal(detail.body.assignedGroupId, `grp-${qaRunId}-a2`)
        assert.equal(detail.body.status, 'pending_processing')

        // 审计日志记录了转派事件
        const logs = await apiRequest(url, 'GET', `/api/audit-logs?ticketId=${ticketId}&eventType=ticket.transferred`, { token: adminToken })
        assert.equal(logs.status, 200)
        assert.ok(logs.body.items.length >= 1)
      })
    } finally {
      await platform.close()
    }
  })
})

test('完成工单后记录处理信息并发送邮件通知（AC-08）', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedQaTicketEnvironment(platform, { qaRunId })
      await withHttpServer(buildApp(platform), async (url) => {
        const submitterToken = await loginToken(url, env.users.submitterA)
        const handlerToken = await loginToken(url, env.users.handlerA)

        const created = await apiRequest(url, 'POST', '/api/tickets', {
          token: submitterToken,
          body: { subject: '完成测试', description: '待处理完成', categoryId: env.categories.network, slaPriority: 'P1' },
        })
        const ticketId = created.body.id

        const completed = await apiRequest(url, 'POST', `/api/tickets/${ticketId}/complete`, {
          token: handlerToken,
          body: { summary: '已修复网络' },
        })
        assert.equal(completed.status, 200)
        assert.equal(completed.body.ticketStatus, 'completed')
        assert.equal(completed.body.emailSent, true)
        assert.equal(completed.body.handlerName, env.users.handlerA.displayName)

        const detail = await apiRequest(url, 'GET', `/api/tickets/${ticketId}`, { token: submitterToken })
        assert.equal(detail.body.status, 'completed')
      })
    } finally {
      await platform.close()
    }
  })
})

test('未完成工单不可评价；已完成工单可由提交人评价（AC-09）', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedQaTicketEnvironment(platform, { qaRunId })
      await withHttpServer(buildApp(platform), async (url) => {
        const submitterToken = await loginToken(url, env.users.submitterA)
        const handlerToken = await loginToken(url, env.users.handlerA)

        const created = await apiRequest(url, 'POST', '/api/tickets', {
          token: submitterToken,
          body: { subject: '评价测试', description: '待评价', categoryId: env.categories.network, slaPriority: 'P1' },
        })
        const ticketId = created.body.id

        // 待处理状态不可评价
        const earlyRating = await apiRequest(url, 'POST', `/api/tickets/${ticketId}/rating`, { token: submitterToken, body: { rating: 5 } })
        assert.equal(earlyRating.status, 400)
        assert.equal(earlyRating.body.error.code, 'TICKET_NOT_COMPLETED')

        await apiRequest(url, 'POST', `/api/tickets/${ticketId}/complete`, { token: handlerToken, body: { summary: '完成' } })

        const rating = await apiRequest(url, 'POST', `/api/tickets/${ticketId}/rating`, { token: submitterToken, body: { rating: 4, comment: '满意' } })
        assert.equal(rating.status, 201)
        assert.equal(rating.body.rating, 4)

        // 重复评价被拒绝
        const duplicate = await apiRequest(url, 'POST', `/api/tickets/${ticketId}/rating`, { token: submitterToken, body: { rating: 3 } })
        assert.equal(duplicate.status, 409)
        assert.equal(duplicate.body.error.code, 'RATING_ALREADY_EXISTS')
      })
    } finally {
      await platform.close()
    }
  })
})

test('提交人完整信息含公司、部门与历史工单（AC-07）', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedQaTicketEnvironment(platform, { qaRunId })
      await withHttpServer(buildApp(platform), async (url) => {
        const submitterToken = await loginToken(url, env.users.submitterA)
        const handlerToken = await loginToken(url, env.users.handlerA)

        const created = await apiRequest(url, 'POST', '/api/tickets', {
          token: submitterToken,
          body: { subject: '提交人信息测试', description: '查看提交人', categoryId: env.categories.network, slaPriority: 'P1' },
        })

        const info = await apiRequest(url, 'GET', `/api/tickets/${created.body.id}/submitter`, { token: handlerToken })
        assert.equal(info.status, 200)
        assert.equal(info.body.userId, env.users.submitterA.id)
        assert.equal(info.body.companyName, `公司A-${qaRunId}`)
        assert.equal(info.body.departmentName, `研发部-${qaRunId}`)
        assert.ok(info.body.historyTickets.length >= 1)
        assert.ok(info.body.historyTickets.some((t) => t.id === created.body.id))
      })
    } finally {
      await platform.close()
    }
  })
})

test('统计分布与仪表盘返回聚合数据（AC-10, AC-11）', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedQaTicketEnvironment(platform, { qaRunId })
      await withHttpServer(buildApp(platform), async (url) => {
        const adminToken = await loginToken(url, env.users.adminA)
        const submitterToken = await loginToken(url, env.users.submitterA)
        const handlerToken = await loginToken(url, env.users.handlerA)

        const t1 = await apiRequest(url, 'POST', '/api/tickets', { token: submitterToken, body: { subject: '统计1', description: 'd', categoryId: env.categories.network, slaPriority: 'P0' } })
        await apiRequest(url, 'POST', `/api/tickets/${t1.body.id}/complete`, { token: handlerToken, body: {} })

        const dist = await apiRequest(url, 'GET', '/api/statistics/distribution?dimension=company', { token: adminToken })
        assert.equal(dist.status, 200)
        assert.equal(dist.body.dimension, 'company')
        const companyAItem = dist.body.items.find((i) => i.dimensionId === env.companies.a)
        assert.ok(companyAItem)
        assert.ok(companyAItem.ticketCount >= 1)

        const deptDist = await apiRequest(url, 'GET', '/api/statistics/distribution?dimension=department', { token: adminToken })
        assert.equal(deptDist.status, 200)
        const deptItem = deptDist.body.items.find((i) => i.dimensionId === env.departments.a1)
        assert.ok(deptItem)

        const dashboard = await apiRequest(url, 'GET', '/api/statistics/dashboard', { token: adminToken })
        assert.equal(dashboard.status, 200)
        assert.ok(dashboard.body.totalTickets >= 1)
        assert.ok(dashboard.body.completedTickets >= 1)
        assert.equal(typeof dashboard.body.byPriority.P0, 'number')
      })
    } finally {
      await platform.close()
    }
  })
})

test('工作台返回待处理工单列表（AC-12）', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedQaTicketEnvironment(platform, { qaRunId })
      await withHttpServer(buildApp(platform), async (url) => {
        const handlerToken = await loginToken(url, env.users.handlerA)
        const submitterToken = await loginToken(url, env.users.submitterA)

        await apiRequest(url, 'POST', '/api/tickets', { token: submitterToken, body: { subject: '工作台工单', description: 'd', categoryId: env.categories.network, slaPriority: 'P1' } })

        const workbench = await apiRequest(url, 'GET', '/api/workbench/tickets', { token: handlerToken })
        assert.equal(workbench.status, 200)
        assert.ok(workbench.body.items.every((t) => t.status === 'pending_processing'))
        assert.ok(workbench.body.items.length >= 1)
      })
    } finally {
      await platform.close()
    }
  })
})

test('操作日志记录工单创建、回复、完成事件（AC-13）', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedQaTicketEnvironment(platform, { qaRunId })
      await withHttpServer(buildApp(platform), async (url) => {
        const submitterToken = await loginToken(url, env.users.submitterA)
        const handlerToken = await loginToken(url, env.users.handlerA)
        const adminToken = await loginToken(url, env.users.adminA)

        const created = await apiRequest(url, 'POST', '/api/tickets', { token: submitterToken, body: { subject: '日志测试', description: 'd', categoryId: env.categories.network, slaPriority: 'P1' } })
        await apiRequest(url, 'POST', `/api/tickets/${created.body.id}/replies`, { token: handlerToken, body: { content: '收到' } })
        await apiRequest(url, 'POST', `/api/tickets/${created.body.id}/complete`, { token: handlerToken, body: {} })

        const logs = await apiRequest(url, 'GET', `/api/audit-logs?ticketId=${created.body.id}`, { token: adminToken })
        assert.equal(logs.status, 200)
        const types = logs.body.items.map((i) => i.eventType)
        assert.ok(types.includes('ticket.created'))
        assert.ok(types.includes('ticket.reply_added'))
        assert.ok(types.includes('ticket.completed'))
      })
    } finally {
      await platform.close()
    }
  })
})

test('业务组管理员可创建业务组与配置分类规则（AC-04）', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedQaTicketEnvironment(platform, { qaRunId })
      await withHttpServer(buildApp(platform), async (url) => {
        const adminToken = await loginToken(url, env.users.adminA)

        const group = await apiRequest(url, 'POST', '/api/business-groups', { token: adminToken, body: { name: `新业务组-${qaRunId}` } })
        assert.equal(group.status, 201)
        assert.equal(group.body.companyId, env.companies.a)

        const members = await apiRequest(url, 'PATCH', `/api/business-groups/${group.body.id}/members`, {
          token: adminToken,
          body: { memberUserIds: [env.users.handlerA.id] },
        })
        assert.equal(members.status, 200)
        assert.equal(members.body.members.length, 1)
        assert.equal(members.body.members[0].userId, env.users.handlerA.id)

        const rule = await apiRequest(url, 'POST', '/api/category-rules', {
          token: adminToken,
          body: { categoryId: env.categories.account, targetGroupId: group.body.id },
        })
        assert.equal(rule.status, 201)

        // 同公司同分类重复规则被拒绝
        const dup = await apiRequest(url, 'POST', '/api/category-rules', {
          token: adminToken,
          body: { categoryId: env.categories.account, targetGroupId: group.body.id },
        })
        assert.equal(dup.status, 409)
        assert.equal(dup.body.error.code, 'RULE_ALREADY_EXISTS')
      })
    } finally {
      await platform.close()
    }
  })
})
