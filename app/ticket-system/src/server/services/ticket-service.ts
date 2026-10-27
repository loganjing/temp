import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type { AuditService } from '../platform/audit'
import type { EmailService } from '../platform/email'
import {
  TicketAuditEventType,
  type BusinessGroupView,
  type CategoryAssignmentRuleView,
  type CompleteTicketResponse,
  type CreateTicketRequest,
  type SlaPriority,
  type StatisticsDistributionResponse,
  type StatisticsDashboardResponse,
  type SubmitterInfo,
  type SatisfactionRatingView,
  type TicketDetail,
  type TicketListItem,
  type TicketStatus,
  type TicketTransferView,
} from '../../shared/types'

const PRIORITIES: readonly SlaPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']
const isPriority = (v: unknown): v is SlaPriority => typeof v === 'string' && (PRIORITIES as readonly string[]).includes(v)
const now = () => new Date().toISOString()

export interface UserProfile {
  id: string
  userId: string
  companyId: string
  departmentId: string | null
  displayName: string
  email: string
}

/** 业务操作的错误返回类型。显式注解使调用方 `in` 收窄后 error 为 string。 */
export type ErrorResult = { error: string }

export interface CreateTicketResponse {
  id: string
  companyId: string
  subject: string
  description: string
  categoryId: string
  slaPriority: SlaPriority
  submitterId: string
  status: TicketStatus
  assignedGroupId: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateReplyResponse {
  id: string
  ticketId: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

export interface UpdateBusinessGroupMembersResult {
  id: string
  name: string
  members: Array<{ id: string; userId: string; displayName: string }>
}

export interface CreateCategoryRuleResult {
  id: string
  companyId: string
  categoryId: string
  targetGroupId: string
  createdAt: string
}

export interface TicketServiceDeps {
  db: DbClient
  audit: AuditService
  email: EmailService
}

/** 按工单优先级排序的 SQL CASE 权重（P0 最小，asc 时排在最前）。 */
const priorityOrderCase = "CASE sla_priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 WHEN 'P4' THEN 4 ELSE 5 END"

export async function loadProfile(db: DbClient, userId: string): Promise<UserProfile | null> {
  const row = await db.queryOne<{ id: string; user_id: string; company_id: string; department_id: string | null; display_name: string; email: string }>({
    text: 'SELECT id, user_id, company_id, department_id, display_name, email FROM user_profiles WHERE user_id = ?',
    params: [userId],
  })
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    departmentId: row.department_id,
    displayName: row.display_name,
    email: row.email,
  }
}

const recordAudit = (audit: AuditService, type: string, actorId: string, actorName: string, entityType: string, entityId: string, payload: Record<string, unknown> = {}) =>
  audit.record({ type, actorUserId: actorId, metadata: { entityType, entityId, actorName, ...payload } })

interface ListTicketFilters {
  status?: string
  categoryId?: string
  slaPriority?: string
  search?: string
  sort?: string
  order?: string
  page?: number
  pageSize?: number
  fixedStatus?: TicketStatus
  assignedGroupId?: string
}

async function listTickets(db: DbClient, companyId: string, filters: ListTicketFilters) {
  const where: string[] = ['t.company_id = ?']
  const params: unknown[] = [companyId]
  if (filters.fixedStatus) {
    where.push('t.status = ?')
    params.push(filters.fixedStatus)
  } else if (filters.status) {
    where.push('t.status = ?')
    params.push(filters.status)
  }
  if (filters.categoryId) {
    where.push('t.category_id = ?')
    params.push(filters.categoryId)
  }
  if (filters.slaPriority && isPriority(filters.slaPriority)) {
    where.push('t.sla_priority = ?')
    params.push(filters.slaPriority)
  }
  if (filters.assignedGroupId) {
    where.push('t.assigned_group_id = ?')
    params.push(filters.assignedGroupId)
  }
  if (filters.search) {
    where.push('(t.subject LIKE ? OR t.description LIKE ?)')
    const term = `%${filters.search}%`
    params.push(term, term)
  }

  const sortField = filters.sort === 'sla_priority' ? 'sla_priority' : filters.sort === 'updated_at' ? 'updated_at' : 'created_at'
  const orderDir = filters.order === 'asc' ? 'ASC' : filters.order === 'desc' ? 'DESC' : 'DESC'
  const orderBy = sortField === 'sla_priority'
    ? `${priorityOrderCase} ${orderDir === 'ASC' ? 'ASC' : 'DESC'}, t.created_at ${orderDir === 'ASC' ? 'ASC' : 'DESC'}`
    : `t.${sortField} ${orderDir}`

  const page = Math.max(Number(filters.page) || 1, 1)
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 20, 1), 100)
  const offset = (page - 1) * pageSize

  const baseWhere = where.join(' AND ')
  const totalRow = await db.queryOne<{ total: number }>({
    text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${baseWhere}`,
    params,
  })
  const total = Number(totalRow?.total ?? 0)

  const rows = await db.queryAll<{
    id: string; subject: string; category_name: string; sla_priority: SlaPriority; status: TicketStatus
    submitter_name: string; assigned_group_name: string | null; created_at: string; updated_at: string
  }>({
    text: `SELECT t.id, t.subject, c.name AS category_name, t.sla_priority, t.status,
      p.display_name AS submitter_name, bg.name AS assigned_group_name, t.created_at, t.updated_at
      FROM tickets t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN user_profiles p ON p.user_id = t.submitter_id
      LEFT JOIN business_groups bg ON bg.id = t.assigned_group_id
      WHERE ${baseWhere}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
    params: [...params, pageSize, offset],
  })

  return {
    items: rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      categoryName: row.category_name,
      slaPriority: row.sla_priority,
      status: row.status,
      submitterName: row.submitter_name,
      assignedGroupName: row.assigned_group_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) as TicketListItem[],
    total,
    page,
    pageSize,
  }
}

