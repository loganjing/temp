// 引擎单测：decimal 精度、快评试算、正式测算全链、校验、敏感性与反算（契约 §0/6/7/8/14）。
// 直接调用引擎纯函数，不启动服务器、不访问数据库。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dec, decInt, add, sub, mul, div, fmt, cmp, pctShare, sum, isZero, DecimalFormatError,
} from '../src/server/engine/decimal.ts'
import { computePlanResults, emptyPlanInputs, sumCategory } from '../src/server/engine/plan-engine.ts'
import { computeQuickAssessment } from '../src/server/engine/compute.ts'
import { applySensitivity, backSolve, sensitivityMatrix } from '../src/server/engine/analysis.ts'
import { validatePlanInputs, validateForFormalize } from '../src/server/engine/validate.ts'

const clone = (value) => JSON.parse(JSON.stringify(value))
const CONVENTION = { name: '测试口径', efficiencyExParkingDefault: '0.8' }
const COMPUTED_AT = '2026-10-18T00:00:00.000Z'

/** 单期双产品 + 十项成本（覆盖九类与全部 basis）+ 两个公共分摊的基准输入。 */
function planInputsFixture() {
  return {
    areaBasis: {
      landAreaSqft: '100000',
      plotRatioOrDensity: '2.5',
      densityBasis: 'plot-ratio',
      areaConventionId: 'param-ac-test',
      areaConventionReason: null,
      gfaIncludesParking: false,
      nfaMode: 'convention-default',
      manualEfficiency: null,
    },
    phases: [{
      id: 'ph-a',
      name: '期次 1',
      seq: 1,
      landAllocation: { method: 'by-land-area', value: null },
      products: [
        {
          id: 'pd-a', format: 'residential', tier: null, sharePct: '60', units: 200,
          unitAreaSqft: '500', saleableAreaSqft: '100000', price: '500000', pricePerSqft: null,
          priceBasis: 'unit-price', bumiQuotaPct: '30', bumiDiscountPct: '5',
          affordableQuota: null, parkingPerUnit: '1',
        },
        {
          id: 'pd-b', format: 'retail', tier: null, sharePct: '40', units: 100,
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

test('decimal：全精度解析、运算与格式化', () => {
  assert.equal(fmt(dec('123.45')), '123.45')
  assert.equal(fmt(dec(12)), '12')
  assert.equal(fmt(decInt(0)), '0')
  assert.equal(fmt(dec('-0')), '0')
  assert.equal(fmt(add(dec('0.1'), dec('0.2'))), '0.3')
  assert.equal(fmt(sum([dec('1.1'), dec('2.2')])), '3.3')
  assert.equal(fmt(mul(dec('1.25'), dec('2'))), '2.5')
  assert.equal(fmt(sub(dec('1'), dec('0.99999999999999999999'))), '0.00000000000000000001')
  // 除法内部放大到 20 位小数后截断：1/3 与 0.18 均为可复现输出。
  assert.equal(fmt(div(dec('1'), dec('3'))), '0.33333333333333333333')
  assert.equal(fmt(pctShare('18')), '0.18')
  assert.equal(cmp(dec('2.5'), dec('2.50')), 0)
  assert.equal(cmp(dec('2.5'), dec('2.51')), -1)
  assert.ok(isZero(dec('0.000')))
  for (const bad of ['1e5', '', 'abc', '12.5.3', '  ', '1,000']) {
    assert.throws(() => dec(bad), DecimalFormatError, `dec(${JSON.stringify(bad)}) 应拒绝`)
  }
  assert.throws(() => dec(12.5), DecimalFormatError)
})

test('computeQuickAssessment：PASS（含土著配额折扣与 D4 total 录入）', () => {
  const inputs = {
    locationNote: 'Petaling', landAreaSqft: '100000', useOrZoning: 'residential',
    plotRatioOrDensity: '2', productMixNote: null, estimatedUnitsOrSaleableArea: '400',
    unitPriceOrPricePerSqft: '200000', landCostTotal: '20000000', landCostPerSqft: null,
    landCostLastEditedBasis: 'total', constructionCostPerSqft: '250', miscGovPerSqft: '10',
    professionalFeePct: '5', salesMarketingPct: '2', financeCostPct: '6',
    policyAssumptions: { bumiQuotaPct: '30', bumiDiscountPct: '5', targetPm: '20' }, costPackageId: null,
  }
  const { results, verdict, verdictNote, nextAction } = computeQuickAssessment(inputs, COMPUTED_AT)
  assert.equal(verdict, 'PASS')
  assert.equal(nextAction, 'market-research')
  assert.ok(verdictNote.includes('利润率'))
  assert.equal(results.gdv, '80000000')
  assert.equal(results.bumiQuotaDiscount, '1200000')
  assert.equal(results.netGdv, '78800000')
  assert.equal(results.constructionCost, '100000')
  assert.equal(results.miscGov, '1000000')
  assert.equal(results.professionalFee, '5000')
  assert.equal(results.salesMarketing, '1600000')
  assert.equal(results.financeCost, '1206000')
  assert.equal(results.tdc, '23911000')
  assert.equal(results.pbt, '54889000')
  assert.equal(results.landCostPerSqft, '200')
  assert.ok(Math.abs(Number(results.pm) - 54889000 / 78800000) < 1e-9)
})

test('computeQuickAssessment：REJECT / DROP 分界与缺输入 INSUFFICIENT', () => {
  const base = {
    locationNote: null, landAreaSqft: '100000', useOrZoning: null, plotRatioOrDensity: '2',
    productMixNote: null, estimatedUnitsOrSaleableArea: '400', unitPriceOrPricePerSqft: '200000',
    landCostTotal: '20000000', landCostPerSqft: null, landCostLastEditedBasis: 'total',
    constructionCostPerSqft: '250', miscGovPerSqft: '10', professionalFeePct: '5',
    salesMarketingPct: '2', financeCostPct: '6',
    policyAssumptions: { targetPm: '20' }, costPackageId: null,
  }
  const reject = computeQuickAssessment({ ...base, landCostTotal: '70000000' }, COMPUTED_AT)
  assert.equal(reject.verdict, 'REJECT')
  assert.equal(reject.nextAction, 'price-negotiation')
  assert.equal(reject.results.pbt, '3089000')

  const drop = computeQuickAssessment({ ...base, landCostTotal: '80000000' }, COMPUTED_AT)
  assert.equal(drop.verdict, 'DROP')
  assert.equal(drop.nextAction, 'abandon')
  assert.equal(drop.results.pbt, '-7511000')

  const insufficient = computeQuickAssessment({ ...base, landCostTotal: null, landCostPerSqft: null, landCostLastEditedBasis: null }, COMPUTED_AT)
  assert.equal(insufficient.verdict, 'INSUFFICIENT')
  assert.equal(insufficient.results, null)
  assert.equal(insufficient.nextAction, 'title-verification')
  assert.ok(insufficient.verdictNote.includes('landCostTotal/landCostPerSqft'))
})

test('computePlanResults：面积/收入/九类成本/分摊/利润全链（效率 0.8）', () => {
  const results = computePlanResults(planInputsFixture(), CONVENTION, COMPUTED_AT)
  // 面积链：GFA=250000（gfaBreakdown 权威），不含车位面积，NFA=200000，效率 0.8。
  assert.equal(results.gfaTotal, '250000')
  assert.equal(results.gfaExParking, '250000')
  assert.equal(results.nfaTotal, '200000')
  assert.equal(results.efficiencyExParking, '0.8')
  assert.equal(results.efficiencyInclParking, '0.8')
  assert.equal(results.totalUnits, 300)
  assert.ok(Math.abs(Number(results.unitsPerAcre) - (300 * 43560) / 100000) < 1e-9)
  // 收入链：unit-price 与 per-sqft 两产品，土著配额仅作用于 A。
  assert.deepEqual(
    results.revenue.byProduct.map((entry) => [entry.productId, entry.revenue, entry.bumiAdjustment]),
    [['pd-a', '100000000', '1500000'], ['pd-b', '30000000', '0']],
  )
  assert.equal(results.revenue.gdv, '130000000')
  assert.equal(results.revenue.bumiQuotaDiscount, '1500000')
  assert.equal(results.revenue.netGdv, '128500000')
  assert.equal(results.revenue.parkingRevenue, '0')
  // 成本链：九类桶 + 公共分摊（saleable-area 与 custom-ratio 两种规则）。
  const byCategory = Object.fromEntries(results.costs.byCategory.map((entry) => [entry.category, entry.amount]))
  assert.equal(byCategory.land, '10000000')
  assert.equal(byCategory.construction, '55000000')
  assert.equal(byCategory.infrastructure, '1500000')
  assert.equal(byCategory['furniture-equipment'], '6000000')
  assert.equal(byCategory['contingency-tax'], '1285000')
  // pct-cost 基数 = construction 类原始录入值求和（c1 30,000,000 + c2 100）：2% = 600,002 + pool-2 100,000。
  assert.equal(byCategory['misc-gov'], '700002')
  assert.equal(byCategory['professional-pm'], '400000')
  assert.equal(byCategory['sales-marketing'], '3000000')
  assert.equal(byCategory.finance, '800000')
  assert.equal(results.costs.byCategory.length, 9)
  assert.deepEqual(
    results.costs.commonPoolAllocations.map((entry) => [entry.poolId, entry.phaseId, entry.amount, entry.basis]),
    [['pool-1', 'ph-a', '1000000', 'saleable-area'], ['pool-2', 'ph-a', '100000', 'custom-ratio']],
  )
  assert.equal(results.costs.tdc, '78685002')
  assert.equal(sumCategory(results, 'construction'), '55000000')
  // 利润链与单位指标。
  assert.equal(results.profit.pbt, '49814998')
  assert.ok(Math.abs(Number(results.profit.pm) - 49814998 / 128500000) < 1e-9)
  assert.equal(results.profit.perSqft.gdv, '520')
  assert.equal(results.profit.perSqft.netGdv, '514')
  assert.equal(results.profit.perSqft.tdc, '314.740008')
  assert.equal(results.profit.perSqft.pbt, '199.259992')
  for (const key of ['gdv', 'netGdv', 'tdc', 'pbt']) {
    assert.ok(Math.abs(Number(results.profit.perUnit[key]) - Number({ gdv: 130000000, netGdv: 128500000, tdc: 78685002, pbt: 49814998 }[key]) / 300) < 1e-6, `perUnit.${key}`)
  }
  assert.equal(results.basis.areaConventionId, 'param-ac-test')
  assert.equal(results.basis.landPriceBasis, 'total')
  assert.equal(results.computedAt, COMPUTED_AT)
})

test('computePlanResults：GFA 推导、空输入与口径缺失错误', () => {
  // 无 gfaBreakdown 时 GFA = 产品面积合计 / 效率。
  const derived = clone(planInputsFixture())
  derived.phases[0].gfaBreakdown = null
  derived.phases[0].products = [{
    id: 'pd-x', format: 'apartment', tier: null, sharePct: '100', units: 100,
    unitAreaSqft: '800', saleableAreaSqft: '80000', price: '600000', pricePerSqft: null,
    priceBasis: 'unit-price', bumiQuotaPct: null, bumiDiscountPct: null,
    affordableQuota: null, parkingPerUnit: '1',
  }]
  derived.parking = { govMin: 100, internalTarget: 100, usedBasis: 'gov', visitorSlots: 0, extraInternalSlots: 0, areaPerSlotSqft: '0' }
  derived.costs = []
  derived.commonPools = []
  derived.landPrice = { total: null, perSqft: '100', lastEditedBasis: 'per-sqft' }
  const derivedResults = computePlanResults(derived, CONVENTION, COMPUTED_AT)
  assert.equal(derivedResults.gfaTotal, '100000')
  assert.equal(derivedResults.nfaTotal, '80000')
  assert.equal(derivedResults.costs.byCategory.find((entry) => entry.category === 'land')?.amount, '10000000')

  // 空输入 + 有口径：全零结果不抛错。
  const empty = computePlanResults(emptyPlanInputs(), CONVENTION, COMPUTED_AT)
  assert.equal(empty.gfaTotal, '0')
  assert.equal(empty.totalUnits, 0)
  assert.equal(empty.revenue.gdv, '0')
  assert.equal(empty.profit.pbt, '0')

  // convention-default 但无口径效率且无手工效率：422 VALIDATION_FAILED。
  assert.throws(() => computePlanResults(emptyPlanInputs(), null, COMPUTED_AT), (error) => {
    assert.equal(error.status, 422)
    assert.equal(error.code, 'VALIDATION_FAILED')
    return true
  })
})

test('validatePlanInputs / validateForFormalize：规则与字段级 detail', () => {
  assert.deepEqual(validatePlanInputs(planInputsFixture()), [])

  const share = clone(planInputsFixture())
  share.phases[0].products[1].sharePct = '30'
  assert.equal(validatePlanInputs(share)[0].field, 'phases[0].products.sharePct')

  const saleable = clone(planInputsFixture())
  saleable.phases[0].products[1].saleableAreaSqft = '90000'
  assert.equal(validatePlanInputs(saleable)[0].field, 'phases[0].products[1].saleableAreaSqft')

  const badPhase = clone(planInputsFixture())
  badPhase.costs[6].phaseId = 'ph-x'
  assert.equal(validatePlanInputs(badPhase)[0].field, 'costs[6].phaseId')

  const ratio = clone(planInputsFixture())
  ratio.commonPools[1].customRatios = { 'ph-a': '60' }
  assert.equal(validatePlanInputs(ratio)[0].field, 'commonPools[1].customRatios')

  const unknownRatio = clone(planInputsFixture())
  unknownRatio.commonPools[1].customRatios = { 'ph-z': '100' }
  assert.equal(validatePlanInputs(unknownRatio)[0].field, 'commonPools[1].customRatios.ph-z')

  const parking = clone(planInputsFixture())
  parking.parking.govMin = 400
  assert.equal(validatePlanInputs(parking)[0].field, 'parking')

  const land = clone(planInputsFixture())
  land.landPrice = { total: null, perSqft: null, lastEditedBasis: 'total' }
  assert.equal(validatePlanInputs(land)[0].field, 'landPrice.total')

  const formalize = validateForFormalize(emptyPlanInputs())
  const fields = formalize.map((detail) => detail.field)
  for (const field of ['landPrice', 'areaBasis.areaConventionId', 'areaBasis.landAreaSqft', 'phases']) {
    assert.ok(fields.includes(field), `formalize 校验应包含 ${field}`)
  }
})

test('applySensitivity：维度因子变换', () => {
  const land = applySensitivity(planInputsFixture(), 'land-price', dec('2'))
  assert.equal(land.landPrice.total, '20000000')

  const parking = applySensitivity(planInputsFixture(), 'parking-count', dec('2'))
  assert.equal(parking.parking.govMin, 600)
  assert.equal(parking.parking.internalTarget, 700)

  // 效率维度按当前基准（口径 0.8）施加相对因子：0.8 × 1.25 = 1。
  const efficiency = applySensitivity(planInputsFixture(), 'efficiency', dec('1.25'), '0.8')
  assert.equal(efficiency.areaBasis.nfaMode, 'manual')
  assert.equal(efficiency.areaBasis.manualEfficiency, '1')
})

test('sensitivityMatrix：可行性分档、双维组合与 colorRule', () => {
  const single = sensitivityMatrix(
    planInputsFixture(), CONVENTION,
    [{ variable: 'unit-price', values: ['0.3', '0.7', '1'] }],
    '18', null, COMPUTED_AT,
  )
  assert.equal(single.matrix.length, 3)
  // 0.6 档 pbt 为负属 infeasible，0.7 才是 marginal；1 为基准列。
  assert.deepEqual(single.matrix.map((cell) => cell.feasibility), ['infeasible', 'marginal', 'feasible'])
  assert.deepEqual(single.matrix.map((cell) => cell.coord), [['0.3'], ['0.7'], ['1']])
  assert.ok(single.matrix[0].pbt.startsWith('-'))
  assert.equal(single.matrix[0].riskNote, '该组合税前利润为负，按当前假设不可行。')
  assert.ok(single.matrix[1].riskNote?.includes('低于目标利润率'))
  assert.equal(single.matrix[2].riskNote, null)
  // 未传 colorRule 时返回默认着色规则（契约 §8 三区）。
  assert.deepEqual(single.colorRuleApplied, {
    targetLine: '0.18',
    zones: { aboveTarget: 'ok', nearTarget: 'warning', belowTarget: 'danger' },
  })

  const dual = sensitivityMatrix(
    planInputsFixture(), CONVENTION,
    [{ variable: 'unit-price', values: ['1'] }, { variable: 'construction-cost', values: ['0.8', '1.2'] }],
    '18', null, COMPUTED_AT,
  )
  assert.deepEqual(dual.matrix.map((cell) => cell.coord), [['1', '0.8'], ['1', '1.2']])

  const custom = { targetLine: '0.2', zones: { aboveTarget: 'green', nearTarget: 'amber', belowTarget: 'red' } }
  const passed = sensitivityMatrix(planInputsFixture(), CONVENTION, [{ variable: 'unit-price', values: ['1'] }], '18', custom, COMPUTED_AT)
  assert.deepEqual(passed.colorRuleApplied, custom)

  for (const dimensions of [[], [{ variable: 'unit-price', values: ['1'] }, { variable: 'unit-price', values: ['1'] }, { variable: 'unit-price', values: ['1'] }]]) {
    assert.throws(() => sensitivityMatrix(planInputsFixture(), CONVENTION, dimensions, '18', null, COMPUTED_AT), (error) => error.code === 'VALIDATION_FAILED')
  }
})

test('backSolve：目标利润率反算', () => {
  const inputs = planInputsFixture()
  // max-land-price 闭式解：landNow 10,000,000 + (PBT 49,814,998 − 0.18×128,500,000)。
  const land = backSolve(inputs, CONVENTION, '18', 'max-land-price', COMPUTED_AT)
  assert.equal(land.solveFor, 'max-land-price')
  assert.equal(land.targetPm, '18')
  assert.equal(land.resultValue, '36684998')

  const unit = backSolve(inputs, CONVENTION, '18', 'min-unit-price', COMPUTED_AT)
  assert.equal(unit.solveFor, 'min-unit-price')
  const unitValue = Number(unit.resultValue)
  assert.ok(unitValue > 300000 && unitValue < 400000, `反算最低均价应落在 (300000, 400000)，得到 ${unit.resultValue}`)

  const construction = backSolve(inputs, CONVENTION, '18', 'max-construction-cost', COMPUTED_AT)
  assert.equal(construction.solveFor, 'max-construction-cost')
  const constructionValue = Number(construction.resultValue)
  assert.ok(constructionValue > 70000000 && constructionValue < 90000000, `反算建筑上限应落在 (70000000, 90000000)，得到 ${construction.resultValue}`)
})
