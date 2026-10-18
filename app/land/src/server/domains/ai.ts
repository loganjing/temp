/**
 * ai 域（P1 预留）：建议→确认→候选方案管道（契约第 12 节 / AC-15）。
 * provider 适配层配置化（AI_PROVIDER_URL）；调用失败 502 AI_PROVIDER_UNAVAILABLE 且无部分写入。
 */
import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import type { Platform } from '../platform/bootstrap'
import { newId } from '../platform/authorization'
import { errors, readJsonBody, requiredString, optionalString, optionalEnum, currentActor } from '../lib/api'
import { auditEvent, loadParcel, loadPlan, nowIso, parseJsonColumn, requirePermission, type DomainRoutes, type Row } from '../lib/db'
import { loadPlanInputs, savePlanInputs } from './plans'

export const AI_SUGGESTION_KINDS = ['market-summary', 'plan-adjustment'] as const
export const AI_SUGGESTION_STATUSES = ['pending', 'confirmed', 'dismissed'] as const

type ProviderResult = { content: Record<string, unknown>; sources: Array<{ refType: string; refId: string | null; confidence: string; note: string | null }> }

interface AiProvider {
  available: boolean
  generate(request: { kind: string; parcelId: string; prompt: string | null; targetPlanId: string | null }): Promise<ProviderResult>
}

/** provider 适配层：AI_PROVIDER_URL 未配置时 available=false；调用失败抛错（502，无部分写入）。 */
export function createAiProvider(): AiProvider {
  const url = process.env.AI_PROVIDER_URL
  if (!url) {
    return {
      available: false,
      async generate() {
        throw errors.aiProviderUnavailable()
      },
    }
  }
  return {
    available: true,
    async generate(request) {
      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(process.env.AI_PROVIDER_KEY ? { Authorization: `Bearer ${process.env.AI_PROVIDER_KEY}` } : {}) },
          body: JSON.stringify(request),
        })
      } catch {
        throw errors.aiProviderUnavailable()
      }
      if (!response.ok) throw errors.aiProviderUnavailable()
      const payload = await response.json().catch(() => null) as { content?: unknown; sources?: unknown } | null
      if (!payload || typeof payload !== 'object' || typeof payload.content !== 'object' || payload.content === null) {
        throw errors.aiProviderUnavailable()
      }
      const sources = Array.isArray(payload.sources)
        ? payload.sources.map((entry) => {
            const record = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>
            return {
              refType: String(record.refType ?? 'public-clue'),
              refId: record.refId === undefined || record.refId === null ? null : String(record.refId),
              confidence: String(record.confidence ?? 'unverified'),
              note: record.note === undefined || record.note === null ? null : String(record.note),
            }
          })
        : []
      return { content: payload.content as Record<string, unknown>, sources }
    },
  }
}

function mapSuggestion(row: Row) {
  return {
    id: String(row.id),
    status: String(row.status),
    kind: String(row.kind),
    parcelId: String(row.parcel_id),
    targetPlanId: row.target_plan_id === null ? null : String(row.target_plan_id),
    prompt: row.prompt === null ? null : String(row.prompt),
    content: row.content_json === null ? null : parseJsonColumn<unknown>(row.content_json, null),
    sources: row.sources_json === null ? [] : parseJsonColumn<unknown[]>(row.sources_json, []),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
  }
}

async function insertSuggestion(db: DbClient, entry: {
  id: string; parcelId: string; kind: string; targetPlanId: string | null; prompt: string | null
  content: Record<string, unknown>; sources: ProviderResult['sources']; createdBy: string
}): Promise<Row> {
  const timestamp = nowIso()
  await db.run({
    text: 'INSERT INTO ai_suggestions (id, parcel_id, kind, target_plan_id, prompt, status, content_json, sources_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [entry.id, entry.parcelId, entry.kind, entry.targetPlanId, entry.prompt, 'pending', JSON.stringify(entry.content), JSON.stringify(entry.sources), entry.createdBy, timestamp],
  })
  const row = await db.queryOne<Row>({ text: 'SELECT * FROM ai_suggestions WHERE id = ?', params: [entry.id] })
  return row!
}

