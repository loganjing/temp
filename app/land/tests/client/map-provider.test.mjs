// 前端地图加载器测试：parseGeoJson 各分支（纯函数）与无 DOM 环境的 loadLeaflet 降级（CDN 注入不适用于 Node）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { loadLeaflet, parseGeoJson, resetLeafletCache } from '../../src/client/lib/map-provider.ts'

test('parseGeoJson：空文本返回 null', () => {
  assert.equal(parseGeoJson(''), null)
  assert.equal(parseGeoJson('   '), null)
})

test('parseGeoJson：非对象 JSON（数组/标量/非法文本）返回 null', () => {
  assert.equal(parseGeoJson('[]'), null)
  assert.equal(parseGeoJson('"text"'), null)
  assert.equal(parseGeoJson('123'), null)
  assert.equal(parseGeoJson('{oops}'), null)
})

test('parseGeoJson：合法 GeoJSON 对象返回解析结果', () => {
  const parsed = parseGeoJson('{"type":"Polygon","coordinates":[[]]}')
  assert.deepEqual(parsed, { type: 'Polygon', coordinates: [[]] })
})

test('loadLeaflet：无 document 环境降级返回 null（不注入、不抛错）', async () => {
  assert.equal(typeof document, 'undefined')
  resetLeafletCache()
  assert.equal(await loadLeaflet(), null)
  // 缓存复位后再次调用仍稳定降级
  assert.equal(await loadLeaflet(), null)
})
