import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import {
  AUDIT_ACTIONS,
  AUDIT_OBJECT_TYPES,
  ERROR_CODES,
  PERMISSIONS,
  SYSTEM_ACTOR,
  type MeContext,
  type Page,
  type Priority,
  type RoleCode,
  type Ticket,
  type TicketNotification,
  type TicketRating,
  type TicketReply,
  type TicketStatus,
  type TicketSummary,
} from '../../shared/contracts'
import type { AuditTrail } from '../audit/repository'
import type { IdentityRepository } from '../identity/repository'
import type { NotificationService } from '../notification/service'
import type { OrgRepository } from '../org/repository'
import type { RequestActor } from '../platform/actor'
import { apiError, forbidden, notFound, stateViolation } from '../platform/http'
import { hasAssignAuthority, hasCompanyWideVisibility } from '../platform/actor'
import type { TicketFilter, TicketRepository, TicketRow, TicketSort } from './repository'

const OPEN_STATUSES: readonly TicketStatus[] = ['created', 'pending_assignment', 'pending_processing']
const REPLIABLE_STATUSES: readonly TicketStatus[] = ['created', 'pending_assignment', 'pending_processing']

const ROLE_PRECEDENCE: readonly RoleCode[] = ['agent', 'configurator', 'manager', 'submitter']

const authorRoleOf = (roles: readonly RoleCode[]): string => ROLE_PRECEDENCE.find((role) => roles.includes(role)) ?? 'submitter'

export function toMeContext(actor: RequestActor): MeContext {
  const { member, authorization } = actor
  return {
    userId: member.userId,
    memberId: member.memberId,
    displayName: member.displayName,
    email: member.email,
    companyId: member.companyId,
    companyName: member.companyName,
    departmentId: member.departmentId,
    departmentName: member.departmentName,
    roles: member.roles,
    permissions: authorization.permissions,
  }
}

export type CreateTicketInput = { subject: string; description: string; category: string; priority: Priority }
export type TicketListQuery = {
  status?: TicketStatus
  category?: string
  priority?: Priority
  groupId?: string
  assigneeMemberId?: string
  search?: string
  sort: TicketSort
  page: number
  pageSize: number
  offset: number
}

/**
 * ticket-workflow：工单主数据、生命周期、回复、分配/转派、完成与通知、满意度评价。
 * 公司范围与对象归属在每个方法内独立强制；跨公司对象一律按不存在处理。
 */
