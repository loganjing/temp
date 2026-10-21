import type { Context, Hono } from 'hono'
import type { initializePlatform } from '../platform/bootstrap'
import { listTicketEvents, maskEmail, recordTicketEvent } from './audit'
import { forbidden, invalidInput, notFound, validationFailed } from './errors'
import { sendCompletionEmail } from './notification'
import {
  canViewTicket,
  createAssignmentRule,
  createGroup,
  findCompany,
  findGroup,
  isCompanyAdminOf,
  listAssignmentRules,
  listCategories,
  listCompanyUsers,
  listGroups,
  loadIdentity,
  setUserOrg,
  setGroupMembers,
  type Identity,
} from './org'
import { dashboard, distribution } from './stats'
import { addReply, assignTicket, cancelTicket, completeTicket, createTicket, getSubmitterHistory, getTicketDetail, getTicketRow, listTickets, rateTicket, transferTicket } from './tickets'
import { PRIORITIES, TICKET_SORTS, TICKET_STATUSES, type Priority, type TicketSort, type TicketStatus } from './types'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

async function identityOf(platform: Platform, context: Context): Promise<Identity> {
  const user = (context as unknown as { get(name: string): unknown }).get('currentUser') as { id: string }
  return loadIdentity(platform.db, user.id)
}

async function readJson(context: Context): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await context.req.json()
  } catch {
    body = null
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalidInput('Request body must be a JSON object')
  return body as Record<string, unknown>
}

/** 文本字段：缺失/类型错按 missing 抛出；长度与空白属语义校验（422）。 */
function requireTextField(
  body: Record<string, unknown>,
  name: string,
  minLength: number,
  maxLength: number,
  missing: (message: string) => Error,
): string {
  const value = body[name]
  if (typeof value !== 'string' || value.trim().length === 0) throw missing(`${name} is required`)
  if (value.length < minLength || value.length > maxLength) {
    throw validationFailed(`${name} must contain ${minLength} to ${maxLength} characters`)
  }
  return value
}

function requireIntField(body: Record<string, unknown>, name: string, missing: (message: string) => Error): number {
  const value = body[name]
  if (typeof value !== 'number' || !Number.isInteger(value)) throw missing(`${name} must be an integer`)
  return value
}

function requireBooleanField(body: Record<string, unknown>, name: string): boolean {
  const value = body[name]
  if (typeof value !== 'boolean') throw invalidInput(`${name} must be a boolean`)
  return value
}

function requireEnumField<T extends string>(body: Record<string, unknown>, name: string, values: readonly T[], missing: (message: string) => Error): T {
  const value = body[name]
  if (typeof value !== 'string' || !value) throw missing(`${name} is required`)
  if (!values.includes(value as T)) throw validationFailed(`${name} must be one of: ${values.join(', ')}`)
  return value as T
}

function intParam(context: Context, name: string): number {
  const id = Number(context.req.param(name))
  if (!Number.isInteger(id) || id < 1) throw notFound()
  return id
}

function queryInt(context: Context, name: string, required: boolean): number | undefined {
  const raw = context.req.query(name)
  if (raw === undefined || raw === '') {
    if (required) throw invalidInput(`${name} is required`)
    return undefined
  }
  const value = Number(raw)
  if (!Number.isInteger(value)) throw invalidInput(`${name} must be an integer`)
  return value
}

async function requireCompanyAdmin(platform: Platform, context: Context, companyId: number): Promise<Identity> {
  const identity = await identityOf(platform, context)
  const company = await findCompany(platform.db, companyId)
  if (!company) throw validationFailed('Company does not exist')
  if (!isCompanyAdminOf(identity, companyId)) throw forbidden('Company admin permission is required')
  return identity
}

async function loadVisibleTicket(platform: Platform, identity: Identity, ticketId: number) {
  const row = await getTicketRow(platform.db, ticketId)
  if (!row || !canViewTicket(identity, row)) throw notFound()
  return row
}

