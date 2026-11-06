import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { withHttpServer } from './with-http-server.mjs'

// 使用隔离 DB_PATH 构建带完整业务路由的真实 HTTP 应用。
async function withSecurityApp(verify) {
  const dir = await mkdtemp(path.join(tmpdir(), 'park-security-api-'))
  const previous = process.env.DB_PATH
  process.env.DB_PATH = path.join(dir, 'application.db')
  const platform = await initializePlatform()
  const app = createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  })
  try {
    await withHttpServer({ fetch: app.fetch, close: () => platform.close() }, verify)
  } finally {
    if (previous === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previous
    await rm(dir, { recursive: true, force: true })
  }
}

async function json(response) {
  if (response.status >= 400) {
    throw new Error(`unexpected status ${response.status}: ${await response.text()}`)
  }
  return response.json()
}

async function errorBody(response) {
  return response.json()
}

test('AC-01: 巡逻路线 CRUD 并持久化读回', async () => {
  await withSecurityApp(async (url) => {
    // 创建
    const created = await json(await fetch(`${url}/api/patrol-routes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '夜班路线', points: [
        { name: '东门', sequence_order: 1 },
        { name: '配电房', sequence_order: 2 },
        { name: '西门', sequence_order: 3 },
      ] }),
    }))
    assert.equal(created.data.name, '夜班路线')
    assert.equal(created.data.points.length, 3)
    assert.equal(created.data.points[1].name, '配电房')
    const routeId = created.data.id

    // 列表读回
    const list = await json(await fetch(`${url}/api/patrol-routes`))
    assert.equal(list.data.length, 1)
    assert.equal(list.data[0].id, routeId)

    // 详情读回，按 sequence_order 排序
    const detail = await json(await fetch(`${url}/api/patrol-routes/${routeId}`))
    assert.deepEqual(detail.data.points.map((p) => p.name), ['东门', '配电房', '西门'])

    // 编辑：全量替换点位
    const updated = await json(await fetch(`${url}/api/patrol-routes/${routeId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '夜班路线-修订', points: [
        { name: '南门', sequence_order: 1 },
        { name: '仓库', sequence_order: 2 },
      ] }),
    }))
    assert.equal(updated.data.name, '夜班路线-修订')
    assert.equal(updated.data.points.length, 2)
    assert.equal(updated.data.points[0].name, '南门')

    // 再次读回确认持久化
    const reread = await json(await fetch(`${url}/api/patrol-routes/${routeId}`))
    assert.equal(reread.data.name, '夜班路线-修订')
    assert.deepEqual(reread.data.points.map((p) => p.name), ['南门', '仓库'])

    // 删除
    const deleted = await json(await fetch(`${url}/api/patrol-routes/${routeId}`, { method: 'DELETE' }))
    assert.equal(deleted.data.deleted, true)

    // 删除后列表为空
    const afterDelete = await json(await fetch(`${url}/api/patrol-routes`))
    assert.equal(afterDelete.data.length, 0)

    // 删除不存在返回 404
    const missing = await errorBody(await fetch(`${url}/api/patrol-routes/${routeId}`))
    const missingRes = await fetch(`${url}/api/patrol-routes/${routeId}`)
    assert.equal(missingRes.status, 404)
    assert.equal(missing.error.code, 'not_found')

    // 校验失败：空名称
    const invalid = await fetch(`${url}/api/patrol-routes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', points: [{ name: 'x', sequence_order: 1 }] }),
    })
    assert.equal(invalid.status, 400)
    assert.equal((await invalid.json()).error.code, 'validation_error')
  })
})

test('AC-02 / AC-03 / AC-04 / AC-05: 事件识别→告警→处置→留痕全流程', async () => {
  await withSecurityApp(async (url) => {
    // 视频源预置 3 条
    const sources = await json(await fetch(`${url}/api/video-sources`))
    assert.equal(sources.data.length, 3)
    assert.deepEqual(sources.data.map((s) => s.name), ['园区大门', '停车场', '仓库通道'])

    // 触发事件识别 → 同时创建事件、告警、两条留痕
    const recognized = await json(await fetch(`${url}/api/events/recognize`, { method: 'POST' }))
    assert.equal(recognized.data.alert_id.length > 0, true)
    assert.equal(['intrusion', 'loitering', 'vehicle_violation'].includes(recognized.data.event_type), true)
    const alertId = recognized.data.alert_id
    const eventId = recognized.data.id

    // 事件列表读回
    const events = await json(await fetch(`${url}/api/events`))
    assert.equal(events.data.length, 1)
    assert.equal(events.data[0].id, eventId)
    assert.equal(events.data[0].video_source_name, recognized.data.video_source_name)

    // 按 video_source_id 筛选
    const filtered = await json(await fetch(`${url}/api/events?video_source_id=${recognized.data.video_source_id}`))
    assert.equal(filtered.data.length, 1)

    // 告警列表，初始 pending
    const alerts = await json(await fetch(`${url}/api/alerts`))
    assert.equal(alerts.data.length, 1)
    assert.equal(alerts.data[0].status, 'pending')
    assert.equal(alerts.data[0].id, alertId)

    // 按状态筛选 pending
    const pending = await json(await fetch(`${url}/api/alerts?status=pending`))
    assert.equal(pending.data.length, 1)
    const handlingFiltered = await json(await fetch(`${url}/api/alerts?status=handling`))
    assert.equal(handlingFiltered.data.length, 0)

    // 告警详情含关联事件信息
    const detail = await json(await fetch(`${url}/api/alerts/${alertId}`))
    assert.equal(detail.data.event_id, eventId)
    assert.equal(detail.data.occurred_at.length > 0, true)
    assert.equal(detail.data.handling_records.length, 0)

    // 非法状态转换：pending 直接 complete 应返回 400 invalid_state_transition
    const illegal = await fetch(`${url}/api/alerts/${alertId}/handling`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handler: '张三', action: 'complete', handling_result: '已处理' }),
    })
    assert.equal(illegal.status, 400)
    assert.equal((await illegal.json()).error.code, 'invalid_state_transition')

    // confirm：pending → handling
    const confirmed = await json(await fetch(`${url}/api/alerts/${alertId}/handling`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handler: '张三', action: 'confirm' }),
    }))
    assert.equal(confirmed.data.alert_status, 'handling')
    assert.equal(confirmed.data.action, 'confirm')
    assert.equal(confirmed.data.handler, '张三')
    assert.equal(confirmed.data.handling_result, null)

    // 重复 confirm：handling 再 confirm 应非法
    const doubleConfirm = await fetch(`${url}/api/alerts/${alertId}/handling`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handler: '李四', action: 'confirm' }),
    })
    assert.equal(doubleConfirm.status, 400)
    assert.equal((await doubleConfirm.json()).error.code, 'invalid_state_transition')

    // complete 缺少 handling_result 应校验失败
    const incompleteComplete = await fetch(`${url}/api/alerts/${alertId}/handling`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handler: '张三', action: 'complete' }),
    })
    assert.equal(incompleteComplete.status, 400)
    assert.equal((await incompleteComplete.json()).error.code, 'validation_error')

    // complete：handling → handled
    const completed = await json(await fetch(`${url}/api/alerts/${alertId}/handling`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handler: '张三', action: 'complete', handling_result: '现场核实为误报，已复位' }),
    }))
    assert.equal(completed.data.alert_status, 'handled')
    assert.equal(completed.data.handling_result, '现场核实为误报，已复位')

    // 告警详情含两条处置记录
    const detailAfter = await json(await fetch(`${url}/api/alerts/${alertId}`))
    assert.equal(detailAfter.data.status, 'handled')
    assert.equal(detailAfter.data.handling_records.length, 2)
    assert.deepEqual(detailAfter.data.handling_records.map((r) => r.action), ['confirm', 'complete'])

    // 留痕：包含四个节点
    const trails = await json(await fetch(`${url}/api/trails`))
    const operations = trails.data.map((t) => t.operation_type)
    assert.equal(operations.includes('event_created'), true)
    assert.equal(operations.includes('alert_created'), true)
    assert.equal(operations.includes('alert_confirmed'), true)
    assert.equal(operations.includes('alert_completed'), true)

    // 按操作类型筛选
    const confirmedTrails = await json(await fetch(`${url}/api/trails?operation_type=alert_confirmed`))
    assert.equal(confirmedTrails.data.length, 1)
    assert.equal(confirmedTrails.data[0].business_object_type, 'handling_record')

    // 不存在的告警处置返回 404
    const notFoundHandling = await fetch(`${url}/api/alerts/00000000-0000-4000-8000-000000000000/handling`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handler: 'x', action: 'confirm' }),
    })
    assert.equal(notFoundHandling.status, 404)
    assert.equal((await notFoundHandling.json()).error.code, 'not_found')
  })
})
