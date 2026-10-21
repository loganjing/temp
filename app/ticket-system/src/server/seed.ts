/**
 * 幂等种子数据：两家演示公司、部门、含跨公司视角的用户档案、业务组与分配规则。
 * 重复执行不重复插入、不重置既有账号密码；平台登录账号与业务档案保持一一对应。
 */
import { pathToFileURL } from 'node:url'
import type { PlatformResources } from './platform/bootstrap'

/** 演示账号统一密码（登录名即邮箱）。 */
export const SEED_PASSWORD = 'Demo#Passw0rd!'

const COMPANIES = [
  { id: 1, name: '宏图科技' },
  { id: 2, name: '蓝海物流' },
]

const DEPARTMENTS = [
  { id: 1, companyId: 1, name: '技术部' },
  { id: 2, companyId: 1, name: '财务部' },
  { id: 3, companyId: 2, name: '运营部' },
]

const USERS = [
  { profileId: 1, displayName: '李雅', email: 'alice@hongtu.example.com', companyId: 1, departmentId: 1, crossCompanyView: false },
  { profileId: 2, displayName: '王斌', email: 'bob@hongtu.example.com', companyId: 1, departmentId: 1, crossCompanyView: false },
  { profileId: 3, displayName: '陈芳', email: 'carol@hongtu.example.com', companyId: 1, departmentId: 2, crossCompanyView: false },
  { profileId: 4, displayName: '高远', email: 'grace@hongtu.example.com', companyId: 1, departmentId: 1, crossCompanyView: true },
  { profileId: 5, displayName: '刘强', email: 'dave@blueocean.example.com', companyId: 2, departmentId: 3, crossCompanyView: false },
  { profileId: 6, displayName: '赵敏', email: 'erin@blueocean.example.com', companyId: 2, departmentId: 3, crossCompanyView: false },
]

const GROUPS = [
  { id: 1, companyId: 1, name: '技术支持组', memberProfileIds: [2] },
  { id: 2, companyId: 1, name: '账务组', memberProfileIds: [3] },
  { id: 3, companyId: 2, name: '运营支持组', memberProfileIds: [6] },
]

const ASSIGNMENT_RULES = [
  { id: 1, companyId: 1, category: 'bug', targetGroupId: 1 },
  { id: 2, companyId: 1, category: 'account', targetGroupId: 2 },
  { id: 3, companyId: 2, category: 'payment', targetGroupId: 3 },
]

export async function runSeed(platform: PlatformResources): Promise<void> {
  const { db, auth } = platform
  const timestamp = new Date().toISOString()
  await db.transaction(async (tx) => {
    for (const company of COMPANIES) {
      await tx.run({
        text: 'INSERT OR IGNORE INTO companies (id, name, created_at) VALUES (?, ?, ?)',
        params: [company.id, company.name, timestamp],
      })
    }
    for (const department of DEPARTMENTS) {
      await tx.run({
        text: 'INSERT OR IGNORE INTO departments (id, company_id, name) VALUES (?, ?, ?)',
        params: [department.id, department.companyId, department.name],
      })
    }
    for (const user of USERS) {
      const existing = await auth.userStore.findByCredential(user.email, 'email')
      const platformUserId = existing?.id ?? (await auth.userStore.create({ name: user.displayName, email: user.email, passwordChangeRequired: false }, auth.hashPassword(SEED_PASSWORD))).id
      await tx.run({
        text: `INSERT OR IGNORE INTO user_profiles (id, platform_user_id, display_name, email, company_id, department_id, cross_company_view, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [user.profileId, platformUserId, user.displayName, user.email, user.companyId, user.departmentId, user.crossCompanyView ? 1 : 0, timestamp],
      })
    }
    for (const group of GROUPS) {
      await tx.run({
        text: 'INSERT OR IGNORE INTO groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
        params: [group.id, group.companyId, group.name, timestamp],
      })
      for (const memberProfileId of group.memberProfileIds) {
        await tx.run({
          text: 'INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)',
          params: [group.id, memberProfileId],
        })
      }
    }
    for (const rule of ASSIGNMENT_RULES) {
      await tx.run({
        text: 'INSERT OR IGNORE INTO assignment_rules (id, company_id, category, target_group_id, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [rule.id, rule.companyId, rule.category, rule.targetGroupId, timestamp],
      })
    }
  })
}

async function main() {
  await import('dotenv/config')
  const { initializePlatform } = await import('./platform/bootstrap')
  const platform = await initializePlatform()
  try {
    await runSeed(platform)
    console.log('[seed] 演示数据已就绪：公司 2、部门 3、用户档案 6（含 1 名跨公司视角）、业务组 3、分配规则 3')
    console.log('[seed] 演示登录名：alice@hongtu.example.com / bob@hongtu.example.com / grace@hongtu.example.com 等（密码 Demo#Passw0rd!）')
  } finally {
    await platform.close()
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) await main()
