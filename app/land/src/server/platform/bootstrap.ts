import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createPermissionKit } from '@commonapp/permissionkit'
import { createApplicationAudit } from './audit'
import { authorizationRegistry } from './authorization'
import { createApplicationAuth } from './auth'

/** 契约默认 DB_PATH=./data/land.db（架构基线第 3/5 节）。 */
export const DEFAULT_DB_PATH = './data/land.db'

export type Platform = {
  db: Awaited<ReturnType<typeof createDb>>
  permissionKit: ReturnType<typeof createPermissionKit>
  auditKit: ReturnType<typeof createApplicationAudit>
  auth: ReturnType<typeof createApplicationAuth>
  attachmentsDir: string
  close: () => Promise<void>
}

type SeedUser = { email: string; name: string; role: string }

const SEED_USERS: SeedUser[] = [
  { email: 'admin@land.local', name: '业务规则管理员', role: 'admin' },
  { email: 'investor@land.local', name: '投资业务人员', role: 'investment-officer' },
  { email: 'planner@land.local', name: '方案负责人', role: 'plan-owner' },
  { email: 'researcher@land.local', name: '市场研究人员', role: 'market-researcher' },
  { email: 'finance@land.local', name: '财务成本人员', role: 'finance-cost' },
  { email: 'approver@land.local', role: 'approver', name: '管理层审批人' },
  { email: 'downstream@land.local', name: '下游交接人员', role: 'downstream' },
]

export function seedUserEmails(): string[] {
  return SEED_USERS.map((user) => user.email)
}

export async function initializePlatform(): Promise<Platform> {
  const sqlitePath = process.env.DB_PATH ?? DEFAULT_DB_PATH
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const permissionKit = createPermissionKit(db)
    const auditKit = createApplicationAudit(db)
    await permissionKit.syncRegistry(authorizationRegistry)
    const auth = createApplicationAuth(db, permissionKit, auditKit)
    await seedUsers(db, auth)
    const attachmentsDir = process.env.ATTACHMENTS_DIR ?? './data/attachments'
    await mkdir(attachmentsDir, { recursive: true })
    return { db, permissionKit, auditKit, auth, attachmentsDir, close: () => db.close() }
  } catch (error) {
    await db.close()
    throw error
  }
}

/** 幂等种子：可登录的业务与管理账号（契约 0.1 角色各一 + 管理员）。密码默认 Land-Seed-2026!，可用 LAND_SEED_PASSWORD 覆盖。 */
async function seedUsers(
  db: Platform['db'],
  auth: ReturnType<typeof createApplicationAuth>
): Promise<void> {
  const password = process.env.LAND_SEED_PASSWORD ?? 'Land-Seed-2026!'
  const passwordHash = auth.hashPassword(password)
  const timestamp = new Date().toISOString()
  for (const seed of SEED_USERS) {
    const existing = await db.queryOne({ text: 'SELECT id FROM users WHERE email = ?', params: [seed.email] })
    if (existing) continue
    const id = randomUUID()
    await db.run({
      text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, NULL, ?, 0, ?, ?)',
      params: [id, seed.name, seed.email, passwordHash, timestamp, timestamp],
    })
    await db.run({
      text: 'INSERT INTO user_role_assignments (user_id, role_key, scope_type, scope_id, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [id, seed.role, '', '', timestamp],
    })
  }
}
