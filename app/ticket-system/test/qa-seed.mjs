// QA seed script: sets up companies, users, categories, business groups, and assignment rules
// for browser verification of the ticket system. Run with the app's node_modules.
import { randomBytes, scryptSync, randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'

const DB_PATH = process.env.DB_PATH || '/tmp/qa-ticket-wi-t1000016.db'
const db = new Database(DB_PATH)

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const now = new Date().toISOString()
const pwd = hashPassword('qa-test-password-123')

// Companies
const companyA = randomUUID()
const companyB = randomUUID()
db.prepare('INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)').run(companyA, 'TechCorp', now)
db.prepare('INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)').run(companyB, 'DataSoft', now)

// Users
const admin = randomUUID()
const submitter = randomUUID()
const handler = randomUUID()
const bSubmitter = randomUUID()

const insertUser = db.prepare(
  'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at, department, role) VALUES (?, ?, ?, NULL, 1, ?, ?, 0, ?, ?, ?, ?)'
)
insertUser.run(admin, 'QA Admin', 'qa-admin@test.local', companyA, pwd, now, now, 'IT', 'admin')
insertUser.run(submitter, 'QA Submitter', 'qa-submitter@test.local', companyA, pwd, now, now, 'Product', 'submitter')
insertUser.run(handler, 'QA Handler', 'qa-handler@test.local', companyA, pwd, now, now, 'Engineering', 'handler')
insertUser.run(bSubmitter, 'QA BUser', 'qa-buser@test.local', companyB, pwd, now, now, 'Sales', 'submitter')

// Categories (Company A)
const catBug = randomUUID()
const catFeature = randomUUID()
const catOther = randomUUID()
db.prepare('INSERT INTO categories (id, name, company_id, created_at) VALUES (?, ?, ?, ?)').run(catBug, 'Bug Report', companyA, now)
db.prepare('INSERT INTO categories (id, name, company_id, created_at) VALUES (?, ?, ?, ?)').run(catFeature, 'Feature Request', companyA, now)
db.prepare('INSERT INTO categories (id, name, company_id, created_at) VALUES (?, ?, ?, ?)').run(catOther, 'Other', companyA, now)

// Categories (Company B)
const catB1 = randomUUID()
db.prepare('INSERT INTO categories (id, name, company_id, created_at) VALUES (?, ?, ?, ?)').run(catB1, 'General', companyB, now)

// Business groups (Company A)
const engGroup = randomUUID()
const supportGroup = randomUUID()
db.prepare('INSERT INTO business_groups (id, name, company_id, created_at) VALUES (?, ?, ?, ?)').run(engGroup, 'Engineering Team', companyA, now)
db.prepare('INSERT INTO business_groups (id, name, company_id, created_at) VALUES (?, ?, ?, ?)').run(supportGroup, 'Support Team', companyA, now)

// Business group members
db.prepare('INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)').run(randomUUID(), engGroup, handler, now)

// Assignment rules (Company A)
db.prepare('INSERT INTO assignment_rules (id, company_id, category_id, group_id, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), companyA, catBug, engGroup, now)

// Pre-existing ticket for submitter (for history ticket test in AC-08)
const existingTicket = randomUUID()
db.prepare(
  'INSERT INTO tickets (id, subject, description, category_id, priority, status, submitter_id, handler_id, group_id, company_id, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)'
).run(existingTicket, 'Previous issue', 'A previously resolved issue', catFeature, 'P2', 'completed', submitter, engGroup, companyA, now, now)

// Print IDs for reference
console.log(JSON.stringify({
  companyA, companyB,
  admin, submitter, handler, bSubmitter,
  catBug, catFeature, catOther,
  engGroup, supportGroup,
  existingTicket
}, null, 2))

db.close()
