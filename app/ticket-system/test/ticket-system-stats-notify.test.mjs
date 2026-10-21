// 服务端集成测试（真实 HTTP）：本地 SMTP 通知、通知失败可见性、
// 统计口径（分布与仪表盘）、工作台筛选/搜索/排序、业务组与分配规则配置。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startLocalSmtp } from './local-smtp.mjs'
import {
  SEED_ACCOUNTS,
  SEED_PASSWORD,
  deleteJson,
  getJson,
  login,
  postJson,
  putJson,
  withSeededApp,
} from './seeded-app.mjs'

test('完成通知：本地 SMTP 收到发给提交人的邮件，notification.sent=true', async () => {
  const smtp = await startLocalSmtp()
  try {
    await withSeededApp({ smtp: { port: smtp.port } }, async (url) => {
      const alice = (await login(url, SEED_ACCOUNTS.alice)).body
      const bob = (await login(url, SEED_ACCOUNTS.bob)).body

      const created = await postJson(url, alice.token, '/api/tickets', {
        subject: '支付页面加载缓慢',
        description: '支付页需要 10 秒以上才能打开',
        category: 'bug',
        priority: 'P0',
      })
      const ticket = created.body
      await postJson(url, bob.token, `/api/tickets/${ticket.id}/claim`, {})
      const completed = await postJson(url, bob.token, `/api/tickets/${ticket.id}/complete`, { resolution: '已优化查询性能' })
      assert.equal(completed.response.status, 200)
      assert.equal(completed.body.ticket.status, 'completed')
      assert.deepEqual(completed.body.notification, { sent: true, error: null })

      assert.equal(smtp.messages.length, 1)
      assert.equal(smtp.messages[0].to[0], SEED_ACCOUNTS.alice)
      assert.ok(smtp.messages[0].from.length > 0)
      // 正文按 MIME 编码传输，断言基于解码后的可读文本（decoded）。
      assert.ok(smtp.messages[0].decoded.includes(`#${ticket.id}`))
      assert.ok(smtp.messages[0].decoded.includes('支付页面加载缓慢'))
      assert.ok(smtp.messages[0].decoded.includes('已完成处理'))

      // 通知成功不产生 notification_failed 审计事件。
      const logs = await getJson(url, alice.token, `/api/tickets/${ticket.id}/logs`)
      assert.ok(logs.body.every((entry) => entry.action !== 'notification_failed'))
    })
  } finally {
    await smtp.stop()
  }
})

test('通知失败不回滚完成状态，并记录 notification_failed 审计事件', async () => {
  await withSeededApp({ smtp: { port: 1 } }, async (url) => {
    const alice = (await login(url, SEED_ACCOUNTS.alice)).body
    const bob = (await login(url, SEED_ACCOUNTS.bob)).body

    const created = await postJson(url, alice.token, '/api/tickets', {
      subject: '验证通知失败路径',
      description: 'SMTP 指向无服务端口',
      category: 'bug',
      priority: 'P3',
    })
    const ticket = created.body
    const completed = await postJson(url, bob.token, `/api/tickets/${ticket.id}/complete`, {})
    assert.equal(completed.response.status, 200)
    assert.equal(completed.body.ticket.status, 'completed')
    assert.ok(completed.body.ticket.completedAt)
    assert.equal(completed.body.notification.sent, false)
    assert.ok(completed.body.notification.error)

    const logs = await getJson(url, alice.token, `/api/tickets/${ticket.id}/logs`)
    const failure = logs.body.find((entry) => entry.action === 'notification_failed')
    assert.ok(failure, JSON.stringify(logs.body))
    assert.equal(failure.actor, 'system')
    assert.equal(failure.ticketId, ticket.id)
    assert.ok(failure.detail.includes('通知发送失败'))
  })
})

