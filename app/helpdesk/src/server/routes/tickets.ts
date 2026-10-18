// Ticket routes (contract §3): list/detail, drafts, idempotent submit, state
// machine, assign/transfer, online edits, rating, timeline and CSV export.
import type { Hono } from 'hono'
import { validation } from '../core/errors'
import { message } from '../core/messages'
import { requestLocale, requireSession, type AppEnv } from '../core/session'
import type { Platform } from '../platform/bootstrap'
import {
  addReply,
  assignTicket,
  cancelTicket,
  changeCategory,
  changePriority,
  confirmTicket,
  createDraft,
  deleteDraft,
  exportTicketsCsv,
  getTicketDetail,
  holdTicket,
  listTickets,
  rateTicket,
  rejectTicket,
  resolveTicket,
  resumeTicket,
  startProcessing,
  submitTicket,
  ticketActivities,
  timeline,
  transferTicket,
  updateDraft,
  type TicketDraftInput,
} from '../services/tickets'
import { csvResponse, numericParam, safeJsonBody, stringOf } from './helpers'

function draftInputFrom(body: Record<string, unknown>): TicketDraftInput {
  const input: TicketDraftInput = {
    subjectZh: stringOf(body, 'subjectZh'),
    description: stringOf(body, 'description'),
    categoryId: Number(body.categoryId),
    priority: stringOf(body, 'priority'),
  }
  if (body.subjectEn !== undefined) input.subjectEn = stringOf(body, 'subjectEn') || null
  if (body.subCategoryId !== undefined) input.subCategoryId = body.subCategoryId === null ? null : Number(body.subCategoryId)
  if (Array.isArray(body.attachmentIds)) input.attachmentIds = body.attachmentIds.map((id) => Number(id))
  return input
}

function draftPatchFrom(body: Record<string, unknown>): Partial<TicketDraftInput> {
  const input: Partial<TicketDraftInput> = {}
  if (body.subjectZh !== undefined) input.subjectZh = stringOf(body, 'subjectZh')
  if (body.subjectEn !== undefined) input.subjectEn = stringOf(body, 'subjectEn') || null
  if (body.description !== undefined) input.description = stringOf(body, 'description')
  if (body.categoryId !== undefined) input.categoryId = Number(body.categoryId)
  if (body.subCategoryId !== undefined) input.subCategoryId = body.subCategoryId === null ? null : Number(body.subCategoryId)
  if (body.priority !== undefined) input.priority = stringOf(body, 'priority')
  if (Array.isArray(body.attachmentIds)) input.attachmentIds = body.attachmentIds.map((id) => Number(id))
  return input
}

function requireIdempotencyKey(body: Record<string, unknown>): string {
  const key = body.idempotencyKey
  if (typeof key !== 'string' || !key.trim()) {
    throw validation('idempotencyKey is required', ['idempotencyKey'])
  }
  return key
}

