// 配置域测试：公司/部门/Team/成员/休假/用户管理（§4）、分类与分配规则（§5）、
// SLA 策略/日历/节假日（§6）、配置审计日志（§10）与 CSV 导入导出。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { jsonCall, loginAdmin, loginAs, seedScenario, withIsolatedPlatform } from './api-helpers.mjs'

const NOW = new Date().toISOString()

test('公司：树/创建/重复编码/导入导出与权限', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const admin = await loginAdmin(app)
    const requester = await loginAs(app, 'requester@corp.test')

    const created = await jsonCall(app, 'POST', '/api/org/companies', {
      token: admin,
      body: { code: 'C-SUB', nameZh: '子公司', nameEn: 'Sub Corp', parentId: 10 },
    })
    assert.equal(created.status, 200)
    assert.equal(created.json.ok, true)

    const duplicate = await jsonCall(app, 'POST', '/api/org/companies', {
      token: admin,
      body: { code: 'C-SUB', nameZh: '重复' },
    })
    assert.equal(duplicate.status, 422)
    assert.ok(duplicate.json.error.details.fields.includes('code'))

    const tree = await jsonCall(app, 'GET', '/api/org/companies', { token: admin })
    assert.equal(tree.status, 200)
    const root = tree.json.find((node) => node.id === 10)
    assert.ok(root)
    assert.ok(root.children.some((child) => child.code === 'C-SUB'))

    const patched = await jsonCall(app, 'PATCH', '/api/org/companies/10', { token: admin, body: { nameZh: '示例集团' } })
    assert.equal(patched.json.ok, true)

    const exported = await jsonCall(app, 'GET', '/api/org/companies/export.csv', { token: admin })
    assert.equal(exported.status, 200)
    assert.ok(exported.text.includes('code'))
    assert.ok(exported.text.includes('C-SUB'))

    const imported = await jsonCall(app, 'POST', '/api/org/companies/import', {
      token: admin,
      body: { rows: [{ code: 'C-IMP', nameZh: '导入公司' }] },
    })
    assert.equal(imported.status, 200)
    assert.equal(imported.json.applied, 1)

    const importFailed = await jsonCall(app, 'POST', '/api/org/companies/import', {
      token: admin,
      body: { rows: [{ code: 'C-IMP2', parentCode: 'NOPE', nameZh: '坏行' }] },
    })
    assert.equal(importFailed.status, 422)
    assert.equal(importFailed.json.error.code, 'VALIDATION')
    assert.equal(importFailed.json.error.details.rows[0].row, 0)

    const requesterDenied = await jsonCall(app, 'GET', '/api/org/companies', { token: requester })
    assert.equal(requesterDenied.status, 403)
  })
})

