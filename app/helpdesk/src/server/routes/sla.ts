// SLA policy, work calendar and holiday routes (contract §6): admin only.
import type { Hono } from 'hono'
import { requestLocale, type AppEnv } from '../core/session'
import type { Platform } from '../platform/bootstrap'
import * as sla from '../services/slaConfig'
import { numericParam, requireAdmin, safeJsonBody, stringOf } from './helpers'

function policyInputFrom(body: Record<string, unknown>): sla.SlaPolicyInput {
  return {
    categoryId: Number(body.categoryId),
    firstResponseMinutes: Number(body.firstResponseMinutes),
    resolutionMinutes: Number(body.resolutionMinutes),
    warnThresholdPercent: body.warnThresholdPercent === undefined ? undefined : Number(body.warnThresholdPercent),
  }
}

function policyPatchFrom(body: Record<string, unknown>): Partial<sla.SlaPolicyInput> {
  const patch: Partial<sla.SlaPolicyInput> = {}
  if (body.categoryId !== undefined) patch.categoryId = Number(body.categoryId)
  if (body.firstResponseMinutes !== undefined) patch.firstResponseMinutes = Number(body.firstResponseMinutes)
  if (body.resolutionMinutes !== undefined) patch.resolutionMinutes = Number(body.resolutionMinutes)
  if (body.warnThresholdPercent !== undefined) patch.warnThresholdPercent = Number(body.warnThresholdPercent)
  return patch
}

export function registerSlaRoutes(app: Hono<AppEnv>, platform: Platform): void {
  const db = platform.db

  app.get('/api/admin/sla-policies', async (c) => {
    requireAdmin(c)
    return c.json(await sla.listSlaPolicies(db, requestLocale(c)))
  })

  app.post('/api/admin/sla-policies', async (c) => {
    const actor = requireAdmin(c)
    await sla.createSlaPolicy(db, actor, policyInputFrom(await safeJsonBody(c)), requestLocale(c))
    return c.json({ ok: true })
  })

  app.patch('/api/admin/sla-policies/:id', async (c) => {
    const actor = requireAdmin(c)
    await sla.updateSlaPolicy(db, actor, numericParam(c, 'id'), policyPatchFrom(await safeJsonBody(c)), requestLocale(c))
    return c.json({ ok: true })
  })

  app.get('/api/admin/calendar', async (c) => {
    requireAdmin(c)
    return c.json(await sla.getCalendar(db))
  })

  app.put('/api/admin/calendar', async (c) => {
    const actor = requireAdmin(c)
    const body = await safeJsonBody(c)
    await sla.putCalendar(
      db,
      actor,
      {
        weekdays: Array.isArray(body.weekdays) ? body.weekdays.map(Number) : [],
        workStartTime: stringOf(body, 'workStartTime'),
        workEndTime: stringOf(body, 'workEndTime'),
        timezone: stringOf(body, 'timezone'),
      },
      requestLocale(c),
    )
    return c.json({ ok: true })
  })

  app.get('/api/admin/holidays', async (c) => {
    requireAdmin(c)
    return c.json(await sla.listHolidays(db, requestLocale(c)))
  })

  app.post('/api/admin/holidays', async (c) => {
    const actor = requireAdmin(c)
    const body = await safeJsonBody(c)
    await sla.createHoliday(
      db,
      actor,
      {
        date: stringOf(body, 'date'),
        nameZh: stringOf(body, 'nameZh'),
        nameEn: stringOf(body, 'nameEn') || null,
      },
      requestLocale(c),
    )
    return c.json({ ok: true })
  })

  app.delete('/api/admin/holidays/:id', async (c) => {
    const actor = requireAdmin(c)
    await sla.deleteHoliday(db, actor, numericParam(c, 'id'), requestLocale(c))
    return c.json({ ok: true })
  })
}
