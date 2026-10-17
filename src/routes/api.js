import { Hono } from 'hono';
import { forbidden, invalidUser, notFound, validationError } from '../domain/errors.js';
import { getUserRow, listUserRows, serializeUser, isCompanyAdmin } from '../domain/users.js';
import {
  getBusinessGroup,
  getCompany,
  listBusinessGroups,
  createBusinessGroup,
  setGroupMembers,
  listAssignmentRules,
  createAssignmentRule,
  listCategories,
  createCategory,
} from '../domain/org.js';
import {
  createTicket,
  loadTicket,
  dispatchTicket,
  assignTicket,
  addReply,
  reassignTicket,
  completeTicket,
  cancelTicket,
  rateTicket,
  listTickets,
  listUserTickets,
  assertValidStatusFilter,
} from '../domain/tickets.js';
import { ticketDetail } from '../domain/serialize.js';

/**
 * API 路由层（src/server.js 挂载 /api）：
 * 请求参数校验、X-User-Id 解析校验、角色判断调用、统一 JSON/错误响应。
 * 契约基准：docs/wi-t1000293/technical-contract.md。
 */

function parseIdParam(c, field) {
  const raw = c.req.param(field);
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw notFound(`${field} 对应资源不存在`);
  }
  return id;
}

async function readJsonBody(c) {
  const text = await c.req.text();
  if (text.trim() === '') return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('body must be a JSON object');
    }
    return parsed;
  } catch {
    throw validationError('请求体必须是合法的 JSON 对象');
  }
}

