// 分配引擎行为测试：双层轮转、重启续转（游标持久化）、休假排除、
// 经理回退、全员不可用、无规则分类、经理回复认领、手动指派与转派矩阵
// （需求 §6.2 / 契约 §3.5）。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  bootPlatform,
  createSubmittedTicket,
  jsonCall,
  loginAdmin,
  loginAs,
  seedScenario,
  withIsolatedPlatform,
} from './api-helpers.mjs'

const NOW = new Date().toISOString()

async function insertVacation(db, userId) {
  await db.run({
    text: `INSERT INTO vacations (user_id, start_date, end_date, auto_reply_text, created_at)
           VALUES (?, '2000-01-01', '2999-12-31', NULL, ?)`,
    params: [userId, NOW],
  })
}

async function insertCategory(db, id, code, departmentId) {
  await db.run({
    text: `INSERT INTO categories (id, code, name_zh, name_en, department_id, ticket_type, sort_order, status, is_skeleton, created_at, updated_at)
           VALUES (?, ?, ?, 'X', ?, 'incident', 9, 1, 0, ?, ?)`,
    params: [id, code, `分类${id}`, departmentId, NOW, NOW],
  })
}

test('双层轮转：Team 与成员依次轮转 3→5→4', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const token = await loginAs(app, 'requester@corp.test')
    const picks = []
    for (const key of ['rr-1', 'rr-2', 'rr-3']) {
      const { submit } = await createSubmittedTicket(app, token, { key })
      picks.push([
        submit.json.assignment.result,
        submit.json.assignment.team.id,
        submit.json.assignment.assignee.id,
      ])
    }
    assert.deepEqual(picks, [
      ['assigned', 30, 3],
      ['assigned', 31, 5],
      ['assigned', 30, 4],
    ])
  })
})

test('重启后轮转游标持久化：续转 5→3', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'helpdesk-restart-'))
  const dbPath = path.join(directory, 'app.db')
  let first
  try {
    first = await bootPlatform({ env: { DB_PATH: dbPath, ATTACHMENT_DIR: path.join(directory, 'attachments') } })
    await seedScenario(first.platform.db)
    const token = await loginAs(first.app, 'requester@corp.test')
    const picks = []
    for (const key of ['restart-1', 'restart-2', 'restart-3']) {
      const { submit } = await createSubmittedTicket(first.app, token, { key })
      picks.push([submit.json.assignment.team.id, submit.json.assignment.assignee.id])
    }
    assert.deepEqual(picks, [
      [30, 3],
      [31, 5],
      [30, 4],
    ])
    await first.platform.close()

    const second = await bootPlatform({ env: { DB_PATH: dbPath, ATTACHMENT_DIR: path.join(directory, 'attachments') } })
    try {
      const token2 = await loginAs(second.app, 'requester@corp.test')
      const picks2 = []
      for (const key of ['restart-4', 'restart-5']) {
        const { submit } = await createSubmittedTicket(second.app, token2, { key })
        picks2.push([submit.json.assignment.team.id, submit.json.assignment.assignee.id])
      }
      assert.deepEqual(picks2, [
        [31, 5],
        [30, 3],
      ])
      const cursor = await second.platform.db.queryOne({ text: "SELECT last_value FROM round_robin_cursors WHERE scope = 'member:30'" })
      assert.equal(cursor.last_value, 0)
    } finally {
      await second.close()
    }
  } finally {
    if (first?.platform) {
      try {
        await first.platform.close()
      } catch {
        // platform may already be closed by the test body
      }
    }
    if (first?.directory) await rm(first.directory, { recursive: true, force: true })
    await rm(directory, { recursive: true, force: true })
  }
})

test('休假排除：当日休假成员被跳过，分配给下一位', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    await insertVacation(platform.db, 3)
    const token = await loginAs(app, 'requester@corp.test')
    const { submit } = await createSubmittedTicket(app, token, { key: 'vacation-1' })
    assert.equal(submit.json.assignment.result, 'assigned')
    assert.equal(submit.json.assignment.team.id, 30)
    assert.equal(submit.json.assignment.assignee.id, 4)
    assert.equal(submit.json.assignment.fallback, undefined)
  })
})

test('经理回退：目标 Team 无可用成员时回退部门经理', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    await insertVacation(platform.db, 3)
    await insertVacation(platform.db, 4)
    const token = await loginAs(app, 'requester@corp.test')
    const { submit, id } = await createSubmittedTicket(app, token, { key: 'fallback-1' })
    assert.equal(submit.json.assignment.result, 'assigned')
    assert.equal(submit.json.assignment.assignee.id, 2)
    assert.equal(submit.json.assignment.fallback, 'manager')

    const activities = await jsonCall(app, 'GET', `/api/tickets/${id}/activities`, { token })
    assert.equal(activities.status, 200)
    assert.ok(
      activities.json.items.some((item) => item.action === 'submit' && item.remarkZh.includes('回退部门经理')),
    )
  })
})

