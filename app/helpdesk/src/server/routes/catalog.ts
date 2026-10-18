// Catalog routes (contract §5): admin categories/subcategories, business
// category options and assignment-rule CRUD + CSV.
import type { Hono } from 'hono'
import { validation } from '../core/errors'
import { message } from '../core/messages'
import { requestLocale, requireSession, type AppEnv } from '../core/session'
import type { Platform } from '../platform/bootstrap'
import * as catalog from '../services/catalog'
import { csvResponse, numericParam, pageParam, requireAdmin, safeJsonBody, stringOf } from './helpers'

function statusOf(body: Record<string, unknown>): number | string | undefined {
  const value = body.status
  return typeof value === 'number' || typeof value === 'string' ? value : undefined
}

function categoryInputFrom(body: Record<string, unknown>): catalog.CategoryInput {
  return {
    code: stringOf(body, 'code'),
    nameZh: stringOf(body, 'nameZh'),
    nameEn: stringOf(body, 'nameEn') || null,
    departmentId: body.departmentId === undefined || body.departmentId === null ? null : Number(body.departmentId),
    ticketType: stringOf(body, 'ticketType'),
    sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
    status: statusOf(body),
  }
}

function categoryPatchFrom(body: Record<string, unknown>): Partial<catalog.CategoryInput> {
  const patch: Partial<catalog.CategoryInput> = {}
  if (body.code !== undefined) patch.code = stringOf(body, 'code')
  if (body.nameZh !== undefined) patch.nameZh = stringOf(body, 'nameZh')
  if (body.nameEn !== undefined) patch.nameEn = stringOf(body, 'nameEn') || null
  if (body.departmentId !== undefined) patch.departmentId = body.departmentId === null ? null : Number(body.departmentId)
  if (body.ticketType !== undefined) patch.ticketType = stringOf(body, 'ticketType')
  if (body.sortOrder !== undefined) patch.sortOrder = Number(body.sortOrder)
  if (body.status !== undefined) patch.status = statusOf(body)
  return patch
}

function subcategoryInputFrom(body: Record<string, unknown>): catalog.SubcategoryInput {
  return {
    code: stringOf(body, 'code'),
    nameZh: stringOf(body, 'nameZh'),
    nameEn: stringOf(body, 'nameEn') || null,
    categoryId: Number(body.categoryId),
    sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
    status: statusOf(body),
  }
}

function subcategoryPatchFrom(body: Record<string, unknown>): Partial<catalog.SubcategoryInput> {
  const patch: Partial<catalog.SubcategoryInput> = {}
  if (body.code !== undefined) patch.code = stringOf(body, 'code')
  if (body.nameZh !== undefined) patch.nameZh = stringOf(body, 'nameZh')
  if (body.nameEn !== undefined) patch.nameEn = stringOf(body, 'nameEn') || null
  if (body.categoryId !== undefined) patch.categoryId = Number(body.categoryId)
  if (body.sortOrder !== undefined) patch.sortOrder = Number(body.sortOrder)
  if (body.status !== undefined) patch.status = statusOf(body)
  return patch
}

export function registerCatalogRoutes(app: Hono<AppEnv>, platform: Platform): void {
  const db = platform.db

  app.get('/api/admin/categories', async (c) => {
    const locale = requestLocale(c)
    requireAdmin(c)
    return c.json(await catalog.listCategories(db, pageParam(c), locale))
  })

  app.post('/api/admin/categories', async (c) => {
    const locale = requestLocale(c)
    const actor = requireAdmin(c)
    await catalog.createCategory(db, actor, categoryInputFrom(await safeJsonBody(c)), locale)
    return c.json({ ok: true })
  })

  app.patch('/api/admin/categories/:id', async (c) => {
    const locale = requestLocale(c)
    const actor = requireAdmin(c)
    await catalog.updateCategory(db, actor, numericParam(c, 'id'), categoryPatchFrom(await safeJsonBody(c)), locale)
    return c.json({ ok: true })
  })

  app.get('/api/categories/options', async (c) => {
    requireSession(c)
    return c.json(await catalog.categoryOptions(db, requestLocale(c)))
  })

  app.post('/api/admin/subcategories', async (c) => {
    const locale = requestLocale(c)
    const actor = requireAdmin(c)
    await catalog.createSubcategory(db, actor, subcategoryInputFrom(await safeJsonBody(c)), locale)
    return c.json({ ok: true })
  })

  app.patch('/api/admin/subcategories/:id', async (c) => {
    const locale = requestLocale(c)
    const actor = requireAdmin(c)
    await catalog.updateSubcategory(db, actor, numericParam(c, 'id'), subcategoryPatchFrom(await safeJsonBody(c)), locale)
    return c.json({ ok: true })
  })

  app.get('/api/admin/assignment-rules', async (c) => {
    const locale = requestLocale(c)
    requireAdmin(c)
    return c.json(await catalog.listAssignmentRules(db, c.req.query('q'), locale))
  })

  app.post('/api/admin/assignment-rules', async (c) => {
    const locale = requestLocale(c)
    const actor = requireAdmin(c)
    const body = await safeJsonBody(c)
    const teamIds = Array.isArray(body.teamIds) ? body.teamIds.map((id) => Number(id)) : []
    await catalog.createAssignmentRule(db, actor, { categoryId: Number(body.categoryId), teamIds }, locale)
    return c.json({ ok: true })
  })

  app.patch('/api/admin/assignment-rules/:id', async (c) => {
    const locale = requestLocale(c)
    const actor = requireAdmin(c)
    const body = await safeJsonBody(c)
    const teamIds = Array.isArray(body.teamIds) ? body.teamIds.map((id) => Number(id)) : []
    await catalog.updateAssignmentRule(db, actor, numericParam(c, 'id'), { teamIds }, locale)
    return c.json({ ok: true })
  })

  app.delete('/api/admin/assignment-rules/:id', async (c) => {
    const locale = requestLocale(c)
    const actor = requireAdmin(c)
    await catalog.deleteAssignmentRule(db, actor, numericParam(c, 'id'), locale)
    return c.json({ ok: true })
  })

  app.get('/api/admin/assignment-rules/export.csv', async (c) => {
    requireAdmin(c)
    return csvResponse(await catalog.exportAssignmentRulesCsv(db))
  })

  app.post('/api/admin/assignment-rules/import', async (c) => {
    const locale = requestLocale(c)
    const actor = requireAdmin(c)
    const body = await safeJsonBody(c)
    if (!Array.isArray(body.rows)) {
      throw validation(message(locale, 'validation'), ['rows'])
    }
    const applied = await catalog.importAssignmentRules(db, actor, body.rows as catalog.RuleImportRow[], locale)
    return c.json({ applied })
  })
}
