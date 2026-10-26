import { randomUUID } from 'node:crypto'
import type { Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { EnrichedUser } from './platform/auth'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
type ContextVars = { Variables: { currentUser: EnrichedUser } }
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const now = () => new Date().toISOString()

function getUser(context: { get(name: string): unknown }): EnrichedUser {
  return context.get('currentUser') as EnrichedUser
}

type TicketRow = { id: string; subject: string; description: string; category: string; sla_priority: string; status: string; submitter_id: string; submitter_name: string; submitter_email: string; submitter_company: string | null; submitter_department: string | null; assigned_group_id: string | null; assigned_handler_id: string | null; handler_id: string | null; handler_name: string | null; processed_at: string | null; created_at: string; updated_at: string }

function requireRole(user: EnrichedUser, ...roles: string[]): boolean {
  return roles.some((r) => user.roles.includes(r))
}

export function registerTicketRoutes(app: Hono<ContextVars>, platform: Platform) {
  const db = platform.db

  // === 工单接口 ===

  // POST /api/tickets — 提交人创建工单
  app.post('/api/tickets', async (context) => {
    const user = getUser(context)
    if (!requireRole(user, 'submitter', 'admin')) return context.json(errorBody('forbidden', '无权限创建工单'), 403)
    const body = await context.req.json().catch(() => ({}))
    const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const category = typeof body.category === 'string' ? body.category.trim() : ''
    const slaPriority = body.sla_priority
    const validPriorities = ['P0', 'P1', 'P2', 'P3', 'P4']
    if (!subject || !description || !category || !validPriorities.includes(slaPriority)) {
      return context.json(errorBody('bad_request', '参数缺失或 sla_priority 不合法'), 400)
    }
    const id = randomUUID()
    const ts = now()
    const submitterCompany = user.company
    const submitterDepartment = user.department

    // 自动分配：查找匹配的分类分配规则
    let assignedGroupId: string | null = null
    let status = 'pending_assign'
    if (submitterCompany) {
      // 查找用户所属公司
      const company = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM companies WHERE name = ?', params: [submitterCompany] })
      if (company) {
        const rule = await db.queryOne<{ group_id: string }>({ text: 'SELECT group_id FROM category_assignment_rules WHERE company_id = ? AND category = ?', params: [company.id, category] })
        if (rule) {
          assignedGroupId = rule.group_id
          status = 'pending_process'
        }
      }
    }

    await db.run({
      text: `INSERT INTO tickets (id, subject, description, category, sla_priority, status, submitter_id, submitter_name, submitter_email, submitter_company, submitter_department, assigned_group_id, assigned_handler_id, handler_id, handler_name, processed_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
      params: [id, subject, description, category, slaPriority, status, user.id, user.name, user.email, submitterCompany, submitterDepartment, assignedGroupId, ts, ts],
    })

    const ticket = await db.queryOne<TicketRow>({ text: 'SELECT * FROM tickets WHERE id = ?', params: [id] })
    return context.json(ticket, 201)
  })

  // GET /api/tickets — 查询工单列表
  app.get('/api/tickets', async (context) => {
    const user = getUser(context)
    const statusFilter = context.req.query('status')
    const categoryFilter = context.req.query('category')
    const page = Math.max(Number(context.req.query('page') ?? 1), 1)
    const pageSize = Math.min(Math.max(Number(context.req.query('page_size') ?? 20), 1), 100)
    const offset = (page - 1) * pageSize

    let where = '1=1'
    const params: unknown[] = []
    if (user.roles.includes('admin')) {
      // admin sees all
    } else if (user.roles.includes('handler')) {
      where += ` AND (assigned_group_id IN (SELECT group_id FROM business_group_members WHERE user_id = ?) OR submitter_id = ?)`
      params.push(user.id, user.id)
    } else {
      where += ' AND submitter_id = ?'
      params.push(user.id)
    }
    if (statusFilter) { where += ' AND status = ?'; params.push(statusFilter) }
    if (categoryFilter) { where += ' AND category = ?'; params.push(categoryFilter) }

    const countRow = await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets WHERE ${where}`, params })
    const items = await db.queryAll({ text: `SELECT * FROM tickets WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, params: [...params, pageSize, offset] })

    return context.json({ items: items ?? [], total: countRow?.total ?? 0, page, page_size: pageSize })
  })

  // GET /api/tickets/:id — 工单详情
  app.get('/api/tickets/:id', async (context) => {
    const user = getUser(context)
    const id = context.req.param('id')
    const ticket = await db.queryOne<TicketRow>({ text: 'SELECT * FROM tickets WHERE id = ?', params: [id] })
    if (!ticket) return context.json(errorBody('not_found', '工单不存在'), 404)

    const canView = user.roles.includes('admin')
      || ticket.submitter_id === user.id
      || (user.roles.includes('handler') && await isAssignedHandler(db, user.id, ticket.assigned_group_id as string | null))
    if (!canView) return context.json(errorBody('forbidden', '无权查看此工单'), 403)

    const replies = await db.queryAll({ text: 'SELECT * FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC', params: [id] })
    const transfers = await db.queryAll({
      text: 'SELECT id, from_user_name, to_user_name, to_group_id, reason, created_at FROM ticket_transfers WHERE ticket_id = ? ORDER BY created_at ASC',
      params: [id],
    })
    const evaluation = await db.queryOne({ text: 'SELECT rating, comment, created_at FROM ticket_evaluations WHERE ticket_id = ?', params: [id] })

    return context.json({ ...ticket, replies: replies ?? [], transfers: transfers ?? [], evaluation })
  })

  // POST /api/tickets/:id/replies — 添加回复
  app.post('/api/tickets/:id/replies', async (context) => {
    const user = getUser(context)
    const id = context.req.param('id')
    const ticket = await db.queryOne<{ id: string; submitter_id: string; status: string; assigned_group_id: string | null }>({ text: 'SELECT id, submitter_id, status, assigned_group_id FROM tickets WHERE id = ?', params: [id] })
    if (!ticket) return context.json(errorBody('not_found', '工单不存在'), 404)

    const canReply = user.roles.includes('admin')
      || ticket.submitter_id === user.id
      || (user.roles.includes('handler') && await isAssignedHandler(db, user.id, ticket.assigned_group_id))
    if (!canReply) return context.json(errorBody('forbidden', '无权回复此工单'), 403)

    const body = await context.req.json().catch(() => ({}))
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) return context.json(errorBody('bad_request', '回复内容不能为空'), 400)

    const replyId = randomUUID()
    const ts = now()
    await db.run({
      text: 'INSERT INTO ticket_replies (id, ticket_id, user_id, user_name, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [replyId, id, user.id, user.name, content, ts],
    })
    await db.run({ text: 'UPDATE tickets SET updated_at = ? WHERE id = ?', params: [ts, id] })

    return context.json({ id: replyId, ticket_id: id, user_id: user.id, user_name: user.name, content, created_at: ts }, 201)
  })

  // PATCH /api/tickets/:id/status — 变更状态（取消）
  app.patch('/api/tickets/:id/status', async (context) => {
    const user = getUser(context)
    const id = context.req.param('id')
    const ticket = await db.queryOne<{ id: string; submitter_id: string; status: string }>({ text: 'SELECT id, submitter_id, status FROM tickets WHERE id = ?', params: [id] })
    if (!ticket) return context.json(errorBody('not_found', '工单不存在'), 404)

    const body = await context.req.json().catch(() => ({}))
    if (body.status !== 'cancelled') return context.json(errorBody('bad_request', '仅支持取消操作'), 400)

    const canCancel = user.roles.includes('admin') || ticket.submitter_id === user.id
    if (!canCancel) return context.json(errorBody('forbidden', '无权取消此工单'), 403)

    if (['completed', 'cancelled'].includes(ticket.status)) return context.json(errorBody('bad_request', '工单已完成或已取消'), 400)

    const ts = now()
    await db.run({ text: "UPDATE tickets SET status = 'cancelled', updated_at = ? WHERE id = ?", params: [ts, id] })
    const updated = await db.queryOne<TicketRow>({ text: 'SELECT * FROM tickets WHERE id = ?', params: [id] })
    return context.json(updated, 200)
  })

  // POST /api/tickets/:id/complete — 处理人完成处理
  app.post('/api/tickets/:id/complete', async (context) => {
    const user = getUser(context)
    const id = context.req.param('id')
    const ticket = await db.queryOne<{ id: string; status: string; assigned_group_id: string | null }>({ text: 'SELECT id, status, assigned_group_id FROM tickets WHERE id = ?', params: [id] })
    if (!ticket) return context.json(errorBody('not_found', '工单不存在'), 404)
    if (!user.roles.includes('handler')) return context.json(errorBody('forbidden', '非处理人'), 403)
    if (ticket.status !== 'pending_process') return context.json(errorBody('bad_request', '工单状态非待处理'), 400)
    if (!await isAssignedHandler(db, user.id, ticket.assigned_group_id)) return context.json(errorBody('forbidden', '非分配处理人'), 403)

    const ts = now()
    await db.run({
      text: "UPDATE tickets SET status = 'completed', handler_id = ?, handler_name = ?, processed_at = ?, updated_at = ? WHERE id = ?",
      params: [user.id, user.name, ts, ts, id],
    })
    const updated = await db.queryOne<TicketRow>({ text: 'SELECT * FROM tickets WHERE id = ?', params: [id] })
    return context.json(updated, 200)
  })

  // POST /api/tickets/:id/transfer — 转派工单
  app.post('/api/tickets/:id/transfer', async (context) => {
    const user = getUser(context)
    const id = context.req.param('id')
    const ticket = await db.queryOne<{ id: string; status: string; assigned_group_id: string | null }>({ text: 'SELECT id, status, assigned_group_id FROM tickets WHERE id = ?', params: [id] })
    if (!ticket) return context.json(errorBody('not_found', '工单不存在'), 404)
    if (!user.roles.includes('handler')) return context.json(errorBody('forbidden', '非处理人'), 403)
    if (ticket.status !== 'pending_process') return context.json(errorBody('bad_request', '仅待处理工单可转派'), 400)
    if (!await isAssignedHandler(db, user.id, ticket.assigned_group_id)) return context.json(errorBody('forbidden', '非当前处理人'), 403)

    const body = await context.req.json().catch(() => ({}))
    const toGroupId = typeof body.to_group_id === 'string' ? body.to_group_id : null
    const toUserId = typeof body.to_user_id === 'string' ? body.to_user_id : null
    if (!toGroupId && !toUserId) return context.json(errorBody('bad_request', '未指定转派目标'), 400)

    let toUserName: string | null = null
    if (toUserId) {
      const targetUser = await platform.auth.userStore.findById(toUserId)
      if (!targetUser) return context.json(errorBody('bad_request', '目标用户不存在'), 400)
      toUserName = targetUser.name
    }

    const transferId = randomUUID()
    const ts = now()
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO ticket_transfers (id, ticket_id, from_user_id, from_user_name, to_group_id, to_user_id, to_user_name, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [transferId, id, user.id, user.name, toGroupId, toUserId, toUserName, typeof body.reason === 'string' ? body.reason : null, ts],
      })
      await tx.run({
        text: 'UPDATE tickets SET assigned_group_id = COALESCE(?, assigned_group_id), assigned_handler_id = ?, updated_at = ? WHERE id = ?',
        params: [toGroupId, toUserId, ts, id],
      })
    })

    const updated = await db.queryOne<TicketRow>({ text: 'SELECT * FROM tickets WHERE id = ?', params: [id] })
    return context.json(updated, 200)
  })

  // POST /api/tickets/:id/evaluation — 满意度评价
  app.post('/api/tickets/:id/evaluation', async (context) => {
    const user = getUser(context)
    const id = context.req.param('id')
    const ticket = await db.queryOne<{ id: string; submitter_id: string; status: string }>({ text: 'SELECT id, submitter_id, status FROM tickets WHERE id = ?', params: [id] })
    if (!ticket) return context.json(errorBody('not_found', '工单不存在'), 404)
    if (ticket.submitter_id !== user.id) return context.json(errorBody('forbidden', '非提交人工单'), 403)
    if (ticket.status !== 'completed') return context.json(errorBody('bad_request', '工单未完成'), 400)

    const existing = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM ticket_evaluations WHERE ticket_id = ?', params: [id] })
    if (existing) return context.json(errorBody('bad_request', '已评价'), 400)

    const body = await context.req.json().catch(() => ({}))
    const rating = Number(body.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return context.json(errorBody('bad_request', '评分需为1-5'), 400)

    const evalId = randomUUID()
    const ts = now()
    await db.run({
      text: 'INSERT INTO ticket_evaluations (id, ticket_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [evalId, id, rating, typeof body.comment === 'string' ? body.comment : null, ts],
    })
    return context.json({ id: evalId, ticket_id: id, rating, comment: typeof body.comment === 'string' ? body.comment : null, created_at: ts }, 201)
  })

  // GET /api/tickets/:id/submitter-info — 提交人完整信息
  app.get('/api/tickets/:id/submitter-info', async (context) => {
    const user = getUser(context)
    if (!requireRole(user, 'handler', 'admin')) return context.json(errorBody('forbidden', '无权限'), 403)
    const id = context.req.param('id')
    const ticket = await db.queryOne<{ submitter_id: string }>({ text: 'SELECT submitter_id FROM tickets WHERE id = ?', params: [id] })
    if (!ticket) return context.json(errorBody('not_found', '工单不存在'), 404)

    const submitter = await platform.auth.userStore.findById(ticket.submitter_id)
    if (!submitter) return context.json(errorBody('not_found', '提交人不存在'), 404)

    const profile = await db.queryOne<{ company: string | null; department: string | null }>({ text: 'SELECT company, department FROM users WHERE id = ?', params: [ticket.submitter_id] })
    const history = await db.queryAll({
      text: 'SELECT id, subject, category, sla_priority, status, created_at FROM tickets WHERE submitter_id = ? ORDER BY created_at DESC LIMIT 20',
      params: [ticket.submitter_id],
    })

    return context.json({
      name: submitter.name,
      email: submitter.email,
      company: profile?.company ?? null,
      department: profile?.department ?? null,
      history_tickets: history ?? [],
    })
  })

  // === 分配模块接口 ===

  // GET /api/companies
  app.get('/api/companies', async (context) => {
    const user = getUser(context)
    if (!requireRole(user, 'admin')) return context.json(errorBody('forbidden', '无权限'), 403)
    const items = await db.queryAll({ text: 'SELECT id, name, created_at FROM companies ORDER BY created_at DESC', params: [] })
    return context.json({ items: items ?? [] })
  })

  // POST /api/companies
  app.post('/api/companies', async (context) => {
    const user = getUser(context)
    if (!requireRole(user, 'admin')) return context.json(errorBody('forbidden', '无权限'), 403)
    const body = await context.req.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return context.json(errorBody('bad_request', '名称为空'), 400)
    const id = randomUUID()
    const ts = now()
    await db.run({ text: 'INSERT INTO companies (id, name, created_by, created_at) VALUES (?, ?, ?, ?)', params: [id, name, user.id, ts] })
    const company = await db.queryOne({ text: 'SELECT id, name, created_at FROM companies WHERE id = ?', params: [id] })
    return context.json(company, 201)
  })

  // GET /api/companies/:id/business-groups
  app.get('/api/companies/:id/business-groups', async (context) => {
    const user = getUser(context)
    if (!requireRole(user, 'admin')) return context.json(errorBody('forbidden', '无权限'), 403)
    const companyId = context.req.param('id')
    const groups = await db.queryAll<{ id: string; company_id: string; name: string; created_at: string }>({ text: 'SELECT id, company_id, name, created_at FROM business_groups WHERE company_id = ? ORDER BY created_at DESC', params: [companyId] })
    const result = []
    for (const g of groups) {
      const members = await db.queryAll<{ id: string; user_id: string; user_name: string }>({ text: 'SELECT id, user_id, user_name FROM business_group_members WHERE group_id = ?', params: [g.id] })
      result.push({ ...g, members: members ?? [] })
    }
    return context.json({ items: result })
  })

  // POST /api/companies/:id/business-groups
  app.post('/api/companies/:id/business-groups', async (context) => {
    const user = getUser(context)
    if (!requireRole(user, 'admin')) return context.json(errorBody('forbidden', '无权限'), 403)
    const companyId = context.req.param('id')
    const body = await context.req.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return context.json(errorBody('bad_request', '名称为空'), 400)
    const id = randomUUID()
    const ts = now()
    await db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [id, companyId, name, ts] })
    const group = await db.queryOne<{ id: string; company_id: string; name: string; created_at: string }>({ text: 'SELECT id, company_id, name, created_at FROM business_groups WHERE id = ?', params: [id] })
    return context.json({ ...group!, members: [] }, 201)
  })

  // POST /api/business-groups/:id/members
  app.post('/api/business-groups/:id/members', async (context) => {
    const user = getUser(context)
    if (!requireRole(user, 'admin')) return context.json(errorBody('forbidden', '无权限'), 403)
    const groupId = context.req.param('id')
    const body = await context.req.json().catch(() => ({}))
    const userId = typeof body.user_id === 'string' ? body.user_id : ''
    if (!userId) return context.json(errorBody('bad_request', 'user_id 必填'), 400)

    const targetUser = await platform.auth.userStore.findById(userId)
    if (!targetUser) return context.json(errorBody('bad_request', '用户不存在'), 400)

    const existing = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_group_members WHERE group_id = ? AND user_id = ?', params: [groupId, userId] })
    if (existing) return context.json(errorBody('bad_request', '已在组中'), 400)

    const id = randomUUID()
    const ts = now()
    await db.run({ text: 'INSERT INTO business_group_members (id, group_id, user_id, user_name, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, groupId, userId, targetUser.name, ts] })
    return context.json({ id, group_id: groupId, user_id: userId, user_name: targetUser.name }, 201)
  })

  // GET /api/companies/:id/assignment-rules
  app.get('/api/companies/:id/assignment-rules', async (context) => {
    const user = getUser(context)
    if (!requireRole(user, 'admin')) return context.json(errorBody('forbidden', '无权限'), 403)
    const companyId = context.req.param('id')
    const rules = await db.queryAll({
      text: `SELECT r.id, r.company_id, r.category, r.group_id, g.name AS group_name, r.created_at FROM category_assignment_rules r JOIN business_groups g ON r.group_id = g.id WHERE r.company_id = ? ORDER BY r.created_at DESC`,
      params: [companyId],
    })
    return context.json({ items: rules ?? [] })
  })

  // POST /api/assignment-rules
  app.post('/api/assignment-rules', async (context) => {
    const user = getUser(context)
    if (!requireRole(user, 'admin')) return context.json(errorBody('forbidden', '无权限'), 403)
    const body = await context.req.json().catch(() => ({}))
    const companyId = typeof body.company_id === 'string' ? body.company_id : ''
    const category = typeof body.category === 'string' ? body.category.trim() : ''
    const groupId = typeof body.group_id === 'string' ? body.group_id : ''
    if (!companyId || !category || !groupId) return context.json(errorBody('bad_request', '参数缺失'), 400)

    const existing = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM category_assignment_rules WHERE company_id = ? AND category = ?', params: [companyId, category] })
    if (existing) return context.json(errorBody('bad_request', '规则已存在'), 400)

    const id = randomUUID()
    const ts = now()
    await db.run({ text: 'INSERT INTO category_assignment_rules (id, company_id, category, group_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, companyId, category, groupId, ts] })
    const group = await db.queryOne<{ name: string }>({ text: 'SELECT name FROM business_groups WHERE id = ?', params: [groupId] })
    return context.json({ id, company_id: companyId, category, group_id: groupId, group_name: group?.name ?? '', created_at: ts }, 201)
  })

  // === 用户管理增强 ===

  // POST /api/users — 管理员创建用户（扩展原有 /api/admin/users）
  app.post('/api/users', async (context) => {
    const user = getUser(context)
    if (!requireRole(user, 'admin')) return context.json(errorBody('forbidden', '无权限'), 403)
    const body = await context.req.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const role = typeof body.role === 'string' ? body.role : ''
    const company = typeof body.company === 'string' ? body.company.trim() : null
    const department = typeof body.department === 'string' ? body.department.trim() : null

    if (!name || !email || !password || !['submitter', 'handler', 'admin'].includes(role)) {
      return context.json(errorBody('bad_request', '参数缺失或 role 不合法'), 400)
    }
    if (!email.includes('@') || password.length < 12) {
      return context.json(errorBody('bad_request', '邮箱或密码不合法'), 400)
    }

    try {
      const created = await platform.auth.userStore.create({ name, email, phone: null, passwordChangeRequired: true }, platform.auth.hashPassword(password))
      await db.run({ text: 'UPDATE users SET company = ?, department = ? WHERE id = ?', params: [company, department, created.id] })
      await platform.permissionKit.assignRole(created.id, role)
      return context.json({ id: created.id, name: created.name, email: created.email, role, company, department }, 201)
    } catch (error) {
      const msg = error instanceof Error && /unique constraint/i.test(error.message) ? '邮箱已存在' : '创建用户失败'
      return context.json(errorBody('bad_request', msg), 400)
    }
  })

  // GET /api/users/:id — 获取用户详情
  app.get('/api/users/:id', async (context) => {
    const user = getUser(context)
    if (!requireRole(user, 'admin')) return context.json(errorBody('forbidden', '无权限'), 403)
    const userId = context.req.param('id')
    const target = await platform.auth.userStore.findById(userId)
    if (!target) return context.json(errorBody('not_found', '用户不存在'), 404)
    const profile = await db.queryOne<{ company: string | null; department: string | null }>({ text: 'SELECT company, department FROM users WHERE id = ?', params: [userId] })
    const roles = await platform.permissionKit.getRoles(userId)
    return context.json({ id: target.id, name: target.name, email: target.email, role: roles[0] ?? 'submitter', company: profile?.company ?? null, department: profile?.department ?? null })
  })
}

async function isAssignedHandler(db: Platform['db'], userId: string, groupId: string | null): Promise<boolean> {
  if (!groupId) return false
  const row = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_group_members WHERE group_id = ? AND user_id = ?', params: [groupId, userId] })
  return !!row
}
