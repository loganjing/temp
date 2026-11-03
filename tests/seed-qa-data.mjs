import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { createAuth } from '@commonapp/authkit'

const DB_PATH = process.env.DB_PATH || '/tmp/qa-t1000079/application.db'
const db = new Database(DB_PATH)

const auth = createAuth({ userResolver: { findById: async () => null } })
const hashPassword = (pw) => auth.hashPassword(pw)
const now = () => new Date().toISOString()
const uid = () => randomUUID()

function insertUser({ id, name, email, phone, companyId, password, roles, scopeType = 'company', scopeId }) {
  const ts = now()
  db.prepare(`INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, 0, ?, ?)`).run(id, name, email, phone ?? null, companyId ?? null, hashPassword(password), ts, ts)
  for (const role of roles) {
    db.prepare(`INSERT INTO user_role_assignments (user_id, role_key, scope_type, scope_id, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(id, role, scopeType, scopeId ?? companyId ?? '', ts)
  }
  console.log(`  user: ${name} (${email}) roles=[${roles.join(',')}] company=${companyId ?? 'null'}`)
  return id
}

function insertCompany(name) {
  const id = uid()
  const ts = now()
  db.prepare('INSERT INTO companies (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, name, ts, ts)
  console.log(`  company: ${name} (${id})`)
  return id
}

function insertDepartment(companyId, name) {
  const id = uid()
  const ts = now()
  db.prepare('INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)').run(id, companyId, name, ts)
  console.log(`  department: ${name} (${id}) company=${companyId}`)
  return id
}

function assignDepartment(userId, deptId) {
  db.prepare('INSERT INTO user_departments (user_id, department_id) VALUES (?, ?)').run(userId, deptId)
}

function insertBusinessGroup(companyId, name) {
  const id = uid()
  const ts = now()
  db.prepare('INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)').run(id, companyId, name, ts)
  console.log(`  business_group: ${name} (${id}) company=${companyId}`)
  return id
}

function addGroupMember(groupId, userId) {
  const ts = now()
  db.prepare('INSERT INTO business_group_members (group_id, user_id, created_at) VALUES (?, ?, ?)').run(groupId, userId, ts)
}

function insertRoutingRule(companyId, category, groupId) {
  const id = uid()
  const ts = now()
  db.prepare('INSERT INTO category_routing_rules (id, company_id, category, business_group_id, created_at) VALUES (?, ?, ?, ?, ?)').run(id, companyId, category, groupId, ts)
  console.log(`  routing_rule: ${category} → group ${groupId}`)
  return id
}

function insertTicket({ subject, description, category, priority, status, companyId, submitterId, businessGroupId, assigneeId, handlerId, createdAt, handledAt }) {
  const id = uid()
  const ts = createdAt || now()
  const updated = handledAt || ts
  db.prepare(`INSERT INTO tickets (id, subject, description, category, priority, status, company_id, submitter_id, business_group_id, assignee_id, handler_id, created_at, updated_at, handled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, subject, description ?? null, category, priority, status, companyId, submitterId, businessGroupId ?? null, assigneeId ?? null, handlerId ?? null, ts, updated, handledAt ?? null)
  console.log(`  ticket: ${subject} (${id}) status=${status} priority=${priority} category=${category}`)
  return id
}

function insertReply(ticketId, replierId, content, repliedAt) {
  const id = uid()
  const ts = repliedAt || now()
  db.prepare('INSERT INTO ticket_replies (id, ticket_id, replier_id, content, replied_at) VALUES (?, ?, ?, ?, ?)').run(id, ticketId, replierId, content, ts)
  return id
}

function insertEvaluation(ticketId, rating, comment) {
  const id = uid()
  const ts = now()
  db.prepare('INSERT INTO ticket_evaluations (id, ticket_id, rating, comment, evaluated_at) VALUES (?, ?, ?, ?, ?)').run(id, ticketId, rating, comment ?? null, ts)
  console.log(`  evaluation: ticket=${ticketId} rating=${rating}`)
  return id
}

function insertAuditEvent(eventType, actorUserId, metadata = {}) {
  const id = uid()
  const ts = now()
  db.prepare(`INSERT INTO audit_events (id, occurred_at, event_type, actor_user_id, method, route, status_code, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, ts, eventType, actorUserId ?? null, 'POST', '/api/tickets', 200, JSON.stringify(metadata))
  return id
}

console.log('=== Seeding QA test data ===')

// Companies
const compA = insertCompany('TechCorp')
const compB = insertCompany('DataNet')

// Departments
const deptATech = insertDepartment(compA, '技术部')
const deptAMkt = insertDepartment(compA, '市场部')
const deptBOps = insertDepartment(compB, '运维部')

// Users
const PASSWORD = 'TestPass123!'
console.log('\n--- Users ---')
const adminId = insertUser({ id: uid(), name: '管理员', email: 'admin@techcorp.test', companyId: compA, password: PASSWORD, roles: ['admin'] })
const submitterAId = insertUser({ id: uid(), name: '张三', email: 'zhangsan@techcorp.test', phone: '13800001000', companyId: compA, password: PASSWORD, roles: ['ticket_submitter'] })
const handlerAId = insertUser({ id: uid(), name: '李四', email: 'lisi@techcorp.test', phone: '13800002000', companyId: compA, password: PASSWORD, roles: ['ticket_handler'] })
const submitterBId = insertUser({ id: uid(), name: '王五', email: 'wangwu@datanet.test', phone: '13800003000', companyId: compB, password: PASSWORD, roles: ['ticket_submitter'] })
const handlerBId = insertUser({ id: uid(), name: '赵六', email: 'zhaoliu@datanet.test', phone: '13800004000', companyId: compB, password: PASSWORD, roles: ['ticket_handler'] })

// Assign departments
assignDepartment(submitterAId, deptATech)
assignDepartment(handlerAId, deptATech)
assignDepartment(submitterBId, deptBOps)
assignDepartment(handlerBId, deptBOps)

// Business Groups
console.log('\n--- Business Groups ---')
const bgTech = insertBusinessGroup(compA, '技术支持组')
const bgCS = insertBusinessGroup(compA, '客服组')
const bgBOps = insertBusinessGroup(compB, '运维支持组')

// Group Members
addGroupMember(bgTech, handlerAId)
addGroupMember(bgCS, handlerAId)
addGroupMember(bgBOps, handlerBId)

// Routing Rules
console.log('\n--- Routing Rules ---')
insertRoutingRule(compA, '账号问题', bgTech)
insertRoutingRule(compA, '系统故障', bgTech)
insertRoutingRule(compA, '网络问题', bgCS)
insertRoutingRule(compB, '系统故障', bgBOps)

// Tickets
console.log('\n--- Tickets ---')
const t1CreatedAt = new Date(Date.now() - 3600_000).toISOString()
const ticket1 = insertTicket({
  subject: '登录异常', description: '用户无法登录系统，提示密码错误', category: '账号问题', priority: 'P1',
  status: 'pending_processing', companyId: compA, submitterId: submitterAId, businessGroupId: bgTech, assigneeId: handlerAId, createdAt: t1CreatedAt
})
insertAuditEvent('ticket.created', submitterAId, { ticketId: ticket1 })
insertAuditEvent('ticket.assigned', submitterAId, { ticketId: ticket1, groupId: bgTech })

const ticket2 = insertTicket({
  subject: '系统响应缓慢', description: '页面加载时间超过10秒', category: '系统故障', priority: 'P2',
  status: 'pending_processing', companyId: compA, submitterId: submitterAId, businessGroupId: bgTech, assigneeId: handlerAId, createdAt: new Date(Date.now() - 7200_000).toISOString()
})
insertAuditEvent('ticket.created', submitterAId, { ticketId: ticket2 })
insertAuditEvent('ticket.assigned', submitterAId, { ticketId: ticket2, groupId: bgTech })

// Completed ticket with evaluation
const t3CreatedAt = new Date(Date.now() - 86400_000).toISOString()
const t3HandledAt = new Date(Date.now() - 80000_000).toISOString()
const ticket3 = insertTicket({
  subject: '密码重置请求', description: '需要重置账户密码', category: '账号问题', priority: 'P0',
  status: 'completed', companyId: compA, submitterId: submitterAId, businessGroupId: bgTech, assigneeId: handlerAId, handlerId: handlerAId, createdAt: t3CreatedAt, handledAt: t3HandledAt
})
insertAuditEvent('ticket.created', submitterAId, { ticketId: ticket3 })
insertAuditEvent('ticket.assigned', submitterAId, { ticketId: ticket3, groupId: bgTech })
insertReply(ticket3, handlerAId, '已为您重置密码，请使用临时密码登录后修改。', new Date(Date.now() - 82000_000).toISOString())
insertReply(ticket3, submitterAId, '收到，谢谢！', new Date(Date.now() - 81000_000).toISOString())
insertAuditEvent('ticket.completed', handlerAId, { ticketId: ticket3 })
insertEvaluation(ticket3, 5, '处理很快，非常满意')

// Pending assignment ticket (no routing rule for this category)
const ticket4 = insertTicket({
  subject: '功能增强建议', description: '希望在工单列表中增加批量操作功能', category: '功能需求', priority: 'P4',
  status: 'pending_assignment', companyId: compA, submitterId: submitterAId, createdAt: new Date(Date.now() - 1800_000).toISOString()
})
insertAuditEvent('ticket.created', submitterAId, { ticketId: ticket4 })

// Cancelled ticket
const ticket5 = insertTicket({
  subject: '网络偶尔中断', description: '办公网络每隔几小时断一次', category: '网络问题', priority: 'P1',
  status: 'cancelled', companyId: compA, submitterId: submitterAId, businessGroupId: bgCS, createdAt: new Date(Date.now() - 14400_000).toISOString()
})
insertAuditEvent('ticket.created', submitterAId, { ticketId: ticket5 })
insertAuditEvent('ticket.cancelled', submitterAId, { ticketId: ticket5 })

// Company B ticket
const ticket6 = insertTicket({
  subject: '数据库连接失败', description: '生产环境数据库无法连接', category: '系统故障', priority: 'P0',
  status: 'pending_processing', companyId: compB, submitterId: submitterBId, businessGroupId: bgBOps, assigneeId: handlerBId, createdAt: new Date(Date.now() - 3600_000).toISOString()
})
insertAuditEvent('ticket.created', submitterBId, { ticketId: ticket6 })
insertAuditEvent('ticket.assigned', submitterBId, { ticketId: ticket6, groupId: bgBOps })

// Reply on ticket1
insertReply(ticket1, handlerAId, '已排查，是密码策略更新导致旧密码失效，请重置密码。', new Date(Date.now() - 3000_000).toISOString())
insertAuditEvent('ticket.replied', handlerAId, { ticketId: ticket1 })

console.log('\n=== Seed complete ===')
console.log(`Companies: ${compA}, ${compB}`)
console.log(`Users: admin=${adminId}, submitterA=${submitterAId}, handlerA=${handlerAId}, submitterB=${submitterBId}, handlerB=${handlerBId}`)
console.log(`Tickets: ${ticket1}, ${ticket2}, ${ticket3}, ${ticket4}, ${ticket5}, ${ticket6}`)
console.log(`Password for all users: ${PASSWORD}`)

db.close()
