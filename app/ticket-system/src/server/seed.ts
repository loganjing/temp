import type { DbClient } from '@commonapp/dbkit'
import { createUserStore } from '@commonapp/userkit'
import type { Role } from './business/types'

// 首次启动（companies 为空）时执行一次的演示种子（契约 4.7）；
// 非空库跳过，不种子任何工单数据。

export const DEMO_PASSWORD = 'demo-131'

const COMPANIES = [
  { key: 'A', name: '华东科技' },
  { key: 'B', name: '南方制造' },
] as const

const USERS: { username: string; company: string; role: Role; department: string }[] = [
  { username: 'a-admin', company: 'A', role: 'company_admin', department: '管理部' },
  { username: 'a-sub1', company: 'A', role: 'submitter', department: '研发部' },
  { username: 'a-sub2', company: 'A', role: 'submitter', department: '运维部' },
  { username: 'a-agent1', company: 'A', role: 'agent', department: '支持部' },
  { username: 'a-agent2', company: 'A', role: 'agent', department: '支持部' },
  { username: 'b-admin', company: 'B', role: 'company_admin', department: '管理部' },
  { username: 'b-sub1', company: 'B', role: 'submitter', department: '研发部' },
  { username: 'b-agent1', company: 'B', role: 'agent', department: '支持部' },
  { username: 'ops1', company: 'A', role: 'platform_ops', department: '平台运营' },
]

const CATEGORIES = ['账号权限', '功能故障', '数据问题', '其他']

const GROUPS = [
  { company: 'A', name: '一线支持组', members: ['a-agent1'] },
  { company: 'A', name: '二线专家组', members: ['a-agent2'] },
  { company: 'B', name: '综合支持组', members: ['b-agent1'] },
]

const RULES = [
  { company: 'A', category: '功能故障', group: '一线支持组' },
  { company: 'A', category: '数据问题', group: '二线专家组' },
  { company: 'B', category: '账号权限', group: '综合支持组' },
]

// GROUPS / RULES 以公司键（A/B）引用，companies.name 存中文名，写入前统一换算。
const companyNameOf = (key: string) => COMPANIES.find((item) => item.key === key)!.name

export async function seedDemoData(db: DbClient, hashPassword: (password: string) => string): Promise<void> {
  const existing = await db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM companies' })
  if (Number(existing?.total ?? 0) > 0) return

  await db.transaction(async (tx) => {
    const userStore = createUserStore(tx)
    const now = new Date().toISOString()

    for (const company of COMPANIES) {
      await tx.run({ text: 'INSERT INTO companies (name, created_at) VALUES (?, ?)', params: [company.name, now] })
    }

    const profileIdByUsername = new Map<string, number>()
    for (const user of USERS) {
      const company = COMPANIES.find((item) => item.key === user.company)!
      // platform_users.email 承载登录名（用户名即登录名）；业务邮箱存于 user_profiles。
      const created = await userStore.create({ name: user.username, email: user.username, phone: null }, hashPassword(DEMO_PASSWORD))
      await tx.run({
        text: `INSERT INTO user_profiles (platform_user_id, company_id, display_name, email, department, role, created_at)
          VALUES (?, (SELECT id FROM companies WHERE name = ?), ?, ?, ?, ?, ?)`,
        params: [created.id, company.name, user.username, `${user.username}@example.com`, user.department, user.role, now],
      })
      const profile = await tx.queryOne<{ id: number }>({
        text: 'SELECT id FROM user_profiles WHERE platform_user_id = ?',
        params: [created.id],
      })
      profileIdByUsername.set(user.username, profile?.id ?? 0)
    }

    for (const company of COMPANIES) {
      for (const name of CATEGORIES) {
        await tx.run({ text: 'INSERT INTO categories (company_id, name) VALUES ((SELECT id FROM companies WHERE name = ?), ?)', params: [company.name, name] })
      }
    }

    for (const group of GROUPS) {
      const companyName = companyNameOf(group.company)
      await tx.run({
        text: 'INSERT INTO business_groups (company_id, name, created_at) VALUES ((SELECT id FROM companies WHERE name = ?), ?, ?)',
        params: [companyName, group.name, now],
      })
      const created = await tx.queryOne<{ id: number }>({
        text: `SELECT g.id FROM business_groups g JOIN companies c ON c.id = g.company_id WHERE c.name = ? AND g.name = ?`,
        params: [companyName, group.name],
      })
      for (const member of group.members) {
        await tx.run({ text: 'INSERT INTO group_members (group_id, user_profile_id) VALUES (?, ?)', params: [created?.id ?? 0, profileIdByUsername.get(member) ?? 0] })
      }
    }

    for (const rule of RULES) {
      const companyName = companyNameOf(rule.company)
      const category = await tx.queryOne<{ id: number }>({
        text: `SELECT cat.id FROM categories cat JOIN companies c ON c.id = cat.company_id WHERE c.name = ? AND cat.name = ?`,
        params: [companyName, rule.category],
      })
      const group = await tx.queryOne<{ id: number }>({
        text: `SELECT g.id FROM business_groups g JOIN companies c ON c.id = g.company_id WHERE c.name = ? AND g.name = ?`,
        params: [companyName, rule.group],
      })
      if (!category || !group) throw new Error(`种子分配规则引用缺失：${rule.company} ${rule.category} → ${rule.group}`)
      await tx.run({
        text: `INSERT INTO assignment_rules (company_id, category_id, group_id)
          VALUES ((SELECT id FROM companies WHERE name = ?), ?, ?)`,
        params: [companyName, category.id, group.id],
      })
    }
  })
}
