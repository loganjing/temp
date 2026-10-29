/**
 * 工单核心服务：创建（含自动分配）、详情、回复、分配、转派、完成、取消、评价。
 * 事务保证：创建工单+自动分配、转派+记录、完成状态更新使用 db.transaction。
 */
import type { DbClient } from '@commonapp/dbkit'
import { TicketStatus, PRIORITY_VALUES, MIN_RATING, MAX_RATING } from '../../shared/types.js'
import { conflict, notFound, now, uuid, validationError } from './helpers.js'

interface CategoryRow { id: string; name: string }
interface SubmitterRow { id: string; name: string; email: string; company_id: string }
interface RuleRow { group_id: string; group_name: string }
interface TicketRow {
  id: string; status: string; assigned_group_id: string | null; assigned_handler_id: string | null
}
interface OperatorRow { id: string; name: string }
interface EvaluationRow {
  id: string; ticket_id: string; submitter_id: string; rating: number; comment: string | null; created_at: string
}

/** 工单列表查询，支持可选筛选 */
export async function listTickets(
  db: DbClient,
  filters: { status?: string; priority?: string; categoryId?: string; submitterId?: string; assignedGroupId?: string },
) {
  const conditions: string[] = []
  const params: string[] = []
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue
    const column = { status: 't.status', priority: 't.priority', categoryId: 't.category_id', submitterId: 't.submitter_id', assignedGroupId: 't.assigned_group_id' }[key]
    conditions.push(`${column} = ?`)
    params.push(value)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return db.queryAll({
    text: `SELECT t.id, t.title, c.name AS category_name, t.priority, t.status,
              u.name AS submitter_name, bg.name AS assigned_group_name, t.created_at
           FROM tickets t
           LEFT JOIN categories c ON c.id = t.category_id
           LEFT JOIN users u ON u.id = t.submitter_id
           LEFT JOIN business_groups bg ON bg.id = t.assigned_group_id
           ${where}
           ORDER BY t.created_at DESC`,
    params,
  })
}

