import { createUserStore, type UserStore } from '@commonapp/userkit'
import type { AuditEvent } from '@commonapp/auditkit'
import type { DbClient } from '@commonapp/dbkit'
import type { EmailClient } from '@commonapp/emailkit'
import {
  createTicketRepository,
  nowIso,
  TERMINAL_STATUSES,
  toProfileDto,
  type BusinessGroupRow,
  type RatingRow,
  type TicketListQuery,
  type TicketRow,
  type TicketStatus,
  type UserProfileRow,
} from './repository'

/** 业务错误：带契约声明的状态码与错误码，由路由层统一转换为 { error: { code, message } } */
export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export type TicketPlatform = {
  db: DbClient
  audit: { record(event: AuditEvent): Promise<void> }
  email: EmailClient | null
  auth: { hashPassword: (password: string) => string }
}

/** 当前操作者：公司范围取自服务端可信的用户业务属性记录 */
export type TicketActor = { userId: string; name: string; email: string; companyId: number | null; profile: UserProfileRow }
type Actor = TicketActor

export type CreateTicketInput = { title: string; description: string; categoryId: number; slaPriority: string }
export type TransferInput = { targetGroupId: number | null; targetUserId: string | null }
export type CreateUserInput = { email: string; password: string; displayName: string; companyId: number | null; departmentId: number | null }
export type UpdateUserInput = { displayName?: string; companyId?: number | null; departmentId?: number | null }
export type UpsertRuleInput = { companyId: number; categoryId: number; targetGroupId: number }

