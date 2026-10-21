import type { DbClient } from '@commonapp/dbkit'
import type { createApplicationAuth } from './platform/auth'

type Auth = ReturnType<typeof createApplicationAuth>

// 启动种子（契约 6.2）：仅空库（无任何用户账户）时幂等执行。
// 创建公司A/公司B 与示例账号；账户经 userkit 用户 API 创建，组织档案写入 user_org。
// 口令：SEED_PASSWORD 环境变量覆盖，默认种子常量（见 DEFAULT_SEED_PASSWORD），验收/测试按此登录。
const DEFAULT_SEED_PASSWORD = 'Ticket#Demo2026!'

export const SEED_PASSWORD = process.env.SEED_PASSWORD || DEFAULT_SEED_PASSWORD

export const SEED_COMPANIES = ['公司A', '公司B'] as const

type SeedAccount = {
  email: string
  name: string
  company: '公司A' | '公司B'
  department: string
  isCompanyAdmin: boolean
  role: 'submitter' | 'handler' | 'company-admin'
}

export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  { email: 'company-a-submitter-1@company-a.test', name: '张三', company: '公司A', department: '研发部', isCompanyAdmin: false, role: 'submitter' },
  { email: 'company-a-submitter-2@company-a.test', name: '李四', company: '公司A', department: '市场部', isCompanyAdmin: false, role: 'submitter' },
  { email: 'company-a-handler@company-a.test', name: '王五', company: '公司A', department: '运维部', isCompanyAdmin: false, role: 'handler' },
  { email: 'company-a-admin@company-a.test', name: '赵六', company: '公司A', department: '管理部', isCompanyAdmin: true, role: 'company-admin' },
  { email: 'company-b-submitter@company-b.test', name: '钱七', company: '公司B', department: '采购部', isCompanyAdmin: false, role: 'submitter' },
]

export async function seedInitialData(db: DbClient, auth: Auth): Promise<void> {
  const userCount = await auth.userStore.count()
  if (userCount > 0) return

  const now = new Date().toISOString()
  const companyIds = new Map<string, number>()
  for (const name of SEED_COMPANIES) {
    await db.run({ text: 'INSERT INTO companies (name, created_at) VALUES (?, ?)', params: [name, now] })
    const row = await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
    companyIds.set(name, Number(row?.id ?? 0))
  }

  for (const account of SEED_ACCOUNTS) {
    const companyId = companyIds.get(account.company)
    if (!companyId) throw new Error(`Seed company missing: ${account.company}`)
    const user = await auth.userStore.create(
      { name: account.name, email: account.email, passwordChangeRequired: false },
      auth.hashPassword(SEED_PASSWORD),
    )
    await db.run({
      text: 'INSERT INTO user_org (user_id, company_id, department, is_company_admin, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [user.id, companyId, account.department, account.isCompanyAdmin ? 1 : 0, now],
    })
  }
}