export function registerTicketRoutes(app: Hono<AppEnv>, platform: Platform): void {
  const db = platform.db

  app.get('/api/tickets', async (c) => {
    const user = requireSession(c)
    return c.json(await listTickets(db, user, c.req.query(), requestLocale(c)))
  })

  // Registered before /api/tickets/:id so the literal segment wins.
  app.get('/api/tickets/export.csv', async (c) => {
    const user = requireSession(c)
    return csvResponse(await exportTicketsCsv(db, user, c.req.query(), requestLocale(c)))
  })

  app.post('/api/tickets', async (c) => {
    const user = requireSession(c)
    const locale = requestLocale(c)
    const body = await safeJsonBody(c)
    const { ticket, replay } = await createDraft(db, user, draftInputFrom(body), requireIdempotencyKey(body), locale)
    if (replay) return c.json({ ...ticket, idempotentReplay: true })
    return c.json(ticket, 201)
  })

  app.get('/api/tickets/:id', async (c) => {
    const user = requireSession(c)
    return c.json(await getTicketDetail(db, user, numericParam(c, 'id'), requestLocale(c)))
  })

  app.patch('/api/tickets/:id', async (c) => {
    const user = requireSession(c)
    const detail = await updateDraft(db, user, numericParam(c, 'id'), draftPatchFrom(await safeJsonBody(c)), requestLocale(c))
    return c.json(detail)
  })

  app.delete('/api/tickets/:id', async (c) => {
    const user = requireSession(c)
    await deleteDraft(db, user, numericParam(c, 'id'), requestLocale(c))
    return c.body(null, 204)
  })

  app.post('/api/tickets/:id/submit', async (c) => {
    const user = requireSession(c)
    const locale = requestLocale(c)
    const outcome = await submitTicket(db, user, numericParam(c, 'id'), requireIdempotencyKey(await safeJsonBody(c)), locale)
    return c.json({ ticket: outcome.ticket, assignment: outcome.assignment })
  })

  app.post('/api/tickets/:id/replies', async (c) => {
    const user = requireSession(c)
    const locale = requestLocale(c)
    const result = await addReply(
      db,
      user,
      numericParam(c, 'id'),
      { body: stringOf(await safeJsonBody(c), 'body') },
      locale,
    )
    return c.json(result, 201)
  })

  app.post('/api/tickets/:id/start', async (c) => {
    const user = requireSession(c)
    return c.json(await startProcessing(db, user, numericParam(c, 'id'), requestLocale(c)))
  })

  app.post('/api/tickets/:id/resolve', async (c) => {
    const user = requireSession(c)
    const locale = requestLocale(c)
    const detail = await resolveTicket(db, user, numericParam(c, 'id'), stringOf(await safeJsonBody(c), 'resolutionNote'), locale)
    return c.json(detail)
  })

  app.post('/api/tickets/:id/confirm', async (c) => {
    const user = requireSession(c)
    return c.json(await confirmTicket(db, user, numericParam(c, 'id'), requestLocale(c)))
  })

  app.post('/api/tickets/:id/reject', async (c) => {
    const user = requireSession(c)
    const locale = requestLocale(c)
    const detail = await rejectTicket(db, user, numericParam(c, 'id'), stringOf(await safeJsonBody(c), 'reason'), locale)
    return c.json(detail)
  })

  app.post('/api/tickets/:id/cancel', async (c) => {
    const user = requireSession(c)
    const locale = requestLocale(c)
    const detail = await cancelTicket(db, user, numericParam(c, 'id'), stringOf(await safeJsonBody(c), 'reason'), locale)
    return c.json(detail)
  })

  app.post('/api/tickets/:id/hold', async (c) => {
    const user = requireSession(c)
    const locale = requestLocale(c)
    const body = await safeJsonBody(c)
    const detail = await holdTicket(
      db,
      user,
      numericParam(c, 'id'),
      {
        reason: stringOf(body, 'reason'),
        note: typeof body.note === 'string' ? body.note : undefined,
        expectedResumeAt: typeof body.expectedResumeAt === 'string' ? body.expectedResumeAt : undefined,
      },
      locale,
    )
    return c.json(detail)
  })

  app.post('/api/tickets/:id/resume', async (c) => {
    const user = requireSession(c)
    return c.json(await resumeTicket(db, user, numericParam(c, 'id'), requestLocale(c)))
  })

  app.post('/api/tickets/:id/assign', async (c) => {
    const user = requireSession(c)
    const locale = requestLocale(c)
    const body = await safeJsonBody(c)
    const teamId = Number(body.teamId)
    const userId = Number(body.userId)
    if (!Number.isInteger(teamId) || !Number.isInteger(userId)) {
      throw validation(message(locale, 'validation'), ['teamId', 'userId'])
    }
    return c.json(await assignTicket(db, user, numericParam(c, 'id'), { teamId, userId }, locale))
  })

  app.post('/api/tickets/:id/transfer', async (c) => {
    const user = requireSession(c)
    const locale = requestLocale(c)
    const body = await safeJsonBody(c)
    const targetDepartmentId = Number(body.targetDepartmentId)
    if (!Number.isInteger(targetDepartmentId)) {
      throw validation(message(locale, 'validation'), ['targetDepartmentId'])
    }
    const detail = await transferTicket(
      db,
      user,
      numericParam(c, 'id'),
      {
        targetDepartmentId,
        targetUserId: body.targetUserId === undefined || body.targetUserId === null ? undefined : Number(body.targetUserId),
      },
      locale,
    )
    return c.json(detail)
  })

  app.patch('/api/tickets/:id/category', async (c) => {
    const user = requireSession(c)
    const locale = requestLocale(c)
    const categoryId = Number((await safeJsonBody(c)).categoryId)
    if (!Number.isInteger(categoryId)) {
      throw validation(message(locale, 'validation'), ['categoryId'])
    }
    return c.json(await changeCategory(db, user, numericParam(c, 'id'), categoryId, locale))
  })

  app.patch('/api/tickets/:id/priority', async (c) => {
    const user = requireSession(c)
    const detail = await changePriority(db, user, numericParam(c, 'id'), stringOf(await safeJsonBody(c), 'priority'), requestLocale(c))
    return c.json(detail)
  })

  app.post('/api/tickets/:id/rating', async (c) => {
    const user = requireSession(c)
    const locale = requestLocale(c)
    const body = await safeJsonBody(c)
    const score = Number(body.score)
    const result = await rateTicket(
      db,
      user,
      numericParam(c, 'id'),
      { score, comment: typeof body.comment === 'string' ? body.comment : undefined },
      locale,
    )
    return c.json(result, 201)
  })

  app.get('/api/tickets/:id/timeline', async (c) => {
    const user = requireSession(c)
    const items = await timeline(db, user, numericParam(c, 'id'), requestLocale(c))
    return c.json({ items })
  })

  app.get('/api/tickets/:id/activities', async (c) => {
    const user = requireSession(c)
    return c.json(await ticketActivities(db, user, numericParam(c, 'id'), requestLocale(c)))
  })
}