export function createTicketService(platform: TicketPlatform) {
  const repository = createTicketRepository(platform.db)

  const record = async (event: AuditEvent) => {
    try {
      await platform.audit.record(event)
    } catch (error) {
      console.error('[tickets] audit record failed', error)
    }
  }

  const resolveActor = async (userId: string): Promise<Actor> => {
    const profile = await repository.loadUserProfile(userId)
    if (!profile) throw new ApiError(401, 'NOT_AUTHENTICATED', 'Authenticated user no longer exists')
    return { userId, name: profile.displayName, email: profile.email, companyId: profile.companyId, profile }
  }

  const requireCompany = (actor: Actor): number => {
    if (actor.companyId === null) {
      throw new ApiError(403, 'COMPANY_REQUIRED', 'Your account is not linked to a company yet; set a company on your profile first')
    }
    return actor.companyId
  }

  /** 请求中显式指定的公司必须与当前用户公司一致，否则返回 403 且不返回内容 */
  const scopedCompany = (actor: Actor, requested: number | null): number => {
    const companyId = requireCompany(actor)
    if (requested !== null && requested !== companyId) {
      throw new ApiError(403, 'CROSS_COMPANY', 'Resource belongs to another company')
    }
    return companyId
  }

  const loadTicket = async (actor: Actor, ticketId: number): Promise<TicketRow> => {
    const ticket = await repository.findTicket(ticketId)
    if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found')
    if (actor.companyId === null || ticket.companyId !== actor.companyId) {
      throw new ApiError(403, 'CROSS_COMPANY', 'Ticket belongs to another company')
    }
    return ticket
  }

  const assertActive = (ticket: TicketRow) => {
    if (TERMINAL_STATUSES.includes(ticket.status)) {
      throw new ApiError(409, 'TICKET_TERMINAL', `Ticket is already ${ticket.status} and can no longer be changed`)
    }
  }

  const requireOwnGroup = async (actor: Actor, groupId: number): Promise<BusinessGroupRow> => {
    const group = await repository.findGroup(groupId)
    if (!group) throw new ApiError(404, 'NOT_FOUND', 'Business group not found')
    if (actor.companyId === null || group.companyId !== actor.companyId) {
      throw new ApiError(403, 'CROSS_COMPANY', 'Business group belongs to another company')
    }
    return group
  }

  const isProcessingSide = async (ticket: TicketRow, userId: string): Promise<boolean> => {
    if (ticket.handlerUserId === userId) return true
    if (ticket.businessGroupId === null) return false
    return repository.isMember(ticket.businessGroupId, userId)
  }

  const validatePlacement = async (companyId: number | null, departmentId: number | null): Promise<void> => {
    if (companyId !== null && !(await repository.findCompany(companyId))) {
      throw new ApiError(400, 'INVALID_INPUT', 'companyId does not exist')
    }
    if (departmentId !== null) {
      const department = await repository.findDepartment(departmentId)
      if (!department) throw new ApiError(400, 'INVALID_INPUT', 'departmentId does not exist')
      if (companyId !== null && department.companyId !== companyId) {
        throw new ApiError(400, 'INVALID_INPUT', 'departmentId does not belong to companyId')
      }
    }
  }

  const sendCompletionEmail = async (ticket: TicketRow, handlerName: string, completedAt: string) => {
    const to = ticket.submitterEmail
    const subject = `工单 #${ticket.id} 已完成`
    const text = `工单「${ticket.title}」（编号 #${ticket.id}）已完成。\n处理人：${handlerName}\n完成时间：${completedAt}`
    if (!platform.email) return { to, subject, status: 'skipped' as const, reason: 'not_configured' }
    try {
      const result = await platform.email.send({ to, subject, text, html: `<p>${text.replace(/\n/g, '<br />')}</p>` })
      return result.status === 'sent'
        ? { to, subject, status: result.status, messageId: result.messageId ?? null }
        : result.status === 'skipped'
          ? { to, subject, status: result.status, reason: result.reason }
          : { to, subject, status: result.status, error: result.message }
    } catch (error) {
      return { to, subject, status: 'failed' as const, error: error instanceof Error ? error.message : 'Email delivery failed' }
    }
  }

  return {
    /** 由服务端身份解析操作者与其可信公司范围 */
    resolveActor: (userId: string) => resolveActor(userId),
    // ── 基础数据 ────────────────────────────────────────────────
    async listCompanies() {
      return { items: await repository.listCompanies() }
    },
    async createCompany(name: string) {
      const created = await repository.insertCompany(name, nowIso())
      return { id: created.id, name: created.name }
    },
    async listDepartments(actor: Actor, requestedCompanyId: number | null) {
      const companyId = scopedCompany(actor, requestedCompanyId)
      return { items: await repository.listDepartments(companyId) }
    },
    async createDepartment(actor: Actor, companyId: number, name: string) {
      scopedCompany(actor, companyId)
      if (!(await repository.findCompany(companyId))) throw new ApiError(400, 'INVALID_INPUT', 'Company does not exist')
      const created = await repository.insertDepartment(companyId, name, nowIso())
      return { id: created.id, name: created.name }
    },
    async listCategories() {
      return { items: await repository.listCategories() }
    },
    async createCategory(name: string) {
      const created = await repository.insertCategory(name, nowIso())
      return { id: created.id, name: created.name }
    },

    // ── 用户业务属性 ────────────────────────────────────────────
    async currentProfile(actor: Actor) {
      return toProfileDto(actor.profile)
    },
    async listUsers() {
      const users = await repository.listUsersWithProfiles()
      const items = await Promise.all(users.map(async (user) => {
        const profile = user.profile ?? await repository.loadUserProfile(user.id)
        return { id: user.id, email: user.email, profile: profile ? toProfileDto(profile) : null }
      }))
      return { items, total: items.length }
    },
    async createUser(input: CreateUserInput) {
      await validatePlacement(input.companyId, input.departmentId)
      const createdAt = nowIso()
      let created
      try {
        created = await platform.db.transaction(async (tx) => {
          const txRepository = createTicketRepository(tx)
          const txUserStore = createUserStore(tx)
          const user = await txUserStore.create(
            {
              name: input.displayName,
              email: input.email,
              phone: null,
              companyId: input.companyId === null ? null : String(input.companyId),
              passwordChangeRequired: false,
            },
            platform.auth.hashPassword(input.password),
          )
          await txRepository.insertProfile(
            { userId: user.id, displayName: input.displayName, email: input.email, companyId: input.companyId, departmentId: input.departmentId },
            createdAt,
          )
          return user
        })
      } catch (error) {
        if (error instanceof Error && /unique constraint/i.test(error.message)) {
          throw new ApiError(409, 'EMAIL_EXISTS', 'Email is already in use')
        }
        throw error
      }
      const profile = await repository.loadUserProfile(created.id)
      return { id: created.id, email: created.email, profile: profile ? toProfileDto(profile) : null }
    },
    async updateUserProfile(userId: string, input: UpdateUserInput) {
      const existing = await repository.loadUserProfile(userId)
      if (!existing) throw new ApiError(404, 'NOT_FOUND', 'User not found')
      const displayName = input.displayName ?? existing.displayName
      const companyId = input.companyId === undefined ? existing.companyId : input.companyId
      const departmentId = input.departmentId === undefined ? existing.departmentId : input.departmentId
      await validatePlacement(companyId, departmentId)
      await platform.db.transaction(async (tx) => {
        const txRepository = createTicketRepository(tx)
        await txRepository.updateProfile(userId, { displayName, email: existing.email, companyId, departmentId })
        await tx.run({
          text: 'UPDATE users SET company_id = ?, updated_at = ? WHERE id = ?',
          params: [companyId === null ? null : String(companyId), nowIso(), userId],
        })
      })
      const profile = await repository.loadUserProfile(userId)
      return { id: userId, email: existing.email, profile: profile ? toProfileDto(profile) : null }
    },

    // ── 业务组与分配规则 ────────────────────────────────────────
    async listGroups(actor: Actor, requestedCompanyId: number | null) {
      const companyId = scopedCompany(actor, requestedCompanyId)
      return { items: await repository.listGroups(companyId) }
    },
    async createGroup(actor: Actor, companyId: number, name: string) {
      scopedCompany(actor, companyId)
      if (!(await repository.findCompany(companyId))) throw new ApiError(400, 'INVALID_INPUT', 'Company does not exist')
      const created = await repository.insertGroup(companyId, name, nowIso())
      return { id: created.id, name: created.name, companyId: created.companyId }
    },
    async addGroupMember(actor: Actor, groupId: number, userId: string) {
      const group = await requireOwnGroup(actor, groupId)
      const profile = await repository.loadUserProfile(userId)
      if (!profile) throw new ApiError(404, 'NOT_FOUND', 'User not found')
      if (profile.companyId !== group.companyId) {
        throw new ApiError(403, 'CROSS_COMPANY', 'Member must belong to the same company as the group')
      }
      if (await repository.isMember(group.id, userId)) {
        throw new ApiError(409, 'MEMBER_EXISTS', 'Member already exists in this group')
      }
      await repository.insertMember(group.id, userId, nowIso())
      return { groupId: group.id, userId }
    },
    async removeGroupMember(actor: Actor, groupId: number, userId: string) {
      const group = await requireOwnGroup(actor, groupId)
      await repository.deleteMember(group.id, userId)
      return { success: true }
    },
    async listRules(actor: Actor, requestedCompanyId: number | null) {
      const companyId = scopedCompany(actor, requestedCompanyId)
      return { items: await repository.listRules(companyId) }
    },
    async upsertRule(actor: Actor, input: UpsertRuleInput) {
      scopedCompany(actor, input.companyId)
      if (!(await repository.findCategory(input.categoryId))) {
        throw new ApiError(400, 'INVALID_INPUT', 'categoryId does not exist')
      }
      const group = await repository.findGroup(input.targetGroupId)
      if (!group) throw new ApiError(400, 'INVALID_INPUT', 'targetGroupId does not exist')
      if (group.companyId !== input.companyId) {
        throw new ApiError(403, 'CROSS_COMPANY', 'Target group belongs to another company')
      }
      const rule = await repository.upsertRule(input.companyId, input.categoryId, input.targetGroupId, nowIso())
      return { id: rule.id, companyId: rule.companyId, categoryId: rule.categoryId, targetGroupId: rule.targetGroupId }
    },

    // ── 工单 ───────────────────────────────────────────────────
    async createTicket(actor: Actor, input: CreateTicketInput) {
      const companyId = requireCompany(actor)
      if (!(await repository.findCategory(input.categoryId))) {
        throw new ApiError(400, 'INVALID_INPUT', 'categoryId does not exist')
      }
      const createdAt = nowIso()
      const submitterDepartment = actor.profile.departmentId === null
        ? null
        : (await repository.findDepartment(actor.profile.departmentId))?.name ?? null
      const created = await platform.db.transaction(async (tx) => {
        const txRepository = createTicketRepository(tx)
        const ticketId = await txRepository.insertTicket({
          title: input.title,
          description: input.description,
          categoryId: input.categoryId,
          slaPriority: input.slaPriority,
          companyId,
          submitterUserId: actor.userId,
          submitterName: actor.name,
          submitterEmail: actor.email,
          submitterDepartment,
          createdAt,
        })
        await txRepository.updateTicket(ticketId, { status: 'pending_assignment' })
        const rule = await txRepository.findRule(companyId, input.categoryId)
        if (!rule) return { ticketId, assignedGroupId: null }
        await txRepository.updateTicket(ticketId, { status: 'pending_processing', businessGroupId: rule.targetGroupId })
        return { ticketId, assignedGroupId: rule.targetGroupId }
      })
      await record({
        type: 'ticket.created',
        occurredAt: createdAt,
        actorUserId: actor.userId,
        metadata: { ticketId: created.ticketId, companyId, operatorName: actor.name, title: input.title },
      })
      if (created.assignedGroupId !== null) {
        await record({
          type: 'ticket.assigned',
          occurredAt: createdAt,
          actorUserId: actor.userId,
          metadata: { ticketId: created.ticketId, companyId, operatorName: actor.name, mode: 'auto', businessGroupId: created.assignedGroupId },
        })
      }
      const ticket = await repository.findTicket(created.ticketId)
      if (!ticket) throw new Error('Ticket write did not persist')
      return {
        id: ticket.id,
        title: ticket.title,
        description: ticket.description,
        categoryId: ticket.categoryId,
        slaPriority: ticket.slaPriority,
        status: ticket.status,
        businessGroupId: ticket.businessGroupId,
        createdAt: ticket.createdAt,
      }
    },
    async listTickets(actor: Actor, query: Omit<TicketListQuery, 'companyId'> & { companyId: number | null }) {
      if (actor.companyId === null) return { items: [], total: 0, page: query.page, size: query.size }
      if (query.companyId !== null && query.companyId !== actor.companyId) {
        throw new ApiError(403, 'CROSS_COMPANY', 'Resource belongs to another company')
      }
      const { items, total } = await repository.listTickets({ ...query, companyId: actor.companyId })
      return { items, total, page: query.page, size: query.size }
    },
    async getTicket(actor: Actor, ticketId: number) {
      const ticket = await loadTicket(actor, ticketId)
      const [replies, transfers, rating] = await Promise.all([
        repository.listReplies(ticket.id),
        repository.listTransfers(ticket.id),
        repository.findRating(ticket.id),
      ])
      return {
        id: ticket.id,
        title: ticket.title,
        description: ticket.description,
        categoryId: ticket.categoryId,
        categoryName: ticket.categoryName,
        slaPriority: ticket.slaPriority,
        companyId: ticket.companyId,
        companyName: ticket.companyName,
        submitterName: ticket.submitterName,
        submitterEmail: ticket.submitterEmail,
        submitterDepartment: ticket.submitterDepartment,
        businessGroupId: ticket.businessGroupId,
        businessGroupName: ticket.businessGroupName,
        handlerUserId: ticket.handlerUserId,
        handlerName: ticket.handlerName,
        status: ticket.status,
        createdAt: ticket.createdAt,
        completedAt: ticket.completedAt,
        cancelledAt: ticket.cancelledAt,
        replies: replies.map(({ id, content, replierName, createdAt }) => ({ id, content, replierName, createdAt })),
        transfers,
        rating: rating ? { score: rating.score, comment: rating.comment, ratedAt: rating.ratedAt } : null,
      }
    },
    async reply(actor: Actor, ticketId: number, content: string) {
      const ticket = await loadTicket(actor, ticketId)
      assertActive(ticket)
      const createdAt = nowIso()
      const reply = await repository.insertReply(ticket.id, content, actor.userId, actor.name, createdAt)
      if (ticket.firstResponseAt === null && await isProcessingSide(ticket, actor.userId)) {
        await repository.updateTicket(ticket.id, { firstResponseAt: createdAt })
      }
      await record({
        type: 'ticket.replied',
        occurredAt: createdAt,
        actorUserId: actor.userId,
        metadata: { ticketId: ticket.id, companyId: ticket.companyId, operatorName: actor.name, replyId: reply.id },
      })
      return { id: reply.id, content: reply.content, replierName: reply.replierName, createdAt: reply.createdAt }
    },
    async transfer(actor: Actor, ticketId: number, input: TransferInput) {
      const ticket = await loadTicket(actor, ticketId)
      assertActive(ticket)
      if (input.targetGroupId === null && input.targetUserId === null) {
        throw new ApiError(400, 'INVALID_INPUT', 'targetGroupId or targetUserId is required')
      }
      let businessGroupId = ticket.businessGroupId
      let handlerUserId = ticket.handlerUserId
      let handlerName = ticket.handlerName
      if (input.targetGroupId !== null) {
        const group = await repository.findGroup(input.targetGroupId)
        if (!group) throw new ApiError(404, 'NOT_FOUND', 'Target business group not found')
        if (group.companyId !== ticket.companyId) throw new ApiError(403, 'CROSS_COMPANY', 'Target business group belongs to another company')
        businessGroupId = group.id
      }
      if (input.targetUserId !== null) {
        const profile = await repository.loadUserProfile(input.targetUserId)
        if (!profile) throw new ApiError(404, 'NOT_FOUND', 'Target user not found')
        if (profile.companyId !== ticket.companyId) throw new ApiError(403, 'CROSS_COMPANY', 'Target user belongs to another company')
        handlerUserId = profile.userId
        handlerName = profile.displayName
      }
      const transferredAt = nowIso()
      await repository.insertTransfer({
        ticketId: ticket.id,
        fromGroupId: ticket.businessGroupId,
        toGroupId: input.targetGroupId,
        fromUserId: ticket.handlerUserId,
        toUserId: input.targetUserId,
        transferredBy: actor.userId,
        transferredAt,
      })
      await repository.updateTicket(ticket.id, { businessGroupId, handlerUserId, handlerName })
      await record({
        type: 'ticket.transferred',
        occurredAt: transferredAt,
        actorUserId: actor.userId,
        metadata: {
          ticketId: ticket.id,
          companyId: ticket.companyId,
          operatorName: actor.name,
          fromBusinessGroupId: ticket.businessGroupId,
          toBusinessGroupId: input.targetGroupId,
          toUserId: input.targetUserId,
        },
      })
      return { id: ticket.id, businessGroupId, handlerUserId, status: ticket.status }
    },
    async assign(actor: Actor, ticketId: number, businessGroupId: number) {
      const ticket = await loadTicket(actor, ticketId)
      assertActive(ticket)
      if (ticket.status !== 'pending_assignment') {
        throw new ApiError(409, 'TICKET_ALREADY_ASSIGNED', 'Ticket already has a business group')
      }
      const group = await repository.findGroup(businessGroupId)
      if (!group) throw new ApiError(404, 'NOT_FOUND', 'Business group not found')
      if (group.companyId !== ticket.companyId) throw new ApiError(403, 'CROSS_COMPANY', 'Business group belongs to another company')
      const assignedAt = nowIso()
      await repository.updateTicket(ticket.id, { status: 'pending_processing', businessGroupId: group.id })
      await record({
        type: 'ticket.assigned',
        occurredAt: assignedAt,
        actorUserId: actor.userId,
        metadata: { ticketId: ticket.id, companyId: ticket.companyId, operatorName: actor.name, mode: 'manual', businessGroupId: group.id },
      })
      return { id: ticket.id, businessGroupId: group.id, status: 'pending_processing' as TicketStatus }
    },
    async complete(actor: Actor, ticketId: number) {
      const ticket = await loadTicket(actor, ticketId)
      assertActive(ticket)
      const completedAt = nowIso()
      await repository.updateTicket(ticket.id, {
        status: 'completed',
        handlerUserId: actor.userId,
        handlerName: actor.name,
        completedAt,
      })
      const email = await sendCompletionEmail(ticket, actor.name, completedAt)
      await record({
        type: 'ticket.completed',
        occurredAt: completedAt,
        actorUserId: actor.userId,
        metadata: { ticketId: ticket.id, companyId: ticket.companyId, operatorName: actor.name, handlerName: actor.name, email },
      })
      return { id: ticket.id, status: 'completed' as TicketStatus, handlerName: actor.name, completedAt }
    },
    async cancel(actor: Actor, ticketId: number) {
      const ticket = await loadTicket(actor, ticketId)
      assertActive(ticket)
      const cancelledAt = nowIso()
      await repository.updateTicket(ticket.id, { status: 'cancelled', cancelledAt })
      await record({
        type: 'ticket.cancelled',
        occurredAt: cancelledAt,
        actorUserId: actor.userId,
        metadata: { ticketId: ticket.id, companyId: ticket.companyId, operatorName: actor.name },
      })
      return { id: ticket.id, status: 'cancelled' as TicketStatus, cancelledAt }
    },
    async submitterInfo(actor: Actor, ticketId: number) {
      const ticket = await loadTicket(actor, ticketId)
      const history = await repository.listSubmitterTickets(ticket.companyId, ticket.submitterUserId)
      return {
        name: ticket.submitterName,
        company: ticket.companyName,
        department: ticket.submitterDepartment,
        historyTickets: history.map(({ id, title, status, createdAt }) => ({ id, title, status, createdAt })),
      }
    },
    async logs(actor: Actor, ticketId: number) {
      const ticket = await loadTicket(actor, ticketId)
      return { items: await repository.listTicketLogs(ticket.id) }
    },
    async rate(actor: Actor, ticketId: number, score: number, comment: string | null): Promise<RatingRow> {
      const ticket = await loadTicket(actor, ticketId)
      if (ticket.status !== 'completed') {
        throw new ApiError(409, 'TICKET_NOT_COMPLETED', 'Only completed tickets can be rated')
      }
      if (await repository.findRating(ticket.id)) {
        throw new ApiError(409, 'TICKET_ALREADY_RATED', 'Ticket already has a rating')
      }
      const ratedAt = nowIso()
      let rating: RatingRow
      try {
        rating = await repository.insertRating(ticket.id, score, comment, actor.userId, ratedAt)
      } catch (error) {
        if (error instanceof Error && /unique constraint/i.test(error.message)) {
          throw new ApiError(409, 'TICKET_ALREADY_RATED', 'Ticket already has a rating')
        }
        throw error
      }
      await record({
        type: 'ticket.rated',
        occurredAt: ratedAt,
        actorUserId: actor.userId,
        metadata: { ticketId: ticket.id, companyId: ticket.companyId, operatorName: actor.name, score },
      })
      return rating
    },

    // ── 统计 ───────────────────────────────────────────────────
    async distribution(actor: Actor, dimension: 'company' | 'department') {
      if (actor.companyId === null) return { dimension, items: [] as Array<{ label: string; count: number }> }
      if (dimension === 'company') {
        const company = await repository.findCompany(actor.companyId)
        const count = await repository.countTickets(actor.companyId)
        return { dimension, items: company ? [{ label: company.name, count }] : [] }
      }
      return { dimension, items: await repository.departmentDistribution(actor.companyId) }
    },
    async dashboard(actor: Actor) {
      if (actor.companyId === null) {
        return { totalTickets: 0, avgResponseTimeMinutes: null, satisfactionScore: null, hotCategories: [] }
      }
      const [totalTickets, pairs, averageRating, hotCategories] = await Promise.all([
        repository.countTickets(actor.companyId),
        repository.listResponsePairs(actor.companyId),
        repository.averageRating(actor.companyId),
        repository.hotCategories(actor.companyId),
      ])
      const durations = pairs
        .map((pair) => Date.parse(pair.firstResponseAt) - Date.parse(pair.createdAt))
        .filter((duration) => Number.isFinite(duration) && duration >= 0)
      const averageMilliseconds = durations.length
        ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
        : null
      const avgResponseTimeMinutes = averageMilliseconds === null
        ? null
        : Math.round(averageMilliseconds / 60000 * 10) / 10
      return {
        totalTickets,
        avgResponseTimeMinutes,
        satisfactionScore: averageRating === null ? null : Math.round(averageRating * 100) / 100,
        hotCategories,
      }
    },
  }
}

export type TicketService = ReturnType<typeof createTicketService>
