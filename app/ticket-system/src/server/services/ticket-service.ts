import type { DbClient } from '@commonapp/dbkit'
import type { EmailClient } from '@commonapp/emailkit'
import { createAuditKit } from '@commonapp/auditkit'
import type { UserStore } from '@commonapp/userkit'
import { createTicketRepository, type TicketRepository } from '../repositories/ticket-repository'
import { createOrganizationRepository, type OrganizationRepository } from '../repositories/organization-repository'
import { AUDIT_EVENT_TYPE, TICKET_STATUS } from '../../shared/constants'
import type {
  TicketCreateRequest, TicketCreateResponse, TicketDetail, TicketCompleteResponse,
  TicketTransferRequest, TicketTransferResponse, TicketCancelResponse,
  TicketEvaluationRequest, TicketEvaluationResponse, TicketReplyCreateResponse,
  TicketListResponse,
} from '../../shared/types'

type AuditKit = ReturnType<typeof createAuditKit>

interface PlatformDeps {
  db: DbClient
  auditKit: AuditKit
  email: EmailClient
  userStore: UserStore
}

export function createTicketService(deps: PlatformDeps) {
  const tickets = createTicketRepository(deps.db)
  const org = createOrganizationRepository(deps.db, deps.userStore)

  async function recordAudit(eventType: string, ticketId: string, actorUserId: string, metadata: Record<string, unknown> = {}): Promise<void> {
    await deps.auditKit.record({
      type: eventType,
      actorUserId,
      metadata: { ticketId, ...metadata },
    })
  }

  async function createTicket(input: TicketCreateRequest, submitterId: string, companyId: string): Promise<TicketCreateResponse> {
    const now = new Date().toISOString()
    const id = tickets.createId()
    const rule = await org.findRoutingRule(companyId, input.category)
    const businessGroupId = rule?.business_group_id ?? null
    const status = businessGroupId ? TICKET_STATUS.PENDING_PROCESSING : TICKET_STATUS.PENDING_ASSIGNMENT
    await tickets.insert({
      id, subject: input.subject, description: input.description ?? null,
      category: input.category, priority: input.priority, status, companyId, submitterId,
      businessGroupId, createdAt: now,
    })
    await recordAudit(AUDIT_EVENT_TYPE.TICKET_CREATED, id, submitterId, { subject: input.subject })
    if (businessGroupId) {
      await recordAudit(AUDIT_EVENT_TYPE.TICKET_ASSIGNED, id, submitterId, { businessGroupId })
    }
    return { id, subject: input.subject, category: input.category, priority: input.priority, status, companyId, submitterId, businessGroupId, createdAt: now }
  }

  async function getTicketDetail(id: string): Promise<TicketDetail | null> {
    const ticket = await tickets.findDetailById(id)
    if (!ticket) return null
    const [replies, evaluation, historicalTickets, logs, department] = await Promise.all([
      tickets.listReplies(id),
      tickets.findEvaluation(id),
      tickets.findHistoricalTickets(ticket.submitter_id, id),
      tickets.findTicketLogs(id),
      org.findUserDepartment(ticket.submitter_id),
    ])
    return {
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      companyId: ticket.company_id,
      submitter: {
        id: ticket.submitter_id,
        name: ticket.submitterName,
        email: ticket.submitterEmail,
        companyName: ticket.companyName,
        departmentName: department?.name ?? null,
        historicalTickets,
      },
      businessGroupId: ticket.business_group_id,
      businessGroupName: ticket.businessGroupName,
      assigneeId: ticket.assignee_id,
      assigneeName: ticket.assigneeName,
      handlerId: ticket.handler_id,
      handlerName: ticket.handlerName,
      createdAt: ticket.created_at,
      handledAt: ticket.handled_at,
      replies: replies.map((r) => ({
        id: r.id, replierId: r.replier_id, replierName: r.replierName,
        content: r.content, repliedAt: r.replied_at,
      })),
      evaluation: evaluation ? { rating: evaluation.rating, comment: evaluation.comment, evaluatedAt: evaluation.evaluated_at } : null,
      recentLogs: logs.map((l) => ({
        id: l.id, eventType: l.event_type, actorUserId: l.actor_user_id,
        occurredAt: l.occurred_at, metadata: JSON.parse(l.metadata_json),
      })),
    }
  }

  async function listTickets(filters: {
    companyId?: string; status?: string; priority?: string; category?: string
    search?: string; sort?: string; page?: number; pageSize?: number
  }): Promise<TicketListResponse> {
    return tickets.list(filters)
  }

  async function listWorkbenchTickets(filters: {
    companyId?: string; status?: string; priority?: string; category?: string
    search?: string; sort?: string; page?: number; pageSize?: number
    userId: string
  }): Promise<TicketListResponse> {
    const groupIds = await tickets.findUserBusinessGroupIds(filters.userId)
    return tickets.list({ ...filters, visibleToUserId: filters.userId, visibleToGroupIds: groupIds })
  }

  async function addReply(ticketId: string, replierId: string, content: string): Promise<TicketReplyCreateResponse | null> {
    const ticket = await tickets.findById(ticketId)
    if (!ticket) return null
    const now = new Date().toISOString()
    const id = tickets.createId()
    const reply = await tickets.insertReply({ id, ticketId, replierId, content, repliedAt: now })
    await recordAudit(AUDIT_EVENT_TYPE.TICKET_REPLIED, ticketId, replierId, { replyId: id })
    return {
      id: reply.id, ticketId: reply.ticket_id, replierId: reply.replier_id,
      replierName: reply.replierName, content: reply.content, repliedAt: reply.replied_at,
    }
  }

  async function transferTicket(ticketId: string, userId: string, input: TicketTransferRequest): Promise<TicketTransferResponse | { error: string } | null> {
    if (!input.targetUserId && !input.targetGroupId) return { error: 'missing_target' }
    const ticket = await tickets.findById(ticketId)
    if (!ticket) return null
    if (ticket.status !== TICKET_STATUS.PENDING_PROCESSING) return { error: 'invalid_status' }
    const now = new Date().toISOString()
    const assigneeId = input.targetUserId ?? ticket.assignee_id
    const groupId = input.targetUserId ? ticket.business_group_id : (input.targetGroupId ?? ticket.business_group_id)
    await tickets.updateTransfer(ticketId, assigneeId, groupId, now)
    await recordAudit(AUDIT_EVENT_TYPE.TICKET_TRANSFERRED, ticketId, userId, { targetUserId: input.targetUserId ?? null, targetGroupId: input.targetGroupId ?? null })
    return { id: ticketId, status: TICKET_STATUS.PENDING_PROCESSING, assigneeId: assigneeId ?? null, businessGroupId: groupId ?? null }
  }

  async function completeTicket(ticketId: string, userId: string): Promise<TicketCompleteResponse | { error: string } | null> {
    const ticket = await tickets.findById(ticketId)
    if (!ticket) return null
    if (ticket.status !== TICKET_STATUS.PENDING_PROCESSING) return { error: 'invalid_status' }
    const now = new Date().toISOString()
    await tickets.updateComplete(ticketId, userId, now)
    const submitter = await deps.userStore.findById(ticket.submitter_id)
    let emailNotification: { status: 'sent' | 'skipped' | 'failed'; reason?: string } = { status: 'skipped', reason: 'not_configured' }
    if (submitter?.email) {
      const result = await deps.email.send({
        to: submitter.email,
        subject: `工单已完成：${ticket.subject}`,
        text: `您的工单「${ticket.subject}」已处理完成。`,
        html: `<p>您的工单「${ticket.subject}」已处理完成。</p>`,
      })
      emailNotification = result.status === 'skipped' ? { status: 'skipped', reason: 'not_configured' } : result
    }
    await recordAudit(AUDIT_EVENT_TYPE.TICKET_COMPLETED, ticketId, userId, { emailNotification })
    const handler = await deps.userStore.findById(userId)
    return {
      id: ticketId, status: TICKET_STATUS.COMPLETED, handlerId: userId,
      handlerName: handler?.name ?? '', handledAt: now, emailNotification,
    }
  }

  async function cancelTicket(ticketId: string, userId: string): Promise<TicketCancelResponse | { error: string } | null> {
    const ticket = await tickets.findById(ticketId)
    if (!ticket) return null
    if (ticket.status === TICKET_STATUS.COMPLETED || ticket.status === TICKET_STATUS.CANCELLED) return { error: 'invalid_status' }
    const now = new Date().toISOString()
    await tickets.updateStatus(ticketId, TICKET_STATUS.CANCELLED, now)
    await recordAudit(AUDIT_EVENT_TYPE.TICKET_CANCELLED, ticketId, userId)
    return { id: ticketId, status: TICKET_STATUS.CANCELLED }
  }

  async function evaluateTicket(ticketId: string, userId: string, input: TicketEvaluationRequest): Promise<TicketEvaluationResponse | { error: string } | null> {
    const ticket = await tickets.findById(ticketId)
    if (!ticket) return null
    if (ticket.status !== TICKET_STATUS.COMPLETED) return { error: 'invalid_status' }
    const existing = await tickets.findEvaluation(ticketId)
    if (existing) return { error: 'already_evaluated' }
    const id = tickets.createId()
    const now = new Date().toISOString()
    const evaluation = await tickets.insertEvaluation({ id, ticketId, rating: input.rating, comment: input.comment ?? null, evaluatedAt: now })
    return {
      id: evaluation.id, ticketId: evaluation.ticket_id, rating: evaluation.rating,
      comment: evaluation.comment, evaluatedAt: evaluation.evaluated_at,
    }
  }

  async function getTicketLogs(ticketId: string): Promise<{ items: Array<{ id: string; eventType: string; actorUserId: string | null; occurredAt: string; metadata: Record<string, unknown> }> } | null> {
    const ticket = await tickets.findById(ticketId)
    if (!ticket) return null
    const logs = await tickets.findTicketLogs(ticketId)
    return {
      items: logs.map((l) => ({
        id: l.id, eventType: l.event_type, actorUserId: l.actor_user_id,
        occurredAt: l.occurred_at, metadata: JSON.parse(l.metadata_json),
      })),
    }
  }

  return {
    createTicket, getTicketDetail, listTickets, listWorkbenchTickets,
    addReply, transferTicket, completeTicket, cancelTicket, evaluateTicket, getTicketLogs,
    tickets, org,
  }
}

export type TicketService = ReturnType<typeof createTicketService>
