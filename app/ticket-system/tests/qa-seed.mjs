import { randomUUID } from 'node:crypto'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'

const PASSWORD = 'TestPassword123!'
const ts = () => new Date().toISOString()

async function main() {
  const platform = await initializePlatform()
  try {
    const db = platform.db

    // ─── Companies ───
    const companyA = 'co-a-' + randomUUID()
    const companyB = 'co-b-' + randomUUID()
    await db.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [companyA, '测试公司A', ts()] })
    await db.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [companyB, '测试公司B', ts()] })

    // ─── Departments ───
    const deptTech = 'dept-tech-' + randomUUID()
    await db.run({ text: 'INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [deptTech, companyA, '技术部', ts()] })

    // ─── Helper: create user + profile + role ───
    async function makeUser(name, email, role, companyId, deptId) {
      const user = await platform.auth.userStore.create(
        { name, email, companyId, passwordChangeRequired: false },
        platform.auth.hashPassword(PASSWORD),
      )
      const profileId = randomUUID()
      await db.run({
        text: 'INSERT INTO user_profiles (id, user_id, company_id, department_id, name, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [profileId, user.id, companyId, deptId ?? null, name, email, ts()],
      })
      await platform.permissionKit.assignRole(user.id, role)
      return { userId: user.id, profileId, email, role, companyId }
    }

    const admin = await makeUser('管理员', 'admin@test.com', 'admin', companyA, null)
    const submitter = await makeUser('提交人', 'submitter@test.com', 'submitter', companyA, deptTech)
    const handler = await makeUser('处理人', 'handler@test.com', 'handler', companyA, null)
    const otherSubmitter = await makeUser('其他提交人', 'other@test.com', 'submitter', companyB, null)

    // ─── Business groups ───
    const groupTech = randomUUID()
    const groupSecond = randomUUID()
    await db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [groupTech, companyA, '技术支持组', ts()] })
    await db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [groupSecond, companyA, '二线支持组', ts()] })

    // Add handler as member of 技术支持组
    await db.run({ text: 'INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)', params: [randomUUID(), groupTech, handler.profileId, ts()] })

    // ─── Assignment rule ───
    const ruleTech = randomUUID()
    await db.run({ text: 'INSERT INTO assignment_rules (id, company_id, category, target_group_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [ruleTech, companyA, '技术问题', groupTech, ts()] })

    // ─── Output seed summary (no secrets beyond password which is fixed) ───
    const summary = {
      companyA, companyB, deptTech,
      groupTech, groupSecond, ruleTech,
      admin, submitter, handler, otherSubmitter,
      password: PASSWORD,
    }
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await platform.close()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