test('部门与 Team：创建/重复编码/assignMode/团队列表与维护权限', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const admin = await loginAdmin(app)
    const manager = await loginAs(app, 'manager@corp.test')
    const requester = await loginAs(app, 'requester@corp.test')

    const created = await jsonCall(app, 'POST', '/api/org/departments', {
      token: admin,
      body: { code: 'D-HR', nameZh: '人事部', nameEn: 'HR', managerIds: [2], assignMode: 'manual' },
    })
    assert.equal(created.status, 200)
    assert.equal(created.json.ok, true)

    const duplicate = await jsonCall(app, 'POST', '/api/org/departments', {
      token: admin,
      body: { code: 'D-HR', nameZh: '重复' },
    })
    assert.equal(duplicate.status, 422)
    assert.ok(duplicate.json.error.details.fields.includes('code'))

    const badMode = await jsonCall(app, 'POST', '/api/org/departments', {
      token: admin,
      body: { code: 'D-X', nameZh: '坏模式', assignMode: 'hybrid' },
    })
    assert.equal(badMode.status, 422)
    assert.ok(badMode.json.error.details.fields.includes('assignMode'))

    const list = await jsonCall(app, 'GET', '/api/org/departments', { token: admin })
    assert.equal(list.status, 200)
    assert.equal(list.json.pageSize, 20)
    const it = list.json.items.find((item) => item.id === 20)
    assert.ok(it)
    assert.equal(it.code, 'D-IT')
    assert.equal(it.assignMode, 'auto')
    assert.equal(it.managers[0].id, 2)
    assert.equal(it.teamCount, 2)
    const hr = list.json.items.find((item) => item.code === 'D-HR')
    assert.equal(hr.assignMode, 'manual')
    assert.equal(hr.teamCount, 0)

    const teamByManager = await jsonCall(app, 'POST', '/api/org/teams', {
      token: manager,
      body: { departmentId: 20, code: 'T-C', nameZh: '支持三组', nameEn: 'Support C' },
    })
    assert.equal(teamByManager.status, 200)

    const teamByRequester = await jsonCall(app, 'POST', '/api/org/teams', {
      token: requester,
      body: { departmentId: 20, code: 'T-D', nameZh: '越权' },
    })
    assert.equal(teamByRequester.status, 403)

    const teamDuplicate = await jsonCall(app, 'POST', '/api/org/teams', {
      token: admin,
      body: { departmentId: 20, code: 'T-A', nameZh: '重复' },
    })
    assert.equal(teamDuplicate.status, 422)
    assert.ok(teamDuplicate.json.error.details.fields.includes('code'))

    const teamMissingDept = await jsonCall(app, 'POST', '/api/org/teams', {
      token: admin,
      body: { departmentId: 999, code: 'T-E', nameZh: '无部门' },
    })
    assert.equal(teamMissingDept.status, 422)
    assert.ok(teamMissingDept.json.error.details.fields.includes('departmentId'))

    const renamed = await jsonCall(app, 'PATCH', '/api/org/teams/30', { token: admin, body: { nameZh: '支持一组改' } })
    assert.equal(renamed.json.ok, true)

    const disabled = await jsonCall(app, 'POST', '/api/org/teams/31/status', { token: manager, body: { status: 0 } })
    assert.equal(disabled.status, 200)

    const deptTeams = await jsonCall(app, 'GET', '/api/org/departments/20/teams', { token: manager })
    assert.equal(deptTeams.status, 200)
    const codes = deptTeams.json.items.map((item) => item.code)
    assert.ok(codes.includes('T-A') && codes.includes('T-B') && codes.includes('T-C'))
    assert.equal(deptTeams.json.items.find((item) => item.id === 31).status, 0)
  })
})

test('成员与候选池：先入部门再加入 Team，候选/添加/删除与权限', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const admin = await loginAdmin(app)
    const manager = await loginAs(app, 'manager@corp.test')
    const requester = await loginAs(app, 'requester@corp.test')

    const members = await jsonCall(app, 'GET', '/api/org/teams/30/members', { token: manager })
    assert.equal(members.status, 200)
    assert.deepEqual(members.json.items.map((item) => item.user.id), [3, 4])
    assert.equal(members.json.items[0].vacation, null)

    const candidates = await jsonCall(app, 'GET', '/api/org/teams/30/member-candidates', { token: admin })
    assert.equal(candidates.status, 200)
    assert.deepEqual(candidates.json.items.map((item) => item.id), [5])

    const notInPool = await jsonCall(app, 'POST', '/api/org/teams/30/members', { token: admin, body: { userId: 8 } })
    assert.equal(notInPool.status, 422)
    assert.ok(notInPool.json.error.details.fields.includes('userId'))

    const addToDepartment = await jsonCall(app, 'POST', '/api/org/departments/20/members', { token: admin, body: { userId: 8 } })
    assert.equal(addToDepartment.status, 200)
    assert.equal(addToDepartment.json.ok, true)

    const addToTeam = await jsonCall(app, 'POST', '/api/org/teams/30/members', { token: admin, body: { userId: 8 } })
    assert.equal(addToTeam.status, 200)

    const membersAfter = await jsonCall(app, 'GET', '/api/org/teams/30/members', { token: admin })
    assert.deepEqual(membersAfter.json.items.map((item) => item.user.id), [3, 4, 8])

    const requesterDenied = await jsonCall(app, 'POST', '/api/org/teams/30/members', { token: requester, body: { userId: 8 } })
    assert.equal(requesterDenied.status, 403)

    const deptCandidates = await jsonCall(app, 'GET', '/api/org/departments/20/member-candidates', { token: admin })
    assert.ok(deptCandidates.json.items.some((item) => item.id === 6))

    const removed = await jsonCall(app, 'DELETE', '/api/org/teams/30/members/8', { token: manager })
    assert.equal(removed.json.ok, true)
    const membersFinal = await jsonCall(app, 'GET', '/api/org/teams/30/members', { token: admin })
    assert.deepEqual(membersFinal.json.items.map((item) => item.user.id), [3, 4])
  })
})

