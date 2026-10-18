/**
 * plan 域：方案版本链（创建/复制/输入更新受限状态/正式化冻结/口径切换）（契约第 7 节 / AC-04~AC-06、AC-11~AC-14）。
 */
import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import type { Platform } from '../platform/bootstrap'
import { newId } from '../platform/authorization'
import { errors, readJsonBody, requiredString, optionalString, currentActor } from '../lib/api'
import { auditEvent, loadParcel, loadPlan, nowIso, parseJsonColumn, requirePermission, type DomainRoutes, type Row } from '../lib/db'
import {
  computePlanResults, emptyPlanInputs, type AreaConventionContent, type PlanInputs, type PlanResults, PRODUCT_FORMATS, COST_CATEGORIES, COST_BASES, SOURCE_TYPES, PLAN_STATUSES, type CostCategory,
} from '../engine/plan-engine'
import { validatePlanInputs, validateForFormalize } from '../engine/validate'
import { defaultAreaConventionId } from './profile'

const EDITABLE_STATUSES = new Set(['draft', 'saved'])

async function loadAreaConvention(db: DbClient, conventionId: string | null): Promise<AreaConventionContent | null> {
  if (!conventionId) return null
  const row = await db.queryOne<Row>({ text: 'SELECT content_json FROM parameter_sets WHERE id = ?', params: [conventionId] })
  if (!row) return null
  return parseJsonColumn<AreaConventionContent>(row.content_json, {})
}

export async function loadPlanInputs(db: DbClient, planId: string): Promise<PlanInputs> {
  const plan = await db.queryOne<Row>({ text: 'SELECT area_basis_json, parking_json, land_price_json, parameter_refs_json FROM plans WHERE id = ?', params: [planId] })
  if (!plan) throw errors.notFound('Plan not found')
  const phases = await db.queryAll<Row>({ text: 'SELECT * FROM plan_phases WHERE plan_id = ? ORDER BY seq', params: [planId] })
  const products = await db.queryAll<Row>({ text: 'SELECT * FROM plan_products WHERE plan_id = ? ORDER BY row_index', params: [planId] })
  const costs = await db.queryAll<Row>({ text: 'SELECT * FROM plan_cost_items WHERE plan_id = ? ORDER BY row_index', params: [planId] })
  const pools = await db.queryAll<Row>({ text: 'SELECT * FROM plan_common_pools WHERE plan_id = ? ORDER BY row_index', params: [planId] })
  return {
    areaBasis: parseJsonColumn<PlanInputs['areaBasis']>(plan.area_basis_json, { ...emptyPlanInputs().areaBasis }),
    parking: parseJsonColumn<PlanInputs['parking']>(plan.parking_json, { ...emptyPlanInputs().parking }),
    landPrice: parseJsonColumn<PlanInputs['landPrice']>(plan.land_price_json, { ...emptyPlanInputs().landPrice }),
    phases: phases.map((phase) => ({
      id: String(phase.id),
      name: String(phase.name),
      seq: Number(phase.seq),
      landAllocation: parseJsonColumn<PlanInputs['phases'][number]['landAllocation']>(phase.land_allocation_json, { method: 'by-land-area', value: null }),
      products: products
        .filter((product) => String(product.phase_id) === String(phase.id))
        .map((product) => ({
          id: String(product.id),
          format: String(product.format) as PlanInputs['phases'][number]['products'][number]['format'],
          tier: product.tier === null ? null : String(product.tier),
          sharePct: String(product.share_pct),
          units: Number(product.units),
          unitAreaSqft: String(product.unit_area_sqft),
          saleableAreaSqft: String(product.saleable_area_sqft),
          price: product.price === null ? null : String(product.price),
          pricePerSqft: product.price_per_sqft === null ? null : String(product.price_per_sqft),
          priceBasis: String(product.price_basis) as PlanInputs['phases'][number]['products'][number]['priceBasis'],
          bumiQuotaPct: product.bumi_quota_pct === null ? null : String(product.bumi_quota_pct),
          bumiDiscountPct: product.bumi_discount_pct === null ? null : String(product.bumi_discount_pct),
          affordableQuota: product.affordable_quota_json === null ? null : parseJsonColumn<PlanInputs['phases'][number]['products'][number]['affordableQuota']>(product.affordable_quota_json, null),
          parkingPerUnit: product.parking_per_unit === null ? null : String(product.parking_per_unit),
        })),
      gfaBreakdown: phase.gfa_breakdown_json === null ? null : parseJsonColumn<PlanInputs['phases'][number]['gfaBreakdown']>(phase.gfa_breakdown_json, null),
    })),
    costs: costs.map((item) => ({
      id: String(item.id),
      phaseId: item.phase_id === null ? null : String(item.phase_id),
      category: String(item.category) as CostCategory,
      itemName: String(item.item_name),
      basis: String(item.basis) as PlanInputs['costs'][number]['basis'],
      value: String(item.value),
      sourceType: String(item.source_type) as PlanInputs['costs'][number]['sourceType'],
      status: String(item.status) as PlanInputs['costs'][number]['status'],
      note: item.note === null ? null : String(item.note),
    })),
    commonPools: pools.map((pool) => ({
      id: String(pool.id),
      category: String(pool.category) as CostCategory,
      amount: String(pool.amount),
      allocationBasis: String(pool.allocation_basis) as PlanInputs['commonPools'][number]['allocationBasis'],
      customRatios: pool.custom_ratios_json === null ? null : parseJsonColumn<Record<string, string>>(pool.custom_ratios_json, {}),
      ruleNote: pool.rule_note === null ? null : String(pool.rule_note),
    })),
  }
}

