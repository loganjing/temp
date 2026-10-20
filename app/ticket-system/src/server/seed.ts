import type { DbClient } from '@commonapp/dbkit'
import type { UserStore } from '@commonapp/userkit'

// 种子数据（契约 §6）：两家演示公司、各角色用户、业务组、分类与自动分配规则；不预置工单。
// 幂等：所有写入按唯一键先查后插，重复执行不产生重复记录，也不覆盖已有数据。
export const DEMO_PASSWORD = 'Demo#12345'

export type SeedUser = {
  email: string
  name: string
  department: string
  role: 'submitter' | 'agent' | 'company_admin'
  groups: string[]
}

export type SeedCompany = {
  name: string
  groups: string[]
  categories: string[]
  users: SeedUser[]
  rules: { category: string; group: string }[]
}

const CATEGORIES = ['故障报修', '账号问题', '账务问题', '功能咨询']

export const SEED_COMPANIES: SeedCompany[] = [
  {
    name: '云帆科技',
    groups: ['技术支持组', '账务问题组'],
    categories: CATEGORIES,
    users: [
      { email: 'a-submitter@demo.io', name: '陈晓', department: '研发部', role: 'submitter', groups: [] },
      { email: 'a-agent1@demo.io', name: '林岚', department: '客服部', role: 'agent', groups: ['技术支持组'] },
      { email: 'a-agent2@demo.io', name: '周源', department: '客服部', role: 'agent', groups: ['账务问题组'] },
      { email: 'a-admin@demo.io', name: '高远', department: '运营部', role: 'company_admin', groups: [] },
    ],
    rules: [{ category: '故障报修', group: '技术支持组' }],
  },
  {
    name: '远山制造',
    groups: ['技术支持组', '账务问题组'],
    categories: CATEGORIES,
    users: [
      { email: 'b-submitter@demo.io', name: '沈青', department: '生产部', role: 'submitter', groups: [] },
      { email: 'b-agent1@demo.io', name: '韩梅', department: '客服部', role: 'agent', groups: ['技术支持组'] },
      { email: 'b-agent2@demo.io', name: '方舟', department: '客服部', role: 'agent', groups: ['账务问题组'] },
      { email: 'b-admin@demo.io', name: '罗成', department: '运营部', role: 'company_admin', groups: [] },
    ],
    rules: [{ category: '账务问题', group: '账务问题组' }],
  },
]

export type SeedPlatform = {
  db: DbClient
  auth: { hashPassword: (password: string) => string; userStore: UserStore }
}

export type SeedSummary = { companies: number; users: number; groups: number; rules: number }

export async function seedDemoData(platform: SeedPlatform): Promise<SeedSummary> {
  const { db, auth } = platform
  const createdAt = new Date().toISOString()
  const summary: SeedSummary = { companies: 0, users: 0, groups: 0, rules: 0 }
  for (const company of SEED_COMPANIES) {
    const companyId = await ensureCompany(db, company.name, createdAt)
    summary.companies += 1
    const groupIds = new Map<string, number>()
    for (const groupName of company.groups) {
      const groupId = await ensureGroup(db, companyId, groupName, createdAt)
      groupIds.set(groupName, groupId)
      summary.groups += 1
    }
    for (const category of company.categories) {
      await db.run({ text: 'INSERT OR IGNORE INTO company_categories (company_id, category) VALUES (?, ?)', params: [companyId, category] })
    }
    for (const user of company.users) {
      const userId = await ensureUser(db, auth, user, companyId, createdAt)
      summary.users += 1
      for (const groupName of user.groups) {
        const groupId = groupIds.get(groupName)
        if (!groupId) throw new Error(`Seed group not found: ${groupName}`)
        await db.run({ text: 'INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', params: [groupId, userId] })
      }
    }
    for (const rule of company.rules) {
      const groupId = groupIds.get(rule.group)
      if (!groupId) throw new Error(`Seed rule group not found: ${rule.group}`)
      const existing = await db.queryOne<{ id: number }>({
        text: 'SELECT id FROM category_rules WHERE company_id = ? AND category = ?',
        params: [companyId, rule.category],
      })
      if (!existing) {
        await db.run({ text: 'INSERT INTO category_rules (company_id, category, group_id) VALUES (?, ?, ?)', params: [companyId, rule.category, groupId] })
        summary.rules += 1
      }
    }
  }
  return summary
}

async function ensureCompany(db: DbClient, name: string, createdAt: string): Promise<number> {
  const existing = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM companies WHERE name = ?', params: [name] })
  if (existing) return existing.id
  const row = await db.queryOne<{ id: number }>({
    text: 'INSERT INTO companies (name, created_at) VALUES (?, ?) RETURNING id',
    params: [name, createdAt],
  })
  if (!row) throw new Error('Failed to insert seed company')
  return row.id
}

async function ensureGroup(db: DbClient, companyId: number, name: string, createdAt: string): Promise<number> {
  const existing = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM groups WHERE company_id = ? AND name = ?', params: [companyId, name] })
  if (existing) return existing.id
  const row = await db.queryOne<{ id: number }>({
    text: 'INSERT INTO groups (company_id, name, created_at) VALUES (?, ?, ?) RETURNING id',
    params: [companyId, name, createdAt],
  })
  if (!row) throw new Error('Failed to insert seed group')
  return row.id
}

async function ensureUser(db: DbClient, auth: SeedPlatform['auth'], user: SeedUser, companyId: number, createdAt: string): Promise<string> {
  const existing = await auth.userStore.findByCredential(user.email, 'email')
  let userId: string
  if (existing) {
    userId = existing.id
  } else {
    const created = await auth.userStore.create(
      { name: user.name, email: user.email, phone: null, passwordChangeRequired: false },
      auth.hashPassword(DEMO_PASSWORD),
    )
    userId = created.id
  }
  const profile = await db.queryOne<{ user_id: string }>({ text: 'SELECT user_id FROM user_profiles WHERE user_id = ?', params: [userId] })
  if (!profile) {
    await db.run({
      text: 'INSERT INTO user_profiles (user_id, display_name, email, company_id, department, role) VALUES (?, ?, ?, ?, ?, ?)',
      params: [userId, user.name, user.email, companyId, user.department, user.role],
    })
  }
  return userId
}