test('休假：日期自动排序、单条记录替换、删除与校验', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const admin = await loginAdmin(app)
    const manager = await loginAs(app, 'manager@corp.test')

    const reversed = await jsonCall(app, 'POST', '/api/org/teams/30/members/3/vacations', {
      token: admin,
      body: { startDate: '2027-01-10', endDate: '2027-01-05', autoReplyText: '休假自动回复' },
    })
    assert.equal(reversed.status, 200)
    assert.equal(reversed.json.ok, true)

    const members = await jsonCall(app, 'GET', '/api/org/teams/30/members', { token: admin })
    const vacation = members.json.items.find((item) => item.user.id === 3).vacation
    assert.equal(vacation.state, 'scheduled')
    assert.equal(vacation.startDate, '2027-01-05')
    assert.equal(vacation.endDate, '2027-01-10')
    assert.equal(vacation.autoReplyText, '休假自动回复')

    const replaced = await jsonCall(app, 'POST', '/api/org/teams/30/members/3/vacations', {
      token: manager,
      body: { startDate: '2000-01-01', endDate: '2999-12-31' },
    })
    assert.equal(replaced.status, 200)
    const count = await platform.db.queryOne({ text: 'SELECT COUNT(*) AS total FROM vacations WHERE user_id = 3' })
    assert.equal(count.total, 1)
    const membersAfter = await jsonCall(app, 'GET', '/api/org/teams/30/members', { token: admin })
    assert.equal(membersAfter.json.items.find((item) => item.user.id === 3).vacation.state, 'on_leave')

    const removed = await jsonCall(app, 'DELETE', '/api/org/teams/30/members/3/vacations', { token: admin })
    assert.equal(removed.json.ok, true)
    const membersFinal = await jsonCall(app, 'GET', '/api/org/teams/30/members', { token: admin })
    assert.equal(membersFinal.json.items.find((item) => item.user.id === 3).vacation, null)

    const badFormat = await jsonCall(app, 'POST', '/api/org/teams/30/members/3/vacations', {
      token: admin,
      body: { startDate: '2027/01/01', endDate: '2027-01-02' },
    })
    assert.equal(badFormat.status, 422)
    assert.deepEqual(badFormat.json.error.details.fields, ['startDate', 'endDate'])

    const notMember = await jsonCall(app, 'POST', '/api/org/teams/30/members/5/vacations', {
      token: admin,
      body: { startDate: '2027-01-01', endDate: '2027-01-02' },
    })
    assert.equal(notMember.status, 404)
  })
})

