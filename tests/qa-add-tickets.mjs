import { randomUUID } from 'node:crypto'
import { initializePlatform } from '../app/ticket-system/src/server/platform/bootstrap.ts'

process.env.DB_PATH = './data/qa-ticket-system.db'
const platform = await initializePlatform()
const { db } = platform

// Get Company A data
const compA = (await db.queryOne({ text: 'SELECT id FROM companies WHERE name=?', params: ['CompanyA'] })).id
const submitterA = (await db.queryOne({ text: 'SELECT id FROM users WHERE email=?', params: ['submittera@test.local'] })).id
const handlerA = (await db.queryOne({ text: 'SELECT id FROM users WHERE email=?', params: ['handlera@test.local'] })).id
const catNetwork = (await db.queryOne({ text: 'SELECT id FROM ticket_categories WHERE name=? AND company_id=?', params: ['网络故障', compA] })).id
const networkGroup = (await db.queryOne({ text: 'SELECT id FROM business_groups WHERE name=? AND company_id=?', params: ['网络组', compA] })).id

// Pre-assigned ticket for handlerA (pending_processing)
const ticket1 = randomUUID()
const ts = new Date().toISOString()
const cols = 'id, company_id, subject, description, category_id, priority, status, submitter_id, submitter_name, submitter_email, submitter_company, submitter_department, assigned_group_id, assigned_handler_id, created_at'
const vals = Array.from({ length: 15 }, () => '?').join(',')
await db.run({
  text: `INSERT INTO tickets (${cols}) VALUES (${vals})`,
  params: [ticket1, compA, '网络连接异常', '办公室网络无法连接', catNetwork, 'P1', 'pending_processing', submitterA, 'SubmitterA', 'submittera@test.local', 'CompanyA', 'IT', networkGroup, handlerA, ts],
})

// Another ticket for handlerA (older, for transfer test)
const ticket2 = randomUUID()
await db.run({
  text: `INSERT INTO tickets (${cols}) VALUES (${vals})`,
  params: [ticket2, compA, '邮件系统故障', '无法收发邮件', catNetwork, 'P2', 'pending_processing', submitterA, 'SubmitterA', 'submittera@test.local', 'CompanyA', 'IT', networkGroup, handlerA, new Date(Date.now() - 60000).toISOString()],
})

console.log(JSON.stringify({ ticket1, ticket2, handlerA }))
await platform.close()
