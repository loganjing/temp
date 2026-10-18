// 计费引擎纯函数测试：三种计费模式、分段优惠、最低收费、区间与日期工具（AC-02/AC-03 计算语义）。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeLine, matchDiscount, roundAmount } from '../src/server/services/billing-engine.ts'
import { addDays, compareDates, freeRentEndDate, validateDiscountIntervals } from '../src/shared/contracts.ts'

const MEASURE = { stockQty: 600, locations: 30, volume: 370, weight: 14250 }

test('普通模式：原始费用 = 业务量 × 单价，无最低收费取原始费用', () => {
  const outcome = computeLine(
    { billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: 100, minCharge: null, fixedAmount: null, discounts: [] },
    MEASURE,
  )
  assert.equal(outcome.businessQty, 600)
  assert.equal(outcome.rawAmount, 60000)
  assert.equal(outcome.discountedAmount, 60000)
  assert.equal(outcome.minCharge, null)
  assert.equal(outcome.finalAmount, 60000)
})

test('普通模式按库位/体积/重量分别取对应度量', () => {
  const byLocations = computeLine({ billingMode: 'normal', billingBasis: 'locations', unitPrice: 50, minCharge: null, fixedAmount: null, discounts: [] }, MEASURE)
  assert.equal(byLocations.businessQty, 30)
  assert.equal(byLocations.rawAmount, 1500)

  const byVolume = computeLine({ billingMode: 'normal', billingBasis: 'volume', unitPrice: 20, minCharge: null, fixedAmount: null, discounts: [] }, MEASURE)
  assert.equal(byVolume.businessQty, 370)
  assert.equal(byVolume.rawAmount, 7400)

  const byWeight = computeLine({ billingMode: 'normal', billingBasis: 'weight', unitPrice: 1, minCharge: null, fixedAmount: null, discounts: [] }, MEASURE)
  assert.equal(byWeight.businessQty, 14250)
  assert.equal(byWeight.rawAmount, 14250)
})

test('普通模式含最低收费：最终费用 = Max(原始费用, 最低收费)', () => {
  const outcome = computeLine(
    { billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: 10, minCharge: 50000, fixedAmount: null, discounts: [] },
    MEASURE,
  )
  assert.equal(outcome.rawAmount, 6000)
  assert.equal(outcome.finalAmount, 50000)
})

test('一口价模式：直接取金额，不受业务量、单价、最低收费影响', () => {
  const outcome = computeLine(
    { billingMode: 'fixed_price', billingBasis: null, unitPrice: 999, minCharge: 99999, fixedAmount: 88888, discounts: [{ lowerLimit: 0, upperLimit: 10000, discountMode: 'percent', percentValue: 50 }] },
    { stockQty: 0, locations: 0, volume: 0, weight: 0 },
  )
  assert.equal(outcome.businessQty, null)
  assert.equal(outcome.rawAmount, 88888)
  assert.equal(outcome.discountedAmount, 88888)
  assert.equal(outcome.minCharge, null)
  assert.equal(outcome.finalAmount, 88888)
})

test('取大值模式：体积与重量计费金额取较大者，再对比最低收费', () => {
  // 体积金额 370×100=37000，重量金额 14250×100=1425000 → 取重量
  const outcome = computeLine(
    { billingMode: 'max_value', billingBasis: null, unitPrice: 100, minCharge: null, fixedAmount: null, discounts: [] },
    MEASURE,
  )
  assert.equal(outcome.rawAmount, 1425000)
  assert.equal(outcome.businessQty, 14250)

  // 体积胜出：重量极小
  const volumeWins = computeLine(
    { billingMode: 'max_value', billingBasis: null, unitPrice: 100, minCharge: null, fixedAmount: null, discounts: [] },
    { stockQty: 100, locations: 5, volume: 500, weight: 2 },
  )
  assert.equal(volumeWins.rawAmount, 50000)
  assert.equal(volumeWins.businessQty, 500)

  // 取大值后再与最低收费取最大
  const withMin = computeLine(
    { billingMode: 'max_value', billingBasis: null, unitPrice: 1, minCharge: 500000, fixedAmount: null, discounts: [] },
    MEASURE,
  )
  assert.equal(withMin.rawAmount, 14250)
  assert.equal(withMin.finalAmount, 500000)
})

test('分段优惠按百分比：优惠后金额 = 基础金额 × (1 - 优惠百分比/100)', () => {
  const outcome = computeLine(
    { billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: 100, minCharge: null, fixedAmount: null, discounts: [{ lowerLimit: 0, upperLimit: 10000, discountMode: 'percent', percentValue: 10 }] },
    MEASURE,
  )
  assert.equal(outcome.rawAmount, 60000)
  assert.equal(outcome.discountedAmount, 54000)
  assert.equal(outcome.finalAmount, 54000)
})

