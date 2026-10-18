// API 全链路测试：临时 SQLite + 真实 HTTP 空闲端口，覆盖登录契约、地块→档案 D4→市场→
// 快评→方案（输入保存/口径切换/正式化/锁定/复制）→提交/退回/采用→决策记录→看板→报告→
// 敏感性/反算/比较→交接导出→权限负例→AI 502→参数版本化→状态机与审计（契约 §1–§12）。
// app.fetch 之外的证据均为真实 HTTP listener；此测试为服务端行为验证，非 E2E。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { createApp } from '../src/server/app.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'

const tmp = await mkdtemp(path.join(tmpdir(), 'land-api-flow-'))
process.env.DB_PATH = path.join(tmp, 'land.db')
process.env.ATTACHMENTS_DIR = path.join(tmp, 'attachments')
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'land-test-jwt-secret'
delete process.env.AI_PROVIDER_URL

const platform = await initializePlatform()
const app = createApp({
  registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
  registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  protect: platform.auth.requireAnyAuth,
})

/** 与引擎单测同源的基准输入（wire 形态：数值字段为字符串）。 */
function wireInputs({ priceA = '500000', conventionId = 'param-ac-general-v1' } = {}) {
  return {
    areaBasis: {
      landAreaSqft: '100000', plotRatioOrDensity: '2.5', densityBasis: 'plot-ratio',
      areaConventionId: conventionId, areaConventionReason: null,
      gfaIncludesParking: false, nfaMode: 'convention-default', manualEfficiency: null,
    },
    phases: [{
      id: 'ph-a', name: '期次 1', seq: '1',
      landAllocation: { method: 'by-land-area', value: null },
      products: [
        {
          id: 'pd-a', format: 'residential', tier: null, sharePct: '60', units: '200',
          unitAreaSqft: '500', saleableAreaSqft: '100000', price: priceA, pricePerSqft: null,
          priceBasis: 'unit-price', bumiQuotaPct: '30', bumiDiscountPct: '5',
          affordableQuota: null, parkingPerUnit: '1',
        },
        {
          id: 'pd-b', format: 'retail', tier: null, sharePct: '40', units: '100',
          unitAreaSqft: '1000', saleableAreaSqft: '100000', price: null, pricePerSqft: '300',
          priceBasis: 'per-sqft', bumiQuotaPct: null, bumiDiscountPct: null,
          affordableQuota: null, parkingPerUnit: '1',
        },
      ],
      gfaBreakdown: { total: '250000' },
    }],
    parking: { govMin: 300, internalTarget: 350, usedBasis: 'gov', visitorSlots: 0, extraInternalSlots: 0, areaPerSlotSqft: '0' },
    costs: [
      { id: 'c1', phaseId: null, category: 'construction', itemName: '建安工程', basis: 'fixed', value: '30000000', sourceType: 'historical-project', status: 'confirmed', note: null },
      { id: 'c2', phaseId: null, category: 'construction', itemName: '桩基工程', basis: 'per-gfa', value: '100', sourceType: 'market-judgment', status: 'confirmed', note: null },
      { id: 'c3', phaseId: null, category: 'infrastructure', itemName: '三通一平', basis: 'per-land-area', value: '5', sourceType: 'manual-estimate', status: 'pending', note: null },
      { id: 'c4', phaseId: null, category: 'furniture-equipment', itemName: '机电设备', basis: 'per-unit', value: '20000', sourceType: 'client-input', status: 'confirmed', note: null },
      { id: 'c5', phaseId: null, category: 'contingency-tax', itemName: '税项计提', basis: 'pct-revenue', value: '1', sourceType: 'government', status: 'confirmed', note: null },
      { id: 'c6', phaseId: null, category: 'misc-gov', itemName: '转换费', basis: 'pct-cost', value: '2', sourceType: 'government', status: 'pending', note: null },
      { id: 'c7', phaseId: 'ph-a', category: 'professional-pm', itemName: '专业费用', basis: 'per-saleable', value: '2', sourceType: 'market-judgment', status: 'confirmed', note: null },
      { id: 'c8', phaseId: 'ph-a', category: 'sales-marketing', itemName: '营销费用', basis: 'fixed', value: '3000000', sourceType: 'market-judgment', status: 'confirmed', note: null },
      { id: 'c9', phaseId: null, category: 'finance', itemName: '融资成本', basis: 'per-parking', value: '1000', sourceType: 'manual-estimate', status: 'confirmed', note: null },
      { id: 'c10', phaseId: null, category: 'finance', itemName: '持有期利息', basis: 'per-year', value: '500000', sourceType: 'manual-estimate', status: 'confirmed', note: null },
    ],
    commonPools: [
      { id: 'pool-1', category: 'infrastructure', amount: '1000000', allocationBasis: 'saleable-area', customRatios: null, ruleNote: null },
      { id: 'pool-2', category: 'misc-gov', amount: '100000', allocationBasis: 'custom-ratio', customRatios: { 'ph-a': '100' }, ruleNote: null },
    ],
    landPrice: { total: '10000000', perSqft: null, lastEditedBasis: 'total' },
  }
}

