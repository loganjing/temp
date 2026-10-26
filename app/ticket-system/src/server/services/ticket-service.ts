import type { BusinessServices, Session } from './modules'
import { BusinessError, ensureProjectSchema, ensurePermissionRegistry } from './modules'
import { createTicketRepository } from '../repositories/tickets'
import { createGroupRepository } from '../repositories/groups'
import { createCompanyRepository } from '../repositories/company'
import type {
  TicketRecord,
  TicketReplyRecord,
  TicketTransferRecord,
  TicketEvaluationRecord,
  BusinessGroupRecord,
  BusinessGroupMemberRecord,
  AssignmentRuleRecord,
  SubmitterInfo,
  DashboardMetrics,
  DistributionResponse,
  TicketPriority,
} from '../../shared/types'

const PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3', 'P4'])

function assertPriority(value: unknown): TicketPriority {
  if (typeof value !== 'string' || !PRIORITIES.has(value)) throw new BusinessError(400, 'INVALID_REQUEST', 'priority must be one of P0-P4')
  return value as TicketPriority
}

function requireNonEmpty(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== 'string' || !value.trim()) throw new BusinessError(400, 'INVALID_REQUEST', `${field} is required`)
  if (value.length > maxLength) throw new BusinessError(400, 'INVALID_REQUEST', `${field} is too long`)
  return value.trim()
}

export interface PaginationInput {
  page?: number
  limit?: number
}

function parsePagination(query: Record<string, string | undefined>): { page: number; limit: number } {
  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20) || 20))
  return { page, limit }
}

export interface TicketService {
  ensureReady(): Promise<void>

  createTicket(session: Session, input: { subject: string; description: string; category: string; priority: TicketPriority }): Promise<TicketRecord>
  listTickets(session: Session, query: Record<string, string | undefined>, isAdminCrossCompany: boolean): Promise<{ rows: TicketRecord[]; total: number; page: number; limit: number }>
  getTicket(session: Session, id: string): Promise<TicketRecord>
  updateTicket(session: Session, id: string, input: { subject?: string; description?: string; category?: string; priority?: TicketPriority }): Promise<TicketRecord>
  changeStatus(session: Session, id: string, action: 'assign' | 'process' | 'complete' | 'cancel', opts: { assigned_group_id?: string; assigned_handler_id?: string; reason?: string }): Promise<TicketRecord>
  addReply(session: Session, id: string, content: string): Promise<TicketReplyRecord>
  listReplies(session: Session, id: string): Promise<TicketReplyRecord[]>
  getSubmitterInfo(session: Session, id: string): Promise<SubmitterInfo>
  transferTicket(session: Session, id: string, opts: { to_handler_id?: string; to_group_id?: string; reason?: string }): Promise<TicketRecord>
  completeTicket(session: Session, id: string): Promise<TicketRecord>
  cancelTicket(session: Session, id: string, reason?: string): Promise<TicketRecord>
  submitEvaluation(session: Session, id: string, rating: number, comment?: string): Promise<TicketEvaluationRecord>
  getEvaluation(session: Session, id: string): Promise<TicketEvaluationRecord | null>

  createBusinessGroup(session: Session, company_id: string, name: string): Promise<BusinessGroupRecord>
  listBusinessGroups(session: Session, company_id?: string): Promise<BusinessGroupRecord[]>
  addGroupMember(session: Session, group_id: string, user_id: string): Promise<BusinessGroupMemberRecord>
  listGroupMembers(session: Session, group_id: string): Promise<BusinessGroupMemberRecord[]>
  removeGroupMember(session: Session, group_id: string, user_id: string): Promise<void>
  createAssignmentRule(session: Session, company_id: string, category: string, business_group_id: string): Promise<AssignmentRuleRecord>
  listAssignmentRules(session: Session, company_id?: string): Promise<AssignmentRuleRecord[]>
  deleteAssignmentRule(session: Session, id: string): Promise<void>

  getDashboard(session: Session, query: Record<string, string | undefined>): Promise<DashboardMetrics>
  getDistribution(session: Session, group_by: string): Promise<DistributionResponse>
  getWorkbenchTickets(session: Session, query: Record<string, string | undefined>): Promise<{ rows: TicketRecord[]; total: number; page: number; limit: number }>

