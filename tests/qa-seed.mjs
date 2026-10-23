#!/usr/bin/env node
// QA seed script: initializes companies, users, roles, business groups, categories, assignment rules
import { randomUUID } from 'node:crypto'
import { initializePlatform } from '../app/ticket-system/src/server/platform/bootstrap.ts'

const dbPath = process.env.QA_DB_PATH ?? './data/qa-ticket-system.db'
process.env.DB_PATH = dbPath

const platform = await initializePlatform()
const { db, auth, permissionKit } = platform

const now = () => new Date().toISOString()
const uuid = () => randomUUID()
const passwordHash = auth.hashPassword('TestPassword123!')

// ── Companies ──
const compA = uuid()
const compB = uuid()
await db.run({ text: 'INSERT INTO companies (id, name) VALUES (?, ?)', params: [compA, 'CompanyA'] })
await db.run({ text: 'INSERT INTO companies (id, name) VALUES (?, ?)', params: [compB, 'CompanyB'] })

// ── Users ──
async function createUser(name, email, companyId, department, roles) {
  const id = uuid()
  const ts = now()
  await db.run({
    text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, department, password_hash, password_change_required, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, ?, ?, ?, 0, ?, ?)',
    params: [id, name, email, companyId, department, passwordHash, ts, ts],
  })
  for (const role of roles) {
    await permissionKit.assignRole(id, role)
  }
  return id
}

// Company A users
const adminA = await createUser('AdminA', 'admina@test.local', compA, 'Management', ['admin'])
const submitterA = await createUser('SubmitterA', 'submittera@test.local', compA, 'IT', ['submitter'])
const handlerA = await createUser('HandlerA', 'handlera@test.local', compA, 'Support', ['handler'])
const handlerA2 = await createUser('HandlerA2', 'handlera2@test.local', compA, 'Support', ['handler'])

// Company B users
const adminB = await createUser('AdminB', 'adminb@test.local', compB, 'Management', ['admin'])
const submitterB = await createUser('SubmitterB', 'submitterb@test.local', compB, 'Sales', ['submitter'])
const handlerB = await createUser('HandlerB', 'handlerb@test.local', compB, 'Engineering', ['handler'])

// ── Business Groups (Company A) ──
const networkGroup = uuid()
const hardwareGroup = uuid()
await db.run({ text: 'INSERT INTO business_groups (id, company_id, name) VALUES (?, ?, ?)', params: [networkGroup, compA, '网络组'] })
await db.run({ text: 'INSERT INTO business_groups (id, company_id, name) VALUES (?, ?, ?)', params: [hardwareGroup, compA, '硬件组'] })

// Add handlerA to networkGroup, handlerA2 to hardwareGroup
await db.run({ text: 'INSERT INTO business_group_members (id, group_id, user_id) VALUES (?, ?, ?)', params: [uuid(), networkGroup, handlerA] })
await db.run({ text: 'INSERT INTO business_group_members (id, group_id, user_id) VALUES (?, ?, ?)', params: [uuid(), hardwareGroup, handlerA2] })

// ── Categories (Company A) ──
const catNetwork = uuid()
const catHardware = uuid()
await db.run({ text: 'INSERT INTO ticket_categories (id, company_id, name) VALUES (?, ?, ?)', params: [catNetwork, compA, '网络故障'] })
await db.run({ text: 'INSERT INTO ticket_categories (id, company_id, name) VALUES (?, ?, ?)', params: [catHardware, compA, '硬件故障'] })

// ── Assignment Rule: 网络故障 → 网络组 ──
await db.run({ text: 'INSERT INTO assignment_rules (id, company_id, category_id, group_id) VALUES (?, ?, ?, ?)', params: [uuid(), compA, catNetwork, networkGroup] })

// ── Company B: business group + category + assignment rule ──
const groupB = uuid()
await db.run({ text: 'INSERT INTO business_groups (id, company_id, name) VALUES (?, ?, ?)', params: [groupB, compB, '工程组'] })
await db.run({ text: 'INSERT INTO business_group_members (id, group_id, user_id) VALUES (?, ?, ?)', params: [uuid(), groupB, handlerB] })
const catB = uuid()
await db.run({ text: 'INSERT INTO ticket_categories (id, company_id, name) VALUES (?, ?, ?)', params: [catB, compB, '通用问题'] })
await db.run({ text: 'INSERT INTO assignment_rules (id, company_id, category_id, group_id) VALUES (?, ?, ?, ?)', params: [uuid(), compB, catB, groupB] })

// ── Pre-create a ticket in Company B for isolation test ──
const ticketB = uuid()
await db.run({
  text: `INSERT INTO tickets (id, company_id, subject, description, category_id, priority, status, submitter_id, submitter_name, submitter_email, submitter_company, submitter_department, assigned_group_id, assigned_handler_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  params: [ticketB, compB, 'B公司工单', 'B公司测试工单', catB, 'P2', 'pending_processing', submitterB, 'SubmitterB', 'submitterb@test.local', 'CompanyB', 'Sales', groupB, handlerB, now()],
})

// Output test data for reference
const data = {
  companies: { compA, compB },
  users: { adminA, submitterA, handlerA, handlerA2, adminB, submitterB, handlerB },
  groups: { networkGroup, hardwareGroup, groupB },
  categories: { catNetwork, catHardware, catB },
  ticketB,
  passwords: { all: 'TestPassword123!' },
  emails: {
    adminA: 'admina@test.local',
    submitterA: 'submittera@test.local',
    handlerA: 'handlera@test.local',
    handlerA2: 'handlera2@test.local',
    adminB: 'adminb@test.local',
    submitterB: 'submitterb@test.local',
    handlerB: 'handlerb@test.local',
  },
}
console.log(JSON.stringify(data, null, 2))

await platform.close()
