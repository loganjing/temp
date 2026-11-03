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

const TEST_PASSWORD = 'test-password-12345'

/**
 * Seed a full ticket-system test environment: two companies with departments,
 * users (submitter/handler/admin) in each, business groups, categories, and
 * assignment rules. Returns identifiers and login credentials for all actors.
 */
export async function seedTicketEnvironment(platform, { qaRunId }) {
  const now = new Date().toISOString()
  const companyA = `${qaRunId}-comp-a`
  const companyB = `${qaRunId}-comp-b`
  const deptA = `${qaRunId}-dept-a`

  await platform.db.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [companyA, `Company A`, now] })
  await platform.db.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [companyB, `Company B`, now] })
  await platform.db.run({ text: 'INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [deptA, companyA, `Dept A`, now] })

  async function createUser(name, email, companyId, role, departmentId = null) {
    const user = await platform.auth.userStore.create({ name, email, companyId, passwordChangeRequired: false }, platform.auth.hashPassword(TEST_PASSWORD))
    await platform.permissionKit.assignRole(user.id, role)
    if (departmentId) await platform.db.run({ text: 'UPDATE users SET department_id = ? WHERE id = ?', params: [departmentId, user.id] })
    return { id: user.id, email, password: TEST_PASSWORD, companyId }
  }

  const submitterA = await createUser(`Submitter A`, `sub-a-${qaRunId}@example.test`, companyA, 'submitter', deptA)
  const handlerA = await createUser(`Handler A`, `hdl-a-${qaRunId}@example.test`, companyA, 'handler')
  const adminA = await createUser(`Admin A`, `adm-a-${qaRunId}@example.test`, companyA, 'admin')
  const submitterB = await createUser(`Submitter B`, `sub-b-${qaRunId}@example.test`, companyB, 'submitter')

  const groupA = `${qaRunId}-bg-a`
  const groupB = `${qaRunId}-bg-b`
  await platform.db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [groupA, companyA, `BG A`, now] })
  await platform.db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [groupB, companyA, `BG B`, now] })
  await platform.db.run({ text: 'INSERT INTO business_group_members (id, business_group_id, user_id, created_at) VALUES (?, ?, ?, ?)', params: [randomUUID(), groupA, handlerA.id, now] })

  const catA = `${qaRunId}-cat-a`
  const catAUnassigned = `${qaRunId}-cat-unassigned`
  await platform.db.run({ text: 'INSERT INTO ticket_categories (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [catA, companyA, `Cat A`, now] })
  await platform.db.run({ text: 'INSERT INTO ticket_categories (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [catAUnassigned, companyA, `Cat Unassigned`, now] })

  await platform.db.run({ text: 'INSERT INTO category_assignment_rules (id, company_id, category_id, business_group_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [randomUUID(), companyA, catA, groupA, now] })

  return {
    companyA, companyB, deptA, groupA, groupB, catA, catAUnassigned,
    submitterA, handlerA, adminA, submitterB,
    password: TEST_PASSWORD,
  }
}