/** 创建工单并在事务内执行自动分配 */
export async function createTicket(
  db: DbClient,
  input: { title: string; description: string; categoryId: string; submitterId: string; priority: string },
) {
  const { title, description, categoryId, submitterId, priority } = input
  if (!title?.trim()) throw validationError('title 不能为空')
  if (!description?.trim()) throw validationError('description 不能为空')
  if (!categoryId) throw validationError('categoryId 不能为空')
  if (!submitterId) throw validationError('submitterId 不能为空')
  if (!PRIORITY_VALUES.includes(priority as never)) throw validationError('priority 值非法，应为 P0-P4')

  const category = await db.queryOne<CategoryRow>({ text: 'SELECT id, name FROM categories WHERE id = ?', params: [categoryId] })
  if (!category) throw notFound('分类不存在')
  const submitter = await db.queryOne<SubmitterRow>({ text: 'SELECT id, name, email, company_id FROM users WHERE id = ?', params: [submitterId] })
  if (!submitter) throw notFound('提交人不存在')

  const id = uuid()
  const createdAt = now()

  const result = await db.transaction(async (tx) => {
    await tx.run({
      text: `INSERT INTO tickets (id, title, description, category_id, submitter_id, priority, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [id, title, description, categoryId, submitterId, priority, TicketStatus.PendingAssign, createdAt],
    })
    // 自动分配：查找提交人公司 + 分类的分配规则
    const rule = await tx.queryOne<RuleRow>({
      text: `SELECT r.group_id, bg.name AS group_name
             FROM category_assignment_rules r
             JOIN business_groups bg ON bg.id = r.group_id
             WHERE r.company_id = ? AND r.category_id = ?`,
      params: [submitter.company_id, categoryId],
    })
    let status: TicketStatus = TicketStatus.PendingAssign
    let assignedGroupId: string | null = null
    let assignedGroupName: string | null = null
    if (rule) {
      await tx.run({
        text: 'UPDATE tickets SET assigned_group_id = ?, status = ? WHERE id = ?',
        params: [rule.group_id, TicketStatus.PendingProcess, id],
      })
      status = TicketStatus.PendingProcess
      assignedGroupId = rule.group_id
      assignedGroupName = rule.group_name
    }
    return { status, assignedGroupId, assignedGroupName }
  })

  return {
    id,
    title,
    description,
    category_id: categoryId,
    category_name: category.name,
    submitter_id: submitterId,
    submitter_name: submitter.name,
    submitter_email: submitter.email,
    priority,
    status: result.status,
    assigned_group_id: result.assignedGroupId,
    assigned_group_name: result.assignedGroupName,
    created_at: createdAt,
  }
}

/** 工单详情：含回复、转派记录、评价 */
export async function getTicketDetail(db: DbClient, ticketId: string) {
  const ticket = await db.queryOne({
    text: `SELECT t.id, t.title, t.description, t.category_id, c.name AS category_name,
              t.submitter_id, su.name AS submitter_name, su.email AS submitter_email,
              t.priority, t.status,
              t.assigned_group_id, bg.name AS assigned_group_name,
              t.assigned_handler_id, hu.name AS assigned_handler_name,
              t.processed_by, pu.name AS processed_by_name, t.processed_at, t.created_at
           FROM tickets t
           LEFT JOIN categories c ON c.id = t.category_id
           LEFT JOIN users su ON su.id = t.submitter_id
           LEFT JOIN business_groups bg ON bg.id = t.assigned_group_id
           LEFT JOIN users hu ON hu.id = t.assigned_handler_id
           LEFT JOIN users pu ON pu.id = t.processed_by
           WHERE t.id = ?`,
    params: [ticketId],
  })
  if (!ticket) throw notFound('工单不存在')

  const replies = await db.queryAll({
    text: `SELECT r.id, r.ticket_id, r.replier_id, u.name AS replier_name, r.content, r.created_at
           FROM ticket_replies r
           JOIN users u ON u.id = r.replier_id
           WHERE r.ticket_id = ?
           ORDER BY r.created_at ASC`,
    params: [ticketId],
  })

  const transfers = await db.queryAll({
    text: `SELECT tr.id, tr.ticket_id,
              fbg.name AS from_group_name, fhu.name AS from_handler_name,
              tbg.name AS to_group_name, thu.name AS to_handler_name,
              byu.name AS transferred_by_name, tr.created_at
           FROM ticket_transfers tr
           LEFT JOIN business_groups fbg ON fbg.id = tr.from_group_id
           LEFT JOIN users fhu ON fhu.id = tr.from_handler_id
           LEFT JOIN business_groups tbg ON tbg.id = tr.to_group_id
           LEFT JOIN users thu ON thu.id = tr.to_handler_id
           LEFT JOIN users byu ON byu.id = tr.transferred_by
           WHERE tr.ticket_id = ?
           ORDER BY tr.created_at ASC`,
    params: [ticketId],
  })

  const evaluation = await db.queryOne<EvaluationRow>({
    text: `SELECT e.id, e.ticket_id, e.submitter_id, e.rating, e.comment, e.created_at
           FROM ticket_evaluations e
           WHERE e.ticket_id = ?`,
    params: [ticketId],
  })

  return { ...ticket, replies, transfers, evaluation }
}

/** 添加回复 */
export async function addReply(db: DbClient, ticketId: string, replierId: string, content: string) {
  const ticket = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM tickets WHERE id = ?', params: [ticketId] })
  if (!ticket) throw notFound('工单不存在')
  if (!content?.trim()) throw validationError('content 不能为空')
  const replier = await db.queryOne<OperatorRow>({ text: 'SELECT id, name FROM users WHERE id = ?', params: [replierId] })
  if (!replier) throw notFound('回复人不存在')
  const id = uuid()
  const createdAt = now()
  await db.run({
    text: 'INSERT INTO ticket_replies (id, ticket_id, replier_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
    params: [id, ticketId, replierId, content, createdAt],
  })
  return { id, ticket_id: ticketId, replier_id: replierId, replier_name: replier.name, content, created_at: createdAt }
}

/** 手动分配：仅 pending_assign → pending_process */
export async function assignTicket(
  db: DbClient,
  ticketId: string,
  groupId: string | undefined,
  handlerId: string | undefined,
) {
  if (!groupId && !handlerId) throw validationError('groupId 和 handlerId 至少传一个')
  const ticket = await db.queryOne<TicketRow>({
    text: 'SELECT id, status, assigned_group_id, assigned_handler_id FROM tickets WHERE id = ?',
    params: [ticketId],
  })
  if (!ticket) throw notFound('工单不存在')
  if (ticket.status !== TicketStatus.PendingAssign) {
    throw conflict('工单状态不允许分配（需为 pending_assign）')
  }
  await db.run({
    text: 'UPDATE tickets SET assigned_group_id = ?, assigned_handler_id = ?, status = ? WHERE id = ?',
    params: [groupId ?? null, handlerId ?? null, TicketStatus.PendingProcess, ticketId],
  })
  return {
    id: ticketId,
    status: TicketStatus.PendingProcess,
    assigned_group_id: groupId ?? null,
    assigned_handler_id: handlerId ?? null,
  }
}

/** 转派：仅 pending_process，状态保持，事务记录 from→to */
export async function transferTicket(
  db: DbClient,
  ticketId: string,
  transferredBy: string,
  toGroupId: string | undefined,
  toHandlerId: string | undefined,
) {
  if (!toGroupId && !toHandlerId) throw validationError('toGroupId 和 toHandlerId 至少传一个')
  const ticket = await db.queryOne<TicketRow>({
    text: 'SELECT id, status, assigned_group_id, assigned_handler_id FROM tickets WHERE id = ?',
    params: [ticketId],
  })
  if (!ticket) throw notFound('工单不存在')
  if (ticket.status !== TicketStatus.PendingProcess) {
    throw conflict('工单状态不允许转派（需为 pending_process）')
  }
  const operator = await db.queryOne<OperatorRow>({ text: 'SELECT id, name FROM users WHERE id = ?', params: [transferredBy] })
  if (!operator) throw notFound('操作人不存在')

  const transferId = uuid()
  const createdAt = now()

  await db.transaction(async (tx) => {
    await tx.run({
      text: 'UPDATE tickets SET assigned_group_id = ?, assigned_handler_id = ? WHERE id = ?',
      params: [toGroupId ?? null, toHandlerId ?? null, ticketId],
    })
    await tx.run({
      text: `INSERT INTO ticket_transfers
             (id, ticket_id, from_group_id, from_handler_id, to_group_id, to_handler_id, transferred_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [transferId, ticketId, ticket.assigned_group_id, ticket.assigned_handler_id, toGroupId ?? null, toHandlerId ?? null, transferredBy, createdAt],
    })
  })

  return {
    id: ticketId,
    status: TicketStatus.PendingProcess,
    assigned_group_id: toGroupId ?? null,
    assigned_handler_id: toHandlerId ?? null,
    transfer_record: {
      id: transferId,
      ticket_id: ticketId,
      from_group_id: ticket.assigned_group_id,
      from_handler_id: ticket.assigned_handler_id,
      to_group_id: toGroupId ?? null,
      to_handler_id: toHandlerId ?? null,
      transferred_by: transferredBy,
      transferred_by_name: operator.name,
      created_at: createdAt,
    },
  }
}

/** 完成工单：仅 pending_process → completed，事务更新 */
export async function completeTicket(db: DbClient, ticketId: string, processedBy: string) {
  const ticket = await db.queryOne<TicketRow>({ text: 'SELECT id, status FROM tickets WHERE id = ?', params: [ticketId] })
  if (!ticket) throw notFound('工单不存在')
  if (ticket.status !== TicketStatus.PendingProcess) {
    throw conflict('工单状态不允许完成（需为 pending_process）')
  }
  const handler = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM users WHERE id = ?', params: [processedBy] })
  if (!handler) throw notFound('处理人不存在')
  const processedAt = now()
  await db.transaction(async (tx) => {
    await tx.run({
      text: 'UPDATE tickets SET status = ?, processed_by = ?, processed_at = ? WHERE id = ?',
      params: [TicketStatus.Completed, processedBy, processedAt, ticketId],
    })
  })
  return { id: ticketId, status: TicketStatus.Completed, processed_by: processedBy, processed_at: processedAt }
}

/** 取消工单：从 pending_assign 或 pending_process → cancelled */
export async function cancelTicket(db: DbClient, ticketId: string) {
  const ticket = await db.queryOne<TicketRow>({ text: 'SELECT id, status FROM tickets WHERE id = ?', params: [ticketId] })
  if (!ticket) throw notFound('工单不存在')
  if (ticket.status === TicketStatus.Completed || ticket.status === TicketStatus.Cancelled) {
    throw conflict('工单状态不允许取消（已完成或已取消）')
  }
  await db.run({
    text: 'UPDATE tickets SET status = ? WHERE id = ?',
    params: [TicketStatus.Cancelled, ticketId],
  })
  return { id: ticketId, status: TicketStatus.Cancelled }
}

/** 提交评价：仅 completed，每单一条 */
export async function createEvaluation(
  db: DbClient,
  ticketId: string,
  submitterId: string,
  rating: number,
  comment: string | undefined,
) {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    throw validationError('rating 必须为 1-5 的整数')
  }
  const ticket = await db.queryOne<TicketRow>({ text: 'SELECT id, status FROM tickets WHERE id = ?', params: [ticketId] })
  if (!ticket) throw notFound('工单不存在')
  if (ticket.status !== TicketStatus.Completed) {
    throw conflict('工单状态不允许评价（需为 completed）')
  }
  const existing = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM ticket_evaluations WHERE ticket_id = ?', params: [ticketId] })
  if (existing) throw conflict('该工单已存在评价')
  const submitter = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM users WHERE id = ?', params: [submitterId] })
  if (!submitter) throw notFound('评价人不存在')
  const id = uuid()
  const createdAt = now()
  await db.run({
    text: 'INSERT INTO ticket_evaluations (id, ticket_id, submitter_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    params: [id, ticketId, submitterId, rating, comment ?? null, createdAt],
  })
  return { id, ticket_id: ticketId, submitter_id: submitterId, rating, comment: comment ?? null, created_at: createdAt }
}

/** 获取工单评价 */
export async function getEvaluation(db: DbClient, ticketId: string) {
  const ticket = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM tickets WHERE id = ?', params: [ticketId] })
  if (!ticket) throw notFound('工单不存在')
  const evaluation = await db.queryOne<EvaluationRow>({
    text: 'SELECT id, ticket_id, submitter_id, rating, comment, created_at FROM ticket_evaluations WHERE ticket_id = ?',
    params: [ticketId],
  })
  return evaluation ?? {
    id: null,
    ticket_id: ticketId,
    submitter_id: null,
    rating: null,
    comment: null,
    created_at: null,
  }
}
