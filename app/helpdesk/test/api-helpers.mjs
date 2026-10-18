// 测试辅助：隔离平台（独立 DB 文件/附件目录/环境变量快照恢复）、业务种子数据、
// 登录与 JSON/multipart 调用。每个测试自建平台，避免跨用例状态泄漏。
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { createUserStore } from '@commonapp/userkit'
import { hashPassword } from '@commonapp/authkit'

export const ADMIN_EMAIL = 'admin@helpdesk.local'
export const ADMIN_PASSWORD = 'Admin@Helpdesk2026'
export const SEED_PASSWORD = 'Passw0rd!23'

const ENV_KEYS = [
  'DB_PATH',
  'ATTACHMENT_DIR',
  'AUTO_CLOSE_SCAN_INTERVAL_MS',
  'JWT_SECRET',
  'LINGEE_CONSOLE_URL',
  'MATCH_FIELDS',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'EMBED_KANBAN_LIMIT',
  'PENDING_CONFIRM_TIMEOUT_MS',
]

function snapshotEnv(keys) {
  const snapshot = {}
  for (const key of keys) snapshot[key] = process.env[key]
  return snapshot
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function applyEnv(overrides) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

export function buildApp(platform) {
  return createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    protect: platform.auth.authBoundary,
  })
}

/** 启动一个隔离平台；close() 恢复环境变量并删除临时目录。 */
export async function bootPlatform({ env = {} } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'helpdesk-api-'))
  const snapshot = snapshotEnv(ENV_KEYS)
  const overrides = {
    DB_PATH: path.join(directory, 'app.db'),
    ATTACHMENT_DIR: path.join(directory, 'attachments'),
    AUTO_CLOSE_SCAN_INTERVAL_MS: '0',
    JWT_SECRET: 'helpdesk-test-jwt-secret',
    ...env,
  }
  applyEnv(overrides)
  const platform = await initializePlatform()
  return {
    platform,
    app: buildApp(platform),
    directory,
    dbPath: overrides.DB_PATH,
    async close() {
      await platform.close()
      restoreEnv(snapshot)
      await rm(directory, { recursive: true, force: true })
    },
  }
}

export async function withIsolatedPlatform(options, fn) {
  const boot = await bootPlatform(options)
  try {
    return await fn(boot)
  } finally {
    await boot.close()
  }
}