test('Land 服务端全链路（真实 HTTP + 临时库）', async () => {
  await withHttpServer(
    {
      fetch: app.fetch,
      close: async () => {
        await platform.close()
        await rm(tmp, { recursive: true, force: true })
      },
    },
    async (base) => {
      const call = async (method, requestPath, { token, body } = {}) => {
        const response = await fetch(`${base}${requestPath}`, {
          method,
          headers: {
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        // fetch text() 会剥离 UTF-8 BOM；保留原始字节以便断言导出字节流确实携带 BOM。
        const bytes = new Uint8Array(await response.arrayBuffer())
        const text = new TextDecoder().decode(bytes)
        let json = null
        try { json = JSON.parse(text) } catch { /* CSV 导出为非 JSON 字节流 */ }
        return { status: response.status, json, text, headers: response.headers, bytes }
      }
      const login = async (username, password = 'Land-Seed-2026!') => {
        const { status, json } = await call('POST', '/api/auth/login', { body: { username, password } })
        assert.equal(status, 200, `登录 ${username} 失败：${JSON.stringify(json)}`)
        return json.token
      }

      // —— 平台边界与登录契约（§0/§1）——
      const health = await call('GET', '/api/health')
      assert.equal(health.status, 200)
      assert.equal(health.json.app, 'land')

      const badLogin = await call('POST', '/api/auth/login', { body: { username: 'planner@land.local', password: 'wrong-password' } })
      assert.equal(badLogin.status, 401)
      assert.equal(badLogin.json.error.code, 'INVALID_CREDENTIALS')

      const planner = await login('planner@land.local')
      const plannerLogin = await call('POST', '/api/auth/login', { body: { username: 'planner@land.local', password: 'Land-Seed-2026!' } })
      assert.equal(plannerLogin.json.user.username, 'planner@land.local')
      assert.ok(plannerLogin.json.user.roles.includes('plan-owner'))

      const me = await call('GET', '/api/auth/me', { token: planner })
      assert.equal(me.status, 200)
      assert.ok(me.json.permissions.includes('plans:write'))

      const unauth = await call('GET', '/api/parcels')
      assert.equal(unauth.status, 401)
      assert.equal(unauth.json.error.code, 'UNAUTHENTICATED')

      // —— 地块台账与状态机负例（§2）——
      const created = await call('POST', '/api/parcels', {
        token: planner,
        body: { name: '测试地块 A', state: 'Selangor', city: 'Shah Alam', areaSqft: '100000' },
      })
      assert.equal(created.status, 201)
      const parcelId = created.json.id
      assert.equal(created.json.status, 'processing')
      assert.equal(created.json.areaSqft, '100000')

      const list = await call('GET', '/api/parcels', { token: planner })
      assert.equal(list.json.total, 1)
      // 契约 §2：列表项携带 summary 与 summaryIncomplete；progress 仅在详情接口返回。
      assert.equal(list.json.items[0].summaryIncomplete !== undefined, true)
      assert.equal(list.json.items[0].summary.gdv !== undefined, true)

      const illegalTransition = await call('POST', `/api/parcels/${parcelId}/status`, { token: planner, body: { to: 'completed', reason: '越级' } })
      assert.equal(illegalTransition.status, 409)
      assert.equal(illegalTransition.json.error.code, 'STATUS_CONFLICT')

      const missingReason = await call('POST', `/api/parcels/${parcelId}/status`, { token: planner, body: { to: 'in_review' } })
      assert.equal(missingReason.status, 422)
      assert.equal(missingReason.json.error.code, 'VALIDATION_FAILED')

      // —— 档案 D4 地价双向录入（§3）——
      const profileByTotal = await call('PATCH', `/api/parcels/${parcelId}/profile`, {
        token: planner,
        body: { totalLandAreaSqft: '100000', totalLandPrice: '10000000', landPriceLastEditedBasis: 'total' },
      })
      assert.equal(profileByTotal.status, 200)
      assert.equal(profileByTotal.json.totalLandPrice, '10000000')
      assert.equal(profileByTotal.json.unitLandPrice, '100')
      assert.equal(profileByTotal.json.landPriceLastEditedBasis, 'total')

      const profileByUnit = await call('PATCH', `/api/parcels/${parcelId}/profile`, {
        token: planner,
        body: { unitLandPrice: '120', landPriceLastEditedBasis: 'unit' },
      })
      assert.equal(profileByUnit.json.unitLandPrice, '120')
      assert.equal(profileByUnit.json.totalLandPrice, '12000000')

      // —— 市场参考（§5）——
      const landRef = await call('POST', `/api/parcels/${parcelId}/market/land-refs`, {
        token: planner,
        body: { projectName: '参考地块 1', distanceKm: '1.5', dealPrice: '9000000', pricePerSqft: '90', source: '中介口述', sourceType: 'government', confidence: 'verified', listingStatus: 'transacted' },
      })
      assert.equal(landRef.status, 201)
      const comp = await call('POST', `/api/parcels/${parcelId}/market/comps`, {
        token: planner,
        body: { projectName: '竞品 1', format: 'residential', askingPrice: '480000', pricePerSqft: '400', totalUnits: 500, soldUnits: 120, source: '调研', sourceType: 'market-judgment' },
      })
      assert.equal(comp.status, 201)

      // —— 快速评估（§6）——
      const assessment = await call('POST', `/api/parcels/${parcelId}/quick-assessments`, {
        token: planner,
        body: {
          inputs: {
            landAreaSqft: '100000', plotRatioOrDensity: '2', estimatedUnitsOrSaleableArea: '400',
            unitPriceOrPricePerSqft: '200000', landCostTotal: '20000000', landCostLastEditedBasis: 'total',
            constructionCostPerSqft: '250', miscGovPerSqft: '10', professionalFeePct: '5',
            salesMarketingPct: '2', financeCostPct: '6',
            policyAssumptions: { bumiQuotaPct: '30', bumiDiscountPct: '5', targetPm: '20' },
          },
        },
      })
      assert.equal(assessment.status, 201)
      assert.equal(assessment.json.verdict, null)
      const computed = await call('POST', `/api/quick-assessments/${assessment.json.id}/compute`, { token: planner })
      assert.equal(computed.status, 200)
      assert.equal(computed.json.verdict, 'PASS')
      assert.equal(computed.json.results.gdv, '80000000')
      assert.equal(computed.json.results.netGdv, '78800000')
      const assessmentList = await call('GET', '/api/quick-assessments', { token: planner })
      assert.equal(assessmentList.json.total, 1)
      assert.equal(assessmentList.json.items[0].verdict, 'PASS')

      // —— 参数版本（§11）：两套种子口径可读 ——
      const params = await call('GET', '/api/parameters?kind=area-convention', { token: planner })
      assert.equal(params.json.total, 2)
      const generalParam = params.json.items.find((item) => item.id === 'param-ac-general-v1')
      assert.equal(generalParam.content.efficiencyExParkingDefault, '0.75')
      const paramDetail = await call('GET', '/api/parameters/param-ac-selangor-v1', { token: planner })
      assert.equal(paramDetail.json.content.efficiencyExParkingDefault, '0.72')

      // —— 方案 A：创建、输入保存（服务端行 ID 权威）、口径、正式化与锁定（§7）——
      const planA = await call('POST', `/api/parcels/${parcelId}/plans`, {
        token: planner,
        body: { name: '基准方案 A', initialAreaConventionId: 'param-ac-general-v1' },
      })
      assert.equal(planA.status, 201)
      const planAId = planA.json.id
      assert.equal(planA.json.status, 'draft')
      assert.equal(planA.json.inputs.areaBasis.areaConventionId, 'param-ac-general-v1')

      const patched = await call('PATCH', `/api/plans/${planAId}/inputs`, { token: planner, body: wireInputs() })
      assert.equal(patched.status, 200)
      assert.equal(patched.json.results.gfaTotal, '250000')
      assert.equal(patched.json.results.nfaTotal, '187500')
      assert.equal(patched.json.results.revenue.gdv, '130000000')
      assert.equal(patched.json.results.revenue.netGdv, '128500000')
      assert.equal(patched.json.results.costs.tdc, '78660002')
      assert.equal(patched.json.results.profit.pbt, '49839998')
      assert.equal(patched.json.results.profit.perSqft.tdc, '314.640008')
      assert.equal(patched.json.results.costs.commonPoolAllocations.length, 2)
      assert.equal(patched.json.results.costs.byCategory.length, 9)
      // 契约 §0：行 ID 服务端生成；costs.phaseId 与 customRatios 的期次引用同步重映射。
      const newPhaseId = patched.json.inputs.phases[0].id
      assert.notEqual(newPhaseId, 'ph-a')
      assert.notEqual(patched.json.inputs.phases[0].products[0].id, 'pd-a')
      const professional = patched.json.inputs.costs.find((item) => item.itemName === '专业费用')
      assert.equal(professional.phaseId, newPhaseId)
      const customPool = patched.json.inputs.commonPools.find((pool) => pool.allocationBasis === 'custom-ratio')
      assert.deepEqual(Object.keys(customPool.customRatios), [newPhaseId])

      const invalid = await call('PATCH', `/api/plans/${planAId}/inputs`, {
        token: planner,
        body: { ...wireInputs(), phases: [{ ...wireInputs().phases[0], products: [wireInputs().phases[0].products[0], { ...wireInputs().phases[0].products[1], sharePct: '30' }] }] },
      })
      assert.equal(invalid.status, 422)
      assert.equal(invalid.json.error.code, 'VALIDATION_FAILED')
      assert.ok(invalid.json.error.details[0].field.includes('sharePct'))

      const formalized = await call('POST', `/api/plans/${planAId}/formalize`, { token: planner })
      assert.equal(formalized.status, 200)
      assert.equal(formalized.json.status, 'formalized')
      assert.equal(typeof formalized.json.snapshotId, 'string')

      const lockedPatch = await call('PATCH', `/api/plans/${planAId}/inputs`, { token: planner, body: { areaBasis: { landAreaSqft: '999999' } } })
      assert.equal(lockedPatch.status, 403)
      assert.equal(lockedPatch.json.error.code, 'PLAN_LOCKED')
      const lockedConvention = await call('POST', `/api/plans/${planAId}/area-convention`, { token: planner, body: { areaConventionId: 'param-ac-selangor-v1', reason: '不应生效' } })
      assert.equal(lockedConvention.status, 403)
      assert.equal(lockedConvention.json.error.code, 'PLAN_LOCKED')

      // —— 提交 1 → 退回（§9）——
      const submission1 = await call('POST', `/api/parcels/${parcelId}/submissions`, { token: planner, body: { planIds: [planAId], note: '首次提交' } })
      assert.equal(submission1.status, 201)
      assert.equal(submission1.json.status, 'pending')
      const submission1Id = submission1.json.id

      const submissionDetail = await call('GET', `/api/submissions/${submission1Id}`, { token: planner })
      assert.equal(submissionDetail.json.plans.length, 1)
      assert.equal(submissionDetail.json.plans[0].status, 'in_review')
      assert.equal(submissionDetail.json.plans[0].formalizedSnapshot.snapshotId, formalized.json.snapshotId)
      assert.equal(submissionDetail.json.returnCount, 0)

      const notAdopted = await call('POST', `/api/parcels/${parcelId}/status`, { token: planner, body: { to: 'completed', reason: '无采用方案' } })
      assert.equal(notAdopted.status, 422)
      assert.equal(notAdopted.json.error.code, 'ADOPTED_PLAN_REQUIRED')

      const approver = await login('approver@land.local')
      const returnNoReason = await call('POST', `/api/submissions/${submission1Id}/return`, { token: approver, body: {} })
      assert.equal(returnNoReason.status, 422)
      assert.equal(returnNoReason.json.error.code, 'RETURN_REASON_REQUIRED')
      const returned = await call('POST', `/api/submissions/${submission1Id}/return`, { token: approver, body: { reason: '售价假设需复核' } })
      assert.equal(returned.status, 200)
      assert.equal(returned.json.status, 'returned')
      const planAReturned = await call('GET', `/api/plans/${planAId}`, { token: planner })
      assert.equal(planAReturned.json.status, 'returned')

      // —— 方案 B：退回后复制派生 + 口径切换 + 输入修改（§7）——
      const planB = await call('POST', `/api/plans/${planAId}/copy`, { token: planner, body: { changeNote: '下调住宅售价再试' } })
      assert.equal(planB.status, 201)
      const planBId = planB.json.id
      assert.equal(planB.json.status, 'draft')
      assert.equal(planB.json.kind, 'candidate')
      assert.equal(planB.json.sourcePlanId, planAId)
      assert.notEqual(planB.json.inputs.phases[0].id, newPhaseId)

      const switched = await call('POST', `/api/plans/${planBId}/area-convention`, { token: planner, body: { areaConventionId: 'param-ac-selangor-v1', reason: '雪兰莪州属项目' } })
      assert.equal(switched.status, 200)
      assert.equal(switched.json.inputs.areaBasis.areaConventionId, 'param-ac-selangor-v1')
      assert.equal(switched.json.results.nfaTotal, '180000')

      const patchedB = await call('PATCH', `/api/plans/${planBId}/inputs`, { token: planner, body: wireInputs({ priceA: '450000', conventionId: 'param-ac-selangor-v1' }) })
      assert.equal(patchedB.status, 200)
      assert.equal(patchedB.json.results.revenue.gdv, '120000000')
      assert.equal(patchedB.json.results.revenue.netGdv, '118650000')
      assert.equal(patchedB.json.results.costs.tdc, '78546502')
      assert.equal(patchedB.json.results.profit.pbt, '40103498')
      const formalizedB = await call('POST', `/api/plans/${planBId}/formalize`, { token: planner })
      assert.equal(formalizedB.status, 200)

      // —— 方案 C：第二个候选进入同次提交（未采用路径 not_selected）——
      const planC = await call('POST', `/api/parcels/${parcelId}/plans`, { token: planner, body: { name: '基准方案 C' } })
      assert.equal(planC.status, 201)
      const planCId = planC.json.id
      const patchedC = await call('PATCH', `/api/plans/${planCId}/inputs`, { token: planner, body: wireInputs() })
      assert.equal(patchedC.status, 200)
      assert.equal(patchedC.json.results.costs.tdc, '78660002')
      const formalizedC = await call('POST', `/api/plans/${planCId}/formalize`, { token: planner })
      assert.equal(formalizedC.status, 200)

      // —— 提交 2 → 审批采用（§9）——
      const submission2 = await call('POST', `/api/parcels/${parcelId}/submissions`, { token: planner, body: { planIds: [planBId, planCId], note: '两案比选' } })
      assert.equal(submission2.status, 201)
      const submission2Id = submission2.json.id
      const approveWrongPlan = await call('POST', `/api/submissions/${submission2Id}/approve`, { token: approver, body: { selectedPlanId: planAId } })
      assert.equal(approveWrongPlan.status, 422)
      const approved = await call('POST', `/api/submissions/${submission2Id}/approve`, { token: approver, body: { selectedPlanId: planBId, reason: '采用 B：利润率更稳' } })
      assert.equal(approved.status, 200)
      assert.equal(approved.json.status, 'approved')
      assert.equal(approved.json.selectedPlanId, planBId)

      const parcelFinal = await call('GET', `/api/parcels/${parcelId}`, { token: planner })
      assert.equal(parcelFinal.json.status, 'completed')
      assert.equal(parcelFinal.json.adoptedPlanId, planBId)
      // 契约 §2 详情：progress 五项进度布尔。
      assert.equal(parcelFinal.json.progress.planFormalized, true)
      assert.equal(parcelFinal.json.progress.approvalDone, true)
      assert.equal(parcelFinal.json.progress.profileCollected, true)
      assert.equal(parcelFinal.json.progress.marketResearched, true)
      assert.equal(parcelFinal.json.progress.assessmentDone, true)

      const decision = await call('GET', `/api/parcels/${parcelId}/decision-record`, { token: approver })
      assert.equal(decision.json.adoptedPlanId, planBId)
      assert.equal(decision.json.action, 'continue')
      assert.equal(decision.json.reason, '采用 B：利润率更稳')

      // —— 看板与投资报告（§10）——
      const dashboard = await call('GET', `/api/parcels/${parcelId}/dashboard`, { token: approver })
      assert.equal(dashboard.status, 200)
      assert.equal(dashboard.json.incomplete, false)
      assert.equal(dashboard.json.conclusion.recommendation, 'continue')
      assert.equal(dashboard.json.coreMetrics.gdv, '120000000')
      assert.equal(dashboard.json.recommendedPlan.id, planBId)

      const report = await call('GET', `/api/parcels/${parcelId}/report`, { token: planner })
      assert.equal(report.status, 200)
      assert.equal(report.json.sections.length, 10)
      const financial = report.json.sections.find((section) => section.key === 'financial-summary')
      assert.equal(financial.data.gdv, '120000000')

      // —— 敏感性 / 反算 / 比较（§8）——
      const sensitivity = await call('POST', `/api/plans/${planBId}/sensitivity`, {
        token: planner,
        body: { dimensions: [{ variable: 'unit-price', values: ['0.3', '0.7', '1'] }], targetPm: '18' },
      })
      assert.equal(sensitivity.status, 200)
      assert.deepEqual(sensitivity.json.matrix.map((cell) => cell.feasibility), ['infeasible', 'marginal', 'feasible'])
      assert.equal(sensitivity.json.colorRuleApplied.targetLine, '0.18')

      const backSolve = await call('POST', `/api/plans/${planBId}/back-solve`, { token: planner, body: { targetPm: '18', solveFor: 'max-land-price' } })
      assert.equal(backSolve.status, 200)
      assert.equal(backSolve.json.resultValue, '28746498')

      const compare = await call('POST', '/api/plans/compare', { token: planner, body: { planIds: [planAId, planBId] } })
      assert.equal(compare.status, 200)
      assert.equal(compare.json.plans.length, 2)
      const gdvRow = compare.json.rows.find((row) => row.dimension === 'GDV')
      assert.deepEqual(gdvRow.values, ['130000000', '120000000'])

      // —— 下游交接与受控导出（§10）——
      const handoff = await call('POST', `/api/parcels/${parcelId}/handoff`, { token: planner })
      assert.equal(handoff.status, 201)
      assert.equal(handoff.json.version, `${planBId}@adopted`)
      const handoffLatest = await call('GET', `/api/parcels/${parcelId}/handoff/latest`, { token: approver })
      assert.equal(handoffLatest.status, 200)
      assert.equal(handoffLatest.json.readOnly, true)
      assert.equal(handoffLatest.json.content.adoptedPlan.id, planBId)

      const exportCsv = await call('GET', `/api/parcels/${parcelId}/handoff/export?format=csv`, { token: approver })
      assert.equal(exportCsv.status, 200)
      assert.equal(exportCsv.headers.get('content-type'), 'text/csv; charset=utf-8')
      assert.ok(exportCsv.bytes[0] === 0xef && exportCsv.bytes[1] === 0xbb && exportCsv.bytes[2] === 0xbf, 'CSV 导出字节流应以 UTF-8 BOM 开头')
      assert.ok(exportCsv.text.includes('GDV,120000000'))
      const exportXlsx = await call('GET', `/api/parcels/${parcelId}/handoff/export?format=xlsx`, { token: approver })
      assert.equal(exportXlsx.status, 422)
      assert.equal(exportXlsx.json.error.code, 'VALIDATION_FAILED')

      // —— 完成后的状态机负例：completed → abandoned 非法（§2）——
      const completedTransition = await call('POST', `/api/parcels/${parcelId}/status`, { token: planner, body: { to: 'abandoned', reason: '无效跳转' } })
      assert.equal(completedTransition.status, 409)
      assert.equal(completedTransition.json.error.code, 'STATUS_CONFLICT')

      // —— 权限负例：downstream 只读交接（§0.1）——
      const downstream = await login('downstream@land.local')
      const downstreamForbidden = await call('POST', '/api/parcels', { token: downstream, body: { name: '越权地块' } })
      assert.equal(downstreamForbidden.status, 403)
      assert.equal(downstreamForbidden.json.error.code, 'FORBIDDEN')
      const downstreamHandoff = await call('GET', `/api/parcels/${parcelId}/handoff/latest`, { token: downstream })
      assert.equal(downstreamHandoff.status, 200)
      const plannerUsersForbidden = await call('GET', '/api/users', { token: planner })
      assert.equal(plannerUsersForbidden.status, 403)

      // —— AI 建议：provider 未配置 → 502 且无部分写入（§12）——
      const aiSuggestion = await call('POST', '/api/ai/suggestions', { token: planner, body: { parcelId, kind: 'market-summary' } })
      assert.equal(aiSuggestion.status, 502)
      assert.equal(aiSuggestion.json.error.code, 'AI_PROVIDER_UNAVAILABLE')
      const suggestionCount = await platform.db.queryOne({ text: 'SELECT COUNT(*) AS total FROM ai_suggestions' })
      assert.equal(Number(suggestionCount?.total ?? 0), 0)

      // —— 管理员：参数版本化与用户管理（§1/§11）——
      const admin = await login('admin@land.local')
      const version2 = await call('POST', '/api/parameters', {
        token: admin,
        body: { kind: 'area-convention', region: 'Selangor', effectiveAt: new Date().toISOString(), changeNote: '雪兰莪口径 v2', content: { name: '雪兰莪特殊口径 v2', efficiencyExParkingDefault: '0.75' } },
      })
      assert.equal(version2.status, 201)
      assert.equal(version2.json.version, 2)
      const paramsAfter = await call('GET', '/api/parameters?kind=area-convention', { token: planner })
      assert.equal(paramsAfter.json.total, 3)
      const v1Still = await call('GET', '/api/parameters/param-ac-selangor-v1', { token: planner })
      assert.equal(v1Still.status, 200)
      assert.equal(v1Still.json.version, 1)

      const newUser = await call('POST', '/api/users', {
        token: admin,
        body: { username: 'new-user@land.local', displayName: '新用户', password: 'NewUserPass1234', roleIds: ['plan-owner'] },
      })
      assert.equal(newUser.status, 201)
      assert.deepEqual(newUser.json.roles, ['plan-owner'])
      const roles = await call('GET', '/api/roles', { token: admin })
      assert.equal(roles.json.items.length, 7)
      const adminUsers = await call('GET', '/api/admin/users', { token: admin })
      assert.equal(adminUsers.status, 200)
      assert.equal(adminUsers.json.total, 8)

      // —— 审计（§1/§13）——
      const auditAsOwner = await call('GET', `/api/parcels/${parcelId}/audit`, { token: planner })
      assert.equal(auditAsOwner.status, 200)
      assert.ok(auditAsOwner.json.items.length > 0)
      const auditByAction = await call('GET', `/api/parcels/${parcelId}/audit?action=plan.formalized`, { token: admin })
      assert.ok(auditByAction.json.items.length >= 1)
      assert.equal(auditByAction.json.items.every((item) => item.action === 'plan.formalized'), true)

      // —— 404 与 token 撤销 ——
      const notFound = await call('GET', '/api/plans/pln_missing', { token: planner })
      assert.equal(notFound.status, 404)
      assert.equal(notFound.json.error.code, 'NOT_FOUND')
      const logout = await call('POST', '/api/auth/logout', { token: planner })
      assert.equal(logout.status, 204)
      const revoked = await call('GET', '/api/parcels', { token: planner })
      assert.equal(revoked.status, 401)
      assert.equal(revoked.json.error.code, 'UNAUTHENTICATED')
    },
  )
})
