import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const restore = (key, value) => {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

/** Run setup against a unique database and QA_RUN_ID, then remove all run data. */
export async function withQaEnvironment(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'app-qa-'))
  const databasePath = path.join(directory, 'application.sqlite')
  const qaRunId = `qa-${randomUUID()}`
  const previousDatabasePath = process.env.DB_PATH
  const previousQaRunId = process.env.QA_RUN_ID
  process.env.DB_PATH = databasePath
  process.env.QA_RUN_ID = qaRunId

  try {
    return await run({ databasePath, qaRunId })
  } finally {
    restore('DB_PATH', previousDatabasePath)
    restore('QA_RUN_ID', previousQaRunId)
    await rm(directory, { recursive: true, force: true })
  }
}

/** Create a fresh login identity for the current QA run and verify its resolved state. */
export async function seedQaIdentity(platform, {
  qaRunId,
  companyId = `${qaRunId}-company`,
  assignRoles,
  verifyAuthorization,
}) {
  const email = `qa-${randomUUID()}@example.test`
  const password = randomBytes(24).toString('base64url')
  const created = await platform.auth.userStore.create({
    name: `QA ${qaRunId}`,
    email,
    companyId,
    passwordChangeRequired: false,
  }, platform.auth.hashPassword(password))
  await assignRoles?.(platform, { userId: created.id, companyId, qaRunId })
  const identity = await platform.auth.userResolver.findById(created.id)

  if (!identity || identity.status !== 'active' || identity.passwordChangeRequired || identity.companyId !== companyId)
    throw new Error('QA identity fixture did not create an active, ready-to-login account')
  await verifyAuthorization?.(platform, { identity, companyId, qaRunId })

  return { id: created.id, email, password, companyId }
}

/**
 * 预置工单业务数据：公司、部门、提交人/处理人、公司维度角色、业务组、分类规则。
 * 所有记录写入当前 QA 运行的隔离数据库，供 tickets.test.mjs 验证完整业务流程。
 */
export async function seedTicketBusiness(platform, { qaRunId, companyId = `${qaRunId}-company` }) {
  const now = new Date().toISOString()
  const db = platform.db

  await db.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [companyId, `Company ${qaRunId}`, now] })
  const departmentId = `${qaRunId}-dept`
  await db.run({ text: 'INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [departmentId, companyId, `Engineering ${qaRunId}`, now] })

  const submitterPassword = randomBytes(24).toString('base64url')
  const submitter = await platform.auth.userStore.create(
    { name: `Submitter ${qaRunId}`, email: `submitter-${qaRunId}@example.test`, companyId, passwordChangeRequired: false },
    platform.auth.hashPassword(submitterPassword),
  )
  await db.run({ text: 'UPDATE users SET department_id = ? WHERE id = ?', params: [departmentId, submitter.id] })
  await platform.permission.assignRole(submitter.id, 'ticket_submitter', { type: 'company', id: companyId })

  const handlerPassword = randomBytes(24).toString('base64url')
  const handler = await platform.auth.userStore.create(
    { name: `Handler ${qaRunId}`, email: `handler-${qaRunId}@example.test`, companyId, passwordChangeRequired: false },
    platform.auth.hashPassword(handlerPassword),
  )
  await platform.permission.assignRole(handler.id, 'ticket_admin', { type: 'company', id: companyId })

  const groupId = `${qaRunId}-group`
  await db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [groupId, companyId, `Support ${qaRunId}`, now] })
  await db.run({ text: 'INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)', params: [randomUUID(), groupId, handler.id, now] })

  const ruleId = `${qaRunId}-rule`
  await db.run({ text: 'INSERT INTO category_assignment_rules (id, company_id, category, business_group_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [ruleId, companyId, 'incident', groupId, now] })

  return {
    companyId,
    departmentId,
    groupId,
    ruleId,
    category: 'incident',
    submitter: { id: submitter.id, email: `submitter-${qaRunId}@example.test`, password: submitterPassword },
    handler: { id: handler.id, email: `handler-${qaRunId}@example.test`, password: handlerPassword },
  }
}