async function fetchTicketDetail(db: DbClient, companyId: string, ticketId: string): Promise<TicketDetail | null> {
  const ticket = await db.queryOne<{
    id: string; company_id: string; subject: string; description: string; category_id: string; category_name: string
    sla_priority: SlaPriority; submitter_id: string; submitter_name: string; submitter_email: string
    status: TicketStatus; assigned_group_id: string | null; assigned_group_name: string | null
    handler_id: string | null; created_at: string; updated_at: string
  }>({
    text: `SELECT t.id, t.company_id, t.subject, t.description, t.category_id, c.name AS category_name,
      t.sla_priority, t.submitter_id, p.display_name AS submitter_name, p.email AS submitter_email,
      t.status, t.assigned_group_id, bg.name AS assigned_group_name, t.handler_id, t.created_at, t.updated_at
      FROM tickets t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN user_profiles p ON p.user_id = t.submitter_id
      LEFT JOIN business_groups bg ON bg.id = t.assigned_group_id
      WHERE t.id = ? AND t.company_id = ?`,
    params: [ticketId, companyId],
  })
  if (!ticket) return null

  const replies = await db.queryAll<{
    id: string; replier_id: string; replier_name: string; content: string; created_at: string
  }>({
    text: `SELECT r.id, r.replier_id, p.display_name AS replier_name, r.content, r.created_at
      FROM ticket_replies r LEFT JOIN user_profiles p ON p.user_id = r.replier_id
      WHERE r.ticket_id = ? ORDER BY r.created_at ASC`,
    params: [ticketId],
  })

  return {
    id: ticket.id,
    companyId: ticket.company_id,
    subject: ticket.subject,
    description: ticket.description,
    categoryId: ticket.category_id,
    categoryName: ticket.category_name,
    slaPriority: ticket.sla_priority,
    submitterId: ticket.submitter_id,
    submitterName: ticket.submitter_name,
    submitterEmail: ticket.submitter_email,
    status: ticket.status,
    assignedGroupId: ticket.assigned_group_id,
    assignedGroupName: ticket.assigned_group_name,
    handlerId: ticket.handler_id,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    replies: replies.map((r) => ({
      id: r.id, replierId: r.replier_id, replierName: r.replier_name, content: r.content, createdAt: r.created_at,
    })),
  }
}