export function registerApiRoutes(app, db) {
  const api = new Hono();

  // X-User-Id 解析与校验（契约第 1 节）：缺失/非整数/用户不存在 → 401 INVALID_USER
  api.use('*', async (c, next) => {
    const raw = c.req.header('x-user-id');
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      throw invalidUser('缺少 X-User-Id 请求头');
    }
    const userId = Number(String(raw).trim());
    if (!Number.isInteger(userId) || userId <= 0) {
      throw invalidUser('X-User-Id 必须为整数用户 id');
    }
    const user = getUserRow(db, userId);
    if (!user) {
      throw invalidUser('X-User-Id 对应用户不存在');
    }
    c.set('currentUser', serializeUser(user));
    await next();
  });

  /* ---------------- 用户（契约 2.1 / 3.5） ---------------- */

  api.get('/users', (c) => {
    const users = listUserRows(db).map(serializeUser);
    return c.json({ users });
  });

  api.get('/users/:userId/tickets', (c) => {
    const userId = parseIdParam(c, 'userId');
    const tickets = listUserTickets(db, userId);
    return c.json({ tickets });
  });

  /* ---------------- 业务组（契约 2.2 / 2.3 / 2.4） ---------------- */

  api.get('/companies/:companyId/business-groups', (c) => {
    const companyId = parseIdParam(c, 'companyId');
    const groups = listBusinessGroups(db, companyId);
    return c.json({ groups });
  });

  api.post('/companies/:companyId/business-groups', async (c) => {
    const companyId = parseIdParam(c, 'companyId');
    const actor = c.get('currentUser');
    const company = getCompany(db, companyId);
    if (!company) throw notFound('公司不存在');
    if (!isCompanyAdmin(actor, companyId)) {
      throw forbidden('仅该公司管理员可新增业务组');
    }
    const body = await readJsonBody(c);
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      throw validationError('字段 name 必须为非空字符串');
    }
    const group = createBusinessGroup(db, { company, actor, name: body.name });
    return c.json(group, 201);
  });

  api.put('/business-groups/:groupId/members', async (c) => {
    const groupId = parseIdParam(c, 'groupId');
    const actor = c.get('currentUser');
    const group = getBusinessGroup(db, groupId);
    if (!group) throw notFound('业务组不存在');
    if (!isCompanyAdmin(actor, group.company_id)) {
      throw forbidden('仅该业务组所属公司的管理员可设置成员');
    }
    const body = await readJsonBody(c);
    if (!Array.isArray(body.userIds)) {
      throw validationError('字段 userIds 必须为整数数组');
    }
    for (const v of body.userIds) {
      if (!Number.isInteger(v)) {
        throw validationError('字段 userIds 的元素必须为整数');
      }
    }
    const updated = setGroupMembers(db, { group, actor, userIds: body.userIds });
    return c.json(updated);
  });

  /* ---------------- 分配规则（契约 2.5 / 2.6） ---------------- */

  api.get('/companies/:companyId/assignment-rules', (c) => {
    const companyId = parseIdParam(c, 'companyId');
    const rules = listAssignmentRules(db, companyId);
    return c.json({ rules });
  });

  api.post('/companies/:companyId/assignment-rules', async (c) => {
    const companyId = parseIdParam(c, 'companyId');
    const actor = c.get('currentUser');
    const company = getCompany(db, companyId);
    if (!company) throw notFound('公司不存在');
    if (!isCompanyAdmin(actor, companyId)) {
      throw forbidden('仅该公司管理员可配置分配规则');
    }
    const body = await readJsonBody(c);
    if (!Number.isInteger(body.categoryId)) {
      throw validationError('字段 categoryId 必须为整数');
    }
    if (!Number.isInteger(body.groupId)) {
      throw validationError('字段 groupId 必须为整数');
    }
    const rule = createAssignmentRule(db, {
      company,
      actor,
      categoryId: body.categoryId,
      groupId: body.groupId,
    });
    return c.json(rule, 201);
  });

  /* ---------------- 分类（契约 2.7） ---------------- */

  api.get('/categories', (c) => {
    return c.json({ categories: listCategories(db) });
  });

  api.post('/categories', async (c) => {
    const actor = c.get('currentUser');
    if (!actor.isCompanyAdmin) {
      throw forbidden('仅公司管理员可新增分类');
    }
    const body = await readJsonBody(c);
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      throw validationError('字段 name 必须为非空字符串');
    }
    const category = createCategory(db, { actor, name: body.name });
    return c.json(category, 201);
  });

  /* ---------------- 工单（契约第 3 节） ---------------- */

  api.post('/tickets', async (c) => {
    const actor = c.get('currentUser');
    const body = await readJsonBody(c);
    if (typeof body.subject !== 'string' || body.subject.trim() === '') {
      throw validationError('字段 subject 必须为非空字符串');
    }
    if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
      throw validationError('字段 description 必须为字符串');
    }
    if (!Number.isInteger(body.categoryId)) {
      throw validationError('字段 categoryId 必须为整数');
    }
    if (typeof body.priority !== 'string') {
      throw validationError('字段 priority 必须为字符串');
    }
    const ticket = createTicket(db, {
      submitter: actor,
      subject: body.subject,
      description: body.description ?? '',
      categoryId: body.categoryId,
      priority: body.priority,
    });
    return c.json(ticket, 201);
  });

  api.get('/tickets', (c) => {
    const q = c.req.query();
    const filters = {};
    if (q.status !== undefined) {
      if (typeof q.status !== 'string') throw validationError('status 必须为状态枚举');
      assertValidStatusFilter(q.status);
      filters.status = q.status;
    }
    for (const [key, raw] of Object.entries(q)) {
      if (['categoryId', 'companyId', 'submitterId'].includes(key)) {
        const v = Number(raw);
        if (!Number.isInteger(v) || v <= 0) {
          throw validationError(`查询参数 ${key} 必须为正整数`);
        }
        filters[key] = v;
      }
    }
    const tickets = listTickets(db, filters);
    return c.json({ tickets });
  });

  api.get('/tickets/:ticketId', (c) => {
    const ticketId = parseIdParam(c, 'ticketId');
    const ticket = ticketDetail(db, ticketId);
    if (!ticket) throw notFound('工单不存在');
    return c.json(ticket);
  });

  api.post('/tickets/:ticketId/dispatch', async (c) => {
    const ticketId = parseIdParam(c, 'ticketId');
    const actor = c.get('currentUser');
    const { ticket } = loadTicket(db, ticketId);
    await readJsonBody(c); // 容忍空 body / 任意 JSON（契约：无请求体）
    const updated = dispatchTicket(db, { actor, ticket });
    return c.json(updated);
  });

  api.post('/tickets/:ticketId/assign', async (c) => {
    const ticketId = parseIdParam(c, 'ticketId');
    const actor = c.get('currentUser');
    const { ticket } = loadTicket(db, ticketId);
    const body = await readJsonBody(c);
    if (!Number.isInteger(body.groupId)) {
      throw validationError('字段 groupId 必须为整数');
    }
    let assigneeId = null;
    if (body.assigneeId !== undefined && body.assigneeId !== null) {
      if (!Number.isInteger(body.assigneeId)) {
        throw validationError('字段 assigneeId 必须为整数');
      }
      assigneeId = body.assigneeId;
    }
    const updated = assignTicket(db, { actor, ticket, groupId: body.groupId, assigneeId });
    return c.json(updated);
  });

  api.post('/tickets/:ticketId/replies', async (c) => {
    const ticketId = parseIdParam(c, 'ticketId');
    const actor = c.get('currentUser');
    const { ticket } = loadTicket(db, ticketId);
    const body = await readJsonBody(c);
    if (typeof body.content !== 'string' || body.content.trim() === '') {
      throw validationError('字段 content 必须为非空字符串');
    }
    const result = addReply(db, { actor, ticket, content: body.content });
    return c.json(result, 201);
  });

  api.post('/tickets/:ticketId/reassign', async (c) => {
    const ticketId = parseIdParam(c, 'ticketId');
    const actor = c.get('currentUser');
    const { ticket } = loadTicket(db, ticketId);
    const body = await readJsonBody(c);
    if (!Number.isInteger(body.groupId)) {
      throw validationError('字段 groupId 必须为整数');
    }
    let assigneeId = null;
    if (body.assigneeId !== undefined && body.assigneeId !== null) {
      if (!Number.isInteger(body.assigneeId)) {
        throw validationError('字段 assigneeId 必须为整数');
      }
      assigneeId = body.assigneeId;
    }
    const updated = reassignTicket(db, { actor, ticket, groupId: body.groupId, assigneeId });
    return c.json(updated);
  });

  api.post('/tickets/:ticketId/complete', async (c) => {
    const ticketId = parseIdParam(c, 'ticketId');
    const actor = c.get('currentUser');
    const { ticket } = loadTicket(db, ticketId);
    const body = await readJsonBody(c);
    if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
      throw validationError('字段 note 必须为字符串');
    }
    const updated = completeTicket(db, { actor, ticket, note: body.note ?? null });
    return c.json(updated);
  });

  api.post('/tickets/:ticketId/cancel', async (c) => {
    const ticketId = parseIdParam(c, 'ticketId');
    const actor = c.get('currentUser');
    const { ticket } = loadTicket(db, ticketId);
    const body = await readJsonBody(c);
    if (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string') {
      throw validationError('字段 reason 必须为字符串');
    }
    const updated = cancelTicket(db, { actor, ticket, reason: body.reason ?? null });
    return c.json(updated);
  });

  api.post('/tickets/:ticketId/rating', async (c) => {
    const ticketId = parseIdParam(c, 'ticketId');
    const actor = c.get('currentUser');
    const { ticket } = loadTicket(db, ticketId);
    const body = await readJsonBody(c);
    if (!Number.isInteger(body.score)) {
      throw validationError('字段 score 必须为 1–5 的整数');
    }
    if (body.comment !== undefined && body.comment !== null && typeof body.comment !== 'string') {
      throw validationError('字段 comment 必须为字符串');
    }
    const rating = rateTicket(db, {
      actor,
      ticket,
      score: body.score,
      comment: body.comment ?? null,
    });
    return c.json({ rating }, 201);
  });

  app.route('/api', api);
  return api;
}
