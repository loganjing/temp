// 前端展示层测试：format.ts 纯函数（展示四舍五入、空值占位，不实现业务公式）与契约封闭枚举的中文标签映射。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  displayMoney, displayNumber, displayPercent, displayPercentValue, displayDateTime, displayBytes, dash,
  PARCEL_STATUS_LABELS, PLAN_KIND_LABELS, PLAN_STATUS_LABELS, COST_CATEGORY_LABELS,
  VERDICT_LABELS, REPORT_SECTION_LABELS, DECISION_ACTION_LABELS, PARAMETER_KIND_LABELS,
} from '../../src/client/lib/format.ts'

test('displayMoney：空值占位 —，数值千分位且最多 2 位小数，非数字原样返回', () => {
  assert.equal(displayMoney(null), '—')
  assert.equal(displayMoney(undefined), '—')
  assert.equal(displayMoney(''), '—')
  assert.equal(displayMoney('1234.567'), '1,234.57')
  assert.equal(displayMoney(1234.5), '1,234.5')
  assert.equal(displayMoney(0), '0')
  assert.equal(displayMoney('not-a-number'), 'not-a-number')
})

test('displayNumber：与 displayMoney 同口径', () => {
  assert.equal(displayNumber(null), '—')
  assert.equal(displayNumber('1234.567'), '1,234.57')
})

test('displayPercent：0–1 口径乘 100 追加 %', () => {
  assert.equal(displayPercent(null), '—')
  assert.equal(displayPercent(0.2341), '23.41%')
  assert.equal(displayPercent('0.1'), '10%')
  assert.equal(displayPercent(1), '100%')
})

test('displayPercentValue：已是百分比口径直接展示', () => {
  assert.equal(displayPercentValue(undefined), '—')
  assert.equal(displayPercentValue(60), '60%')
  assert.equal(displayPercentValue('12.5'), '12.5%')
})

test('displayDateTime：空值占位、非法原样返回、合法 ISO 走本地化', () => {
  assert.equal(displayDateTime(null), '—')
  assert.equal(displayDateTime(''), '—')
  assert.equal(displayDateTime('not-a-date'), 'not-a-date')
  const iso = '2026-01-02T03:04:05Z'
  assert.equal(displayDateTime(iso), new Date(iso).toLocaleString('zh-CN', { hour12: false }))
})

test('displayBytes：B/KB/MB 阶梯', () => {
  assert.equal(displayBytes(512), '512 B')
  assert.equal(displayBytes(2048), '2.0 KB')
  assert.equal(displayBytes(3 * 1024 * 1024), '3.0 MB')
})

test('dash：空值占位，非空转字符串', () => {
  assert.equal(dash(null), '—')
  assert.equal(dash('JHR'), 'JHR')
  assert.equal(dash(5), '5')
})

test('标签映射与契约枚举一致', () => {
  assert.equal(PARCEL_STATUS_LABELS.processing, '处理中')
  assert.equal(Object.keys(PARCEL_STATUS_LABELS).length, 4)
  assert.equal(PLAN_KIND_LABELS.candidate, '候选方案')
  assert.equal(PLAN_STATUS_LABELS.returned, '已退回')
  assert.equal(Object.keys(PLAN_STATUS_LABELS).length, 7)
  assert.equal(COST_CATEGORY_LABELS.land, '土地成本')
  assert.equal(Object.keys(COST_CATEGORY_LABELS).length, 9)
  assert.equal(VERDICT_LABELS.PASS, 'PASS（继续推进）')
  assert.equal(REPORT_SECTION_LABELS.conclusion, '项目结论')
  assert.equal(DECISION_ACTION_LABELS.jv, '合作开发')
  assert.equal(PARAMETER_KIND_LABELS['area-convention'], '面积口径')
})
