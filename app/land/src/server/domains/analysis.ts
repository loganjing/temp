/**
 * analysis 域：方案比较、敏感性矩阵、目标反算路由（契约第 8 节 / AC-07、AC-13）。
 */
import type { Hono } from 'hono'
import type { Platform } from '../platform/bootstrap'
import { errors, readJsonBody, decimalValues, optionalString } from '../lib/api'
import { loadPlan, requirePermission, type DomainRoutes, type Row } from '../lib/db'
import { computePlanResults, type PlanInputs } from '../engine/plan-engine'
import { backSolve, compareRows, SENSITIVITY_VARIABLES, sensitivityMatrix, type BackSolveTarget, type SensitivityVariable } from '../engine/analysis'
import { loadAreaConvention, loadPlanInputs } from './plans'

export const registerAnalysisRoutes: DomainRoutes = (app, platform) => {
  app.post('/api/plans/compare', async (context) => {
    await requirePermission(context, platform, 'plans:read')
    const body = await readJsonBody(context)
    const planIds = Array.isArray(body.planIds) ? body.planIds.map((item) => String(item)) : []
    if (planIds.length < 2) {
      throw errors.validationFailed([{ field: 'planIds', reason: 'at least two plans are required for comparison' }])
    }
    const plans: Array<{ label: string; inputs: PlanInputs; results: ReturnType<typeof computePlanResults> }> = []
    let parcelId: string | null = null
    for (const planId of planIds) {
      const plan = await loadPlan(platform.db, planId)
      if (parcelId === null) parcelId = String(plan.parcel_id)
      if (String(plan.parcel_id) !== parcelId) {
        throw errors.validationFailed([{ field: 'planIds', reason: 'only plans under the same parcel can be compared' }])
      }
      const inputs = await loadPlanInputs(platform.db, planId)
      const convention = await loadAreaConvention(platform.db, inputs.areaBasis.areaConventionId)
      const results = computePlanResults(inputs, convention, new Date().toISOString())
      plans.push({ label: String(plan.name), inputs, results })
    }
    // plans 元数据需先行解析（map 产生 Promise，直接序列化会得到空对象）。
    const plansMeta = await Promise.all(planIds.map((planId) => planSummary(platform, planId)))
    return context.json({
      plans: plansMeta,
      rows: compareRows(plans),
    })
  })

  app.post('/api/plans/:id/sensitivity', async (context) => {
    await requirePermission(context, platform, 'plans:read')
    const plan = await loadPlan(platform.db, context.req.param('id'))
    const body = await readJsonBody(context)
    const rawDimensions = Array.isArray(body.dimensions) ? body.dimensions : []
    if (rawDimensions.length < 1 || rawDimensions.length > 2) {
      throw errors.validationFailed([{ field: 'dimensions', reason: '1 to 2 dimensions are required' }])
    }
    const dimensions = rawDimensions.map((entry, index) => {
      if (typeof entry !== 'object' || entry === null) throw errors.validationFailed([{ field: `dimensions[${index}]`, reason: 'must be an object' }])
      const record = entry as Record<string, unknown>
      const variable = optionalString(record.variable, `dimensions[${index}].variable`, 60)
      if (!variable || !(SENSITIVITY_VARIABLES as readonly string[]).includes(variable)) {
        throw errors.validationFailed([{ field: `dimensions[${index}].variable`, reason: `must be one of ${SENSITIVITY_VARIABLES.join(' | ')}` }])
      }
      const values = decimalValues(record.values, `dimensions[${index}].values`)
      return { variable: variable as SensitivityVariable, values }
    })
    const targetPm = optionalString(body.targetPm, 'targetPm', 40)
    const rawColorRule = body.colorRule
    const colorRule = rawColorRule === null || rawColorRule === undefined ? null : (() => {
      const rule = rawColorRule as Record<string, unknown>
      const zones = rule.zones as Record<string, unknown> | undefined
      return {
        targetLine: String(rule.targetLine ?? ''),
        zones: {
          aboveTarget: String(zones?.aboveTarget ?? 'ok'),
          nearTarget: String(zones?.nearTarget ?? 'warning'),
          belowTarget: String(zones?.belowTarget ?? 'danger'),
        },
      }
    })()
    const inputs = await loadPlanInputs(platform.db, String(plan.id))
    const convention = await loadAreaConvention(platform.db, inputs.areaBasis.areaConventionId)
    const { matrix, colorRuleApplied } = sensitivityMatrix(inputs, convention, dimensions, targetPm, colorRule, new Date().toISOString())
    return context.json({ matrix, colorRuleApplied })
  })

  app.post('/api/plans/:id/back-solve', async (context) => {
    await requirePermission(context, platform, 'plans:read')
    const plan = await loadPlan(platform.db, context.req.param('id'))
    const body = await readJsonBody(context)
    const targetPm = optionalString(body.targetPm, 'targetPm', 40)
    if (!targetPm) throw errors.validationFailed([{ field: 'targetPm', reason: 'is required' }])
    const solveFor = optionalString(body.solveFor, 'solveFor', 40)
    if (!solveFor || !(['max-land-price', 'min-unit-price', 'max-construction-cost'] as const).some((item) => item === solveFor)) {
      throw errors.validationFailed([{ field: 'solveFor', reason: 'must be max-land-price | min-unit-price | max-construction-cost' }])
    }
    const inputs = await loadPlanInputs(platform.db, String(plan.id))
    const convention = await loadAreaConvention(platform.db, inputs.areaBasis.areaConventionId)
    const result = backSolve(inputs, convention, targetPm, solveFor as BackSolveTarget, new Date().toISOString())
    return context.json(result)
  })
}

async function planSummary(platform: Platform, planId: string): Promise<Row | Record<string, unknown>> {
  const plan = await platform.db.queryOne<Row>({ text: 'SELECT * FROM plans WHERE id = ?', params: [planId] })
  if (!plan) throw errors.notFound('Plan not found')
  return {
    id: String(plan.id),
    name: String(plan.name),
    kind: String(plan.kind),
    status: String(plan.status),
    parcelId: String(plan.parcel_id),
    updatedAt: String(plan.updated_at),
  }
}