test('分段优惠固定金额：优惠后金额 = 基础金额 - 固定优惠，结果小于 0 置 0', () => {
  const outcome = computeLine(
    { billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: 100, minCharge: null, fixedAmount: null, discounts: [{ lowerLimit: 0, upperLimit: 10000, discountMode: 'fixed', fixedValue: 5000 }] },
    MEASURE,
  )
  assert.equal(outcome.discountedAmount, 55000)

  // 固定优惠大于基础金额 → 0（需求第 10 节异常 3）
  const negative = computeLine(
    { billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: 1, minCharge: null, fixedAmount: null, discounts: [{ lowerLimit: 0, upperLimit: 10000, discountMode: 'fixed', fixedValue: 99999 }] },
    MEASURE,
  )
  assert.equal(negative.rawAmount, 600)
  assert.equal(negative.discountedAmount, 0)
  assert.equal(negative.finalAmount, 0)
})

test('优惠后金额再与最低收费取最大值作为最终计费金额', () => {
  const outcome = computeLine(
    { billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: 100, minCharge: 60000, fixedAmount: null, discounts: [{ lowerLimit: 0, upperLimit: 10000, discountMode: 'percent', percentValue: 50 }] },
    MEASURE,
  )
  assert.equal(outcome.discountedAmount, 30000)
  assert.equal(outcome.finalAmount, 60000)
})

test('分段优惠区间左闭右开，业务量仅命中一条规则', () => {
  const discounts = [
    { lowerLimit: 0, upperLimit: 100, discountMode: 'percent', percentValue: 5 },
    { lowerLimit: 100, upperLimit: 1000, discountMode: 'percent', percentValue: 10 },
  ]
  assert.equal(matchDiscount(discounts, 99)?.percentValue, 5)
  assert.equal(matchDiscount(discounts, 100)?.percentValue, 10)
  assert.equal(matchDiscount(discounts, 999)?.percentValue, 10)
  assert.equal(matchDiscount(discounts, 1000), null)
  assert.equal(matchDiscount(discounts, 0)?.percentValue, 5)
})

test('validateDiscountIntervals 拦截重叠与断层，放行首尾相接区间', () => {
  assert.equal(validateDiscountIntervals([
    { lowerLimit: 0, upperLimit: 100, discountMode: 'percent', percentValue: 5 },
    { lowerLimit: 50, upperLimit: 200, discountMode: 'percent', percentValue: 10 },
  ]), '分段优惠区间存在重叠')

  assert.equal(validateDiscountIntervals([
    { lowerLimit: 0, upperLimit: 100, discountMode: 'percent', percentValue: 5 },
    { lowerLimit: 200, upperLimit: 300, discountMode: 'percent', percentValue: 10 },
  ]), '分段优惠区间存在断层')

  assert.equal(validateDiscountIntervals([
    { lowerLimit: 0, upperLimit: 100, discountMode: 'percent', percentValue: 5 },
    { lowerLimit: 100, upperLimit: 2000, discountMode: 'fixed', fixedValue: 300 },
  ]), null)

  assert.equal(validateDiscountIntervals([]), null)
  assert.equal(validateDiscountIntervals([{ lowerLimit: 0, upperLimit: 0, discountMode: 'percent', percentValue: 5 }]), '业务量上限必须大于业务量下限')
})

test('金额舍入策略点：四舍五入到整数分', () => {
  assert.equal(roundAmount(0.4), 0)
  assert.equal(roundAmount(0.5), 1)
  assert.equal(roundAmount(1.5), 2)
  assert.equal(roundAmount(-0.5), 0)
})

test('免租期与日期工具', () => {
  assert.equal(freeRentEndDate('2026-01-01', 0), '2026-01-01')
  assert.equal(freeRentEndDate('2026-01-01', 1), '2026-01-01')
  assert.equal(freeRentEndDate('2026-01-01', 7), '2026-01-07')
  assert.equal(freeRentEndDate('2026-01-25', 15), '2026-02-08')
  assert.equal(addDays('2026-01-31', 1), '2026-02-01')
  assert.equal(compareDates('2026-01-01', '2026-01-02'), -1)
  assert.equal(compareDates('2026-01-02', '2026-01-02'), 0)
  assert.equal(compareDates('2026-01-03', '2026-01-02'), 1)
})