test('用户管理：创建/登录/改密/停用/导入随机密码/查询/导出', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const admin = await loginAdmin(app)
    const requester = await loginAs(app, 'requester@corp.test')

    const created = await jsonCall(app, 'POST', '/api/admin/users', {
      token: admin,
      body: { email: 'newbie@corp.test', nameZh: '新员工', nameEn: 'Newbie', role: 'requester', password: 'Password123', companyId: 10 },
    })
    assert.equal(created.status, 200)
    assert.equal(created.json.ok, true)
    const newbieToken = await loginAs(app, 'newbie@corp.test', 'Password123')
    assert.ok(newbieToken)

    const found = await jsonCall(app, 'GET', '/api/admin/users', { token: admin, query: { q: 'newbie' } })
    assert.equal(found.json.total, 1)
    const newbie = found.json.items[0]
    assert.equal(newbie.email, 'newbie@corp.test')
    assert.equal(newbie.companyNameZh, '示例公司')

    const passwordChanged = await jsonCall(app, 'PATCH', `/api/admin/users/${newbie.id}`, {
      token: admin,
      body: { password: 'ChangedPass456' },
    })
    assert.equal(passwordChanged.json.ok, true)
    const oldLogin = await jsonCall(app, 'POST', '/api/auth/login', { body: { email: 'newbie@corp.test', password: 'Password123' } })
    assert.equal(oldLogin.status, 401)
    await loginAs(app, 'newbie@corp.test', 'ChangedPass456')

    const disabled = await jsonCall(app, 'PATCH', `/api/admin/users/${newbie.id}`, { token: admin, body: { status: 0 } })
    assert.equal(disabled.json.ok, true)
    const disabledLogin = await jsonCall(app, 'POST', '/api/auth/login', { body: { email: 'newbie@corp.test', password: 'ChangedPass456' } })
    assert.equal(disabledLogin.status, 401)
    await jsonCall(app, 'PATCH', `/api/admin/users/${newbie.id}`, { token: admin, body: { status: 1 } })

    const badRole = await jsonCall(app, 'POST', '/api/admin/users', {
      token: admin,
      body: { email: 'role-x@corp.test', nameZh: 'x', role: 'wizard', password: 'Password123' },
    })
    assert.equal(badRole.status, 422)
    assert.ok(badRole.json.error.details.fields.includes('role'))

    const dupEmail = await jsonCall(app, 'POST', '/api/admin/users', {
      token: admin,
      body: { email: 'newbie@corp.test', nameZh: 'x', role: 'agent', password: 'Password123' },
    })
    assert.equal(dupEmail.status, 422)
    assert.ok(dupEmail.json.error.details.fields.includes('email'))

    const shortPassword = await jsonCall(app, 'POST', '/api/admin/users', {
      token: admin,
      body: { email: 'short@corp.test', nameZh: 'x', role: 'agent', password: '123' },
    })
    assert.equal(shortPassword.status, 422)
    assert.ok(shortPassword.json.error.details.fields.includes('password'))

    const imported = await jsonCall(app, 'POST', '/api/admin/users/import', {
      token: admin,
      body: { rows: [{ email: 'imported@corp.test', nameZh: '导入用户', role: 'agent' }] },
    })
    assert.equal(imported.status, 200)
    assert.equal(imported.json.applied, 1)
    const importedLogin = await jsonCall(app, 'POST', '/api/auth/login', { body: { email: 'imported@corp.test', password: 'whatever123' } })
    assert.equal(importedLogin.status, 401)
    const importedRow = await jsonCall(app, 'GET', '/api/admin/users', { token: admin, query: { q: 'imported' } })
    const importedId = importedRow.json.items[0].id
    await jsonCall(app, 'PATCH', `/api/admin/users/${importedId}`, { token: admin, body: { password: 'ImportedPass789' } })
    await loginAs(app, 'imported@corp.test', 'ImportedPass789')

    const importFailed = await jsonCall(app, 'POST', '/api/admin/users/import', {
      token: admin,
      body: { rows: [{ email: 'bad-email', nameZh: 'x', role: 'agent' }] },
    })
    assert.equal(importFailed.status, 422)
    assert.equal(importFailed.json.error.details.rows[0].row, 0)

    const exported = await jsonCall(app, 'GET', '/api/admin/users/export.csv', { token: admin })
    assert.equal(exported.status, 200)
    assert.ok(exported.text.includes('email'))
    assert.ok(exported.text.includes('newbie@corp.test'))

    const requesterDenied = await jsonCall(app, 'GET', '/api/admin/users', { token: requester })
    assert.equal(requesterDenied.status, 403)
  })
})

