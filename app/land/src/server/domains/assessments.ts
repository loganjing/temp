/**
 * assessment 域：快速评估保存、服务端试算与多机会组合视图（契约第 6 节 / AC-03）。
 */
import type { Hono } from 'hono'
import type { Platform } from '../platform/bootstrap'
import { newId } from '../platform/authorization'
import { errors, readJsonBody, decimalInput, optionalString, optionalJsonObject, optionalEnum, currentActor, pagination, pagedResponse } from '../lib/api'
import { auditEvent, loadParcel, nowIso, parseJsonColumn, requirePermission, type DomainRoutes, type Row } from '../lib/db'
import { computeQuickAssessment, type QuickAssessmentInputs } from '../engine/compute'

type Verdict = 'PASS' | 'REJECT' | 'DROP' | 'INSUFFICIENT'

/** 旧记录缺列时的兜底输入形状（compute 会按缺失输出 INSUFFICIENT，不伪造结论）。 */
const EMPTY_INPUTS: QuickAssessmentInputs = {
  locationNote: null,
  landAreaSqft: '0',
  useOrZoning: null,
  plotRatioOrDensity: '0',
  productMixNote: null,
  estimatedUnitsOrSaleableArea: '0',
  unitPriceOrPricePerSqft: '0',
  landCostTotal: null,
  landCostPerSqft: null,
  landCostLastEditedBasis: null,
  constructionCostPerSqft: '0',
  miscGovPerSqft: null,
  professionalFeePct: null,
  salesMarketingPct: null,
  financeCostPct: null,
  policyAssumptions: null,
  costPackageId: null,
}

function parseInputs(body: Record<string, unknown>): QuickAssessmentInputs {
  const inputs = (body.inputs ?? body) as Record<string, unknown>
  const policy = optionalJsonObject(inputs.policyAssumptions, 'inputs.policyAssumptions')
  const landBasis = optionalEnum(inputs.landCostLastEditedBasis, 'inputs.landCostLastEditedBasis', ['total', 'per-sqft'] as const)
  return {
    locationNote: optionalString(inputs.locationNote, 'inputs.locationNote', 500),
    landAreaSqft: decimalInput(inputs.landAreaSqft) ?? '0',
    useOrZoning: optionalString(inputs.useOrZoning, 'inputs.useOrZoning', 200),
    plotRatioOrDensity: decimalInput(inputs.plotRatioOrDensity) ?? '0',
    productMixNote: optionalString(inputs.productMixNote, 'inputs.productMixNote', 500),
    estimatedUnitsOrSaleableArea: decimalInput(inputs.estimatedUnitsOrSaleableArea) ?? '0',
    unitPriceOrPricePerSqft: decimalInput(inputs.unitPriceOrPricePerSqft) ?? '0',
    landCostTotal: decimalInput(inputs.landCostTotal),
    landCostPerSqft: decimalInput(inputs.landCostPerSqft),
    landCostLastEditedBasis: landBasis ?? (decimalInput(inputs.landCostTotal) !== null ? 'total' : decimalInput(inputs.landCostPerSqft) !== null ? 'per-sqft' : null),
    constructionCostPerSqft: decimalInput(inputs.constructionCostPerSqft) ?? '0',
    miscGovPerSqft: decimalInput(inputs.miscGovPerSqft),
    professionalFeePct: decimalInput(inputs.professionalFeePct),
    salesMarketingPct: decimalInput(inputs.salesMarketingPct),
    financeCostPct: decimalInput(inputs.financeCostPct),
    policyAssumptions: policy ? {
      bumiQuotaPct: policy.bumiQuotaPct === undefined ? undefined : String(policy.bumiQuotaPct),
      bumiDiscountPct: policy.bumiDiscountPct === undefined ? undefined : String(policy.bumiDiscountPct),
      affordableRatio: policy.affordableRatio === undefined ? undefined : String(policy.affordableRatio),
      targetPm: policy.targetPm === undefined ? undefined : String(policy.targetPm),
    } : null,
    costPackageId: optionalString(inputs.costPackageId, 'inputs.costPackageId', 100),
  }
}