export function registerTicketRoutes(app: Hono, platform: Platform): void {
  // ---- 组织与配置（契约第 4 节）----

  app.get('/api/categories', async (context) => {
    await identityOf(platform, context)
    return context.json(await listCategories(platform.db))
  })

  app.post('/api/groups', async (context) => {
    const body = await readJson(context)
    const companyId = requireIntField(body, 'companyId', invalidInput)
    const name = requireTextField(body, 'name', 1, 100, invalidInput)
    await requireCompanyAdmin(platform, context, companyId)
    return context.json(await createGroup(platform.db, { companyId, name }), 201)
  })

  app.get('/api/groups', async (context) => {
    const companyId = queryInt(context, 'companyId', true)
    await requireCompanyAdmin(platform, context, companyId as number)
    return context.json(await listGroups(platform.db, companyId as number))
  })

  app.put('/api/groups/:id/members', async (context) => {
    const groupId = intParam(context, 'id')
    const group = await findGroup(platform.db, groupId)
    if (!group) throw notFound('Group not found')
    await requireCompanyAdmin(platform, context, group.company_id)
    const body = await readJson(context)
    const userIds = body.userIds
    if (!Array.isArray(userIds) || userIds.some((id) => typeof id !== 'string')) throw invalidInput('userIds must be an array of user ids')
    return context.json(await setGroupMembers(platform.db, groupId, userIds as string[]))
  })

  app.post('/api/assignment-rules', async (context) => {
    const body = await readJson(context)
    const companyId = requireIntField(body, 'companyId', invalidInput)
    const categoryId = requireIntField(body, 'categoryId', invalidInput)
    const groupId = requireIntField(body, 'groupId', invalidInput)
    await requireCompanyAdmin(platform, context, companyId)
    return context.json(await createAssignmentRule(platform.db, { companyId, categoryId, groupId }), 201)
  })

  app.get('/api/assignment-rules', async (context) => {
    const companyId = queryInt(context, 'companyId', true)
    await requireCompanyAdmin(platform, context, companyId as number)
    return context.json(await listAssignmentRules(platform.db, companyId as number))
  })

  app.put('/api/users/:id/org', async (context) => {
    const body = await readJson(context)
    const companyId = requireIntField(body, 'companyId', invalidInput)
    const department = requireTextField(body, 'department', 1, 100, invalidInput)
    const isCompanyAdmin = body.isCompanyAdmin === undefined ? false : requireBooleanField(body, 'isCompanyAdmin')
    await requireCompanyAdmin(platform, context, companyId)
    return context.json(await setUserOrg(platform.db, context.req.param('id'), { companyId, department, isCompanyAdmin }))
  })

  app.get('/api/users', async (context) => {
    const companyId = queryInt(context, 'companyId', true)
    await requireCompanyAdmin(platform, context, companyId as number)
    return context.json(await listCompanyUsers(platform.db))
  })

  // ---- 工单（契约第 3 节）----

  app.post('/api/tickets', async (context) => {
    const identity = await identityOf(platform, context)
    const body = await readJson(context)
    const subject = requireTextField(body, 'subject', 1, 200, validationFailed)
    const description = requireTextField(body, 'description', 1, 10000, validationFailed)
    const categoryId = requireIntField(body, 'categoryId', validationFailed)
    const priority = requireEnumField<Priority>(body, 'priority', PRIORITIES, validationFailed)
    return context.json(await createTicket(platform.db, identity, { subject, description, categoryId, priority }), 201)
  })

  app.get('/api/tickets', async (context) => {
    const identity = await identityOf(platform, context)
    const status = context.req.query('status')
    if (status !== undefined && status !== '' && !TICKET_STATUSES.includes(status as TicketStatus)) {
      throw invalidInput(`status must be one of: ${TICKET_STATUSES.join(', ')}`)
    }
    const sort = context.req.query('sort')
    if (sort !== undefined && sort !== '' && !TICKET_SORTS.includes(sort as TicketSort)) {
      throw invalidInput(`sort must be one of: ${TICKET_SORTS.join(', ')}`)
    }
    const companyId = queryInt(context, 'companyId', false)
    const tickets = await listTickets(platform.db, identity, {
      status: status ? (status as TicketStatus) : undefined,
      companyId,
      q: context.req.query('q') || undefined,
      sort: sort ? (sort as TicketSort) : undefined,
    })
    return context.json({ tickets })
  })

  app.get('/api/tickets/:id', async (context) => {
    const identity = await identityOf(platform, context)
    const ticketId = intParam(context, 'id')
    await loadVisibleTicket(platform, identity, ticketId)
    const detail = await getTicketDetail(platform.db, ticketId)
    if (!detail) throw notFound()
    return context.json(detail)
  })

  app.get('/api/tickets/:id/submitter-history', async (context) => {
    const identity = await identityOf(platform, context)
    const ticketId = intParam(context, 'id')
    const row = await loadVisibleTicket(platform, identity, ticketId)
    return context.json(await getSubmitterHistory(platform.db, row.submitter_user_id))
  })

  app.post('/api/tickets/:id/replies', async (context) => {
    const identity = await identityOf(platform, context)
    const ticketId = intParam(context, 'id')
    const body = await readJson(context)
    const content = requireTextField(body, 'content', 1, 10000, invalidInput)
    return context.json(await addReply(platform.db, identity, ticketId, content), 201)
  })

  app.post('/api/tickets/:id/assign', async (context) => {
    const identity = await identityOf(platform, context)
    const ticketId = intParam(context, 'id')
    const body = await readJson(context)
    const groupId = requireIntField(body, 'groupId', invalidInput)
    return context.json(await assignTicket(platform.db, identity, ticketId, groupId))
  })

  app.post('/api/tickets/:id/transfer', async (context) => {
    const identity = await identityOf(platform, context)
    const ticketId = intParam(context, 'id')
    const body = await readJson(context)
    const targetGroupId = requireIntField(body, 'targetGroupId', invalidInput)
    return context.json(await transferTicket(platform.db, identity, ticketId, targetGroupId))
  })

  app.post('/api/tickets/:id/complete', async (context) => {
    const identity = await identityOf(platform, context)
    const ticketId = intParam(context, 'id')
    const { ticket, handledAt } = await completeTicket(platform.db, identity, ticketId)
    // 邮件在事务提交后发送（契约第 7 节）：失败不回滚完成状态。
    const notification = await sendCompletionEmail(platform.email, { id: ticket.id, subject: ticket.subject, handledAt }, ticket.submitter.email)
    await recordTicketEvent(platform.db, {
      type: notification.emailSent ? 'ticket_email_sent' : 'ticket_email_failed',
      actorUserId: identity.userId,
      ticketId: ticket.id,
      detail: notification.error
        ? { recipient: maskEmail(ticket.submitter.email), error: notification.error }
        : { recipient: maskEmail(ticket.submitter.email) },
      occurredAt: new Date().toISOString(),
    })
    return context.json({ ticket, notification })
  })

  app.post('/api/tickets/:id/cancel', async (context) => {
    const identity = await identityOf(platform, context)
    const ticketId = intParam(context, 'id')
    return context.json(await cancelTicket(platform.db, identity, ticketId))
  })

  app.post('/api/tickets/:id/rating', async (context) => {
    const identity = await identityOf(platform, context)
    const ticketId = intParam(context, 'id')
    const body = await readJson(context)
    const score = requireIntField(body, 'score', invalidInput)
    if (score < 1 || score > 5) throw validationFailed('score must be between 1 and 5')
    return context.json(await rateTicket(platform.db, identity, ticketId, score), 201)
  })

  app.get('/api/tickets/:id/logs', async (context) => {
    const identity = await identityOf(platform, context)
    const ticketId = intParam(context, 'id')
    await loadVisibleTicket(platform, identity, ticketId)
    return context.json({ events: await listTicketEvents(platform.db, ticketId) })
  })

  // ---- 统计（契约第 5 节）----

  app.get('/api/stats/distribution', async (context) => {
    const identity = await identityOf(platform, context)
    const dimension = context.req.query('dimension')
    if (dimension !== 'company' && dimension !== 'department') throw invalidInput('dimension must be company or department')
    return context.json(await distribution(platform.db, identity, { dimension, companyId: queryInt(context, 'companyId', false) }))
  })

  app.get('/api/stats/dashboard', async (context) => {
    const identity = await identityOf(platform, context)
    return context.json(await dashboard(platform.db, identity, { companyId: queryInt(context, 'companyId', false) }))
  })
}