test('分类与业务选项：二级分类、状态过滤与骨架排除', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const admin = await loginAdmin(app)
    const requester = await loginAs(app, 'requester@corp.test')

    const created = await jsonCall(app, 'POST', '/api/admin/categories', {
      token: admin,
      body: { code: 'CAT-DB', nameZh: '数据库', nameEn: 'Database', departmentId: 20, ticketType: 'incident', sortOrder: 3 },
    })
    assert.equal(created.status, 200)
    assert.equal(created.json.ok, true)

    const duplicate = await jsonCall(app, 'POST', '/api/admin/categories', {
      token: admin,
      body: { code: 'CAT-DB', nameZh: '重复', ticketType: 'incident' },
    })
    assert.equal(duplicate.status, 422)
    assert.ok(duplicate.json.error.details.fields.includes('code'))

    const badType = await jsonCall(app, 'POST', '/api/admin/categories', {
      token: admin,
      body: { code: 'CAT-BAD', nameZh: '坏类型', ticketType: 'change' },
    })
    assert.equal(badType.status, 422)
    assert.ok(badType.json.error.details.fields.includes('ticketType'))

    const list = await jsonCall(app, 'GET', '/api/admin/categories', { token: admin })
    assert.equal(list.status, 200)
    assert.equal(list.json.pageSize, 20)
    const dbCategory = list.json.items.find((item) => item.code === 'CAT-DB')
    assert.ok(dbCategory)
    assert.equal(dbCategory.department.id, 20)
    assert.equal(dbCategory.ticketType, 'incident')

    const sub = await jsonCall(app, 'POST', '/api/admin/subcategories', {
      token: admin,
      body: { code: 'SUB-1', nameZh: '账号问题', categoryId: dbCategory.id, sortOrder: 1 },
    })
    assert.equal(sub.status, 200)
    const subDuplicate = await jsonCall(app, 'POST', '/api/admin/subcategories', {
      token: admin,
      body: { code: 'SUB-1', nameZh: '重复', categoryId: dbCategory.id },
    })
    assert.equal(subDuplicate.status, 422)
    assert.ok(subDuplicate.json.error.details.fields.includes('code'))

    const options = await jsonCall(app, 'GET', '/api/categories/options', { token: requester })
    assert.equal(options.status, 200)
    const codes = options.json.map((item) => item.code)
    assert.ok(codes.includes('CAT-NETWORK'))
    assert.ok(codes.includes('CAT-OTHER'))
    assert.ok(codes.includes('CAT-DB'))
    const networkOption = options.json.find((item) => item.code === 'CAT-NETWORK')
    assert.ok(Array.isArray(networkOption.subCategories))

    const disabled = await jsonCall(app, 'PATCH', `/api/admin/categories/${dbCategory.id}`, { token: admin, body: { status: 0 } })
    assert.equal(disabled.json.ok, true)
    const optionsAfter = await jsonCall(app, 'GET', '/api/categories/options', { token: requester })
    assert.ok(!optionsAfter.json.some((item) => item.code === 'CAT-DB'))
    assert.ok(!optionsAfter.json.some((item) => item.id === 1 || item.id === 2))
  })
})

test('分配规则：列表/部门匹配校验/CRUD/导入导出', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const admin = await loginAdmin(app)
    const requester = await loginAs(app, 'requester@corp.test')

    const initial = await jsonCall(app, 'GET', '/api/admin/assignment-rules', { token: admin })
    assert.equal(initial.status, 200)
    const rule = initial.json.items[0]
    assert.equal(rule.id, 50)
    assert.equal(rule.category.id, 40)
    assert.equal(rule.department.id, 20)
    assert.equal(rule.teams.length, 2)
    assert.ok(initial.json.unconfiguredCategories.some((item) => item.id === 41))

    const mismatch = await jsonCall(app, 'POST', '/api/admin/assignment-rules', {
      token: admin,
      body: { categoryId: 41, teamIds: [30] },
    })
    assert.equal(mismatch.status, 422)
    assert.equal(mismatch.json.error.code, 'RULE_TEAM_DEPARTMENT_MISMATCH')

    const created = await jsonCall(app, 'POST', '/api/admin/categories', {
      token: admin,
      body: { code: 'CAT-DB', nameZh: '数据库', departmentId: 20, ticketType: 'incident' },
    })
    assert.equal(created.json.ok, true)
    const list = await jsonCall(app, 'GET', '/api/admin/categories', { token: admin })
    const dbCategory = list.json.items.find((item) => item.code === 'CAT-DB')

    const empty = await jsonCall(app, 'POST', '/api/admin/assignment-rules', {
      token: admin,
      body: { categoryId: dbCategory.id, teamIds: [] },
    })
    assert.equal(empty.status, 422)
    assert.ok(empty.json.error.details.fields.includes('teamIds'))

    const createdRule = await jsonCall(app, 'POST', '/api/admin/assignment-rules', {
      token: admin,
      body: { categoryId: dbCategory.id, teamIds: [30, 31] },
    })
    assert.equal(createdRule.status, 200)

    const duplicate = await jsonCall(app, 'POST', '/api/admin/assignment-rules', {
      token: admin,
      body: { categoryId: dbCategory.id, teamIds: [30] },
    })
    assert.equal(duplicate.status, 422)
    assert.ok(duplicate.json.error.details.fields.includes('categoryId'))

    const exported = await jsonCall(app, 'GET', '/api/admin/assignment-rules/export.csv', { token: admin })
    assert.equal(exported.status, 200)
    assert.ok(exported.text.includes('categoryCode'))
    assert.ok(exported.text.includes('CAT-NETWORK'))
    assert.ok(exported.text.includes('T-A;T-B'))

    const imported = await jsonCall(app, 'POST', '/api/admin/assignment-rules/import', {
      token: admin,
      body: { rows: [{ categoryCode: 'CAT-NETWORK', teamCodes: ['T-A', 'T-B'] }] },
    })
    assert.equal(imported.status, 200)
    assert.equal(imported.json.applied, 1)

    const importFailed = await jsonCall(app, 'POST', '/api/admin/assignment-rules/import', {
      token: admin,
      body: { rows: [{ categoryCode: 'NOPE', teamCodes: ['T-A'] }] },
    })
    assert.equal(importFailed.status, 400)
    assert.equal(importFailed.json.error.code, 'CSV_ROW_INVALID')
    assert.equal(importFailed.json.error.details.row.categoryCode, 'NOPE')

    const patched = await jsonCall(app, 'PATCH', '/api/admin/assignment-rules/50', { token: admin, body: { teamIds: [30] } })
    assert.equal(patched.json.ok, true)
    const afterPatch = await jsonCall(app, 'GET', '/api/admin/assignment-rules', { token: admin })
    assert.equal(afterPatch.json.items.find((item) => item.id === 50).teams.length, 1)

    const deleted = await jsonCall(app, 'DELETE', '/api/admin/assignment-rules/50', { token: admin })
    assert.equal(deleted.json.ok, true)
    const afterDelete = await jsonCall(app, 'GET', '/api/admin/assignment-rules', { token: admin })
    assert.ok(!afterDelete.json.items.some((item) => item.id === 50))
    assert.ok(afterDelete.json.unconfiguredCategories.some((item) => item.id === 40))

    const requesterDenied = await jsonCall(app, 'GET', '/api/admin/assignment-rules', { token: requester })
    assert.equal(requesterDenied.status, 403)
  })
})