function mapAssessment(row: Row) {
  return {
    id: String(row.id),
    parcelId: String(row.parcel_id),
    inputs: parseJsonColumn<QuickAssessmentInputs>(row.inputs_json, { ...EMPTY_INPUTS }),
    results: row.results_json === null ? null : parseJsonColumn<unknown>(row.results_json, null),
    verdict: row.verdict === null ? null : String(row.verdict),
    verdictNote: row.verdict_note === null ? null : String(row.verdict_note),
    nextAction: row.next_action === null ? null : String(row.next_action),
    nextActionNote: row.next_action_note === null ? null : String(row.next_action_note),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export const registerAssessmentRoutes: DomainRoutes = (app, platform) => {
  app.post('/api/parcels/:id/quick-assessments', async (context) => {
    await requirePermission(context, platform, 'quick-assessments:write')
    const actor = currentActor(context)
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const body = await readJsonBody(context)
    const inputs = parseInputs(body)
    const id = newId('qa')
    const timestamp = nowIso()
    await platform.db.run({
      text: 'INSERT INTO quick_assessments (id, parcel_id, inputs_json, results_json, verdict, verdict_note, next_action, next_action_note, created_by, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)',
      params: [id, parcelId, JSON.stringify(inputs), actor.id, timestamp, timestamp],
    })
    await auditEvent(platform, { type: 'assessment.created', actorUserId: actor.id, objectType: 'parcel', objectId: parcelId, summary: '保存快速评估输入' })
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM quick_assessments WHERE id = ?', params: [id] })
    return context.json(mapAssessment(row!), 201)
  })

  app.post('/api/quick-assessments/:id/compute', async (context) => {
    await requirePermission(context, platform, 'quick-assessments:write')
    const actor = currentActor(context)
    const id = context.req.param('id')
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM quick_assessments WHERE id = ?', params: [id] })
    if (!row) throw errors.notFound('Quick assessment not found')
    const inputs = parseJsonColumn<QuickAssessmentInputs>(row.inputs_json, { landAreaSqft: '0', plotRatioOrDensity: '0', estimatedUnitsOrSaleableArea: '0', unitPriceOrPricePerSqft: '0', constructionCostPerSqft: '0', landCostTotal: null, landCostPerSqft: null, landCostLastEditedBasis: null, miscGovPerSqft: null, professionalFeePct: null, salesMarketingPct: null, financeCostPct: null, policyAssumptions: null, costPackageId: null, locationNote: null, useOrZoning: null, productMixNote: null })
    const computed = computeQuickAssessment(inputs, nowIso())
    const timestamp = nowIso()
    await platform.db.run({
      text: 'UPDATE quick_assessments SET results_json = ?, verdict = ?, verdict_note = ?, next_action = ?, next_action_note = ?, updated_at = ? WHERE id = ?',
      params: [
        computed.results === null ? null : JSON.stringify(computed.results),
        computed.verdict, computed.verdictNote, computed.nextAction, computed.nextActionNote, timestamp, id,
      ],
    })
    await auditEvent(platform, {
      type: 'assessment.computed',
      actorUserId: actor.id,
      objectType: 'quick-assessment',
      objectId: id,
      summary: `试算结论 ${computed.verdict}`,
      metadata: { verdict: computed.verdict },
    })
    const refreshed = await platform.db.queryOne<Row>({ text: 'SELECT * FROM quick_assessments WHERE id = ?', params: [id] })
    return context.json(mapAssessment(refreshed!))
  })

  app.get('/api/quick-assessments', async (context) => {
    await requirePermission(context, platform, 'parcels:read')
    const { page, pageSize, offset } = pagination(context)
    const filters: string[] = ['1 = 1']
    const params: unknown[] = []
    const state = context.req.query('state')
    const verdict = context.req.query('verdict')
    const ownerId = context.req.query('ownerId')
    if (state) {
      filters.push('p.state = ?')
      params.push(state)
    }
    if (verdict && (['PASS', 'REJECT', 'DROP', 'INSUFFICIENT'] as const).some((item) => item === verdict)) {
      filters.push('q.verdict = ?')
      params.push(verdict)
    }
    if (ownerId) {
      filters.push('q.created_by = ?')
      params.push(ownerId)
    }
    const rows = await platform.db.queryAll<Row>({
      text: `SELECT q.*, p.name AS parcel_name, p.state AS parcel_state FROM quick_assessments q JOIN parcels p ON p.id = q.parcel_id
             WHERE ${filters.join(' AND ')} ORDER BY q.updated_at DESC LIMIT ? OFFSET ?`,
      params: [...params, pageSize, offset],
    })
    const total = await platform.db.queryOne<Row>({
      text: `SELECT COUNT(*) AS total FROM quick_assessments q JOIN parcels p ON p.id = q.parcel_id WHERE ${filters.join(' AND ')}`,
      params,
    })
    return context.json(pagedResponse(
      rows.map((row) => ({
        id: String(row.id),
        parcelId: String(row.parcel_id),
        parcelName: String(row.parcel_name),
        state: row.parcel_state === null ? null : String(row.parcel_state),
        verdict: row.verdict === null ? null : String(row.verdict),
        results: row.results_json === null ? null : parseJsonColumn<unknown>(row.results_json, null),
        updatedAt: String(row.updated_at),
      })),
      Number(total?.total ?? 0),
      page,
      pageSize
    ))
  })

  void errors
  void (undefined as Verdict | undefined)
}