/**
 * 保存方案输入。行 ID 一律服务端重新生成（契约 §0：id 由服务端生成；这些表主键全局唯一，
 * 沿用客户端或源方案提供的行 ID 会在跨方案保存时触发唯一约束冲突），并同步 costs.phaseId
 * 与 customRatios 的期次引用；返回写入后的规范输入（含新行 ID）。
 */
export async function savePlanInputs(db: DbClient, planId: string, inputs: PlanInputs): Promise<PlanInputs> {
  const saved = withNewRowIds(inputs)
  await db.run({
    text: 'UPDATE plans SET area_basis_json = ?, parking_json = ?, land_price_json = ?, phase_count = ? WHERE id = ?',
    params: [JSON.stringify(saved.areaBasis), JSON.stringify(saved.parking), JSON.stringify(saved.landPrice), saved.phases.length, planId],
  })
  await db.run({ text: 'DELETE FROM plan_phases WHERE plan_id = ?', params: [planId] })
  await db.run({ text: 'DELETE FROM plan_products WHERE plan_id = ?', params: [planId] })
  await db.run({ text: 'DELETE FROM plan_cost_items WHERE plan_id = ?', params: [planId] })
  await db.run({ text: 'DELETE FROM plan_common_pools WHERE plan_id = ?', params: [planId] })
  let productIndex = 0
  for (const [phaseIndex, phase] of saved.phases.entries()) {
    await db.run({
      text: 'INSERT INTO plan_phases (id, plan_id, name, seq, land_allocation_json, gfa_breakdown_json) VALUES (?, ?, ?, ?, ?, ?)',
      params: [phase.id, planId, phase.name, phase.seq ?? phaseIndex + 1, JSON.stringify(phase.landAllocation), phase.gfaBreakdown === null ? '{}' : JSON.stringify(phase.gfaBreakdown)],
    })
    for (const product of phase.products) {
      await db.run({
        text: `INSERT INTO plan_products (id, plan_id, phase_id, row_index, format, tier, share_pct, units, unit_area_sqft, saleable_area_sqft, price, price_per_sqft, price_basis, bumi_quota_pct, bumi_discount_pct, affordable_quota_json, parking_per_unit)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          product.id, planId, phase.id, productIndex, product.format, product.tier, product.sharePct, product.units,
          product.unitAreaSqft, product.saleableAreaSqft, product.price, product.pricePerSqft, product.priceBasis,
          product.bumiQuotaPct, product.bumiDiscountPct,
          product.affordableQuota === null ? null : JSON.stringify(product.affordableQuota), product.parkingPerUnit,
        ],
      })
      productIndex += 1
    }
  }
  for (const [index, item] of saved.costs.entries()) {
    await db.run({
      text: 'INSERT INTO plan_cost_items (id, plan_id, phase_id, row_index, category, item_name, basis, value, source_type, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [item.id, planId, item.phaseId, index, item.category, item.itemName, item.basis, item.value, item.sourceType, item.status, item.note],
    })
  }
  for (const [index, pool] of saved.commonPools.entries()) {
    await db.run({
      text: 'INSERT INTO plan_common_pools (id, plan_id, row_index, category, amount, allocation_basis, custom_ratios_json, rule_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      params: [pool.id, planId, index, pool.category, pool.amount, pool.allocationBasis, pool.customRatios === null ? null : JSON.stringify(pool.customRatios), pool.ruleNote],
    })
  }
  return saved
}

/**
 * 复制/AI 派生方案时重写行 ID（plan_phases/plan_products/plan_cost_items/plan_common_pools
 * 的主键全局唯一，直接沿用源方案行 ID 会触发唯一约束冲突），并同步 costs.phaseId 与
 * customRatios 的期次引用。
 */
export function withNewRowIds(inputs: PlanInputs): PlanInputs {
  const next: PlanInputs = JSON.parse(JSON.stringify(inputs))
  const phaseIdMap = new Map<string, string>()
  next.phases = next.phases.map((phase) => {
    const id = newId('pph')
    phaseIdMap.set(phase.id, id)
    return { ...phase, id, products: phase.products.map((product) => ({ ...product, id: newId('ppd') })) }
  })
  next.costs = next.costs.map((item) => ({
    ...item,
    id: newId('pci'),
    phaseId: item.phaseId !== null && phaseIdMap.has(item.phaseId) ? phaseIdMap.get(item.phaseId)! : item.phaseId,
  }))
  next.commonPools = next.commonPools.map((pool) => ({
    ...pool,
    id: newId('pcp'),
    customRatios: pool.customRatios === null
      ? null
      : Object.fromEntries(Object.entries(pool.customRatios).map(([phaseId, ratio]) => [phaseIdMap.get(phaseId) ?? phaseId, ratio])),
  }))
  return next
}

function mapPlanResource(plan: Row, inputs: PlanInputs, results: PlanResults | null) {
  return {
    id: String(plan.id),
    parcelId: String(plan.parcel_id),
    phaseCount: Number(plan.phase_count),
    name: String(plan.name),
    kind: String(plan.kind),
    status: String(plan.status),
    sourcePlanId: plan.source_plan_id === null ? null : String(plan.source_plan_id),
    copiedAt: plan.copied_at === null ? null : String(plan.copied_at),
    copiedBy: plan.copied_by === null ? null : String(plan.copied_by),
    changeNote: plan.change_note === null ? null : String(plan.change_note),
    ownerId: String(plan.owner_id),
    assumptionTags: parseJsonColumn<string[]>(plan.assumption_tags_json, []),
    parameterRefs: parseJsonColumn<{ areaConventionId: string | null; costPackageIds: string[] | null; policyRefs: string[] | null }>(plan.parameter_refs_json, { areaConventionId: null, costPackageIds: null, policyRefs: null }),
    createdAt: String(plan.created_at),
    updatedAt: String(plan.updated_at),
    inputs,
    results,
  }
}

function parsePlanInputsPatch(body: Record<string, unknown>, base: PlanInputs): PlanInputs {
  const next: PlanInputs = JSON.parse(JSON.stringify(base))
  if (body.areaBasis !== undefined) {
    const value = body.areaBasis as Record<string, unknown>
    next.areaBasis = { ...next.areaBasis, ...stripUndefined(value) } as PlanInputs['areaBasis']
  }
  if (body.landPrice !== undefined) {
    const value = body.landPrice as Record<string, unknown>
    next.landPrice = { ...next.landPrice, ...stripUndefined(value) } as PlanInputs['landPrice']
  }
  if (body.parking !== undefined) {
    const value = body.parking as Record<string, unknown>
    next.parking = { ...next.parking, ...stripUndefined(value) } as PlanInputs['parking']
  }
  if (body.phases !== undefined) {
    if (!Array.isArray(body.phases)) throw errors.validationFailed([{ field: 'phases', reason: 'must be an array' }])
    next.phases = body.phases.map((entry, index) => {
      if (typeof entry !== 'object' || entry === null) throw errors.validationFailed([{ field: `phases[${index}]`, reason: 'must be an object' }])
      const phase = entry as Record<string, unknown>
      const products = Array.isArray(phase.products) ? phase.products : []
      return {
        id: optionalString(phase.id, `phases[${index}].id`, 100) ?? newId('pph'),
        name: optionalString(phase.name, `phases[${index}].name`, 200) ?? `期次 ${index + 1}`,
        seq: Number(optionalString(phase.seq, `phases[${index}].seq`, 10) ?? index + 1),
        landAllocation: {
          method: (optionalString((phase.landAllocation as Record<string, unknown> | undefined)?.method, 'landAllocation.method', 40) ?? 'by-land-area') as PlanInputs['phases'][number]['landAllocation']['method'],
          value: optionalString((phase.landAllocation as Record<string, unknown> | undefined)?.value, 'landAllocation.value', 40),
        },
        products: products.map((productEntry, productIndex) => {
          if (typeof productEntry !== 'object' || productEntry === null) throw errors.validationFailed([{ field: `phases[${index}].products[${productIndex}]`, reason: 'must be an object' }])
          const product = productEntry as Record<string, unknown>
          const format = optionalString(product.format, 'format', 40)
          if (!format || !((PRODUCT_FORMATS as readonly string[]).includes(format))) {
            throw errors.validationFailed([{ field: `phases[${index}].products[${productIndex}].format`, reason: `must be one of ${PRODUCT_FORMATS.join(' | ')}` }])
          }
          const priceBasis = optionalString(product.priceBasis, 'priceBasis', 40) ?? 'unit-price'
          if (!(['unit-price', 'per-sqft', 'policy-fixed'] as const).some((item) => item === priceBasis)) {
            throw errors.validationFailed([{ field: `phases[${index}].products[${productIndex}].priceBasis`, reason: 'must be unit-price | per-sqft | policy-fixed' }])
          }
          const affordable = product.affordableQuota === null || product.affordableQuota === undefined ? null : (typeof product.affordableQuota === 'object' ? product.affordableQuota as Record<string, unknown> : null)
          return {
            id: optionalString(product.id, 'id', 100) ?? newId('ppd'),
            format: format as PlanInputs['phases'][number]['products'][number]['format'],
            tier: optionalString(product.tier, 'tier', 100),
            sharePct: optionalString(product.sharePct, 'sharePct', 40) ?? '0',
            units: Number(optionalString(product.units, 'units', 20) ?? 0),
            unitAreaSqft: optionalString(product.unitAreaSqft, 'unitAreaSqft', 40) ?? '0',
            saleableAreaSqft: optionalString(product.saleableAreaSqft, 'saleableAreaSqft', 40) ?? '0',
            price: optionalString(product.price, 'price', 40),
            pricePerSqft: optionalString(product.pricePerSqft, 'pricePerSqft', 40),
            priceBasis: priceBasis as PlanInputs['phases'][number]['products'][number]['priceBasis'],
            bumiQuotaPct: optionalString(product.bumiQuotaPct, 'bumiQuotaPct', 40),
            bumiDiscountPct: optionalString(product.bumiDiscountPct, 'bumiDiscountPct', 40),
            affordableQuota: affordable === null ? null : {
              units: Number(affordable.units ?? 0),
              price: String(affordable.price ?? '0'),
            },
            parkingPerUnit: optionalString(product.parkingPerUnit, 'parkingPerUnit', 40),
          }
        }),
        gfaBreakdown: phase.gfaBreakdown === null || phase.gfaBreakdown === undefined ? null : (typeof phase.gfaBreakdown === 'object' && !Array.isArray(phase.gfaBreakdown) ? phase.gfaBreakdown as Record<string, string> : null),
      }
    })
  }
  if (body.costs !== undefined) {
    if (!Array.isArray(body.costs)) throw errors.validationFailed([{ field: 'costs', reason: 'must be an array' }])
    next.costs = body.costs.map((entry, index) => {
      if (typeof entry !== 'object' || entry === null) throw errors.validationFailed([{ field: `costs[${index}]`, reason: 'must be an object' }])
      const item = entry as Record<string, unknown>
      const category = optionalString(item.category, 'category', 60)
      const basis = optionalString(item.basis, 'basis', 40)
      const sourceType = optionalString(item.sourceType, 'sourceType', 60)
      const status = optionalString(item.status, 'status', 20) ?? 'pending'
      if (!category || !(COST_CATEGORIES as readonly string[]).includes(category)) {
        throw errors.validationFailed([{ field: `costs[${index}].category`, reason: `must be one of ${COST_CATEGORIES.join(' | ')}` }])
      }
      if (!basis || !(COST_BASES as readonly string[]).includes(basis)) {
        throw errors.validationFailed([{ field: `costs[${index}].basis`, reason: `must be one of ${COST_BASES.join(' | ')}` }])
      }
      if (!sourceType || !(SOURCE_TYPES as readonly string[]).includes(sourceType)) {
        throw errors.validationFailed([{ field: `costs[${index}].sourceType`, reason: `must be one of ${SOURCE_TYPES.join(' | ')}` }])
      }
      if (!(['confirmed', 'zero', 'pending'] as const).some((item2) => item2 === status)) {
        throw errors.validationFailed([{ field: `costs[${index}].status`, reason: 'must be confirmed | zero | pending' }])
      }
      return {
        id: optionalString(item.id, 'id', 100) ?? newId('pci'),
        phaseId: optionalString(item.phaseId, 'phaseId', 100),
        category: category as CostCategory,
        itemName: optionalString(item.itemName, 'itemName', 200) ?? '未命名费用项',
        basis: basis as PlanInputs['costs'][number]['basis'],
        value: optionalString(item.value, 'value', 40) ?? '0',
        sourceType: sourceType as PlanInputs['costs'][number]['sourceType'],
        status: status as PlanInputs['costs'][number]['status'],
        note: optionalString(item.note, 'note', 1000),
      }
    })
  }
  if (body.commonPools !== undefined) {
    if (!Array.isArray(body.commonPools)) throw errors.validationFailed([{ field: 'commonPools', reason: 'must be an array' }])
    next.commonPools = body.commonPools.map((entry, index) => {
      if (typeof entry !== 'object' || entry === null) throw errors.validationFailed([{ field: `commonPools[${index}]`, reason: 'must be an object' }])
      const pool = entry as Record<string, unknown>
      const category = optionalString(pool.category, 'category', 60)
      const basis = optionalString(pool.allocationBasis, 'allocationBasis', 40)
      if (!category || !(COST_CATEGORIES as readonly string[]).includes(category)) {
        throw errors.validationFailed([{ field: `commonPools[${index}].category`, reason: `must be one of ${COST_CATEGORIES.join(' | ')}` }])
      }
      if (!basis || !(['saleable-area', 'gfa', 'units', 'custom-ratio'] as const).some((item) => item === basis)) {
        throw errors.validationFailed([{ field: `commonPools[${index}].allocationBasis`, reason: 'must be saleable-area | gfa | units | custom-ratio' }])
      }
      const rawRatios = pool.customRatios === null || pool.customRatios === undefined ? null : (typeof pool.customRatios === 'object' && !Array.isArray(pool.customRatios) ? pool.customRatios as Record<string, unknown> : null)
      return {
        id: optionalString(pool.id, 'id', 100) ?? newId('pcp'),
        category: category as CostCategory,
        amount: optionalString(pool.amount, 'amount', 40) ?? '0',
        allocationBasis: basis as PlanInputs['commonPools'][number]['allocationBasis'],
        customRatios: rawRatios === null ? null : Object.fromEntries(Object.entries(rawRatios).map(([key, value]) => [key, String(value)])),
        ruleNote: optionalString(pool.ruleNote, 'ruleNote', 1000),
      }
    })
  }
  return next
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

function planResultsOf(plan: Row): PlanResults | null {
  return parseJsonColumn<PlanResults | null>(plan.results_json, null)
}

export const registerPlanRoutes: DomainRoutes = (app, platform) => {
  app.post('/api/parcels/:id/plans', async (context) => {
    await requirePermission(context, platform, 'plans:write')
    const actor = currentActor(context)
    const parcelId = context.req.param('id')
    const parcel = await loadParcel(platform.db, parcelId)
    const body = await readJsonBody(context)
    const name = requiredString(body.name, 'name')
    let conventionId = optionalString(body.initialAreaConventionId, 'initialAreaConventionId', 100)
    if (!conventionId) conventionId = await defaultAreaConventionId(platform.db, parcel.state ? String(parcel.state) : null)
    const copyFrom = optionalString(body.copyFromQuickAssessmentId, 'copyFromQuickAssessmentId', 100)
    const id = newId('pln')
    const timestamp = nowIso()
    const baseInputs = emptyPlanInputs()
    baseInputs.areaBasis.areaConventionId = conventionId
    baseInputs.phases = [{ id: newId('pph'), name: '期次 1', seq: 1, landAllocation: { method: 'by-land-area', value: null }, products: [], gfaBreakdown: null }]
    if (copyFrom) {
      const assessment = await platform.db.queryOne<Row>({ text: 'SELECT * FROM quick_assessments WHERE id = ? AND parcel_id = ?', params: [copyFrom, parcelId] })
      if (!assessment) throw errors.notFound('Quick assessment not found')
      const inputs = parseJsonColumn<{ landAreaSqft?: string; plotRatioOrDensity?: string; landCostTotal?: string | null; landCostPerSqft?: string | null; landCostLastEditedBasis?: string | null; policyAssumptions?: Record<string, unknown> | null }>(assessment.inputs_json, {})
      baseInputs.areaBasis.landAreaSqft = inputs.landAreaSqft ?? '0'
      baseInputs.areaBasis.plotRatioOrDensity = inputs.plotRatioOrDensity ?? '0'
      if (inputs.landCostTotal || inputs.landCostPerSqft) {
        baseInputs.landPrice = {
          total: inputs.landCostTotal ?? null,
          perSqft: inputs.landCostPerSqft ?? null,
          lastEditedBasis: (inputs.landCostLastEditedBasis as 'total' | 'per-sqft') ?? (inputs.landCostTotal ? 'total' : 'per-sqft'),
        }
      }
    }
    await platform.db.transaction(async (tx) => {
      await tx.run({
        text: `INSERT INTO plans (id, parcel_id, name, kind, status, source_plan_id, copied_at, copied_by, change_note, owner_id, assumption_tags_json, parameter_refs_json, phase_count, area_basis_json, parking_json, land_price_json, results_json, created_at, updated_at)
               VALUES (?, ?, ?, 'baseline', 'draft', NULL, NULL, NULL, NULL, ?, ?, ?, 1, ?, ?, ?, NULL, ?, ?)`,
        params: [id, parcelId, name, actor.id, '[]', JSON.stringify({ areaConventionId: conventionId, costPackageIds: null, policyRefs: null }), JSON.stringify(baseInputs.areaBasis), JSON.stringify(baseInputs.parking), JSON.stringify(baseInputs.landPrice), timestamp, timestamp],
      })
      await savePlanInputs(tx, id, baseInputs)
    })
    await auditEvent(platform, { type: 'plan.created', actorUserId: actor.id, objectType: 'plan', objectId: id, summary: `新建基准方案 ${name}` })
    const plan = await loadPlan(platform.db, id)
    return context.json(mapPlanResource(plan, await loadPlanInputs(platform.db, id), null), 201)
  })

  app.get('/api/parcels/:id/plans', async (context) => {
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const filters: string[] = ['parcel_id = ?']
    const params: unknown[] = [parcelId]
    const status = context.req.query('status')
    const kind = context.req.query('kind')
    if (status && (PLAN_STATUSES as readonly string[]).includes(status)) {
      filters.push('status = ?')
      params.push(status)
    }
    if (kind && (['baseline', 'candidate'] as const).some((item) => item === kind)) {
      filters.push('kind = ?')
      params.push(kind)
    }
    const rows = await platform.db.queryAll<Row>({ text: `SELECT * FROM plans WHERE ${filters.join(' AND ')} ORDER BY created_at DESC`, params })
    return context.json({
      items: rows.map((row) => {
        const { inputs, results, ...meta } = mapPlanResource(row, emptyPlanInputs(), null)
        void inputs
        void results
        return meta
      }),
    })
  })

  app.get('/api/plans/:id', async (context) => {
    const plan = await loadPlan(platform.db, context.req.param('id'))
    return context.json(mapPlanResource(plan, await loadPlanInputs(platform.db, String(plan.id)), planResultsOf(plan)))
  })

  app.post('/api/plans/:id/copy', async (context) => {
    await requirePermission(context, platform, 'plans:copy')
    const actor = currentActor(context)
    const sourceId = context.req.param('id')
    const source = await loadPlan(platform.db, sourceId)
    const body = await readJsonBody(context)
    const changeNote = requiredString(body.changeNote, 'changeNote')
    const asKind = optionalString(body.asKind, 'asKind', 40) ?? 'candidate'
    if (asKind !== 'candidate' && asKind !== 'baseline') {
      throw errors.validationFailed([{ field: 'asKind', reason: 'must be candidate or baseline' }])
    }
    // 输入原样复制；行 ID 由 savePlanInputs 服务端重生成（跨方案主键隔离）。
    const inputs = await loadPlanInputs(platform.db, sourceId)
    const id = newId('pln')
    const timestamp = nowIso()
    const results = planResultsOf(source)
    await platform.db.transaction(async (tx) => {
      await tx.run({
        text: `INSERT INTO plans (id, parcel_id, name, kind, status, source_plan_id, copied_at, copied_by, change_note, owner_id, assumption_tags_json, parameter_refs_json, phase_count, area_basis_json, parking_json, land_price_json, results_json, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [id, String(source.parcel_id), String(source.name), asKind, sourceId, timestamp, actor.id, changeNote, actor.id, source.assumption_tags_json, source.parameter_refs_json, Number(source.phase_count), source.area_basis_json, source.parking_json, source.land_price_json, results === null ? null : JSON.stringify(results), timestamp, timestamp],
      })
      await savePlanInputs(tx, id, inputs)
    })
    await auditEvent(platform, { type: 'plan.copied', actorUserId: actor.id, objectType: 'plan', objectId: id, summary: `复制方案（来源 ${sourceId}）：${changeNote}`, metadata: { sourcePlanId: sourceId } })
    const plan = await loadPlan(platform.db, id)
    return context.json(mapPlanResource(plan, await loadPlanInputs(platform.db, id), planResultsOf(plan)), 201)
  })

  app.patch('/api/plans/:id/inputs', async (context) => {
    const actor = currentActor(context)
    const planId = context.req.param('id')
    const plan = await loadPlan(platform.db, planId)
    const status = String(plan.status)
    if (!EDITABLE_STATUSES.has(status)) throw errors.planLocked()
    await requirePermission(context, platform, 'plans:write')
    if (String(plan.owner_id) !== actor.id) {
      throw errors.forbidden('Only the plan owner can edit plan inputs')
    }
    const body = await readJsonBody(context)
    const base = await loadPlanInputs(platform.db, planId)
    const next = parsePlanInputsPatch(body, base)
    const details = validatePlanInputs(next)
    if (details.length > 0) throw errors.validationFailed(details)
    const timestamp = nowIso()
    const saved = await platform.db.transaction(async (tx) => {
      const canonical = await savePlanInputs(tx, planId, next)
      await tx.run({ text: 'UPDATE plans SET updated_at = ? WHERE id = ?', params: [timestamp, planId] })
      return { canonical, results: await recomputeInTx(tx, planId) }
    })
    await auditEvent(platform, { type: 'plan.inputs.updated', actorUserId: actor.id, objectType: 'plan', objectId: planId, summary: `更新测算输入并重算（${Object.keys(body).join(', ')}）` })
    const refreshed = await loadPlan(platform.db, planId)
    return context.json(mapPlanResource(refreshed, saved.canonical, saved.results))
  })

  app.post('/api/plans/:id/formalize', async (context) => {
    await requirePermission(context, platform, 'plans:formalize')
    const actor = currentActor(context)
    const planId = context.req.param('id')
    const plan = await loadPlan(platform.db, planId)
    if (String(plan.owner_id) !== actor.id) {
      throw errors.forbidden('Only the plan owner can formalize the plan')
    }
    const status = String(plan.status)
    if (status === 'formalized' || status === 'in_review' || status === 'adopted' || status === 'not_selected' || status === 'returned') {
      return context.json({ ...mapPlanResource(plan, await loadPlanInputs(platform.db, planId), planResultsOf(plan)), snapshotId: (await platform.db.queryOne<Row>({ text: 'SELECT id FROM plan_snapshots WHERE plan_id = ? ORDER BY created_at DESC LIMIT 1', params: [planId] }))?.id ?? null })
    }
    if (status !== 'draft' && status !== 'saved') {
      throw errors.statusConflict(`plan in status ${status} cannot be formalized`)
    }
    const inputs = await loadPlanInputs(platform.db, planId)
    const details = validateForFormalize(inputs)
    if (details.length > 0) throw errors.formalizeChecksFailed(details)
    const refs = parseJsonColumn<{ areaConventionId: string | null }>(plan.parameter_refs_json, { areaConventionId: null })
    const convention = await loadAreaConvention(platform.db, inputs.areaBasis.areaConventionId ?? refs.areaConventionId)
    const results = computePlanResults(inputs, convention, nowIso())
    const snapshotId = newId('psn')
    const timestamp = nowIso()
    await platform.db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO plan_snapshots (id, plan_id, kind, inputs_json, results_json, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [snapshotId, planId, 'formalized', JSON.stringify(inputs), JSON.stringify(results), timestamp, actor.id],
      })
      await tx.run({ text: "UPDATE plans SET status = 'formalized', results_json = ?, updated_at = ? WHERE id = ?", params: [JSON.stringify(results), timestamp, planId] })
    })
    await auditEvent(platform, { type: 'plan.formalized', actorUserId: actor.id, objectType: 'plan', objectId: planId, summary: '方案正式化并生成冻结快照' })
    const refreshed = await loadPlan(platform.db, planId)
    return context.json({ ...mapPlanResource(refreshed, inputs, results), snapshotId })
  })

  app.get('/api/plans/:id/results', async (context) => {
    await requirePermission(context, platform, 'plans:read')
    const plan = await loadPlan(platform.db, context.req.param('id'))
    const results = planResultsOf(plan)
    const refs = parseJsonColumn<{ areaConventionId: string | null }>(plan.parameter_refs_json, { areaConventionId: null })
    const inputs = await loadPlanInputs(platform.db, String(plan.id))
    return context.json({
      results,
      basis: { areaConventionId: inputs.areaBasis.areaConventionId ?? refs.areaConventionId, landPriceBasis: inputs.landPrice.lastEditedBasis },
    })
  })

  app.post('/api/plans/:id/area-convention', async (context) => {
    await requirePermission(context, platform, 'plans:write')
    const actor = currentActor(context)
    const planId = context.req.param('id')
    const plan = await loadPlan(platform.db, planId)
    if (!EDITABLE_STATUSES.has(String(plan.status))) throw errors.planLocked()
    if (String(plan.owner_id) !== actor.id) {
      throw errors.forbidden('Only the plan owner can switch the area convention')
    }
    const body = await readJsonBody(context)
    const areaConventionId = requiredString(body.areaConventionId, 'areaConventionId', 100)
    const reason = requiredString(body.reason, 'reason')
    const convention = await loadAreaConvention(platform.db, areaConventionId)
    if (!convention) throw errors.validationFailed([{ field: 'areaConventionId', reason: 'unknown area convention version' }])
    const inputs = await loadPlanInputs(platform.db, planId)
    inputs.areaBasis.areaConventionId = areaConventionId
    inputs.areaBasis.areaConventionReason = reason
    const timestamp = nowIso()
    const canonical = await platform.db.transaction(async (tx) => {
      const saved = await savePlanInputs(tx, planId, inputs)
      await tx.run({
        text: 'UPDATE plans SET parameter_refs_json = json_set(parameter_refs_json, \'$.areaConventionId\', ?), updated_at = ? WHERE id = ?',
        params: [areaConventionId, timestamp, planId],
      })
      await recomputeInTx(tx, planId)
      return saved
    })
    await auditEvent(platform, { type: 'plan.area_convention.switched', actorUserId: actor.id, objectType: 'plan', objectId: planId, summary: `切换面积口径至 ${areaConventionId}（${reason}）` })
    const refreshed = await loadPlan(platform.db, planId)
    return context.json(mapPlanResource(refreshed, canonical, planResultsOf(refreshed)))
  })
}

/** 事务内重算（PATCH inputs / 切换口径共用；保持保存+重算原子性）。 */
async function recomputeInTx(tx: DbClient, planId: string): Promise<PlanResults | null> {
  const plan = await tx.queryOne<Row>({ text: 'SELECT * FROM plans WHERE id = ?', params: [planId] })
  if (!plan) throw errors.notFound('Plan not found')
  const inputs = await loadPlanInputs(tx, planId)
  const refs = parseJsonColumn<{ areaConventionId: string | null }>(plan.parameter_refs_json, { areaConventionId: null })
  const convention = await loadAreaConvention(tx, inputs.areaBasis.areaConventionId ?? refs.areaConventionId)
  const results = computePlanResults(inputs, convention, nowIso())
  await tx.run({ text: 'UPDATE plans SET results_json = ? WHERE id = ?', params: [JSON.stringify(results), planId] })
  return results
}

export { loadAreaConvention }
