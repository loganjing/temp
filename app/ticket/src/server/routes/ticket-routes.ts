import type { Hono } from 'hono'
import { TICKET_PRIORITIES, type TicketPriority } from '../../shared/ticket-contracts'
import { notFound, requireText, throwIfInvalid } from '../errors'
import type { IdentityService } from '../services/identity'
import type { NotificationService } from '../services/notifications'
import type { TicketListQuery, TicketService } from '../services/tickets'
import { currentIdentity, jsonBody, optionalNumber, optionalString } from './helpers'

export function registerTicketRoutes(
  app: Hono,
  identityService: IdentityService,
  tickets: TicketService,
  notifications: NotificationService,
) {
  app.get('/api/tickets', async (context) => {
    const actor = await currentIdentity(context, identityService)
    const query: TicketListQuery = {
      scope: context.req.query('scope'),
      status: context.req.queries('status'),
      priority: context.req.queries('priority'),
      categoryId: optionalString(context.req.query('categoryId')),
      groupId: optionalString(context.req.query('groupId')),
      companyId: optionalString(context.req.query('companyId')),
      submitterId: optionalString(context.req.query('submitterId')),
      from: optionalString(context.req.query('from')),
      to: optionalString(context.req.query('to')),
      q: optionalString(context.req.query('q')),
      sort: optionalString(context.req.query('sort')),
      order: optionalString(context.req.query('order')),
      page: optionalNumber(context.req.query('page')),
      pageSize: optionalNumber(context.req.query('pageSize')),
    }
    return context.json(await tickets.listTickets(query, actor))
  })

  app.post('/api/tickets', async (context) => {
    const actor = await currentIdentity(context, identityService)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const subject = requireText(body.subject, 'subject', '主题', 120, errors)
    const description = requireText(body.description, 'description', '描述', 5000, errors)
    const categoryId = requireText(body.categoryId, 'categoryId', '分类', 100, errors)
    if (!(TICKET_PRIORITIES as readonly unknown[]).includes(body.priority)) errors.priority = '优先级取值不正确'
    throwIfInvalid(errors)
    const ticket = await tickets.createTicket(
      { subject: subject!, description: description!, categoryId: categoryId!, priority: body.priority as TicketPriority },
      actor,
    )
    return context.json({ ticket }, 201)
  })

  app.get('/api/tickets/:id', async (context) => {
    const actor = await currentIdentity(context, identityService)
    return context.json(await tickets.getTicketDetail(context.req.param('id'), actor))
  })

  app.get('/api/tickets/:id/logs', async (context) => {
    const actor = await currentIdentity(context, identityService)
    return context.json(await tickets.getTicketLogs(context.req.param('id'), actor))
  })

  app.post('/api/tickets/:id/replies', async (context) => {
    const actor = await currentIdentity(context, identityService)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const content = requireText(body.content, 'content', '回复内容', 2000, errors)
    throwIfInvalid(errors)
    return context.json({ reply: await tickets.addReply(context.req.param('id'), content!, actor) }, 201)
  })

  app.post('/api/tickets/:id/assign', async (context) => {
    const actor = await currentIdentity(context, identityService)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const groupId = requireText(body.groupId, 'groupId', '业务组', 100, errors)
    const assigneeId = requireText(body.assigneeId, 'assigneeId', '处理人', 100, errors, { required: false })
    throwIfInvalid(errors)
    return context.json({ ticket: await tickets.assignTicket(context.req.param('id'), { groupId: groupId!, assigneeId }, actor) })
  })

  app.post('/api/tickets/:id/transfer', async (context) => {
    const actor = await currentIdentity(context, identityService)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const groupId = requireText(body.groupId, 'groupId', '业务组', 100, errors)
    const assigneeId = requireText(body.assigneeId, 'assigneeId', '处理人', 100, errors, { required: false })
    const note = requireText(body.note, 'note', '转派说明', 500, errors, { required: false })
    throwIfInvalid(errors)
    return context.json({ ticket: await tickets.transferTicket(context.req.param('id'), { groupId: groupId!, assigneeId, note }, actor) })
  })

  app.post('/api/tickets/:id/complete', async (context) => {
    const actor = await currentIdentity(context, identityService)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const note = requireText(body.note, 'note', '处理说明', 500, errors, { required: false })
    throwIfInvalid(errors)
    const ticket = await tickets.completeTicket(context.req.param('id'), note, actor)
    const notification = await notifications.notifyCompleted(ticket.id, actor)
    return context.json({ ticket, notification })
  })

  app.post('/api/tickets/:id/cancel', async (context) => {
    const actor = await currentIdentity(context, identityService)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    const reason = requireText(body.reason, 'reason', '取消原因', 500, errors, { required: false })
    throwIfInvalid(errors)
    return context.json({ ticket: await tickets.cancelTicket(context.req.param('id'), reason, actor) })
  })

  app.post('/api/tickets/:id/rating', async (context) => {
    const actor = await currentIdentity(context, identityService)
    const body = await jsonBody(context)
    const errors: Record<string, string> = {}
    if (typeof body.score !== 'number' || !Number.isInteger(body.score) || body.score < 1 || body.score > 5) {
      errors.score = '评分必须是 1 到 5 的整数'
    }
    const comment = requireText(body.comment, 'comment', '评语', 500, errors, { required: false })
    throwIfInvalid(errors)
    return context.json({ rating: await tickets.rateTicket(context.req.param('id'), { score: body.score as number, comment }, actor) }, 201)
  })

  app.post('/api/tickets/:id/notifications/:notificationId/retry', async (context) => {
    const actor = await currentIdentity(context, identityService)
    return context.json({
      notification: await notifications.retryNotification(context.req.param('id'), context.req.param('notificationId'), actor),
    })
  })

  app.all('/api/tickets/*', (context) => {
    throw notFound('接口不存在')
  })
}