export const registerAiRoutes: DomainRoutes = (app, platform) => {
  const provider = createAiProvider()

  app.post('/api/ai/suggestions', async (context) => {
    const actor = currentActor(context)
    const body = await readJsonBody(context)
    const parcelId = requiredString(body.parcelId, 'parcelId', 100)
    await loadParcel(platform.db, parcelId)
    const kind = optionalEnum(body.kind, 'kind', AI_SUGGESTION_KINDS)
    if (!kind) throw errors.validationFailed([{ field: 'kind', reason: `must be one of ${AI_SUGGESTION_KINDS.join(' | ')}` }])
    const prompt = optionalString(body.prompt, 'prompt', 4000)
    const targetPlanId = optionalString(body.targetPlanId, 'targetPlanId', 100)
    if (kind === 'plan-adjustment' && !targetPlanId) {
      throw errors.validationFailed([{ field: 'targetPlanId', reason: 'plan-adjustment suggestions require targetPlanId' }])
    }
    if (targetPlanId) {
      const plan = await loadPlan(platform.db, targetPlanId)
      if (String(plan.parcel_id) !== parcelId) {
        throw errors.validationFailed([{ field: 'targetPlanId', reason: 'target plan belongs to another parcel' }])
      }
    }
    await requirePermission(context, platform, kind === 'market-summary' ? 'quick-assessments:write' : 'plans:read')
    // provider 调用失败时抛 ApiError(502)，此前不产生任何写入（契约边界）。
    const result = await provider.generate({ kind, parcelId, prompt, targetPlanId })
    const id = newId('ais')
    const row = await insertSuggestion(platform.db, {
      id, parcelId, kind, targetPlanId, prompt,
      content: { ...result.content, provider: process.env.AI_PROVIDER_URL ?? 'configured' },
      sources: result.sources,
      createdBy: actor.id,
    })
    await auditEvent(platform, { type: 'ai.suggestion.created', actorUserId: actor.id, objectType: 'ai-suggestion', objectId: id, summary: `生成 ${kind} 建议` })
    return context.json(mapSuggestion(row), 201)
  })

  app.post('/api/ai/suggestions/:id/confirm', async (context) => {
    await requirePermission(context, platform, 'plans:write')
    const actor = currentActor(context)
    const id = context.req.param('id')
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM ai_suggestions WHERE id = ?', params: [id] })
    if (!row) throw errors.notFound('AI suggestion not found')
    if (String(row.status) !== 'pending') {
      throw errors.statusConflict(`suggestion is already ${String(row.status)}`)
    }
    const kind = String(row.kind)
    const parcelId = String(row.parcel_id)
    if (kind === 'plan-adjustment') {
      const targetPlanId = row.target_plan_id === null ? null : String(row.target_plan_id)
      if (!targetPlanId) throw errors.statusConflict('suggestion has no target plan')
      const target = await loadPlan(platform.db, targetPlanId)
      if (String(target.owner_id) !== actor.id) {
        throw errors.forbidden('Only the target plan owner can confirm an adjustment suggestion')
      }
      // copy 语义派生候选方案：sourcePlanId=目标方案，assumptionTags 注明 AI 建议；行 ID 由 savePlanInputs 服务端重生成。
      const inputs = await loadPlanInputs(platform.db, targetPlanId)
      const newPlanId = newId('pln')
      const timestamp = nowIso()
      const assumptionTags = parseJsonColumn<string[]>(target.assumption_tags_json, [])
      assumptionTags.push('AI 建议派生')
      await platform.db.transaction(async (tx) => {
        await tx.run({
          text: `INSERT INTO plans (id, parcel_id, name, kind, status, source_plan_id, copied_at, copied_by, change_note, owner_id, assumption_tags_json, parameter_refs_json, phase_count, area_basis_json, parking_json, land_price_json, results_json, created_at, updated_at)
                 VALUES (?, ?, ?, 'candidate', 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          params: [newPlanId, parcelId, `${String(target.name)}（AI 建议）`, targetPlanId, timestamp, actor.id, 'AI 建议确认派生', actor.id, JSON.stringify(assumptionTags), target.parameter_refs_json, Number(target.phase_count), target.area_basis_json, target.parking_json, target.land_price_json, timestamp, timestamp],
        })
        await savePlanInputs(tx, newPlanId, inputs)
      })
      await platform.db.run({ text: 'UPDATE ai_suggestions SET status = ? WHERE id = ?', params: ['confirmed', id] })
      await auditEvent(platform, {
        type: 'ai.suggestion.confirmed',
        actorUserId: actor.id,
        objectType: 'ai-suggestion',
        objectId: id,
        summary: `确认建议并派生候选方案 ${newPlanId}`,
        metadata: { derivedPlanId: newPlanId, sourcePlanId: targetPlanId },
      })
      const plan = await loadPlan(platform.db, newPlanId)
      const refreshed = await platform.db.queryOne<Row>({ text: 'SELECT * FROM ai_suggestions WHERE id = ?', params: [id] })
      return context.json({ suggestion: mapSuggestion(refreshed!), derivedPlan: { id: newPlanId, name: String(plan.name), kind: 'candidate', status: 'draft', sourcePlanId: targetPlanId } })
    }
    // market-summary：转入市场资料（confidence 由确认人复核后标注；AI 来源默认 unverified 起步）。
    const content = parseJsonColumn<Record<string, unknown>>(row.content_json, {})
    const created: string[] = []
    const entries = Array.isArray(content.comps) ? content.comps : []
    for (const entry of entries) {
      const record = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>
      const entryId = newId('mc')
      await platform.db.run({
        text: `INSERT INTO market_comps (id, parcel_id, project_name, distance_km, format, type_tier, unit_area_from, unit_area_to, asking_price, price_per_sqft, total_units, sold_units, absorption_rate, positioning, incentives, affordable_flag, project_status, source, source_type, collected_at, confidence, note)
               VALUES (?, ?, ?, ?, 'other', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'unknown', ?, 'market-judgment', ?, 'unverified', ?)`,
        params: [entryId, parcelId, String(record.projectName ?? 'AI 汇总竞品'), optionalString(record.distanceKm, 'distanceKm', 40), String(record.source ?? 'AI 建议'), nowIso(), optionalString(record.note, 'note', 2000)],
      })
      created.push(entryId)
    }
    await platform.db.run({ text: 'UPDATE ai_suggestions SET status = ? WHERE id = ?', params: ['confirmed', id] })
    await auditEvent(platform, {
      type: 'ai.suggestion.confirmed',
      actorUserId: actor.id,
      objectType: 'ai-suggestion',
      objectId: id,
      summary: `确认市场汇总建议并转入市场资料（${created.length} 条）`,
      metadata: { marketEntries: created },
    })
    const refreshed = await platform.db.queryOne<Row>({ text: 'SELECT * FROM ai_suggestions WHERE id = ?', params: [id] })
    return context.json({ suggestion: mapSuggestion(refreshed!), marketEntries: created })
  })

  app.post('/api/ai/suggestions/:id/dismiss', async (context) => {
    const actor = currentActor(context)
    const id = context.req.param('id')
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM ai_suggestions WHERE id = ?', params: [id] })
    if (!row) throw errors.notFound('AI suggestion not found')
    if (String(row.status) === 'pending') {
      await platform.db.run({ text: 'UPDATE ai_suggestions SET status = ? WHERE id = ?', params: ['dismissed', id] })
    }
    await auditEvent(platform, { type: 'ai.suggestion.dismissed', actorUserId: actor.id, objectType: 'ai-suggestion', objectId: id, summary: '驳回 AI 建议' })
    const refreshed = await platform.db.queryOne<Row>({ text: 'SELECT * FROM ai_suggestions WHERE id = ?', params: [id] })
    return context.json(mapSuggestion(refreshed!))
  })
}