test('统计口径：仪表盘与分布按公司聚合（R4/R5/R3）', async () => {
  await withSeededApp(async (url, platform) => {
    const alice = (await login(url, SEED_ACCOUNTS.alice)).body
    const bob = (await login(url, SEED_ACCOUNTS.bob)).body
    const grace = (await login(url, SEED_ACCOUNTS.grace)).body
    const dave = (await login(url, SEED_ACCOUNTS.dave)).body

    // A 公司：t1 完成+回复+评价；t2、t3 待处理；B 公司：t4 待处理；无部门提交人：t5。
    const t1 = (await postJson(url, alice.token, '/api/tickets', {
      subject: '完成并评价的工单',
      description: '闭环数据',
      category: 'bug',
      priority: 'P0',
    })).body
    await postJson(url, bob.token, `/api/tickets/${t1.id}/claim`, {})
    await postJson(url, bob.token, `/api/tickets/${t1.id}/replies`, { content: '定位到数据库连接泄漏' })
    await postJson(url, bob.token, `/api/tickets/${t1.id}/complete`, { resolution: '已修复' })
    await postJson(url, alice.token, `/api/tickets/${t1.id}/rating`, { score: 4 })

    const t2 = (await postJson(url, alice.token, '/api/tickets', {
      subject: '待处理工单二',
      description: '热点分类 bug',
      category: 'bug',
      priority: 'P1',
    })).body
    const t3 = (await postJson(url, alice.token, '/api/tickets', {
      subject: '待处理工单三',
      description: '热点分类 account',
      category: 'account',
      priority: 'P2',
    })).body
    const t4 = (await postJson(url, dave.token, '/api/tickets', {
      subject: 'B 公司工单',
      description: '运营分类 payment',
      category: 'payment',
      priority: 'P2',
    })).body

    // 直接写入一名无部门提交人的档案与工单（验证「未分配部门」桶）。
    // user_profiles.platform_user_id 外键指向平台用户表，先经 userkit 创建平台账号。
    const visitor = await platform.auth.userStore.create(
      { name: '外部访客', email: 'visitor@hongtu.example.com', passwordChangeRequired: false },
      platform.auth.hashPassword(SEED_PASSWORD),
    )
    await platform.db.run({
      text: `INSERT INTO user_profiles (platform_user_id, display_name, email, company_id, department_id, cross_company_view, created_at)
             VALUES (?, '外部访客', 'visitor@hongtu.example.com', 1, NULL, 0, ?)`,
      params: [visitor.id, new Date().toISOString()],
    })
    const visitorProfile = await platform.db.queryOne({
      text: 'SELECT id FROM user_profiles WHERE platform_user_id = ?',
      params: [visitor.id],
    })
    await platform.db.run({
      text: `INSERT INTO tickets (company_id, subject, description, category, priority, status, submitter_user_id, created_at, updated_at)
             VALUES (1, '无部门提交人工单', '计入未分配部门桶', 'other', 'P4', 'pending_assignment', ?, ?, ?)`,
      params: [visitorProfile.id, new Date().toISOString(), new Date().toISOString()],
    })

    // 仪表盘（本公司视角，契约 7.2）。
    const dashboard = await getJson(url, alice.token, '/api/stats/dashboard')
    assert.equal(dashboard.response.status, 200)
    assert.equal(dashboard.body.ticketCount.total, 4)
    assert.deepEqual(dashboard.body.ticketCount.byStatus, {
      created: 0,
      pending_assignment: 1,
      pending_processing: 2,
      completed: 1,
      cancelled: 0,
    })
    assert.equal(typeof dashboard.body.avgResponseMinutes, 'number')
    assert.ok(dashboard.body.avgResponseMinutes >= 0)
    assert.deepEqual(dashboard.body.satisfaction, { avgScore: 4, ratedCount: 1 })
    assert.deepEqual(dashboard.body.hotCategories, [
      { category: 'bug', count: 2 },
      { category: 'account', count: 1 },
      { category: 'other', count: 1 },
    ])

    // 仪表盘（跨公司视角统计全部公司）。
    const global = await getJson(url, grace.token, '/api/stats/dashboard')
    assert.equal(global.body.ticketCount.total, 5)
    assert.deepEqual(global.body.hotCategories, [
      { category: 'bug', count: 2 },
      { category: 'account', count: 1 },
      { category: 'other', count: 1 },
      { category: 'payment', count: 1 },
    ])

    // 仪表盘（跨公司视角指定 B 公司）。
    const blueOcean = await getJson(url, grace.token, '/api/stats/dashboard?companyId=2')
    assert.equal(blueOcean.body.ticketCount.total, 1)
    assert.deepEqual(blueOcean.body.satisfaction, { avgScore: null, ratedCount: 0 })
    assert.equal(blueOcean.body.avgResponseMinutes, null)

    // 普通用户指定他公司 → 403。
    const forbidden = await fetch(`${url}/api/stats/dashboard?companyId=2`, { headers: { authorization: `Bearer ${alice.token}` } })
    assert.equal(forbidden.status, 403)
    assert.equal((await forbidden.json()).error.code, 'COMPANY_FORBIDDEN')

    // 部门维度：本公司默认（提交人所属部门），无部门计入未分配部门桶。
    const byDepartment = await getJson(url, alice.token, '/api/stats/distribution?dimension=department')
    assert.deepEqual(byDepartment.body, {
      dimension: 'department',
      items: [
        { key: 1, label: '技术部', count: 3 },
        { key: 'unassigned', label: '未分配部门', count: 1 },
      ],
    })

    // 部门维度：跨公司视角全部公司（label 带公司前缀区分）。
    const allDepartments = await getJson(url, grace.token, '/api/stats/distribution?dimension=department')
    assert.deepEqual(allDepartments.body.items, [
      { key: 1, label: '宏图科技 · 技术部', count: 3 },
      { key: 3, label: '蓝海物流 · 运营部', count: 1 },
      { key: 'unassigned', label: '未分配部门', count: 1 },
    ])

    // 部门维度：跨公司视角指定 B 公司。
    const bDepartments = await getJson(url, grace.token, '/api/stats/distribution?dimension=department&companyId=2')
    assert.deepEqual(bDepartments.body.items, [{ key: 3, label: '运营部', count: 1 }])

    // 公司维度（仅跨公司视角）。
    const byCompany = await getJson(url, grace.token, '/api/stats/distribution?dimension=company')
    assert.deepEqual(byCompany.body, {
      dimension: 'company',
      items: [
        { key: 1, label: '宏图科技', count: 4 },
        { key: 2, label: '蓝海物流', count: 1 },
      ],
    })
    const singleCompany = await getJson(url, grace.token, '/api/stats/distribution?dimension=company&companyId=2')
    assert.deepEqual(singleCompany.body.items, [{ key: 2, label: '蓝海物流', count: 1 }])

    // mine 视角与 workbench 视角互不串扰（visitor 工单不计入 alice 的 mine）。
    const mine = await getJson(url, alice.token, '/api/tickets?scope=mine')
    assert.equal(mine.body.total, 3)
    const daveWorkbench = await getJson(url, dave.token, '/api/tickets')
    assert.deepEqual(daveWorkbench.body.items.map((item) => item.id), [t4.id])
  })
})