export function createTicketService(deps: TicketServiceDeps) {
  const { db, audit, email } = deps

  return {
    async loadProfile(userId: string) {
      return loadProfile(db, userId)
    },

    async createTicket(profile: UserProfile, input: CreateTicketRequest): Promise<ErrorResult | CreateTicketResponse> {
      const category = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM categories WHERE id = ?', params: [input.categoryId] })
      if (!category) return { error: 'CATEGORY_NOT_FOUND' as const }

      const id = randomUUID()
      const ts = now()
      // 查找当前公司该分类的分配规则。
      const rule = await db.queryOne<{ target_group_id: string }>({
        text: 'SELECT target_group_id FROM category_assignment_rules WHERE company_id = ? AND category_id = ?',
        params: [profile.companyId, input.categoryId],
      })

      const status: TicketStatus = rule ? 'pending_processing' : 'pending_assignment'
      const assignedGroupId = rule ? rule.target_group_id : null

      await db.run({
        text: `INSERT INTO tickets (id, company_id, subject, description, category_id, sla_priority, submitter_id, status, assigned_group_id, handler_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        params: [id, profile.companyId, input.subject, input.description, input.categoryId, input.slaPriority, profile.userId, status, assignedGroupId, ts, ts],
      })

      await recordAudit(audit, TicketAuditEventType.created, profile.userId, profile.displayName, 'ticket', id, {
        companyId: profile.companyId, categoryId: input.categoryId, slaPriority: input.slaPriority, status,
      })
      if (rule) {
        await recordAudit(audit, TicketAuditEventType.assigned, profile.userId, profile.displayName, 'ticket', id, {
          targetGroupId: rule.target_group_id, auto: true,
        })
      }

      return {
        id,
        companyId: profile.companyId,
        subject: input.subject,
        description: input.description,
        categoryId: input.categoryId,
        slaPriority: input.slaPriority,
        submitterId: profile.userId,
        status,
        assignedGroupId,
        createdAt: ts,
        updatedAt: ts,
      }
    },

    listTickets(companyId: string, filters: ListTicketFilters) {
      return listTickets(db, companyId, filters)
    },

    getTicketDetail(companyId: string, ticketId: string) {
      return fetchTicketDetail(db, companyId, ticketId)
    },

    async updateTicket(profile: UserProfile, ticketId: string, input: { slaPriority?: SlaPriority; assignedGroupId?: string | null; status?: TicketStatus }): Promise<ErrorResult | { ok: true }> {
      const ticket = await db.queryOne<{ id: string; status: TicketStatus; assigned_group_id: string | null }>({
        text: 'SELECT id, status, assigned_group_id FROM tickets WHERE id = ? AND company_id = ?',
        params: [ticketId, profile.companyId],
      })
      if (!ticket) return { error: 'TICKET_NOT_FOUND' as const }

      const sets: string[] = ['updated_at = ?']
      const params: unknown[] = [now()]
      if (input.slaPriority && isPriority(input.slaPriority)) {
        sets.push('sla_priority = ?')
        params.push(input.slaPriority)
      }
      // 分配业务组：从待分配流转到待处理。
      if (input.assignedGroupId !== undefined) {
        const group = await db.queryOne<{ id: string }>({
          text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?',
          params: [input.assignedGroupId, profile.companyId],
        })
        if (!group) return { error: 'GROUP_NOT_FOUND' as const }
        sets.push('assigned_group_id = ?')
        params.push(input.assignedGroupId)
        if (ticket.status === 'pending_assignment' && (!input.status || input.status === 'pending_processing')) {
          sets.push('status = ?')
          params.push('pending_processing' as TicketStatus)
        }
      }
      if (input.status) {
        sets.push('status = ?')
        params.push(input.status)
      }
      params.push(ticketId, profile.companyId)
      await db.run({ text: `UPDATE tickets SET ${sets.join(', ')} WHERE id = ? AND company_id = ?`, params })
      await recordAudit(audit, TicketAuditEventType.updated, profile.userId, profile.displayName, 'ticket', ticketId, {
        slaPriority: input.slaPriority, assignedGroupId: input.assignedGroupId, status: input.status,
      })
      return { ok: true as const }
    },

    async addReply(profile: UserProfile, ticketId: string, content: string): Promise<ErrorResult | CreateReplyResponse> {
      const ticket = await db.queryOne<{ id: string }>({
        text: 'SELECT id FROM tickets WHERE id = ? AND company_id = ?',
        params: [ticketId, profile.companyId],
      })
      if (!ticket) return { error: 'TICKET_NOT_FOUND' as const }

      const id = randomUUID()
      const ts = now()
      await db.run({
        text: 'INSERT INTO ticket_replies (id, ticket_id, replier_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [id, ticketId, profile.userId, content, ts],
      })
      await recordAudit(audit, TicketAuditEventType.replyAdded, profile.userId, profile.displayName, 'ticket', ticketId, { replyId: id })
      return { id, ticketId, replierId: profile.userId, replierName: profile.displayName, content, createdAt: ts }
    },

    async transferTicket(profile: UserProfile, ticketId: string, toGroupId: string, reason: string | null): Promise<TicketTransferView | { error: string }> {
      const ticket = await db.queryOne<{ id: string; status: TicketStatus; assigned_group_id: string | null }>({
        text: 'SELECT id, status, assigned_group_id FROM tickets WHERE id = ? AND company_id = ?',
        params: [ticketId, profile.companyId],
      })
      if (!ticket) return { error: 'TICKET_NOT_FOUND' }
      if (ticket.status !== 'pending_processing') return { error: 'TICKET_NOT_PENDING_PROCESSING' }

      const target = await db.queryOne<{ id: string }>({
        text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?',
        params: [toGroupId, profile.companyId],
      })
      if (!target) return { error: 'GROUP_NOT_FOUND' }

      const id = randomUUID()
      const ts = now()
      await db.transaction(async (tx) => {
        await tx.run({
          text: 'INSERT INTO ticket_transfers (id, ticket_id, from_group_id, to_group_id, transferred_by, transferred_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
          params: [id, ticketId, ticket.assigned_group_id, toGroupId, profile.userId, ts, reason],
        })
        await tx.run({
          text: 'UPDATE tickets SET assigned_group_id = ?, updated_at = ? WHERE id = ? AND company_id = ?',
          params: [toGroupId, ts, ticketId, profile.companyId],
        })
      })
      await recordAudit(audit, TicketAuditEventType.transferred, profile.userId, profile.displayName, 'ticket', ticketId, {
        fromGroupId: ticket.assigned_group_id, toGroupId, reason,
      })
      return { id, ticketId, fromGroupId: ticket.assigned_group_id, toGroupId, transferredBy: profile.userId, transferredAt: ts, reason }
    },

    async completeTicket(profile: UserProfile, ticketId: string, summary: string | null): Promise<CompleteTicketResponse | { error: string }> {
      const ticket = await db.queryOne<{ id: string; status: TicketStatus; submitter_id: string }>({
        text: 'SELECT id, status, submitter_id FROM tickets WHERE id = ? AND company_id = ?',
        params: [ticketId, profile.companyId],
      })
      if (!ticket) return { error: 'TICKET_NOT_FOUND' }
      if (ticket.status !== 'pending_processing') return { error: 'TICKET_NOT_PENDING_PROCESSING' }

      const submitter = await db.queryOne<{ display_name: string; email: string }>({
        text: 'SELECT display_name, email FROM user_profiles WHERE user_id = ?',
        params: [ticket.submitter_id],
      })

      const recordId = randomUUID()
      const ts = now()
      await db.transaction(async (tx) => {
        await tx.run({
          text: 'UPDATE tickets SET status = ?, handler_id = ?, updated_at = ? WHERE id = ? AND company_id = ?',
          params: ['completed', profile.userId, ts, ticketId, profile.companyId],
        })
        await tx.run({
          text: 'INSERT INTO processing_records (id, ticket_id, handler_id, processed_at) VALUES (?, ?, ?, ?)',
          params: [recordId, ticketId, profile.userId, ts],
        })
      })

      await recordAudit(audit, TicketAuditEventType.completed, profile.userId, profile.displayName, 'ticket', ticketId, {
        processingRecordId: recordId, summary,
      })

      let emailSent = false
      try {
        const result = await email.send({
          to: submitter?.email ?? '',
          subject: `工单已完成：${ticketId}`,
          text: `您的工单 ${ticketId} 已处理完成。处理人：${profile.displayName}。${summary ? `\n处理总结：${summary}` : ''}`,
        })
        emailSent = result.status === 'sent'
        await recordAudit(audit, emailSent ? TicketAuditEventType.emailSent : TicketAuditEventType.emailSendFailed, profile.userId, profile.displayName, 'ticket', ticketId, {
          recipient: submitter?.email ?? null, status: result.status,
        })
      } catch (err) {
        await recordAudit(audit, TicketAuditEventType.emailSendFailed, profile.userId, profile.displayName, 'ticket', ticketId, {
          recipient: submitter?.email ?? null, message: err instanceof Error ? err.message : 'unknown',
        })
      }

      return {
        id: recordId,
        ticketId,
        handlerId: profile.userId,
        handlerName: profile.displayName,
        processedAt: ts,
        emailSent,
        ticketStatus: 'completed',
      }
    },

    async getSubmitterInfo(profile: UserProfile, ticketId: string): Promise<SubmitterInfo | { error: string }> {
      const ticket = await db.queryOne<{ submitter_id: string }>({
        text: 'SELECT submitter_id FROM tickets WHERE id = ? AND company_id = ?',
        params: [ticketId, profile.companyId],
      })
      if (!ticket) return { error: 'TICKET_NOT_FOUND' }
      const submitterId = ticket.submitter_id

      const submitter = await db.queryOne<{ display_name: string; email: string; company_name: string; department_name: string | null }>({
        text: `SELECT p.display_name, p.email, c.name AS company_name, d.name AS department_name
          FROM user_profiles p
          LEFT JOIN companies c ON c.id = p.company_id
          LEFT JOIN departments d ON d.id = p.department_id
          WHERE p.user_id = ? AND p.company_id = ?`,
        params: [submitterId, profile.companyId],
      })
      if (!submitter) return { error: 'SUBMITTER_NOT_FOUND' }

      const history = await db.queryAll<{
        id: string; subject: string; status: TicketStatus; sla_priority: SlaPriority; created_at: string; updated_at: string
      }>({
        text: `SELECT id, subject, status, sla_priority, created_at, updated_at FROM tickets WHERE submitter_id = ? AND company_id = ? ORDER BY created_at DESC`,
        params: [submitterId, profile.companyId],
      })

      return {
        userId: submitterId,
        displayName: submitter.display_name,
        email: submitter.email,
        companyName: submitter.company_name,
        departmentName: submitter.department_name,
        historyTickets: history.map((h) => ({
          id: h.id, subject: h.subject, status: h.status, slaPriority: h.sla_priority, createdAt: h.created_at, updatedAt: h.updated_at,
        })),
      }
    },

    async createRating(profile: UserProfile, ticketId: string, rating: number, comment: string | null): Promise<ErrorResult | SatisfactionRatingView> {
      const ticket = await db.queryOne<{ id: string; status: TicketStatus; submitter_id: string }>({
        text: 'SELECT id, status, submitter_id FROM tickets WHERE id = ? AND company_id = ?',
        params: [ticketId, profile.companyId],
      })
      if (!ticket) return { error: 'TICKET_NOT_FOUND' as const }
      if (ticket.status !== 'completed') return { error: 'TICKET_NOT_COMPLETED' as const }
      if (ticket.submitter_id !== profile.userId) return { error: 'FORBIDDEN' as const }

      const existing = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM satisfaction_ratings WHERE ticket_id = ?', params: [ticketId] })
      if (existing) return { error: 'RATING_ALREADY_EXISTS' as const }

      const id = randomUUID()
      const ts = now()
      await db.run({
        text: 'INSERT INTO satisfaction_ratings (id, ticket_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [id, ticketId, rating, comment, ts],
      })
      await recordAudit(audit, TicketAuditEventType.rated, profile.userId, profile.displayName, 'ticket', ticketId, { rating, comment })
      return { id, ticketId, rating, comment, createdAt: ts }
    },

    async listBusinessGroups(companyId: string): Promise<{ items: BusinessGroupView[] }> {
      const groups = await db.queryAll<{ id: string; name: string; company_id: string; created_at: string }>({
        text: 'SELECT id, name, company_id, created_at FROM business_groups WHERE company_id = ? ORDER BY created_at ASC',
        params: [companyId],
      })
      const items: BusinessGroupView[] = []
      for (const group of groups) {
        const members = await db.queryAll<{ id: string; user_id: string; display_name: string }>({
          text: `SELECT m.id, m.user_id, p.display_name FROM business_group_members m
            LEFT JOIN user_profiles p ON p.user_id = m.user_id WHERE m.group_id = ? ORDER BY m.created_at ASC`,
          params: [group.id],
        })
        items.push({
          id: group.id, name: group.name, companyId: group.company_id,
          memberCount: members.length,
          members: members.map((m) => ({ id: m.id, userId: m.user_id, displayName: m.display_name })),
          createdAt: group.created_at,
        })
      }
      return { items }
    },

    async createBusinessGroup(profile: UserProfile, name: string) {
      const id = randomUUID()
      const ts = now()
      await db.run({
        text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
        params: [id, profile.companyId, name, ts],
      })
      await recordAudit(audit, TicketAuditEventType.businessGroupCreated, profile.userId, profile.displayName, 'business_group', id, { name })
      return { id, name, companyId: profile.companyId, createdAt: ts }
    },

    async updateBusinessGroupMembers(profile: UserProfile, groupId: string, memberUserIds: string[]): Promise<ErrorResult | UpdateBusinessGroupMembersResult> {
      const group = await db.queryOne<{ id: string; name: string }>({
        text: 'SELECT id, name FROM business_groups WHERE id = ? AND company_id = ?',
        params: [groupId, profile.companyId],
      })
      if (!group) return { error: 'GROUP_NOT_FOUND' as const }

      const ts = now()
      await db.transaction(async (tx) => {
        await tx.run({ text: 'DELETE FROM business_group_members WHERE group_id = ?', params: [groupId] })
        for (const userId of memberUserIds) {
          await tx.run({
            text: 'INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)',
            params: [randomUUID(), groupId, userId, ts],
          })
        }
      })
      await recordAudit(audit, TicketAuditEventType.businessGroupMembersUpdated, profile.userId, profile.displayName, 'business_group', groupId, { memberCount: memberUserIds.length })

      const members = await db.queryAll<{ id: string; user_id: string; display_name: string }>({
        text: `SELECT m.id, m.user_id, p.display_name FROM business_group_members m
          LEFT JOIN user_profiles p ON p.user_id = m.user_id WHERE m.group_id = ? ORDER BY m.created_at ASC`,
        params: [groupId],
      })
      return {
        id: groupId, name: group.name,
        members: members.map((m) => ({ id: m.id, userId: m.user_id, displayName: m.display_name })),
      }
    },

    async listCategoryRules(companyId: string): Promise<{ items: CategoryAssignmentRuleView[] }> {
      const rows = await db.queryAll<{
        id: string; company_id: string; category_id: string; category_name: string
        target_group_id: string; target_group_name: string; created_at: string
      }>({
        text: `SELECT r.id, r.company_id, r.category_id, c.name AS category_name, r.target_group_id, bg.name AS target_group_name, r.created_at
          FROM category_assignment_rules r
          LEFT JOIN categories c ON c.id = r.category_id
          LEFT JOIN business_groups bg ON bg.id = r.target_group_id
          WHERE r.company_id = ? ORDER BY r.created_at ASC`,
        params: [companyId],
      })
      return {
        items: rows.map((r) => ({
          id: r.id, companyId: r.company_id, categoryId: r.category_id, categoryName: r.category_name,
          targetGroupId: r.target_group_id, targetGroupName: r.target_group_name, createdAt: r.created_at,
        })),
      }
    },

    async createCategoryRule(profile: UserProfile, categoryId: string, targetGroupId: string): Promise<ErrorResult | CreateCategoryRuleResult> {
      const existing = await db.queryOne<{ id: string }>({
        text: 'SELECT id FROM category_assignment_rules WHERE company_id = ? AND category_id = ?',
        params: [profile.companyId, categoryId],
      })
      if (existing) return { error: 'RULE_ALREADY_EXISTS' as const }

      const group = await db.queryOne<{ id: string }>({
        text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?',
        params: [targetGroupId, profile.companyId],
      })
      if (!group) return { error: 'GROUP_NOT_FOUND' as const }

      const id = randomUUID()
      const ts = now()
      await db.run({
        text: 'INSERT INTO category_assignment_rules (id, company_id, category_id, target_group_id, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [id, profile.companyId, categoryId, targetGroupId, ts],
      })
      await recordAudit(audit, TicketAuditEventType.categoryRuleCreated, profile.userId, profile.displayName, 'category_rule', id, { categoryId, targetGroupId })
      return { id, companyId: profile.companyId, categoryId, targetGroupId, createdAt: ts }
    },

    async statisticsDistribution(profile: UserProfile, dimension: 'company' | 'department', statusFilter: string | null, isAdmin: boolean, companyIdOverride: string | null): Promise<StatisticsDistributionResponse> {
      const statuses: TicketStatus[] = ['created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled']
      const companyId = isAdmin && companyIdOverride ? companyIdOverride : profile.companyId

      if (dimension === 'company') {
        const rows = await db.queryAll<{ dimension_id: string; dimension_name: string; status: TicketStatus; ticket_count: number }>({
          text: `SELECT t.company_id AS dimension_id, c.name AS dimension_name, t.status, COUNT(*) AS ticket_count
            FROM tickets t LEFT JOIN companies c ON c.id = t.company_id
            WHERE (? IS NULL OR t.company_id = ?) ${statusFilter ? 'AND t.status = ?' : ''}
            GROUP BY t.company_id, c.name, t.status`,
          params: statusFilter ? [companyIdOverride ?? null, companyIdOverride ?? null, statusFilter] : [companyIdOverride ?? null, companyIdOverride ?? null],
        })
        return { dimension, items: aggregateDistribution(rows, companyId, isAdmin, statuses) }
      }

      const rows = await db.queryAll<{ dimension_id: string; dimension_name: string; status: TicketStatus; ticket_count: number }>({
        text: `SELECT p.department_id AS dimension_id, d.name AS dimension_name, t.status, COUNT(*) AS ticket_count
          FROM tickets t
          LEFT JOIN user_profiles p ON p.user_id = t.submitter_id
          LEFT JOIN departments d ON d.id = p.department_id
          WHERE t.company_id = ? ${statusFilter ? 'AND t.status = ?' : ''}
          GROUP BY p.department_id, d.name, t.status`,
        params: statusFilter ? [companyId, statusFilter] : [companyId],
      })
      return { dimension, items: aggregateDistribution(rows, companyId, isAdmin, statuses) }
    },

    async statisticsDashboard(profile: UserProfile, isAdmin: boolean, companyIdOverride: string | null, startDate: string | null, endDate: string | null): Promise<StatisticsDashboardResponse> {
      const companyId = isAdmin && companyIdOverride ? companyIdOverride : profile.companyId
      const dateWhere = (col: string) => {
        const parts: string[] = []
        if (startDate) parts.push(`${col} >= ?`)
        if (endDate) parts.push(`${col} <= ?`)
        return parts.length ? `AND ${parts.join(' AND ')}` : ''
      }
      const dateParams = () => {
        const p: unknown[] = []
        if (startDate) p.push(startDate)
        if (endDate) p.push(endDate)
        return p
      }

      const totalRow = await db.queryOne<{ total: number; pending: number; completed: number }>({
        text: `SELECT COUNT(*) AS total,
          SUM(CASE WHEN status IN ('created','pending_assignment','pending_processing') THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
          FROM tickets WHERE company_id = ? ${dateWhere('created_at')}`,
        params: [companyId, ...dateParams()],
      })

      const byPriorityRows = await db.queryAll<{ sla_priority: SlaPriority; ticket_count: number }>({
        text: `SELECT sla_priority, COUNT(*) AS ticket_count FROM tickets WHERE company_id = ? ${dateWhere('created_at')} GROUP BY sla_priority`,
        params: [companyId, ...dateParams()],
      })
      const byPriority = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0 } as Record<SlaPriority, number>
      for (const row of byPriorityRows) byPriority[row.sla_priority] = Number(row.ticket_count)

      const hotRows = await db.queryAll<{ category_id: string; category_name: string; ticket_count: number }>({
        text: `SELECT t.category_id, c.name AS category_name, COUNT(*) AS ticket_count
          FROM tickets t LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.company_id = ? ${dateWhere('t.created_at')} GROUP BY t.category_id, c.name ORDER BY ticket_count DESC LIMIT 5`,
        params: [companyId, ...dateParams()],
      })

      const responseRow = await db.queryOne<{ avg_minutes: number | null }>({
        text: `SELECT AVG((julianday(r.created_at) - julianday(t.created_at)) * 24 * 60) AS avg_minutes
          FROM ticket_replies r JOIN tickets t ON t.id = r.ticket_id
          WHERE t.company_id = ? AND r.id = (SELECT MIN(id) FROM ticket_replies WHERE ticket_id = t.id)`,
        params: [companyId],
      })

      const ratingRow = await db.queryOne<{ avg_rating: number | null }>({
        text: `SELECT AVG(sr.rating) AS avg_rating FROM satisfaction_ratings sr JOIN tickets t ON t.id = sr.ticket_id WHERE t.company_id = ?`,
        params: [companyId],
      })

      return {
        totalTickets: Number(totalRow?.total ?? 0),
        pendingTickets: Number(totalRow?.pending ?? 0),
        completedTickets: Number(totalRow?.completed ?? 0),
        averageResponseTimeMinutes: responseRow?.avg_minutes != null ? Math.round(Number(responseRow.avg_minutes) * 100) / 100 : 0,
        averageSatisfactionScore: ratingRow?.avg_rating != null ? Math.round(Number(ratingRow.avg_rating) * 100) / 100 : 0,
        hotCategories: hotRows.map((r) => ({ categoryId: r.category_id, categoryName: r.category_name, ticketCount: Number(r.ticket_count) })),
        byPriority,
      }
    },

    listWorkbench(companyId: string, filters: ListTicketFilters) {
      return listTickets(db, companyId, { ...filters, fixedStatus: 'pending_processing' })
    },

    async listAuditLogs(filters: { ticketId?: string; eventType?: string; actorId?: string; page?: number; pageSize?: number }) {
      const page = Math.max(Number(filters.page) || 1, 1)
      const pageSize = Math.min(Math.max(Number(filters.pageSize) || 50, 1), 100)
      const offset = (page - 1) * pageSize
      const where: string[] = []
      const params: unknown[] = []
      if (filters.eventType) { where.push('event_type = ?'); params.push(filters.eventType) }
      if (filters.actorId) { where.push('actor_user_id = ?'); params.push(filters.actorId) }
      if (filters.ticketId) { where.push("json_extract(metadata_json, '$.entityId') = ?"); params.push(filters.ticketId) }
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

      const totalRow = await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM audit_events ${whereClause}`, params })
      const rows = await db.queryAll<{ id: string; occurred_at: string; event_type: string; actor_user_id: string | null; metadata_json: string }>({
        text: `SELECT id, occurred_at, event_type, actor_user_id, metadata_json FROM audit_events ${whereClause} ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`,
        params: [...params, pageSize, offset],
      })

      const items = rows.map((row) => {
        const meta = JSON.parse(row.metadata_json ?? '{}') as Record<string, unknown>
        return {
          id: row.id,
          eventType: row.event_type,
          entityType: String(meta.entityType ?? ''),
          entityId: String(meta.entityId ?? ''),
          actorId: row.actor_user_id ?? '',
          actorName: String(meta.actorName ?? ''),
          payload: meta,
          createdAt: row.occurred_at,
        }
      })
      return { items, total: Number(totalRow?.total ?? 0), page, pageSize }
    },
  }
}

interface DistributionRow {
  dimension_id: string | null
  dimension_name: string | null
  status: TicketStatus
  ticket_count: number
}

function aggregateDistribution(rows: DistributionRow[], scopeCompanyId: string, isAdmin: boolean, statuses: TicketStatus[]) {
  const map = new Map<string, { dimensionId: string; dimensionName: string; byStatus: Record<TicketStatus, number>; total: number }>()
  for (const row of rows) {
    // 非管理员公司维度：仅保留自身公司（已由 SQL 过滤）；空维度归入“未分配部门”。
    const dimId = row.dimension_id ?? 'unassigned'
    const dimName = row.dimension_name ?? (dimId === 'unassigned' ? '未分配部门' : dimId)
    let entry = map.get(dimId)
    if (!entry) {
      const byStatus = { created: 0, pending_assignment: 0, pending_processing: 0, completed: 0, cancelled: 0 } as Record<TicketStatus, number>
      entry = { dimensionId: dimId, dimensionName: dimName, byStatus, total: 0 }
      map.set(dimId, entry)
    }
    entry.byStatus[row.status] = Number(row.ticket_count)
    entry.total += Number(row.ticket_count)
  }
  return Array.from(map.values()).map((e) => ({
    dimensionId: e.dimensionId,
    dimensionName: e.dimensionName,
    ticketCount: e.total,
    byStatus: statuses.reduce((acc, s) => { acc[s] = e.byStatus[s] ?? 0; return acc }, {} as Record<TicketStatus, number>),
  }))
}