export function createTicketService(deps: {
  db: DbClient
  tickets: TicketRepository
  org: OrgRepository
  identity: IdentityRepository
  audit: AuditTrail
  notifications: NotificationService
}) {
  const { db, tickets, org, identity, audit, notifications } = deps

  const assertVisible = (actor: RequestActor, ticket: TicketRow): void => {
    if (hasCompanyWideVisibility(actor.member)) return
    if (ticket.submitterMemberId === actor.member.memberId) return
    throw notFound()
  }

  const requireTicket = async (actor: RequestActor, ticketId: string): Promise<TicketRow> => {
    const ticket = await tickets.findTicket(actor.member.companyId, ticketId)
    if (!ticket) throw notFound()
    return ticket
  }

  const assertHandlerAuthority = (actor: RequestActor, ticket: TicketRow): void => {
    if (ticket.assigneeMemberId === actor.member.memberId) return
    if (hasAssignAuthority(actor.authorization)) return
    throw forbidden('Only the current assignee or an assign manager can perform this action')
  }

  const describeTicket = async (ticket: TicketRow): Promise<Ticket> => {
    const [submitterHistory, replies, assignments, rating, notificationRows] = await Promise.all([
      tickets.listSubmitterHistory(ticket.companyId, ticket.submitterMemberId, ticket.id, 20),
      tickets.listReplies(ticket.id),
      tickets.listAssignments(ticket.id),
      tickets.findRating(ticket.id),
      tickets.listNotifications(ticket.id),
    ])
    return {
      id: ticket.id,
      ticketNo: ticket.ticketNo,
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      groupId: ticket.groupId,
      groupName: ticket.groupName,
      assigneeMemberId: ticket.assigneeMemberId,
      assigneeName: ticket.assigneeName,
      createdAt: ticket.createdAt,
      completedAt: ticket.completedAt,
      completedByName: ticket.completedByName,
      cancelledAt: ticket.cancelledAt,
      submitter: {
        memberId: ticket.submitterMemberId,
        name: ticket.submitterName,
        companyId: ticket.companyId,
        companyName: ticket.companyName,
        departmentId: ticket.submitterDepartmentId,
        departmentName: ticket.submitterDepartment ?? ticket.submitterDepartmentName,
        email: ticket.submitterEmail,
      },
      submitterHistory,
      replies,
      assignments,
      rating,
      notifications: notificationRows,
    }
  }

  return {
    toMeContext,

    async createTicket(actor: RequestActor, input: CreateTicketInput): Promise<Ticket> {
      const { member } = actor
      const createdAt = new Date().toISOString()
      const created = await db.transaction(async (tx) => {
        const sequence = await tickets.allocateTicketNo(member.companyId, tx)
        const ticketNo = `TKT-${String(sequence).padStart(6, '0')}`
        const ruleGroupId = await org.findRuleGroupId(member.companyId, input.category, tx)
        const status: TicketStatus = ruleGroupId ? 'pending_assignment' : 'created'
        const id = randomUUID()
        await tickets.insertTicket({
          id,
          companyId: member.companyId,
          ticketNo,
          subject: input.subject,
          description: input.description,
          category: input.category,
          priority: input.priority,
          status,
          groupId: ruleGroupId,
          submitterMemberId: member.memberId,
          submitterName: member.displayName,
          submitterDepartment: member.departmentName,
          submitterEmail: member.email,
          createdAt,
        }, tx)
        if (ruleGroupId) {
          await tickets.insertAssignment({
            id: randomUUID(),
            ticketId: id,
            companyId: member.companyId,
            kind: 'auto',
            fromMemberId: null,
            toMemberId: null,
            toGroupId: ruleGroupId,
            actorMemberId: null,
            createdAt,
          }, tx)
        }
        return { id, ticketNo, status, autoGroupId: ruleGroupId }
      })

      await audit.record({
        action: AUDIT_ACTIONS.TICKET_CREATED,
        actorMemberId: member.memberId,
        objectType: AUDIT_OBJECT_TYPES.TICKET,
        objectId: created.id,
        companyId: member.companyId,
        details: { ticketNo: created.ticketNo, status: created.status },
      })
      if (created.autoGroupId) {
        await audit.record({
          action: AUDIT_ACTIONS.TICKET_AUTO_ASSIGNED,
          actorMemberId: SYSTEM_ACTOR,
          objectType: AUDIT_OBJECT_TYPES.TICKET,
          objectId: created.id,
          companyId: member.companyId,
          details: { groupId: created.autoGroupId },
        })
      }
      return describeTicket(await requireTicket(actor, created.id))
    },

    async listTickets(actor: RequestActor, query: TicketListQuery): Promise<Page<TicketSummary>> {
      const filter: TicketFilter = {
        status: query.status,
        category: query.category,
        priority: query.priority,
        groupId: query.groupId,
        assigneeMemberId: query.assigneeMemberId,
        search: query.search,
      }
      // 工作台/列表按公司范围；仅持 submitter 角色时进一步限制为本人提交。
      if (!hasCompanyWideVisibility(actor.member)) filter.submitterMemberId = actor.member.memberId
      const [items, total] = await Promise.all([
        tickets.listTicketSummaries(actor.member.companyId, filter, query.sort, query.pageSize, query.offset),
        tickets.countTickets(actor.member.companyId, filter),
      ])
      return { items, total, page: query.page, pageSize: query.pageSize }
    },

    async getTicket(actor: RequestActor, ticketId: string): Promise<Ticket> {
      const ticket = await requireTicket(actor, ticketId)
      assertVisible(actor, ticket)
      return describeTicket(ticket)
    },

    async reply(actor: RequestActor, ticketId: string, content: string): Promise<TicketReply> {
      const ticket = await requireTicket(actor, ticketId)
      assertVisible(actor, ticket)
      if (!REPLIABLE_STATUSES.includes(ticket.status)) throw stateViolation('Replies are only allowed while the ticket is open')
      const reply: TicketReply = {
        id: randomUUID(),
        authorMemberId: actor.member.memberId,
        authorName: actor.member.displayName,
        authorRole: authorRoleOf(actor.member.roles),
        content,
        createdAt: new Date().toISOString(),
      }
      await tickets.insertReply({
        id: reply.id,
        ticketId,
        companyId: ticket.companyId,
        authorMemberId: reply.authorMemberId,
        authorRole: reply.authorRole,
        content: reply.content,
        createdAt: reply.createdAt,
      })
      await audit.record({
        action: AUDIT_ACTIONS.TICKET_REPLIED,
        actorMemberId: actor.member.memberId,
        objectType: AUDIT_OBJECT_TYPES.TICKET,
        objectId: ticketId,
        companyId: ticket.companyId,
        details: { replyId: reply.id },
      })
      return reply
    },

    async assign(actor: RequestActor, ticketId: string, input: { groupId: string; assigneeMemberId: string | null }): Promise<Ticket> {
      const ticket = await requireTicket(actor, ticketId)
      if (!['created', 'pending_assignment'].includes(ticket.status)) throw stateViolation('Ticket is not awaiting assignment')
      const group = await org.findGroup(ticket.companyId, input.groupId)
      if (!group) throw notFound()
      if (input.assigneeMemberId) {
        const member = await identity.findMember(ticket.companyId, input.assigneeMemberId)
        if (!member) throw notFound()
        if (!member.isActive) throw apiError(400, ERROR_CODES.INVALID_REQUEST, 'Invalid request', { fields: { assigneeMemberId: 'must be an active member of the company' } })
        const belongsToGroup = await org.isMemberOfGroup(group.id, input.assigneeMemberId)
        if (!belongsToGroup) throw apiError(400, ERROR_CODES.INVALID_REQUEST, 'Invalid request', { fields: { assigneeMemberId: 'must be a member of the target business group' } })
      }
      const status: TicketStatus = input.assigneeMemberId ? 'pending_processing' : 'pending_assignment'
      const createdAt = new Date().toISOString()
      await db.transaction(async (tx) => {
        await tickets.assignTicket(ticketId, { groupId: group.id, assigneeMemberId: input.assigneeMemberId, status }, tx)
        await tickets.insertAssignment({
          id: randomUUID(),
          ticketId,
          companyId: ticket.companyId,
          kind: 'assign',
          fromMemberId: null,
          toMemberId: input.assigneeMemberId,
          toGroupId: group.id,
          actorMemberId: actor.member.memberId,
          createdAt,
        }, tx)
      })
      await audit.record({
        action: AUDIT_ACTIONS.TICKET_ASSIGNED,
        actorMemberId: actor.member.memberId,
        objectType: AUDIT_OBJECT_TYPES.TICKET,
        objectId: ticketId,
        companyId: ticket.companyId,
        details: { groupId: group.id, assigneeMemberId: input.assigneeMemberId, status },
      })
      return describeTicket(await requireTicket(actor, ticketId))
    },

    async transfer(actor: RequestActor, ticketId: string, input: { toMemberId: string; toGroupId: string | null; reason: string | null }): Promise<Ticket> {
      const ticket = await requireTicket(actor, ticketId)
      assertHandlerAuthority(actor, ticket)
      if (!['pending_assignment', 'pending_processing'].includes(ticket.status)) throw stateViolation('Only pending tickets can be transferred')
      const target = await identity.findActiveMember(ticket.companyId, input.toMemberId)
      if (!target) throw notFound()
      let groupId: string | null = ticket.groupId
      if (input.toGroupId) {
        const group = await org.findGroup(ticket.companyId, input.toGroupId)
        if (!group) throw notFound()
        groupId = group.id
      } else if (!groupId) {
        const memberGroups = await org.groupIdsForMember(ticket.companyId, target.memberId)
        groupId = memberGroups[0] ?? null
      }
      const createdAt = new Date().toISOString()
      const fromMemberId = ticket.assigneeMemberId
      await db.transaction(async (tx) => {
        await tickets.transferTicket(ticketId, { groupId, assigneeMemberId: target.memberId }, tx)
        await tickets.insertAssignment({
          id: randomUUID(),
          ticketId,
          companyId: ticket.companyId,
          kind: 'transfer',
          fromMemberId,
          toMemberId: target.memberId,
          toGroupId: groupId,
          actorMemberId: actor.member.memberId,
          createdAt,
        }, tx)
      })
      await audit.record({
        action: AUDIT_ACTIONS.TICKET_TRANSFERRED,
        actorMemberId: actor.member.memberId,
        objectType: AUDIT_OBJECT_TYPES.TICKET,
        objectId: ticketId,
        companyId: ticket.companyId,
        details: { fromMemberId, toMemberId: target.memberId, groupId, reason: input.reason },
      })
      return describeTicket(await requireTicket(actor, ticketId))
    },

    async complete(actor: RequestActor, ticketId: string, resolution: string | null): Promise<{ ticket: Ticket; notification: TicketNotification }> {
      const ticket = await requireTicket(actor, ticketId)
      assertHandlerAuthority(actor, ticket)
      if (ticket.status !== 'pending_processing') throw stateViolation('Only pending_processing tickets can be completed')
      const completedAt = new Date().toISOString()
      await db.transaction(async (tx) => {
        if (resolution) {
          await tickets.insertReply({
            id: randomUUID(),
            ticketId,
            companyId: ticket.companyId,
            authorMemberId: actor.member.memberId,
            authorRole: authorRoleOf(actor.member.roles),
            content: resolution,
            createdAt: completedAt,
          }, tx)
        }
        await tickets.completeTicket(ticketId, { completedAt, completedByMemberId: actor.member.memberId }, tx)
      })
      await audit.record({
        action: AUDIT_ACTIONS.TICKET_COMPLETED,
        actorMemberId: actor.member.memberId,
        objectType: AUDIT_OBJECT_TYPES.TICKET,
        objectId: ticketId,
        companyId: ticket.companyId,
        details: { completedAt, completedByMemberId: actor.member.memberId },
      })
      // 通知在完成事务之外发送；失败不回滚完成状态，结果写入 notifications 后由工单读回。
      const notification = await notifications.sendCompletionNotice({
        ticketId,
        companyId: ticket.companyId,
        ticketNo: ticket.ticketNo,
        subject: ticket.subject,
        recipientEmail: ticket.submitterEmail,
        completedAt,
        completedByName: actor.member.displayName,
      })
      await audit.record({
        action: AUDIT_ACTIONS.TICKET_COMPLETION_NOTIFIED,
        actorMemberId: SYSTEM_ACTOR,
        objectType: AUDIT_OBJECT_TYPES.TICKET,
        objectId: ticketId,
        companyId: ticket.companyId,
        details: { status: notification.status, error: notification.error },
      })
      return { ticket: await describeTicket(await requireTicket(actor, ticketId)), notification }
    },

    async cancel(actor: RequestActor, ticketId: string, reason: string | null): Promise<Ticket> {
      const ticket = await requireTicket(actor, ticketId)
      assertVisible(actor, ticket)
      if (!OPEN_STATUSES.includes(ticket.status)) throw stateViolation('Completed or cancelled tickets cannot be cancelled')
      const cancelledAt = new Date().toISOString()
      await tickets.cancelTicket(ticketId, { cancelledAt })
      await audit.record({
        action: AUDIT_ACTIONS.TICKET_CANCELLED,
        actorMemberId: actor.member.memberId,
        objectType: AUDIT_OBJECT_TYPES.TICKET,
        objectId: ticketId,
        companyId: ticket.companyId,
        details: { reason },
      })
      return describeTicket(await requireTicket(actor, ticketId))
    },

    async rate(actor: RequestActor, ticketId: string, input: { score: number; comment: string | null }): Promise<TicketRating> {
      const ticket = await requireTicket(actor, ticketId)
      if (ticket.submitterMemberId !== actor.member.memberId) throw forbidden('Only the submitter can rate this ticket')
      if (ticket.status !== 'completed') throw stateViolation('Only completed tickets can be rated')
      const rating: TicketRating = { score: input.score, comment: input.comment, createdAt: new Date().toISOString() }
      try {
        await tickets.insertRating({
          id: randomUUID(),
          ticketId,
          companyId: ticket.companyId,
          score: rating.score,
          comment: rating.comment,
          createdAt: rating.createdAt,
        })
      } catch (error) {
        if (error instanceof Error && /unique constraint/i.test(error.message)) throw apiError(409, ERROR_CODES.CONFLICT, 'This ticket has already been rated')
        throw error
      }
      await audit.record({
        action: AUDIT_ACTIONS.TICKET_RATED,
        actorMemberId: actor.member.memberId,
        objectType: AUDIT_OBJECT_TYPES.TICKET,
        objectId: ticketId,
        companyId: ticket.companyId,
        details: { score: rating.score },
      })
      return rating
    },

    async listNotifications(actor: RequestActor, ticketId: string): Promise<TicketNotification[]> {
      const ticket = await requireTicket(actor, ticketId)
      assertVisible(actor, ticket)
      return tickets.listNotifications(ticketId)
    },

    /** analytics 经此只读查询取数，不直接读取工单相关表。 */
    readModel: tickets,
  }
}

export type TicketService = ReturnType<typeof createTicketService>
export { PERMISSIONS }