test('工作台：筛选、搜索、排序与分页（契约 3.2）', async () => {
  await withSeededApp(async (url) => {
    const alice = (await login(url, SEED_ACCOUNTS.alice)).body
    const bob = (await login(url, SEED_ACCOUNTS.bob)).body

    const t1 = (await postJson(url, alice.token, '/api/tickets', {
      subject: 'Alpha 登录异常',
      description: '登录失败场景 Alpha',
      category: 'bug',
      priority: 'P1',
    })).body
    const t2 = (await postJson(url, alice.token, '/api/tickets', {
      subject: 'Beta 账号锁定',
      description: '账号被锁 Beta',
      category: 'account',
      priority: 'P3',
    })).body
    const t3 = (await postJson(url, alice.token, '/api/tickets', {
      subject: 'Gamma 性能问题',
      description: '查询缓慢 Gamma',
      category: 'performance',
      priority: 'P0',
    })).body
    await postJson(url, alice.token, `/api/tickets/${t2.id}/cancel`, {})

    // 状态筛选：显式看待分配池（t2 已取消，t3 未命中规则停留待分配）。
    const pendingAssignment = await getJson(url, bob.token, '/api/tickets?status=pending_assignment')
    assert.deepEqual(
      pendingAssignment.body.items.map((item) => item.id),
      [t3.id],
    )

    // 分类筛选。
    const bugOnly = await getJson(url, bob.token, '/api/tickets&category=bug'.replace('&', '?'))
    assert.deepEqual(
      bugOnly.body.items.map((item) => item.id),
      [t1.id],
    )

    // 优先级筛选（清空默认状态筛选，跨状态按优先级过滤）。
    const p0 = await getJson(url, bob.token, '/api/tickets?status=&priority=P0')
    assert.deepEqual(
      p0.body.items.map((item) => item.id),
      [t3.id],
    )

    // 组筛选（t1 属组 1，t2 属组 2，t3 未分配）。
    const groupFilter = await getJson(url, bob.token, '/api/tickets?groupId=1&status=')
    assert.deepEqual(
      groupFilter.body.items.map((item) => item.id),
      [t1.id],
    )

    // 关键字搜索（主题、描述、工单 ID，大小写不敏感包含）。
    const bySubject = await getJson(url, bob.token, '/api/tickets?status=&q=alpha')
    assert.deepEqual(bySubject.body.items.map((item) => item.id), [t1.id])
    const byDescription = await getJson(url, bob.token, '/api/tickets?status=&q=beta')
    assert.deepEqual(byDescription.body.items.map((item) => item.id), [t2.id])
    const byDescriptionCase = await getJson(url, bob.token, '/api/tickets?status=&q=GAMMA')
    assert.deepEqual(byDescriptionCase.body.items.map((item) => item.id), [t3.id])
    const byId = await getJson(url, bob.token, `/api/tickets?status=&q=${t1.id}`)
    assert.deepEqual(byId.body.items.map((item) => item.id), [t1.id])
    const byNothing = await getJson(url, bob.token, '/api/tickets?status=&q=不存在的关键字')
    assert.equal(byNothing.body.total, 0)

    // 排序：priority 按 P0 最高（asc）；默认 createdAt desc。
    const byPriority = await getJson(url, bob.token, '/api/tickets?status=&sort=priority&order=asc')
    assert.deepEqual(
      byPriority.body.items.map((item) => item.priority),
      ['P0', 'P1', 'P3'],
    )
    const byPriorityDesc = await getJson(url, bob.token, '/api/tickets?status=&sort=priority&order=desc')
    assert.deepEqual(
      byPriorityDesc.body.items.map((item) => item.priority),
      ['P3', 'P1', 'P0'],
    )
    const byStatus = await getJson(url, bob.token, '/api/tickets?status=&sort=status&order=asc')
    assert.deepEqual(
      byStatus.body.items.map((item) => item.status),
      ['cancelled', 'pending_assignment', 'pending_processing'],
    )
    const byFirstReply = await getJson(url, bob.token, '/api/tickets?status=&sort=firstReplyAt&order=asc')
    assert.deepEqual(byFirstReply.body.items.map((item) => item.firstReplyAt), [null, null, null])

    // 非法参数。
    for (const path of ['/api/tickets?scope=unknown', '/api/tickets?sort=bad', '/api/tickets?order=up', '/api/tickets?status=bad', '/api/tickets?page=0', '/api/tickets?pageSize=0', '/api/tickets?priority=P9', '/api/tickets?groupId=x']) {
      const invalid = await fetch(`${url}${path}`, { headers: { authorization: `Bearer ${bob.token}` } })
      assert.equal(invalid.status, 400, path)
      assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR')
    }

    // 分页。
    const paged = await getJson(url, bob.token, '/api/tickets?status=&page=2&pageSize=2')
    assert.equal(paged.body.total, 3)
    assert.equal(paged.body.page, 2)
    assert.equal(paged.body.pageSize, 2)
    assert.equal(paged.body.items.length, 1)

    // mine + status 组合。
    const mineCancelled = await getJson(url, alice.token, '/api/tickets?scope=mine&status=cancelled')
    assert.deepEqual(mineCancelled.body.items.map((item) => item.id), [t2.id])
  })
})

