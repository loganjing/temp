import type { Hono } from 'hono'
import { PERMISSIONS, PRIORITIES, TICKET_STATUSES, type Priority } from '../../shared/contracts'
import {
  FieldCollector,
  enumField,
  handler,
  integerField,
  pagination,
  queryString,
  readJsonObject,
  stringField,
} from '../platform/http'
import type { TicketSort } from '../tickets/repository'
import { authorizedActor, readBody, type Platform } from './support'

const readSort = (collector: FieldCollector, value: string | null): TicketSort => {
  const raw = value ?? 'created_at'
  const descending = raw.startsWith('-')
  const field = descending ? raw.slice(1) : raw
  if (field === 'created_at' || field === 'priority' || field === 'ticket_no') return { field, descending }
  collector.fail('sort', 'must be one of created_at, priority, ticket_no')
  return { field: 'created_at', descending: false }
}

export function registerTicketRoutes(app: Hono, platform: Platform): void {
  app.post('/api/tickets', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.TICKET_CREATE)
    const body = await readJsonObject(context)
    const collector = new FieldCollector()
    const subject = stringField(collector, 'subject', body.subject, { max: 200 })
    const description = stringField(collector, 'description', body.description, { max: 5000 })
    const category = stringField(collector, 'category', body.category, { max: 50 })
    const priority = enumField(collector, 'priority', body.priority, PRIORITIES)
    collector.assertEmpty()
    const ticket = await platform.ticketService.createTicket(actor, {
      subject: subject as string,
      description: description as string,
      category: category as string,
      priority: priority as Priority,
    })
    return context.json({ ticket }, 201)
  }))

  app.get('/api/tickets', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.TICKET_READ)
    const collector = new FieldCollector()
    const { page, pageSize, offset } = pagination(context)
    const status = enumField(collector, 'status', queryString(context, 'status'), TICKET_STATUSES, { optional: true })
    const priority = enumField(collector, 'priority', queryString(context, 'priority'), PRIORITIES, { optional: true })
    const sort = readSort(collector, queryString(context, 'sort'))
    const assignee = queryString(context, 'assigneeMemberId')
    collector.assertEmpty()
    // 公司维度固定为会话公司；请求体/查询参数中的 companyId 不参与授权。
    const result = await platform.ticketService.listTickets(actor, {
      status: status ?? undefined,
      category: queryString(context, 'category') ?? undefined,
      priority: priority ?? undefined,
      groupId: queryString(context, 'groupId') ?? undefined,
      assigneeMemberId: assignee === 'me' ? actor.member.memberId : assignee ?? undefined,
      search: queryString(context, 'q') ?? undefined,
      sort,
      page,
      pageSize,
      offset,
    })
    return context.json(result)
  }))

  app.get('/api/tickets/:id', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.TICKET_READ)
    const ticket = await platform.ticketService.getTicket(actor, context.req.param('id') ?? '')
    return context.json({ ticket })
  }))

  app.get('/api/tickets/:id/notifications', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.TICKET_READ)
    const items = await platform.ticketService.listNotifications(actor, context.req.param('id') ?? '')
    return context.json({ items })
  }))

  app.post('/api/tickets/:id/replies', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.TICKET_REPLY)
    const body = await readJsonObject(context)
    const collector = new FieldCollector()
    const content = stringField(collector, 'content', body.content, { max: 5000 })
    collector.assertEmpty()
    const reply = await platform.ticketService.reply(actor, context.req.param('id') ?? '', content as string)
    return context.json({ reply }, 201)
  }))

  app.post('/api/tickets/:id/assign', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.TICKET_ASSIGN)
    const body = await readJsonObject(context)
    const collector = new FieldCollector()
    const groupId = stringField(collector, 'groupId', body.groupId, { max: 200 })
    const assigneeMemberId = stringField(collector, 'assigneeMemberId', body.assigneeMemberId, { max: 200, optional: true })
    collector.assertEmpty()
    const ticket = await platform.ticketService.assign(actor, context.req.param('id') ?? '', { groupId: groupId as string, assigneeMemberId })
    return context.json({ ticket })
  }))

  app.post('/api/tickets/:id/transfer', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.TICKET_TRANSFER)
    const body = await readJsonObject(context)
    const collector = new FieldCollector()
    const toMemberId = stringField(collector, 'toMemberId', body.toMemberId, { max: 200 })
    const toGroupId = stringField(collector, 'toGroupId', body.toGroupId, { max: 200, optional: true })
    const reason = stringField(collector, 'reason', body.reason, { max: 500, optional: true, min: 0 })
    collector.assertEmpty()
    const ticket = await platform.ticketService.transfer(actor, context.req.param('id') ?? '', { toMemberId: toMemberId as string, toGroupId, reason })
    return context.json({ ticket })
  }))

  app.post('/api/tickets/:id/complete', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.TICKET_COMPLETE)
    const body = await readBody(context)
    const collector = new FieldCollector()
    const resolution = stringField(collector, 'resolution', body.resolution, { max: 2000, optional: true, min: 0 })
    collector.assertEmpty()
    const { ticket, notification } = await platform.ticketService.complete(actor, context.req.param('id') ?? '', resolution)
    return context.json({
      ticket,
      notification: { id: notification.id, status: notification.status, error: notification.error, sentAt: notification.sentAt },
    })
  }))

  app.post('/api/tickets/:id/cancel', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.TICKET_CANCEL)
    const body = await readBody(context)
    const collector = new FieldCollector()
    const reason = stringField(collector, 'reason', body.reason, { max: 500, optional: true, min: 0 })
    collector.assertEmpty()
    const ticket = await platform.ticketService.cancel(actor, context.req.param('id') ?? '', reason)
    return context.json({ ticket })
  }))

  app.post('/api/tickets/:id/rating', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.TICKET_RATE)
    const body = await readJsonObject(context)
    const collector = new FieldCollector()
    const score = integerField(collector, 'score', body.score, { min: 1, max: 5 })
    const comment = stringField(collector, 'comment', body.comment, { max: 1000, optional: true, min: 0 })
    collector.assertEmpty()
    const rating = await platform.ticketService.rate(actor, context.req.param('id') ?? '', { score: score as number, comment })
    return context.json({ rating }, 201)
  }))
}