/** 直插 platform users + biz_users（带可登录密码）。 */
export async function seedBizUser(db, { id, email, nameZh, nameEn = '', role, phone = null, companyId = null, password = SEED_PASSWORD, status = 1 }) {
  const store = createUserStore(db)
  const platformUser = await store.create(
    { name: nameZh, email, phone, enabled: status === 1, passwordChangeRequired: false },
    hashPassword(password),
  )
  const now = new Date().toISOString()
  await db.run({
    text: `INSERT INTO biz_users (id, credential_user_id, name_zh, name_en, email, phone, role, company_id, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [id, platformUser.id, nameZh, nameEn, email, phone, role, companyId, status, now, now],
  })
  return id
}

/** 固定 ID 的标准业务种子：公司/部门/Team/人员/分类/分配规则/SLA 策略。 */
export async function seedScenario(db) {
  const now = new Date().toISOString()
  await db.run({
    text: `INSERT INTO companies (id, code, name_zh, name_en, parent_id, status, created_at, updated_at)
           VALUES (10, 'C-CORP', '示例公司', 'ACME Corp', NULL, 1, ?, ?)`,
    params: [now, now],
  })
  await db.run({
    text: `INSERT INTO departments (id, code, name_zh, name_en, assign_mode, status, created_at, updated_at)
           VALUES (20, 'D-IT', 'IT 部', 'IT Department', 'auto', 1, ?, ?)`,
    params: [now, now],
  })
  await db.run({
    text: `INSERT INTO teams (id, department_id, code, name_zh, name_en, status, created_at, updated_at)
           VALUES (30, 20, 'T-A', '支持一组', 'Support A', 1, ?, ?), (31, 20, 'T-B', '支持二组', 'Support B', 1, ?, ?)`,
    params: [now, now, now, now],
  })
  await seedBizUser(db, { id: 2, email: 'manager@corp.test', nameZh: '部门经理', nameEn: 'Dept Manager', role: 'manager' })
  await seedBizUser(db, { id: 3, email: 'agent-a1@corp.test', nameZh: '客服甲', nameEn: 'Agent A1', role: 'agent' })
  await seedBizUser(db, { id: 4, email: 'agent-a2@corp.test', nameZh: '客服乙', nameEn: 'Agent A2', role: 'agent' })
  await seedBizUser(db, { id: 5, email: 'agent-b1@corp.test', nameZh: '客服丙', nameEn: 'Agent B1', role: 'agent' })
  await seedBizUser(db, { id: 6, email: 'requester@corp.test', nameZh: '提交人一', nameEn: 'Requester One', role: 'requester', companyId: 10 })
  await seedBizUser(db, { id: 7, email: 'other-requester@corp.test', nameZh: '提交人二', nameEn: 'Requester Two', role: 'requester', companyId: 10 })
  await seedBizUser(db, { id: 8, email: 'agent-x@corp.test', nameZh: '客服丁', nameEn: 'Agent X', role: 'agent' })
  await db.run({ text: 'INSERT INTO department_managers (department_id, user_id) VALUES (20, 2)' })
  await db.run({ text: 'INSERT INTO team_members (team_id, user_id) VALUES (30, 3), (30, 4), (31, 5)' })
  await db.run({
    text: `INSERT INTO categories (id, code, name_zh, name_en, department_id, ticket_type, sort_order, status, is_skeleton, created_at, updated_at)
           VALUES (40, 'CAT-NETWORK', '网络故障', 'Network', 20, 'incident', 1, 1, 0, ?, ?)`,
    params: [now, now],
  })
  await db.run({
    text: `INSERT INTO categories (id, code, name_zh, name_en, department_id, ticket_type, sort_order, status, is_skeleton, created_at, updated_at)
           VALUES (41, 'CAT-OTHER', '其他', 'Other', NULL, 'service_request', 2, 1, 0, ?, ?)`,
    params: [now, now],
  })
  await db.run({
    text: `INSERT INTO assignment_rules (id, category_id, created_at, updated_at) VALUES (50, 40, ?, ?)`,
    params: [now, now],
  })
  await db.run({ text: 'INSERT INTO assignment_rule_targets (rule_id, team_id) VALUES (50, 30), (50, 31)' })
  await db.run({
    text: `INSERT INTO sla_policies (category_id, first_response_minutes, resolution_minutes, warn_threshold_percent, created_at, updated_at)
           VALUES (40, 60, 120, 80, ?, ?)`,
    params: [now, now],
  })
  return {
    company: 10,
    department: 20,
    teamA: 30,
    teamB: 31,
    category: 40,
    categoryNoRule: 41,
    manager: 2,
    agentA1: 3,
    agentA2: 4,
    agentB1: 5,
    requester: 6,
    requester2: 7,
    agentX: 8,
  }
}

export async function jsonCall(app, method, requestPath, { token, body, query, locale = 'zh', headers = {} } = {}) {
  const finalHeaders = { 'Accept-Language': locale, ...headers }
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json'
  if (token) finalHeaders['Authorization'] = `Bearer ${token}`
  const search = query ? `?${new URLSearchParams(query).toString()}` : ''
  const response = await app.request(`${requestPath}${search}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return readResponse(response)
}

export async function multipartCall(app, requestPath, { token, form, locale = 'zh' } = {}) {
  const headers = { 'Accept-Language': locale }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const response = await app.request(requestPath, { method: 'POST', headers, body: form })
  return readResponse(response)
}

async function readResponse(response) {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return { status: response.status, headers: response.headers, json: await response.json() }
  }
  return { status: response.status, headers: response.headers, text: await response.text() }
}

export async function loginAs(app, email, password = SEED_PASSWORD) {
  const { status, json } = await jsonCall(app, 'POST', '/api/auth/login', { body: { email, password } })
  if (status !== 200) {
    throw new Error(`login failed for ${email}: HTTP ${status} ${JSON.stringify(json)}`)
  }
  return json.token
}

export async function loginAdmin(app) {
  return loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD)
}

/** 走完整业务入口：建草稿并提交，返回两次调用的原始结果。 */
export async function createSubmittedTicket(app, token, { subjectZh = '测试工单', description = '测试描述', categoryId = 40, priority = 'medium', key } = {}) {
  const idempotencyKey = key ?? `idem-${randomUUID()}`
  const draft = await jsonCall(app, 'POST', '/api/tickets', {
    token,
    body: { subjectZh, description, categoryId, priority, idempotencyKey },
  })
  const submit = await jsonCall(app, 'POST', `/api/tickets/${draft.json.id}/submit`, {
    token,
    body: { idempotencyKey },
  })
  return { draft, submit, id: draft.json.id, idempotencyKey }
}

/** 轮询等待条件成立（用于异步邮件等副作用）。 */
export async function pollFor(fn, { timeoutMs = 5000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await fn()
    if (last) return last
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return last
}