test('SLA 配置：策略/工作日历/节假日与校验', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const admin = await loginAdmin(app)
    const requester = await loginAs(app, 'requester@corp.test')

    const policies = await jsonCall(app, 'GET', '/api/admin/sla-policies', { token: admin })
    assert.equal(policies.status, 200)
    const policy = policies.json.items[0]
    assert.equal(policy.category.id, 40)
    assert.equal(policy.firstResponseMinutes, 60)
    assert.equal(policy.resolutionMinutes, 120)
    assert.equal(policy.warnThresholdPercent, 80)
    assert.ok(policies.json.unconfiguredCategories.some((item) => item.id === 41))

    const created = await jsonCall(app, 'POST', '/api/admin/sla-policies', {
      token: admin,
      body: { categoryId: 41, firstResponseMinutes: 30, resolutionMinutes: 60, warnThresholdPercent: 90 },
    })
    assert.equal(created.status, 200)

    const duplicate = await jsonCall(app, 'POST', '/api/admin/sla-policies', {
      token: admin,
      body: { categoryId: 41, firstResponseMinutes: 10, resolutionMinutes: 20 },
    })
    assert.equal(duplicate.status, 422)
    assert.ok(duplicate.json.error.details.fields.includes('categoryId'))

    const invalid = await jsonCall(app, 'POST', '/api/admin/sla-policies', {
      token: admin,
      body: { categoryId: 40, firstResponseMinutes: -1, resolutionMinutes: 20 },
    })
    assert.equal(invalid.status, 422)
    assert.ok(invalid.json.error.details.fields.includes('firstResponseMinutes'))

    const patched = await jsonCall(app, 'PATCH', `/api/admin/sla-policies/${policy.id}`, { token: admin, body: { resolutionMinutes: 180 } })
    assert.equal(patched.json.ok, true)
    const afterPatch = await jsonCall(app, 'GET', '/api/admin/sla-policies', { token: admin })
    assert.equal(afterPatch.json.items.find((item) => item.id === policy.id).resolutionMinutes, 180)

    const calendar = await jsonCall(app, 'GET', '/api/admin/calendar', { token: admin })
    assert.equal(calendar.status, 200)
    assert.deepEqual(calendar.json.weekdays, [1, 2, 3, 4, 5])
    assert.equal(calendar.json.workStartTime, '09:00')
    assert.equal(calendar.json.workEndTime, '18:00')

    const putCalendar = await jsonCall(app, 'PUT', '/api/admin/calendar', {
      token: admin,
      body: { weekdays: [1, 2, 3, 4, 5, 6], workStartTime: '08:30', workEndTime: '17:30', timezone: 'Asia/Kuala_Lumpur' },
    })
    assert.equal(putCalendar.json.ok, true)
    const calendarAfter = await jsonCall(app, 'GET', '/api/admin/calendar', { token: admin })
    assert.deepEqual(calendarAfter.json.weekdays, [1, 2, 3, 4, 5, 6])
    assert.equal(calendarAfter.json.workStartTime, '08:30')

    const badWeekdays = await jsonCall(app, 'PUT', '/api/admin/calendar', {
      token: admin,
      body: { weekdays: [1, 1], workStartTime: '09:00', workEndTime: '18:00', timezone: 'Asia/Kuala_Lumpur' },
    })
    assert.equal(badWeekdays.status, 422)
    assert.ok(badWeekdays.json.error.details.fields.includes('weekdays'))

    const badTime = await jsonCall(app, 'PUT', '/api/admin/calendar', {
      token: admin,
      body: { weekdays: [1, 2], workStartTime: '9am', workEndTime: '18:00', timezone: 'Asia/Kuala_Lumpur' },
    })
    assert.equal(badTime.status, 422)
    assert.ok(badTime.json.error.details.fields.includes('workStartTime'))

    const holiday = await jsonCall(app, 'POST', '/api/admin/holidays', {
      token: admin,
      body: { date: '2026-12-25', nameZh: '圣诞节', nameEn: 'Christmas' },
    })
    assert.equal(holiday.status, 200)
    const holidayDuplicate = await jsonCall(app, 'POST', '/api/admin/holidays', {
      token: admin,
      body: { date: '2026-12-25', nameZh: '重复' },
    })
    assert.equal(holidayDuplicate.status, 422)
    assert.ok(holidayDuplicate.json.error.details.fields.includes('date'))
    const badDate = await jsonCall(app, 'POST', '/api/admin/holidays', {
      token: admin,
      body: { date: '2026/12/25', nameZh: '坏日期' },
    })
    assert.equal(badDate.status, 422)
    assert.ok(badDate.json.error.details.fields.includes('date'))

    const holidays = await jsonCall(app, 'GET', '/api/admin/holidays', { token: admin })
    assert.equal(holidays.json.items[0].date, '2026-12-25')
    assert.equal(holidays.json.items[0].nameZh, '圣诞节')
    const removed = await jsonCall(app, 'DELETE', `/api/admin/holidays/${holidays.json.items[0].id}`, { token: admin })
    assert.equal(removed.json.ok, true)
    const holidaysAfter = await jsonCall(app, 'GET', '/api/admin/holidays', { token: admin })
    assert.equal(holidaysAfter.json.items.length, 0)

    const requesterDenied = await jsonCall(app, 'GET', '/api/admin/sla-policies', { token: requester })
    assert.equal(requesterDenied.status, 403)
  })
})

test('配置审计日志：记录配置变更，仅管理员可见', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const admin = await loginAdmin(app)
    const requester = await loginAs(app, 'requester@corp.test')

    const created = await jsonCall(app, 'POST', '/api/org/companies', {
      token: admin,
      body: { code: 'C-AUDIT', nameZh: '审计公司' },
    })
    assert.equal(created.json.ok, true)

    const logs = await jsonCall(app, 'GET', '/api/admin/audit-logs', { token: admin })
    assert.equal(logs.status, 200)
    assert.equal(logs.json.page, 1)
    assert.equal(logs.json.pageSize, 20)
    assert.ok(logs.json.total >= 1)
    const entry = logs.json.items[0]
    assert.ok(typeof entry.id === 'string' && entry.id.length > 0)
    assert.ok(typeof entry.category === 'string' && entry.category.length > 0)
    assert.ok(typeof entry.summaryZh === 'string')
    assert.ok(entry.createdAt)

    const requesterDenied = await jsonCall(app, 'GET', '/api/admin/audit-logs', { token: requester })
    assert.equal(requesterDenied.status, 403)
  })
})
