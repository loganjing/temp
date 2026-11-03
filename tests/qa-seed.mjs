import { randomUUID } from 'node:crypto'
import { initializePlatform } from '../app/ticket-system/src/server/platform/bootstrap.ts'
import { createApplicationAuth } from '../app/ticket-system/src/server/platform/auth.ts'

const DB_PATH = process.env.DB_PATH
if (!DB_PATH) throw new Error('DB_PATH required')

const platform = await initializePlatform()
const auth = createApplicationAuth(platform.db)
const now = new Date().toISOString()

// Companies
const compA = 'comp-alpha-' + randomUUID().slice(0, 8)
const compB = 'comp-beta-' + randomUUID().slice(0, 8)
await platform.db.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [compA, 'Alpha公司', now] })
await platform.db.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [compB, 'Beta公司', now] })

// Departments
const deptA1 = 'dept-a1-' + randomUUID().slice(0, 8)
const deptA2 = 'dept-a2-' + randomUUID().slice(0, 8)
const deptB1 = 'dept-b1-' + randomUUID().slice(0, 8)
await platform.db.run({ text: 'INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [deptA1, compA, '研发部', now] })
await platform.db.run({ text: 'INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [deptA2, compA, '市场部', now] })
await platform.db.run({ text: 'INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [deptB1, compB, '运营部', now] })

// Categories
const catA1 = 'cat-a1-' + randomUUID().slice(0, 8)
const catA2 = 'cat-a2-' + randomUUID().slice(0, 8)
const catB1 = 'cat-b1-' + randomUUID().slice(0, 8)
await platform.db.run({ text: 'INSERT INTO ticket_categories (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [catA1, compA, '技术问题', now] })
await platform.db.run({ text: 'INSERT INTO ticket_categories (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [catA2, compA, '产品咨询', now] })
await platform.db.run({ text: 'INSERT INTO ticket_categories (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [catB1, compB, '售后服务', now] })

// Helper: create a user with role, company, department
async function createUser(name, email, role, companyId, departmentId) {
  const password = 'TestPass123!@#'
  const user = await auth.userStore.create(
    { name, email, companyId, passwordChangeRequired: false },
    auth.hashPassword(password)
  )
  await platform.db.run({ text: 'UPDATE users SET role = ?, company_id = ?, department_id = ? WHERE id = ?', params: [role, companyId, departmentId, user.id] })
  return { id: user.id, email, password, role, companyId, departmentId }
}

// Business group for company A
const groupA = 'grp-a-' + randomUUID().slice(0, 8)
await platform.db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [groupA, compA, '技术支持组', now] })

// Users
const adminA = await createUser('管理员A', 'admin-a@alpha.test', 'admin', compA, deptA1)
const submitterA = await createUser('提交人A', 'submitter-a@alpha.test', 'submitter', compA, deptA2)
const handlerA = await createUser('处理人A', 'handler-a@alpha.test', 'handler', compA, deptA1)
const submitterB = await createUser('提交人B', 'submitter-b@beta.test', 'submitter', compB, deptB1)
const handlerB = await createUser('处理人B', 'handler-b@beta.test', 'handler', compB, deptB1)

// Add handlerA to business group
await platform.db.run({ text: 'INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)', params: [randomUUID(), groupA, handlerA.id, now] })

// Auto-assign rule: catA1 (技术问题) → groupA
await platform.db.run({ text: 'INSERT INTO auto_assign_rules (id, company_id, category_id, target_group_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [randomUUID(), compA, catA1, groupA, now] })

// Output test data for QA use
const testData = {
  companies: { compA, compB },
  departments: { deptA1, deptA2, deptB1 },
  categories: { catA1, catA2, catB1 },
  groups: { groupA },
  users: { adminA, submitterA, handlerA, submitterB, handlerB },
}
console.log(JSON.stringify(testData, null, 2))

platform.close()
