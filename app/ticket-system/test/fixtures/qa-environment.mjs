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
 * 工单系统 QA 种子数据。预置两个公司（A/B）、部门、用户档案、业务组、分类与分配规则。
 * 返回登录凭据与实体 ID，供集成测试直接登录并验证公司隔离、自动分配等场景。
 */
export async function seedQaTicketEnvironment(platform, { qaRunId }) {
  const now = () => new Date().toISOString()
  const companyA = `cmp-${qaRunId}-a`
  const companyB = `cmp-${qaRunId}-b`
  const deptA1 = `dept-${qaRunId}-a1`
  const categoryNetwork = `cat-${qaRunId}-network`
  const categoryAccount = `cat-${qaRunId}-account`
  const groupA1 = `grp-${qaRunId}-a1`

  await platform.db.transaction(async (tx) => {
    const ts = now()
    await tx.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [companyA, `公司A-${qaRunId}`, ts] })
    await tx.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [companyB, `公司B-${qaRunId}`, ts] })
    await tx.run({ text: 'INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [deptA1, companyA, `研发部-${qaRunId}`, ts] })
    await tx.run({ text: 'INSERT INTO categories (id, name, description, created_at) VALUES (?, ?, ?, ?)', params: [categoryNetwork, '网络问题', '网络相关工单', ts] })
    await tx.run({ text: 'INSERT INTO categories (id, name, description, created_at) VALUES (?, ?, ?, ?)', params: [categoryAccount, '账号问题', '账号相关工单', ts] })
    await tx.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [groupA1, companyA, `网络组-${qaRunId}`, ts] })
  })

  // 在两个公司分别创建提交人、处理人、业务组管理员，并分配权限角色与用户档案。
  const createUser = async (companyId, displayName, roleKey, departmentId = null) => {
    const email = `${roleKey}-${qaRunId}-${randomUUID()}@example.test`
    const password = randomBytes(24).toString('base64url')
    const created = await platform.auth.userStore.create({
      name: displayName,
      email,
      companyId,
      passwordChangeRequired: false,
    }, platform.auth.hashPassword(password))
    await platform.permission.assignRole(created.id, roleKey)
    await platform.db.run({
      text: 'INSERT INTO user_profiles (id, user_id, company_id, department_id, display_name, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [randomUUID(), created.id, companyId, departmentId, displayName, email, now()],
    })
    return { id: created.id, email, password, companyId, displayName, role: roleKey }
  }

  const companyACompanyId = companyA
  const companyBCompanyId = companyB

  const submitterA = await createUser(companyACompanyId, `提交人A-${qaRunId}`, 'submitter', deptA1)
  const handlerA = await createUser(companyACompanyId, `处理人A-${qaRunId}`, 'handler')
  const adminA = await createUser(companyACompanyId, `管理员A-${qaRunId}`, 'group_admin')
  const submitterB = await createUser(companyBCompanyId, `提交人B-${qaRunId}`, 'submitter')

  // 业务组成员（处理人）
  await platform.db.run({
    text: 'INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)',
    params: [randomUUID(), groupA1, handlerA.id, now()],
  })

  // 分类分配规则：公司A 的网络问题 → 网络组（用于验证自动分配）
  await platform.db.run({
    text: 'INSERT INTO category_assignment_rules (id, company_id, category_id, target_group_id, created_at) VALUES (?, ?, ?, ?, ?)',
    params: [randomUUID(), companyA, categoryNetwork, groupA1, now()],
  })

  return {
    qaRunId,
    companies: { a: companyA, b: companyB },
    departments: { a1: deptA1 },
    categories: { network: categoryNetwork, account: categoryAccount },
    groups: { a1: groupA1 },
    users: { submitterA, handlerA, adminA, submitterB },
  }
}

/** 通过 HTTP 登录并返回 Bearer token。 */
export async function loginToken(url, { email, password }) {
  const response = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw new Error(`login failed for ${email}: ${response.status}`)
  const body = await response.json()
  return body.token
}

/** 带 token 发起请求的便捷封装。 */
export async function apiRequest(url, method, path, { token, body } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(`${url}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let parsed = null
  if (text) {
    try { parsed = JSON.parse(text) } catch { parsed = text }
  }
  return { status: response.status, body: parsed }
}