test('全员不可用：成员与经理均休假、备用 Team 停用 → pending_assign', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    await insertVacation(platform.db, 3)
    await insertVacation(platform.db, 4)
    await insertVacation(platform.db, 2)
    await platform.db.run({ text: 'UPDATE teams SET status = 0 WHERE id = 31' })
    const token = await loginAs(app, 'requester@corp.test')
    const { submit } = await createSubmittedTicket(app, token, { key: 'unavailable-1' })
    assert.equal(submit.json.ticket.status, 'pending_assign')
    assert.equal(submit.json.assignment.result, 'pending_assign')
    assert.equal(submit.json.assignment.team.id, 30)
    assert.ok(typeof submit.json.assignment.reason === 'string' && submit.json.assignment.reason.length > 0)
  })
})

test('无规则分类：提交后 pending_assign，提交人仍可回复且状态不变', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const token = await loginAs(app, 'requester@corp.test')
    const { submit, id } = await createSubmittedTicket(app, token, { key: 'no-rule-1', categoryId: 41 })
    assert.equal(submit.json.ticket.status, 'pending_assign')
    assert.equal(submit.json.assignment.result, 'pending_assign')
    assert.equal(submit.json.assignment.team, undefined)
    assert.ok(typeof submit.json.assignment.reason === 'string' && submit.json.assignment.reason.length > 0)

    const reply = await jsonCall(app, 'POST', `/api/tickets/${id}/replies`, { token, body: { body: '补充信息' } })
    assert.equal(reply.status, 201)
    assert.equal(reply.json.ticket.status, 'pending_assign')
    assert.equal(reply.json.ticket.assignee, null)
  })
})

test('经理回复认领：pending_assign 转处理中并成为处理人，可继续解决', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    await insertCategory(platform.db, 42, 'CAT-MANUAL', 20)
    const requester = await loginAs(app, 'requester@corp.test')
    const manager = await loginAs(app, 'manager@corp.test')
    const { submit, id } = await createSubmittedTicket(app, requester, { key: 'claim-1', categoryId: 42 })
    assert.equal(submit.json.ticket.status, 'pending_assign')
    assert.equal(submit.json.ticket.department.id, 20)

    const claim = await jsonCall(app, 'POST', `/api/tickets/${id}/replies`, { token: manager, body: { body: '我来接手' } })
    assert.equal(claim.status, 201)
    assert.equal(claim.json.ticket.status, 'in_progress')
    assert.equal(claim.json.ticket.assignee.id, 2)

    const activities = await jsonCall(app, 'GET', `/api/tickets/${id}/activities`, { token: requester })
    assert.ok(activities.json.items.some((item) => item.action === 'claim'))

    const resolve = await jsonCall(app, 'POST', `/api/tickets/${id}/resolve`, { token: manager, body: { resolutionNote: '已处理' } })
    assert.equal(resolve.status, 200)
    assert.equal(resolve.json.status, 'pending_confirm')
  })
})