  getTicketLogs(session: Session, id: string): Promise<Array<{ id: string; action: string; actor_id: string; created_at: string }>>
  listLogs(session: Session, query: Record<string, string | undefined>): Promise<{ rows: Array<{ id: string; action: string; actor_id: string | null; created_at: string }>; total: number; page: number; limit: number }>
}

export function createTicketService(services: BusinessServices): TicketService {
  const { db, permissionKit, auditKit, emailClient, userStore } = services
  const tickets = createTicketRepository(db)
  const groups = createGroupRepository(db)
  const company = createCompanyRepository(db)

  let ready: Promise<void> | null = null
  const ensureReady = () => {
    if (ready) return ready
    ready = (async () => {
      await ensureProjectSchema(db)
      await ensurePermissionRegistry(permissionKit)
    })().catch((error) => { ready = null; throw error })
    return ready
  }

  async function recordAudit(event: { type: string; actorUserId: string; metadata?: Record<string, unknown> }, requestId?: string) {
    await auditKit.record({ type: event.type, actorUserId: event.actorUserId, requestId, metadata: event.metadata ?? {} })
  }

  // Resolve a ticket within the caller's company scope; 404 when missing or cross-company.
  async function loadScopedTicket(session: Session, id: string): Promise<TicketRecord> {
    const ticket = await tickets.getTicket(id)
    if (!ticket) throw new BusinessError(404, 'NOT_FOUND', 'Ticket not found')
    if (ticket.company_id !== session.companyId) throw new BusinessError(403, 'FORBIDDEN', 'Cannot access ticket from another company')
    return ticket
  }

  const service: TicketService = {
    ensureReady,

    async createTicket(session, input) {
      const subject = requireNonEmpty(input.subject, 'subject')
      const description = requireNonEmpty(input.description, 'description', 10000)
      const category = requireNonEmpty(input.category, 'category')
      const priority = assertPriority(input.priority)
      // Auto-assignment: match company_id + category against assignment_rules.
      const rule = await groups.findRule(session.companyId, category)
      const assignedGroupId = rule?.business_group_id ?? null
      const status = assignedGroupId ? 'pending_processing' : 'pending_assignment'
      const firstAssignedAt = assignedGroupId ? new Date().toISOString() : null
      const ticket = await tickets.createTicket({
        company_id: session.companyId, subject, description, category, priority,
        submitter_id: session.userId, status, assigned_group_id: assignedGroupId, first_assigned_at: firstAssignedAt,
      })
      await recordAudit({ type: 'ticket.created', actorUserId: session.userId, metadata: { ticket_id: ticket.id, category, priority } })
      if (assignedGroupId) await recordAudit({ type: 'ticket.assigned', actorUserId: session.userId, metadata: { ticket_id: ticket.id, business_group_id: assignedGroupId } })
      return ticket
    },

    async listTickets(session, query, isAdminCrossCompany) {
      const { page, limit } = parsePagination(query)
      // Admin may pass company_id to filter across companies; non-admin always scoped to own company.
      const companyId = isAdminCrossCompany && query.company_id ? query.company_id : session.companyId
      const { rows, total } = await tickets.listTickets({
        companyId, status: query.status, category: query.category, priority: query.priority,
        search: query.search, sort: query.sort, order: query.order, page, limit,
      })
      return { rows, total, page, limit }
    },

    async getTicket(session, id) {
      return loadScopedTicket(session, id)
    },

    async updateTicket(session, id, input) {
      const ticket = await loadScopedTicket(session, id)
      const isOwner = ticket.submitter_id === session.userId
      if (!(session.roles.includes('admin') || (session.roles.includes('submitter') && isOwner))) {
        throw new BusinessError(403, 'FORBIDDEN', 'Only the submitter or an admin can edit this ticket')
      }
      if (!['created', 'pending_assignment'].includes(ticket.status)) {
        throw new BusinessError(409, 'CONFLICT', 'Ticket can only be edited before assignment')
      }
      const fields: { subject?: string; description?: string; category?: string; priority?: TicketPriority } = {}
      if (input.subject !== undefined) fields.subject = requireNonEmpty(input.subject, 'subject')
      if (input.description !== undefined) fields.description = requireNonEmpty(input.description, 'description', 10000)
      if (input.category !== undefined) fields.category = requireNonEmpty(input.category, 'category')
      if (input.priority !== undefined) fields.priority = assertPriority(input.priority)
      await tickets.updateTicket(id, fields)
      const updated = await tickets.getTicket(id)
      return updated as TicketRecord
    },

    async changeStatus(session, id, action, opts) {
      const ticket = await loadScopedTicket(session, id)
      if (action === 'assign') {
        if (!session.roles.includes('handler') && !session.roles.includes('admin')) throw new BusinessError(403, 'FORBIDDEN', 'Only handler or admin can assign')
        if (!['created', 'pending_assignment'].includes(ticket.status)) throw new BusinessError(409, 'CONFLICT', 'Ticket cannot be assigned from its current status')
        const assignedGroupId = opts.assigned_group_id ?? null
        const assignedHandlerId = opts.assigned_handler_id ?? null
        const firstAssignedAt = ticket.first_assigned_at ?? new Date().toISOString()
        await tickets.setStatus(id, 'pending_processing', { assigned_group_id: assignedGroupId, assigned_handler_id: assignedHandlerId, first_assigned_at: firstAssignedAt })
        await recordAudit({ type: 'ticket.assigned', actorUserId: session.userId, metadata: { ticket_id: id, assigned_group_id: assignedGroupId, assigned_handler_id: assignedHandlerId } })
      } else if (action === 'process') {
        if (!session.roles.includes('handler') && !session.roles.includes('admin')) throw new BusinessError(403, 'FORBIDDEN', 'Only handler or admin can process')
        if (ticket.status !== 'pending_processing') throw new BusinessError(409, 'CONFLICT', 'Only pending_processing tickets can be processed')
        if (opts.assigned_handler_id !== undefined) {
          await tickets.setStatus(id, ticket.status, { assigned_handler_id: opts.assigned_handler_id })
        }
        await recordAudit({ type: 'ticket.processed', actorUserId: session.userId, metadata: { ticket_id: id } })
      } else if (action === 'complete') {
        if (!session.roles.includes('handler')) throw new BusinessError(403, 'FORBIDDEN', 'Only a handler can complete a ticket')
        if (ticket.status !== 'pending_processing') throw new BusinessError(409, 'CONFLICT', 'Only pending_processing tickets can be completed')
        const completedAt = new Date().toISOString()
        await tickets.setStatus(id, 'completed', { completed_at: completedAt, completed_by: session.userId })
        await recordAudit({ type: 'ticket.completed', actorUserId: session.userId, metadata: { ticket_id: id, completed_by: session.userId } })
      } else if (action === 'cancel') {
        if (!session.roles.includes('admin') && !(session.roles.includes('submitter') && ticket.submitter_id === session.userId)) {
          throw new BusinessError(403, 'FORBIDDEN', 'Only the submitter or an admin can cancel')
        }
        if (['completed', 'cancelled'].includes(ticket.status)) throw new BusinessError(409, 'CONFLICT', 'Completed or cancelled tickets cannot be cancelled')
        await tickets.setStatus(id, 'cancelled')
        await recordAudit({ type: 'ticket.cancelled', actorUserId: session.userId, metadata: { ticket_id: id, reason: opts.reason ?? null } })
      } else {
        throw new BusinessError(400, 'INVALID_REQUEST', 'Unknown status action')
      }
      const updated = await tickets.getTicket(id)
      return updated as TicketRecord
    },

    async addReply(session, id, content) {
      const ticket = await loadScopedTicket(session, id)
      const text = requireNonEmpty(content, 'content', 10000)
      const isOwner = ticket.submitter_id === session.userId
      const isAssignedHandler = ticket.assigned_handler_id === session.userId
      const inAssignedGroup = ticket.assigned_group_id ? await groups.memberExists(ticket.assigned_group_id, session.userId) : false
      if (!(session.roles.includes('admin') || (session.roles.includes('submitter') && isOwner) || (session.roles.includes('handler') && (isAssignedHandler || inAssignedGroup)))) {
        throw new BusinessError(403, 'FORBIDDEN', 'Not allowed to reply to this ticket')
      }
      const reply = await tickets.addReply(id, session.userId, text)
      return reply
    },

    async listReplies(session, id) {
      await loadScopedTicket(session, id)
      return tickets.listReplies(id)
    },

    async getSubmitterInfo(session, id) {
      const ticket = await loadScopedTicket(session, id)
      if (!session.roles.includes('handler') && !session.roles.includes('admin')) throw new BusinessError(403, 'FORBIDDEN', 'Only handler or admin can view submitter info')
      const user = await userStore.findById(ticket.submitter_id)
      if (!user) throw new BusinessError(404, 'NOT_FOUND', 'Submitter not found')
      const profile = await company.getProfile(ticket.submitter_id)
      const companyRow = await company.getCompany(ticket.company_id)
      const department = profile?.department_id ? await company.getDepartment(profile.department_id) : null
      const history = await tickets.listBySubmitter(ticket.submitter_id, ticket.company_id)
      return {
        display_name: profile?.display_name ?? user.name,
        email: user.email,
        company: { id: ticket.company_id, name: companyRow?.name ?? '' },
        department: { id: profile?.department_id ?? null, name: department?.name ?? null },
        history_tickets: history,
      }
    },

    async transferTicket(session, id, opts) {
      const ticket = await loadScopedTicket(session, id)
      if (!session.roles.includes('handler') && !session.roles.includes('admin')) throw new BusinessError(403, 'FORBIDDEN', 'Only handler or admin can transfer')
      if (ticket.status !== 'pending_processing') throw new BusinessError(409, 'CONFLICT', 'Only pending_processing tickets can be transferred')
      if (!opts.to_handler_id && !opts.to_group_id) throw new BusinessError(400, 'INVALID_REQUEST', 'Provide to_handler_id or to_group_id')
      await tickets.addTransfer({
        ticket_id: id,
        from_handler_id: ticket.assigned_handler_id,
        from_group_id: ticket.assigned_group_id,
        to_handler_id: opts.to_handler_id ?? null,
        to_group_id: opts.to_group_id ?? null,
        reason: opts.reason ?? null,
      })
      await tickets.setStatus(id, 'pending_processing', {
        assigned_handler_id: opts.to_handler_id ?? null,
        assigned_group_id: opts.to_group_id ?? ticket.assigned_group_id,
      })
      await recordAudit({ type: 'ticket.transferred', actorUserId: session.userId, metadata: { ticket_id: id, to_handler_id: opts.to_handler_id ?? null, to_group_id: opts.to_group_id ?? null } })
      const updated = await tickets.getTicket(id)
      return updated as TicketRecord
    },

    async completeTicket(session, id) {
      const ticket = await loadScopedTicket(session, id)
      if (!session.roles.includes('handler')) throw new BusinessError(403, 'FORBIDDEN', 'Only a handler can complete a ticket')
      if (ticket.status !== 'pending_processing') throw new BusinessError(409, 'CONFLICT', 'Only pending_processing tickets can be completed')
      const completedAt = new Date().toISOString()
      await tickets.setStatus(id, 'completed', { completed_at: completedAt, completed_by: session.userId })
      await recordAudit({ type: 'ticket.completed', actorUserId: session.userId, metadata: { ticket_id: id, completed_by: session.userId } })
      // Best-effort email notification to the submitter; failure does not roll back completion.
      const submitter = await userStore.findById(ticket.submitter_id)
      if (submitter?.email) {
        try {
          await emailClient.send({
            to: submitter.email,
            subject: `工单已完成：${ticket.subject}`,
            text: `您的工单 "${ticket.subject}"（编号 ${ticket.id}）已于 ${completedAt} 完成。`,
            html: `<p>您的工单 <strong>${ticket.subject}</strong>（编号 ${ticket.id}）已于 ${completedAt} 完成。</p>`,
          })
        } catch (error) {
          console.error('[tickets] completion email failed', error)
        }
      }
      const updated = await tickets.getTicket(id)
      return updated as TicketRecord
    },

    async cancelTicket(session, id, reason) {
      return service.changeStatus(session, id, 'cancel', { reason })
    },

    async submitEvaluation(session, id, rating, comment) {
      const ticket = await loadScopedTicket(session, id)
      if (!session.roles.includes('submitter') || ticket.submitter_id !== session.userId) {
        throw new BusinessError(403, 'FORBIDDEN', 'Only the submitter can evaluate this ticket')
      }
      if (ticket.status !== 'completed') throw new BusinessError(409, 'CONFLICT', 'Only completed tickets can be evaluated')
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new BusinessError(400, 'INVALID_REQUEST', 'rating must be an integer between 1 and 5')
      const existing = await tickets.getEvaluation(id)
      if (existing) throw new BusinessError(409, 'CONFLICT', 'Ticket already evaluated')
      return tickets.submitEvaluation(id, rating, comment ?? null)
    },

    async getEvaluation(session, id) {
      await loadScopedTicket(session, id)
      return tickets.getEvaluation(id)
    },

    async createBusinessGroup(session, company_id, name) {
      if (!session.roles.includes('admin')) throw new BusinessError(403, 'FORBIDDEN', 'Only admin can manage business groups')
      if (company_id !== session.companyId) throw new BusinessError(403, 'FORBIDDEN', 'Cannot create groups for another company')
      const groupName = requireNonEmpty(name, 'name')
      return groups.createGroup(company_id, groupName)
    },

    async listBusinessGroups(session, company_id) {
      if (!session.roles.includes('handler') && !session.roles.includes('admin')) throw new BusinessError(403, 'FORBIDDEN', 'Only handler or admin can list business groups')
      const target = company_id ?? session.companyId
      // Non-admin cannot cross companies.
      if (!session.roles.includes('admin') && target !== session.companyId) throw new BusinessError(403, 'FORBIDDEN', 'Cannot list groups for another company')
      return groups.listGroups(target)
    },

    async addGroupMember(session, group_id, user_id) {
      if (!session.roles.includes('admin')) throw new BusinessError(403, 'FORBIDDEN', 'Only admin can manage members')
      const group = await groups.getGroup(group_id)
      if (!group || group.company_id !== session.companyId) throw new BusinessError(404, 'NOT_FOUND', 'Business group not found')
      const targetUser = await userStore.findById(user_id)
      if (!targetUser) throw new BusinessError(404, 'NOT_FOUND', 'User not found')
      const result = await groups.addMember(group_id, user_id)
      if (!result.created) throw new BusinessError(409, 'CONFLICT', 'User already in this business group')
      return result.member as BusinessGroupMemberRecord
    },

    async listGroupMembers(session, group_id) {
      if (!session.roles.includes('handler') && !session.roles.includes('admin')) throw new BusinessError(403, 'FORBIDDEN', 'Only handler or admin can list members')
      const group = await groups.getGroup(group_id)
      if (!group || group.company_id !== session.companyId) throw new BusinessError(404, 'NOT_FOUND', 'Business group not found')
      return groups.listMembers(group_id)
    },

    async removeGroupMember(session, group_id, user_id) {
      if (!session.roles.includes('admin')) throw new BusinessError(403, 'FORBIDDEN', 'Only admin can remove members')
      const group = await groups.getGroup(group_id)
      if (!group || group.company_id !== session.companyId) throw new BusinessError(404, 'NOT_FOUND', 'Business group not found')
      const removed = await groups.removeMember(group_id, user_id)
      if (!removed) throw new BusinessError(404, 'NOT_FOUND', 'Member not found')
    },

    async createAssignmentRule(session, company_id, category, business_group_id) {
      if (!session.roles.includes('admin')) throw new BusinessError(403, 'FORBIDDEN', 'Only admin can manage assignment rules')
      if (company_id !== session.companyId) throw new BusinessError(403, 'FORBIDDEN', 'Cannot create rules for another company')
      const cat = requireNonEmpty(category, 'category')
      const group = await groups.getGroup(business_group_id)
      if (!group || group.company_id !== session.companyId) throw new BusinessError(404, 'NOT_FOUND', 'Business group not found')
      const existing = await groups.findRule(company_id, cat)
      if (existing) throw new BusinessError(409, 'CONFLICT', 'A rule already exists for this company and category')
      return groups.createRule(company_id, cat, business_group_id)
    },

    async listAssignmentRules(session, company_id) {
      if (!session.roles.includes('admin')) throw new BusinessError(403, 'FORBIDDEN', 'Only admin can list assignment rules')
      const target = company_id ?? session.companyId
      if (target !== session.companyId) throw new BusinessError(403, 'FORBIDDEN', 'Cannot list rules for another company')
      return groups.listRules(target)
    },

    async deleteAssignmentRule(session, id) {
      if (!session.roles.includes('admin')) throw new BusinessError(403, 'FORBIDDEN', 'Only admin can delete assignment rules')
      const deleted = await groups.deleteRule(id, session.companyId)
      if (!deleted) throw new BusinessError(404, 'NOT_FOUND', 'Assignment rule not found')
    },

    async getDashboard(session, query) {
      if (!session.roles.includes('admin') && !session.roles.includes('handler')) throw new BusinessError(403, 'FORBIDDEN', 'Only admin or handler can view dashboard')
      const companyId = session.roles.includes('admin') && query.company_id ? query.company_id : session.companyId
      // Non-admin cannot cross companies.
      if (!session.roles.includes('admin') && companyId !== session.companyId) throw new BusinessError(403, 'FORBIDDEN', 'Cannot view dashboard for another company')
      const startDate = query.start_date ?? null
      const endDate = query.end_date ?? null
      const departmentId = query.department_id ?? null
      const [ticket_count, avg_response_time_hours, avg_satisfaction, hot_topics] = await Promise.all([
        tickets.countTickets(companyId, departmentId, startDate, endDate),
        tickets.avgResponseHours(companyId, startDate, endDate),
        tickets.avgSatisfaction(companyId, startDate, endDate),
        tickets.hotTopics(companyId, startDate, endDate, 10),
      ])
      return { ticket_count, avg_response_time_hours, avg_satisfaction, hot_topics }
    },

    async getDistribution(session, group_by) {
      if (!session.roles.includes('admin')) throw new BusinessError(403, 'FORBIDDEN', 'Only admin can view distribution')
      const distribution = group_by === 'department' ? await tickets.distributionByDepartment() : await tickets.distributionByCompany()
      return { distribution }
    },

    async getWorkbenchTickets(session, query) {
      if (!session.roles.includes('handler') && !session.roles.includes('admin')) throw new BusinessError(403, 'FORBIDDEN', 'Only handler or admin can view the workbench')
      const { page, limit } = parsePagination(query)
      const status = query.status ?? 'pending_processing'
      const companyId = session.roles.includes('admin') && query.company_id ? query.company_id : session.companyId
      if (!session.roles.includes('admin') && companyId !== session.companyId) throw new BusinessError(403, 'FORBIDDEN', 'Cannot view workbench for another company')
      if (session.roles.includes('admin')) {
        const { rows, total } = await tickets.listTickets({
          companyId, status, category: query.category, priority: query.priority,
          search: query.search, sort: query.sort, order: query.order, page, limit,
        })
        return { rows, total, page, limit }
      }
      // Handler: only tickets assigned to self or to a group they belong to.
      const groupIds = await groups.groupsForUser(session.userId)
      const { rows, total } = await tickets.listTicketsByCompanyOrGroups(companyId, groupIds, session.userId, {
        companyId, status, category: query.category, priority: query.priority,
        search: query.search, sort: query.sort, order: query.order, page, limit,
      })
      return { rows, total, page, limit }
    },

    async getTicketLogs(session, id) {
      await loadScopedTicket(session, id)
      // auditkit.list filters by actor/eventType; fetch a window and filter by metadata.ticket_id.
      const all = await auditKit.list({ limit: 100 })
      return all
        .filter((event) => {
          const meta = event.metadata as Record<string, unknown> | undefined
          return event.type.startsWith('ticket.') && meta?.ticket_id === id
        })
        .map((event) => ({ id: event.id, action: event.type, actor_id: event.actorUserId ?? '', created_at: event.occurredAt ?? '' }))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
    },

    async listLogs(session, query) {
      if (!session.roles.includes('admin')) throw new BusinessError(403, 'FORBIDDEN', 'Only admin can view global logs')
      const page = Math.max(1, Number(query.page ?? 1) || 1)
      const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20) || 20))
      const action = query.action || undefined
      const offset = (page - 1) * limit
      // auditkit caps limit at 100; admin-only global event list.
      const rows = await auditKit.list({ eventType: action, limit, offset })
      return {
        rows: rows.map((event) => ({ id: event.id, action: event.type, actor_id: event.actorUserId ?? null, created_at: event.occurredAt ?? '' })),
        total: rows.length,
        page,
        limit,
      }
    },
  }

  return service
}
