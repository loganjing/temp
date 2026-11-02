import { hashPassword } from '@commonapp/authkit'
import type { DbClient } from '@commonapp/dbkit'
import type { UserRole } from '../../shared/ticket-domain'

export const DEMO_PASSWORD = 'Ticket@123456'

const companies = [
  { id: 'company-acme', code: 'ACME', name: 'Acme 科技' },
  { id: 'company-globex', code: 'GLOBEX', name: 'Globex 制造' },
]

const departments = [
  { id: 'dept-acme-it', companyId: 'company-acme', name: '信息技术部' },
  { id: 'dept-acme-sales', companyId: 'company-acme', name: '销售部' },
  { id: 'dept-globex-ops', companyId: 'company-globex', name: '运营部' },
  { id: 'dept-globex-finance', companyId: 'company-globex', name: '财务部' },
]

const accounts: Array<{ id: string; name: string; email: string; departmentId: string; role: UserRole }> = [
  { id: 'user-acme-submitter', name: '李提交', email: 'submitter@acme.test', departmentId: 'dept-acme-it', role: 'submitter' },
  { id: 'user-acme-handler', name: '王处理', email: 'handler@acme.test', departmentId: 'dept-acme-it', role: 'handler' },
  { id: 'user-acme-handler2', name: '陈支持', email: 'handler2@acme.test', departmentId: 'dept-acme-it', role: 'handler' },
  { id: 'user-acme-admin', name: '赵管理', email: 'admin@acme.test', departmentId: 'dept-acme-it', role: 'admin' },
  { id: 'user-globex-submitter', name: '周提交', email: 'submitter@globex.test', departmentId: 'dept-globex-finance', role: 'submitter' },
  { id: 'user-globex-handler', name: '吴处理', email: 'handler@globex.test', departmentId: 'dept-globex-ops', role: 'handler' },
  { id: 'user-globex-admin', name: '郑管理', email: 'admin@globex.test', departmentId: 'dept-globex-ops', role: 'admin' },
  { id: 'user-platform-ops', name: '平台运营', email: 'ops@ticket.test', departmentId: 'dept-globex-ops', role: 'ops' },
]

const groups = [
  { id: 'group-acme-tech', companyId: 'company-acme', name: '技术支持组' },
  { id: 'group-acme-success', companyId: 'company-acme', name: '客户成功组' },
  { id: 'group-globex-ops', companyId: 'company-globex', name: '运维支持组' },
]

const members = [
  { groupId: 'group-acme-tech', userId: 'user-acme-handler' },
  { groupId: 'group-acme-success', userId: 'user-acme-handler2' },
  { groupId: 'group-globex-ops', userId: 'user-globex-handler' },
]

const categories = [
  { id: 'cat-software', code: 'INC-SW', name: '软件故障' },
  { id: 'cat-account', code: 'INC-AC', name: '账号与权限' },
  { id: 'cat-billing', code: 'INC-BL', name: '计费与账单' },
  { id: 'cat-consult', code: 'INC-CS', name: '其他咨询' },
]

const rules = [
  { id: 'rule-acme-software', companyId: 'company-acme', categoryId: 'cat-software', groupId: 'group-acme-tech' },
]

/** Insert deterministic demo data once; existing rows are left untouched. */
export async function seedDemoData(db: DbClient) {
  if (process.env.SEED_DEMO_DATA === 'false') return
  await db.transaction(async (tx) => {
    const now = new Date().toISOString()
    for (const company of companies) {
      await tx.run({
        text: 'INSERT OR IGNORE INTO companies (id, name, code, created_at) VALUES (?, ?, ?, ?)',
        params: [company.id, company.name, company.code, now],
      })
    }
    for (const department of departments) {
      await tx.run({
        text: 'INSERT OR IGNORE INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
        params: [department.id, department.companyId, department.name, now],
      })
    }

    const departmentCompany = new Map(departments.map((department) => [department.id, department.companyId]))
    for (const account of accounts) {
      const existing = await tx.queryOne<{ id: string }>({ text: 'SELECT id FROM users WHERE id = ?', params: [account.id] })
      if (!existing) {
        await tx.run({
          text: `INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at)
                 VALUES (?, ?, ?, NULL, 1, ?, ?, 0, ?, ?)`,
          params: [
            account.id,
            account.name,
            account.email,
            departmentCompany.get(account.departmentId) ?? null,
            hashPassword(DEMO_PASSWORD),
            now,
            now,
          ],
        })
      }
      await tx.run({
        text: 'INSERT OR IGNORE INTO user_profiles (user_id, department_id, role, created_at) VALUES (?, ?, ?, ?)',
        params: [account.id, account.departmentId, account.role, now],
      })
    }

    for (const group of groups) {
      await tx.run({
        text: 'INSERT OR IGNORE INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
        params: [group.id, group.companyId, group.name, now],
      })
    }
    for (const member of members) {
      await tx.run({
        text: 'INSERT OR IGNORE INTO business_group_members (group_id, user_id, added_at) VALUES (?, ?, ?)',
        params: [member.groupId, member.userId, now],
      })
    }
    for (const category of categories) {
      await tx.run({
        text: 'INSERT OR IGNORE INTO categories (id, code, name, active, created_at) VALUES (?, ?, ?, 1, ?)',
        params: [category.id, category.code, category.name, now],
      })
    }
    for (const rule of rules) {
      await tx.run({
        text: 'INSERT OR IGNORE INTO assignment_rules (id, company_id, category_id, group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        params: [rule.id, rule.companyId, rule.categoryId, rule.groupId, now, now],
      })
    }
    await tx.run({ text: "INSERT OR IGNORE INTO ticket_sequences (name, next_seq) VALUES ('ticket', 0)" })
  })
}
