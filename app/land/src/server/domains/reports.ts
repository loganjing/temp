/**
 * report 域：管理层看板（结论优先）、投资报告聚合、下游交接与受控导出（契约第 10 节 / AC-09、AC-10）。
 */
import type { Hono } from 'hono'
import type { Platform } from '../platform/bootstrap'
import { newId } from '../platform/authorization'
import { errors, currentActor } from '../lib/api'
import { auditEvent, loadParcel, loadPlan, nowIso, parseJsonColumn, requirePermission, type DomainRoutes, type Row } from '../lib/db'

type ResultShape = {
  revenue?: { gdv?: string; netGdv?: string }
  costs?: { tdc?: string; byCategory?: Array<{ category: string; amount: string; items?: unknown[] }> }
  profit?: { pbt?: string; pm?: string }
  efficiencyExParking?: string
}

async function latestFormalizedOrAdopted(db: Platform['db'], parcelId: string): Promise<Row | null> {
  const adopted = await db.queryOne<Row>({ text: "SELECT * FROM plans WHERE parcel_id = ? AND status = 'adopted' ORDER BY updated_at DESC LIMIT 1", params: [parcelId] })
  if (adopted) return adopted
  return db.queryOne<Row>({
    text: "SELECT * FROM plans WHERE parcel_id = ? AND status IN ('formalized', 'in_review', 'not_selected', 'returned') ORDER BY updated_at DESC LIMIT 1",
    params: [parcelId],
  })
}

function coreMetrics(results: ResultShape) {
  return {
    gdv: results.revenue?.gdv ?? null,
    netGdv: results.revenue?.netGdv ?? null,
    tdc: results.costs?.tdc ?? null,
    pbt: results.profit?.pbt ?? null,
    pm: results.profit?.pm ?? null,
    landCostRatio: null,
  }
}

async function pendingRiskText(db: Platform['db'], parcelId: string): Promise<string[]> {
  // 限定地块范围：仅统计该地块方案下的待确认成本，不跨地块泄漏。
  const pendingCosts = await db.queryAll<Row>({
    text: 'SELECT c.item_name FROM plan_cost_items c JOIN plans p ON p.id = c.plan_id WHERE p.parcel_id = ? AND c.status = ?',
    params: [parcelId, 'pending'],
  })
  const profiles = await db.queryAll<Row>({ text: 'SELECT checklist_json FROM parcel_profile WHERE parcel_id = ?', params: [parcelId] })
  const risks: string[] = []
  for (const cost of pendingCosts) {
    if (risks.length >= 5) break
    risks.push(`费用项“${String(cost.item_name)}”待确认，未纳入确定性结论。`)
  }
  for (const profile of profiles) {
    const checklist = parseJsonColumn<Array<{ item: string; status: string }>>(profile.checklist_json, [])
    for (const entry of checklist) {
      if (entry.status === 'pending') {
        risks.push(`核查项 ${entry.item} 尚未确认。`)
        if (risks.length >= 8) break
      }
    }
  }
  return risks
}