test('手动指派：权限矩阵与校验（403/409/200）', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    await insertCategory(platform.db, 42, 'CAT-MANUAL', 20)
    const requester = await loginAs(app, 'requester@corp.test')
    const manager = await loginAs(app, 'manager@corp.test')
    const agentA1 = await loginAs(app, 'agent-a1@corp.test')
    const admin = await loginAdmin(app)

    const first = await createSubmittedTicket(app, requester, { key: 'assign-1', categoryId: 42 })
    const idA = first.id
    assert.equal(first.submit.json.ticket.status, 'pending_assign')

    const requesterDenied = await jsonCall(app, 'POST', `/api/tickets/${idA}/assign`, { token: requester, body: { teamId: 30, userId: 3 } })
    assert.equal(requesterDenied.status, 403)

    const agentDenied = await jsonCall(app, 'POST', `/api/tickets/${idA}/assign`, { token: agentA1, body: { teamId: 30, userId: 3 } })
    assert.equal(agentDenied.status, 403)

    const crossTeam = await jsonCall(app, 'POST', `/api/tickets/${idA}/assign`, { token: manager, body: { teamId: 30, userId: 5 } })
    assert.equal(crossTeam.status, 409)
    assert.equal(crossTeam.json.error.code, 'ASSIGNEE_NOT_IN_DEPARTMENT')

    const invalidBody = await jsonCall(app, 'POST', `/api/tickets/${idA}/assign`, { token: manager, body: { teamId: 'x', userId: 3 } })
    assert.equal(invalidBody.status, 422)
    assert.ok(invalidBody.json.error.details.fields.includes('teamId'))

    const assigned = await jsonCall(app, 'POST', `/api/tickets/${idA}/assign`, { token: manager, body: { teamId: 30, userId: 3 } })
    assert.equal(assigned.status, 200)
    assert.equal(assigned.json.status, 'assigned')
    assert.equal(assigned.json.assignee.id, 3)
    assert.equal(assigned.json.team.id, 30)

    const activities = await jsonCall(app, 'GET', `/api/tickets/${idA}/activities`, { token: requester })
    assert.ok(activities.json.items.some((item) => item.action === 'assign'))

    const second = await createSubmittedTicket(app, requester, { key: 'assign-2', categoryId: 42 })
    const adminAssigned = await jsonCall(app, 'POST', `/api/tickets/${second.id}/assign`, { token: admin, body: { teamId: 31, userId: 5 } })
    assert.equal(adminAssigned.status, 200)
    assert.equal(adminAssigned.json.assignee.id, 5)
    assert.equal(adminAssigned.json.team.id, 31)

    await insertVacation(platform.db, 3)
    const third = await createSubmittedTicket(app, requester, { key: 'assign-3', categoryId: 42 })
    const onVacation = await jsonCall(app, 'POST', `/api/tickets/${third.id}/assign`, { token: manager, body: { teamId: 30, userId: 3 } })
    assert.equal(onVacation.status, 409)
    assert.equal(onVacation.json.error.code, 'ASSIGNEE_ON_VACATION')
  })
})

test('转派矩阵：处理人/经理/管理员边界与跨部门限制', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    await platform.db.run({
      text: `INSERT INTO departments (id, code, name_zh, name_en, assign_mode, status, created_at, updated_at)
             VALUES (21, 'D-FIN', '财务部', 'Finance', 'auto', 1, ?, ?)`,
      params: [NOW, NOW],
    })
    const requester = await loginAs(app, 'requester@corp.test')
    const agentA1 = await loginAs(app, 'agent-a1@corp.test')
    const agentX = await loginAs(app, 'agent-x@corp.test')
    const manager = await loginAs(app, 'manager@corp.test')
    const admin = await loginAdmin(app)

    const { submit, id } = await createSubmittedTicket(app, requester, { key: 'transfer-1' })
    assert.equal(submit.json.assignment.assignee.id, 3)

    const requesterDenied = await jsonCall(app, 'POST', `/api/tickets/${id}/transfer`, {
      token: requester,
      body: { targetDepartmentId: 21, targetUserId: 4 },
    })
    assert.equal(requesterDenied.status, 403)

    const strangerDenied = await jsonCall(app, 'POST', `/api/tickets/${id}/transfer`, {
      token: agentX,
      body: { targetDepartmentId: 21 },
    })
    assert.equal(strangerDenied.status, 403)

    const crossDeptPerson = await jsonCall(app, 'POST', `/api/tickets/${id}/transfer`, {
      token: agentA1,
      body: { targetDepartmentId: 21, targetUserId: 4 },
    })
    assert.equal(crossDeptPerson.status, 403)

    const sameDeptPerson = await jsonCall(app, 'POST', `/api/tickets/${id}/transfer`, {
      token: agentA1,
      body: { targetDepartmentId: 20, targetUserId: 4 },
    })
    assert.equal(sameDeptPerson.status, 200)
    assert.equal(sameDeptPerson.json.status, 'assigned')
    assert.equal(sameDeptPerson.json.assignee.id, 4)
    assert.equal(sameDeptPerson.json.department.id, 20)

    const wholeTicket = await jsonCall(app, 'POST', `/api/tickets/${id}/transfer`, {
      token: admin,
      body: { targetDepartmentId: 21 },
    })
    assert.equal(wholeTicket.status, 200)
    assert.equal(wholeTicket.json.status, 'pending_assign')
    assert.equal(wholeTicket.json.department.id, 21)
    assert.equal(wholeTicket.json.team, null)
    assert.equal(wholeTicket.json.assignee, null)

    const managerOutOfScope = await jsonCall(app, 'POST', `/api/tickets/${id}/transfer`, {
      token: manager,
      body: { targetDepartmentId: 20 },
    })
    assert.equal(managerOutOfScope.status, 403)

    await platform.db.run({ text: 'INSERT INTO department_managers (department_id, user_id) VALUES (21, 2)' })
    const managerPendingWithPerson = await jsonCall(app, 'POST', `/api/tickets/${id}/transfer`, {
      token: manager,
      body: { targetDepartmentId: 21, targetUserId: 3 },
    })
    assert.equal(managerPendingWithPerson.status, 403)
  })
})