test('业务组与分配规则配置：持久化、成员约束与引用保护（契约 4.1-4.7）', async () => {
  await withSeededApp(async (url) => {
    const alice = (await login(url, SEED_ACCOUNTS.alice)).body
    const bob = (await login(url, SEED_ACCOUNTS.bob)).body
    const dave = (await login(url, SEED_ACCOUNTS.dave)).body
    const grace = (await login(url, SEED_ACCOUNTS.grace)).body

    // 初始两组（A 公司）。
    const initial = await getJson(url, alice.token, '/api/groups')
    assert.deepEqual(
      initial.body.map((group) => group.name),
      ['技术支持组', '账务组'],
    )
    assert.deepEqual(initial.body[0].members.map((member) => member.displayName), ['王斌'])

    // 创建业务组并设置成员；成员不属于本公司 → 400。
    const erin = (await getJson(url, grace.token, '/api/users?companyId=2')).body.find((user) => user.displayName === '赵敏')
    const crossMember = await postJson(url, alice.token, '/api/groups', { name: '新建组', memberIds: [erin.id] })
    assert.equal(crossMember.response.status, 400)
    const created = await postJson(url, alice.token, '/api/groups', { name: '运维值班组', memberIds: [2, 3] })
    assert.equal(created.response.status, 201)
    assert.equal(created.body.id, 4)
    assert.equal(created.body.companyId, 1)
    assert.deepEqual(created.body.members.map((member) => member.displayName), ['王斌', '陈芳'])
    const emptyMembers = await postJson(url, alice.token, '/api/groups', { name: '空组', memberIds: [] })
    assert.equal(emptyMembers.response.status, 201)
    assert.deepEqual(emptyMembers.body.members, [])
    const duplicateName = await postJson(url, alice.token, '/api/groups', { name: '运维值班组' })
    assert.equal(duplicateName.response.status, 409)
    assert.equal(duplicateName.body.error.code, 'GROUP_NAME_CONFLICT')
    const invalidName = await postJson(url, alice.token, '/api/groups', { name: '' })
    assert.equal(invalidName.response.status, 400)

    // 重新读回。
    const reread = await getJson(url, alice.token, '/api/groups')
    assert.equal(reread.body.length, 4)
    const duty = reread.body.find((group) => group.name === '运维值班组')
    assert.deepEqual(duty.members.map((member) => member.displayName), ['王斌', '陈芳'])

    // 更新：整组替换成员与改名。
    const updated = await putJson(url, alice.token, `/api/groups/${duty.id}`, { memberIds: [3] })
    assert.equal(updated.response.status, 200)
    assert.deepEqual(updated.body.members.map((member) => member.displayName), ['陈芳'])
    const renamed = await putJson(url, alice.token, `/api/groups/${emptyMembers.body.id}`, { name: '空组改名' })
    assert.equal(renamed.body.name, '空组改名')

    // B 公司用户不能维护 A 公司组。
    const crossWrite = await fetch(`${url}/api/groups/${duty.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${dave.token}` },
      body: JSON.stringify({ name: '越权改名' }),
    })
    assert.equal(crossWrite.status, 403)
    assert.equal((await crossWrite.json()).error.code, 'COMPANY_FORBIDDEN')

    // 删除：被规则或未结束工单引用时 409。
    const inUse = await deleteJson(url, alice.token, '/api/groups/1')
    assert.equal(inUse.status, 409)
    assert.equal((await inUse.json()).error.code, 'GROUP_IN_USE')
    // 跨公司读：grace 传 companyId=2。
    const crossGroups = await getJson(url, grace.token, '/api/groups?companyId=2')
    assert.deepEqual(crossGroups.body.map((group) => group.name), ['运营支持组'])

    // 分配规则：列表、创建（重复 409 / 非法 400）、删除。
    const rules = await getJson(url, alice.token, '/api/assignment-rules')
    assert.deepEqual(
      rules.body.map((rule) => ({ category: rule.category, targetGroupName: rule.targetGroupName })),
      [
        { category: 'account', targetGroupName: '账务组' },
        { category: 'bug', targetGroupName: '技术支持组' },
      ],
    )
    const newRule = await postJson(url, alice.token, '/api/assignment-rules', { category: 'performance', targetGroupId: 4 })
    assert.equal(newRule.response.status, 201)
    assert.equal(newRule.body.targetGroupName, '运维值班组')
    assert.equal(newRule.body.companyId, 1)
    const duplicateRule = await postJson(url, alice.token, '/api/assignment-rules', { category: 'bug', targetGroupId: 2 })
    assert.equal(duplicateRule.response.status, 409)
    assert.equal(duplicateRule.body.error.code, 'RULE_CONFLICT')
    const badCategory = await postJson(url, alice.token, '/api/assignment-rules', { category: 'not-in-dict', targetGroupId: 1 })
    assert.equal(badCategory.response.status, 400)
    const crossGroupRule = await postJson(url, alice.token, '/api/assignment-rules', { category: 'feature', targetGroupId: 3 })
    assert.equal(crossGroupRule.response.status, 400)

    // 规则创建后，新工单按规则自动分配到新组。
    const routed = await postJson(url, alice.token, '/api/tickets', {
      subject: '按新规则分配',
      description: 'performance 分类',
      category: 'performance',
      priority: 'P2',
    })
    assert.equal(routed.body.assignedGroupId, 4)
    assert.equal(routed.body.status, 'pending_processing')

    // 删除规则后不再命中（回到待分配）。
    const deleteRule = await deleteJson(url, alice.token, `/api/assignment-rules/${newRule.body.id}`)
    assert.equal(deleteRule.status, 204)
    const afterDelete = await postJson(url, alice.token, '/api/tickets', {
      subject: '规则删除后的工单',
      description: 'performance 分类无规则',
      category: 'performance',
      priority: 'P2',
    })
    assert.equal(afterDelete.body.status, 'pending_assignment')

    // 空组无引用可删除；运维值班组被未结束工单引用不可删除。
    const deleteDuty = await deleteJson(url, alice.token, `/api/groups/${duty.id}`)
    assert.equal(deleteDuty.status, 409)
    const deleteEmpty = await deleteJson(url, alice.token, `/api/groups/${emptyMembers.body.id}`)
    assert.equal(deleteEmpty.status, 204)
    const finalGroups = await getJson(url, alice.token, '/api/groups')
    assert.equal(finalGroups.body.length, 3)
    // 未登录用户无权读业务组。
    const anonymous = await fetch(`${url}/api/groups`)
    assert.equal(anonymous.status, 401)
    // 不存在的组 404。
    const missing = await deleteJson(url, bob.token, '/api/groups/999')
    assert.equal(missing.status, 404)
  })
})