export const registerReportRoutes: DomainRoutes = (app, platform) => {
  app.get('/api/parcels/:id/dashboard', async (context) => {
    await requirePermission(context, platform, 'dashboards:read')
    const parcelId = context.req.param('id')
    const parcel = await loadParcel(platform.db, parcelId)
    const decision = await platform.db.queryOne<Row>({ text: 'SELECT * FROM decision_records WHERE parcel_id = ?', params: [parcelId] })
    const recommended = parcel.adopted_plan_id
      ? await platform.db.queryOne<Row>({ text: 'SELECT * FROM plans WHERE id = ?', params: [String(parcel.adopted_plan_id)] })
      : await latestFormalizedOrAdopted(platform.db, parcelId)
    const results = recommended ? parseJsonColumn<ResultShape | null>(recommended.results_json, null) : null
    const conclusionComplete = Boolean(decision && results)
    const risks = (await pendingRiskText(platform.db, parcelId)).map((text) => ({ text, source: 'pending-item' as const }))
    return context.json({
      conclusion: conclusionComplete
        ? { recommendation: String(decision!.action), oneLineReason: String(decision!.reason) }
        : null,
      incomplete: !conclusionComplete,
      coreMetrics: results ? coreMetrics(results) : null,
      recommendedPlan: recommended
        ? { id: String(recommended.id), name: String(recommended.name), kind: String(recommended.kind), status: String(recommended.status) }
        : null,
      risks,
      nextSteps: [
        results
          ? { action: '复核推荐方案明细与假设', owner: null, doneWhen: '方案明细与业务依据核对一致' }
          : { action: '完成正式测算并正式化方案', owner: null, doneWhen: '存在 formalized 及之后状态的方案' },
      ],
      links: {
        planDetail: recommended ? `/api/plans/${String(recommended.id)}` : null,
        report: `/api/parcels/${parcelId}/report`,
        marketBasis: `/api/parcels/${parcelId}/market/comps`,
      },
    })
  })

  app.get('/api/parcels/:id/report', async (context) => {
    const parcelId = context.req.param('id')
    const parcel = await loadParcel(platform.db, parcelId)
    const profile = await platform.db.queryOne<Row>({ text: 'SELECT * FROM parcel_profile WHERE parcel_id = ?', params: [parcelId] })
    const mapRow = await platform.db.queryOne<Row>({ text: 'SELECT * FROM parcel_map WHERE parcel_id = ?', params: [parcelId] })
    const mapView = await platform.db.queryOne<Row>({ text: 'SELECT id, name, view_json, created_at FROM parcel_map_views WHERE parcel_id = ? ORDER BY created_at DESC LIMIT 1', params: [parcelId] })
    const landRefs = await platform.db.queryAll<Row>({ text: 'SELECT * FROM market_land_refs WHERE parcel_id = ? ORDER BY collected_at DESC LIMIT 20', params: [parcelId] })
    const comps = await platform.db.queryAll<Row>({ text: 'SELECT * FROM market_comps WHERE parcel_id = ? ORDER BY collected_at DESC LIMIT 20', params: [parcelId] })
    const adopted = parcel.adopted_plan_id
      ? await platform.db.queryOne<Row>({ text: 'SELECT * FROM plans WHERE id = ?', params: [String(parcel.adopted_plan_id)] })
      : await latestFormalizedOrAdopted(platform.db, parcelId)
    const results = adopted ? parseJsonColumn<ResultShape | null>(adopted.results_json, null) : null
    const decision = await platform.db.queryOne<Row>({ text: 'SELECT * FROM decision_records WHERE parcel_id = ?', params: [parcelId] })
    const snapshot = adopted
      ? await platform.db.queryOne<Row>({ text: 'SELECT id, kind, created_at FROM plan_snapshots WHERE plan_id = ? ORDER BY created_at DESC LIMIT 1', params: [String(adopted.id)] })
      : null
    const pending = await platform.db.queryAll<Row>({
      text: 'SELECT c.item_name, c.category, c.status FROM plan_cost_items c JOIN plans p ON p.id = c.plan_id WHERE p.parcel_id = ? AND c.status = ?',
      params: [parcelId, 'pending'],
    })
    const parcelSummaryText = {
      name: String(parcel.name),
      state: parcel.state === null ? null : String(parcel.state),
      areaSqft: parcel.area_sqft === null ? null : String(parcel.area_sqft),
      tenure: profile?.tenure === null || profile?.tenure === undefined ? null : String(profile.tenure),
      plannedUse: profile?.planned_use === null || profile?.planned_use === undefined ? null : String(profile.planned_use),
      vendorAskingPrice: profile?.vendor_asking_price === null || profile?.vendor_asking_price === undefined ? null : String(profile.vendor_asking_price),
      paymentTerms: profile?.payment_terms === null || profile?.payment_terms === undefined ? null : String(profile.payment_terms),
      layer: 'business-fact' as const,
    }
    return context.json({
      sections: [
        {
          key: 'conclusion',
          data: {
            recommendation: decision ? String(decision.action) : null,
            reason: decision ? String(decision.reason) : null,
            decidedAt: decision ? String(decision.decided_at) : null,
            incomplete: !results,
            layer: results ? 'business-fact' : 'pending',
          },
        },
        { key: 'site-overview', data: { ...parcelSummaryText, checklist: parseJsonColumn<unknown>(profile?.checklist_json, []) } },
        {
          key: 'location',
          data: {
            location: mapRow?.lat !== null && mapRow?.lat !== undefined && mapRow?.lng !== null && mapRow?.lng !== undefined ? { lat: String(mapRow.lat), lng: String(mapRow.lng) } : null,
            boundaryIncluded: mapRow?.boundary_geojson !== null && mapRow?.boundary_geojson !== undefined,
            savedMapView: mapView ? { viewId: String(mapView.id), name: String(mapView.name), snapshotAt: String(mapView.created_at), view: parseJsonColumn<unknown>(mapView.view_json, null) } : null,
            markers: mapRow ? parseJsonColumn<unknown[]>(mapRow.markers_json, []) : [],
          },
        },
        {
          key: 'market',
          data: {
            landRefs: landRefs.map((row) => ({ projectName: String(row.project_name), dealPrice: row.deal_price === null ? null : String(row.deal_price), pricePerSqft: row.price_per_sqft === null ? null : String(row.price_per_sqft), confidence: String(row.confidence), listingStatus: String(row.listing_status) })),
            comps: comps.map((row) => ({ projectName: String(row.project_name), format: String(row.format), askingPrice: row.asking_price === null ? null : String(row.asking_price), pricePerSqft: row.price_per_sqft === null ? null : String(row.price_per_sqft), confidence: String(row.confidence) })),
            note: '土地成交与住宅竞品分表呈现；unverified 条目为待确认资料，不构成正式结论唯一依据。',
          },
        },
        {
          key: 'dev-plan',
          data: {
            plan: adopted ? { id: String(adopted.id), name: String(adopted.name), kind: String(adopted.kind), status: String(adopted.status), assumptionTags: parseJsonColumn<string[]>(adopted.assumption_tags_json, []), snapshotId: snapshot ? String(snapshot.id) : null } : null,
            basisNote: '方案假设、口径与分摊规则见方案明细（可展开）。"不含会所/含可负担"等假设记录在 assumptionTags。',
          },
        },
        {
          key: 'financial-summary',
          data: {
            gdv: results?.revenue?.gdv ?? null,
            netGdv: results?.revenue?.netGdv ?? null,
            tdc: results?.costs?.tdc ?? null,
            pbt: results?.profit?.pbt ?? null,
            pm: results?.profit?.pm ?? null,
            basisNote: '销售收入与净销售收入同时保留；金额为全精度 decimal 字符串。',
          },
        },
        {
          key: 'cost-structure',
          data: {
            byCategory: results?.costs?.byCategory ?? [],
            pendingItems: pending.map((row) => ({ itemName: String(row.item_name), category: String(row.category), status: String(row.status) })),
          },
        },
        {
          key: 'sensitivity-risk',
          data: {
            risks: await pendingRiskText(platform.db, parcelId),
            sensitivityNote: '敏感性矩阵与目标反算经 POST /api/plans/:id/sensitivity 与 /back-solve 现场生成，不落权威数据；本报告仅呈现风险与未确认事项。',
          },
        },
        { key: 'jv-phasing', data: { note: 'JV 分成与多期分摊属后续阶段（P1）；公共分摊结果见方案 results.commonPoolAllocations。' } },
        {
          key: 'recommended-actions',
          data: {
            actions: [
              results ? { action: '从结论跳转方案明细复核依据', doneWhen: '明细与来源核对一致' } : { action: '完成测算并正式化方案', doneWhen: '存在 formalized 方案' },
            ],
          },
        },
      ],
    })
  })

  app.post('/api/parcels/:id/handoff', async (context) => {
    await requirePermission(context, platform, 'parcels:write')
    const actor = currentActor(context)
    const parcelId = context.req.param('id')
    const parcel = await loadParcel(platform.db, parcelId)
    if (String(parcel.status) !== 'completed' || !parcel.adopted_plan_id) {
      throw errors.adoptedPlanRequired()
    }
    const adoptedPlanId = String(parcel.adopted_plan_id)
    const plan = await loadPlan(platform.db, adoptedPlanId)
    const snapshot = await platform.db.queryOne<Row>({ text: "SELECT * FROM plan_snapshots WHERE plan_id = ? AND kind = 'adopted' ORDER BY created_at DESC LIMIT 1", params: [adoptedPlanId] })
    const decision = await platform.db.queryOne<Row>({ text: 'SELECT * FROM decision_records WHERE parcel_id = ?', params: [parcelId] })
    const attachments = await platform.db.queryAll<Row>({ text: 'SELECT id, category, file_name, uploaded_at FROM parcel_attachments WHERE parcel_id = ?', params: [parcelId] })
    const inputs = snapshot ? parseJsonColumn<unknown>(snapshot.inputs_json, null) : null
    const id = newId('hex')
    const timestamp = nowIso()
    const version = `${adoptedPlanId}@adopted`
    await platform.db.run({
      text: 'INSERT INTO handoff_exports (id, parcel_id, adopted_plan_id, version, content_json, generated_by, generated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [
        id, parcelId, adoptedPlanId, version,
        JSON.stringify({
          parcel: { id: parcelId, name: String(parcel.name), state: parcel.state === null ? null : String(parcel.state), areaSqft: parcel.area_sqft === null ? null : String(parcel.area_sqft) },
          adoptedPlan: { id: adoptedPlanId, name: String(plan.name), version, status: String(plan.status) },
          results: parseJsonColumn<unknown>(plan.results_json, null),
          assumptions: { assumptionTags: parseJsonColumn<string[]>(plan.assumption_tags_json, []), inputs },
          approvals: {
            decision: decision ? { action: String(decision.action), reason: String(decision.reason), decidedAt: String(decision.decided_at), decidedBy: String(decision.decided_by) } : null,
          },
          pendingItems: (await platform.db.queryAll<Row>({
            text: 'SELECT c.item_name, c.category, c.status FROM plan_cost_items c JOIN plans p ON p.id = c.plan_id WHERE p.parcel_id = ? AND c.status = ?',
            params: [parcelId, 'pending'],
          })).map((row) => ({ itemName: String(row.item_name), category: String(row.category) })),
          attachments: attachments.map((row) => ({ id: String(row.id), category: String(row.category), fileName: String(row.file_name), uploadedAt: String(row.uploaded_at) })),
          basisNote: '采用方案冻结快照 + 版本号 + 全部假设与口径；金额为 decimal 字符串；空缺项为“待确认”不计入正式结论。',
        }),
        actor.id, timestamp,
      ],
    })
    await auditEvent(platform, { type: 'handoff.created', actorUserId: actor.id, objectType: 'parcel', objectId: parcelId, summary: `生成交接快照 ${id}（${version}）` })
    return context.json({ id, parcelId, adoptedPlanId, version, generatedAt: timestamp }, 201)
  })

  app.get('/api/parcels/:id/handoff/latest', async (context) => {
    await requirePermission(context, platform, 'handoff:read')
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM handoff_exports WHERE parcel_id = ? ORDER BY generated_at DESC LIMIT 1', params: [parcelId] })
    if (!row) throw errors.notFound('No handoff package has been generated')
    return context.json({
      id: String(row.id),
      parcelId,
      adoptedPlanId: String(row.adopted_plan_id),
      version: String(row.version),
      content: parseJsonColumn<unknown>(row.content_json, null),
      generatedAt: String(row.generated_at),
      readOnly: true,
    })
  })

  app.get('/api/parcels/:id/handoff/export', async (context) => {
    await requirePermission(context, platform, 'handoff:read')
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const format = context.req.query('format') ?? 'csv'
    if (format !== 'csv') {
      throw errors.validationFailed([{ field: 'format', reason: 'this iteration provides CSV export with basis notes; xlsx is not provided' }])
    }
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM handoff_exports WHERE parcel_id = ? ORDER BY generated_at DESC LIMIT 1', params: [parcelId] })
    if (!row) throw errors.notFound('No handoff package has been generated')
    const content = parseJsonColumn<{ parcel?: Record<string, unknown>; adoptedPlan?: Record<string, unknown>; results?: { revenue?: Record<string, string>; costs?: { tdc?: string }; profit?: Record<string, string> } }>(row.content_json, {})
    const lines: string[] = []
    lines.push('# Land 受控交接导出（附口径说明）')
    lines.push(`地块,${String((content.parcel ?? {}).name ?? parcelId)}`)
    lines.push(`采用方案,${String((content.adoptedPlan ?? {}).name ?? '')}`)
    lines.push(`版本,${String(row.version)}`)
    lines.push('')
    lines.push('指标,数值,口径')
    lines.push(`GDV,${content.results?.revenue?.gdv ?? ''},总销售收入（decimal 全精度）`)
    lines.push(`净GDV,${content.results?.revenue?.netGdv ?? ''},土著配额/折扣调整后收入`)
    lines.push(`TDC,${content.results?.costs?.tdc ?? ''},九类成本归集+公共分摊合计`)
    lines.push(`PBT,${content.results?.profit?.pbt ?? ''},净GDV-TDC`)
    lines.push(`PM,${content.results?.profit?.pm ?? ''},PBT/净GDV`)
    lines.push('')
    lines.push('口径说明：金额为全精度 decimal 字符串；空缺项为待确认（未纳入正式结论）；调整须由下游发起业务变更，不改投资冻结版本。')
    // 契约导出为受控字节流：直接输出 UTF-8（含 BOM）CSV，而不是 base64 文本。
    return context.body(new Uint8Array(Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8')), 200, { 'Content-Type': 'text/csv; charset=utf-8' })
  })
}

export { latestFormalizedOrAdopted }
