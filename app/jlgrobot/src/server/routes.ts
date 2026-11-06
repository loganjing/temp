import { Hono, type Context } from 'hono'
import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type { initializePlatform } from './platform/bootstrap'
import type {
  CreateDeviceRequest,
  CreateFaultRequest,
  CreateUpgradeRequest,
  CreateWorkOrderRequest,
  Device,
  FaultDiagnosis,
  HistoryEvent,
  RepairOrder,
  UpdateDeviceStatusRequest,
  UpgradeRecord,
} from '../shared/types'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

const now = () => new Date().toISOString()

function badRequest(c: Context, message: string) {
  return c.json({ error: { code: 'VALIDATION_ERROR', message } }, 400)
}

function notFound(c: Context, message: string) {
  return c.json({ error: { code: 'NOT_FOUND', message } }, 404)
}

async function findDevice(db: DbClient, id: string): Promise<Device | null> {
  return db.queryOne<Device>({
    text: 'SELECT id, name, model, current_status, created_at, updated_at FROM devices WHERE id = ?',
    params: [id],
  })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

// 业务路由：需求未要求认证与授权，按技术契约注册为公开路由。
export function registerPublicRoutes(app: Hono, platform: Platform) {
  const { db } = platform

  // ---- 设备管理 ----

  app.get('/api/devices', async (c) => {
    const devices = await db.queryAll<Device>({
      text: 'SELECT id, name, model, current_status, created_at, updated_at FROM devices ORDER BY created_at ASC',
    })
    return c.json({ devices })
  })

  app.post('/api/devices', async (c) => {
    const body = await c.req.json<CreateDeviceRequest>().catch(() => ({} as CreateDeviceRequest))
    if (!isNonEmptyString(body.name)) return badRequest(c, 'name is required')
    const id = randomUUID()
    const ts = now()
    const status = isNonEmptyString(body.current_status) ? body.current_status! : 'unknown'
    const model = typeof body.model === 'string' && body.model.trim() !== '' ? body.model : null
    await db.run({
      text: 'INSERT INTO devices (id, name, model, current_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [id, body.name.trim(), model, status, ts, ts],
    })
    const device = await findDevice(db, id)
    return c.json(device, 201)
  })

  app.get('/api/devices/:id', async (c) => {
    const device = await findDevice(db, c.req.param('id'))
    if (!device) return notFound(c, 'device not found')
    return c.json(device)
  })

  app.patch('/api/devices/:id/status', async (c) => {
    const id = c.req.param('id')
    const existing = await findDevice(db, id)
    if (!existing) return notFound(c, 'device not found')
    const body = await c.req.json<UpdateDeviceStatusRequest>().catch(() => ({} as UpdateDeviceStatusRequest))
    if (!isNonEmptyString(body.current_status)) return badRequest(c, 'current_status is required')
    const ts = now()
    await db.run({
      text: 'UPDATE devices SET current_status = ?, updated_at = ? WHERE id = ?',
      params: [body.current_status.trim(), ts, id],
    })
    const device = await findDevice(db, id)
    return c.json(device)
  })

  // ---- 故障诊断 ----

  app.get('/api/devices/:deviceId/faults', async (c) => {
    const deviceId = c.req.param('deviceId')
    if (!(await findDevice(db, deviceId))) return notFound(c, 'device not found')
    const faults = await db.queryAll<FaultDiagnosis>({
      text: 'SELECT id, device_id, fault_description, diagnosis_result, created_at FROM fault_diagnoses WHERE device_id = ? ORDER BY created_at ASC',
      params: [deviceId],
    })
    return c.json({ faults })
  })

  app.post('/api/devices/:deviceId/faults', async (c) => {
    const deviceId = c.req.param('deviceId')
    if (!(await findDevice(db, deviceId))) return notFound(c, 'device not found')
    const body = await c.req.json<CreateFaultRequest>().catch(() => ({} as CreateFaultRequest))
    if (!isNonEmptyString(body.fault_description)) return badRequest(c, 'fault_description is required')
    const id = randomUUID()
    const ts = now()
    const diagnosisResult = typeof body.diagnosis_result === 'string' && body.diagnosis_result.trim() !== '' ? body.diagnosis_result : null
    await db.run({
      text: 'INSERT INTO fault_diagnoses (id, device_id, fault_description, diagnosis_result, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [id, deviceId, body.fault_description.trim(), diagnosisResult, ts],
    })
    const fault = await db.queryOne<FaultDiagnosis>({
      text: 'SELECT id, device_id, fault_description, diagnosis_result, created_at FROM fault_diagnoses WHERE id = ?',
      params: [id],
    })
    return c.json(fault, 201)
  })

  // ---- 远程升级 ----

  app.get('/api/devices/:deviceId/upgrades', async (c) => {
    const deviceId = c.req.param('deviceId')
    if (!(await findDevice(db, deviceId))) return notFound(c, 'device not found')
    const upgrades = await db.queryAll<UpgradeRecord>({
      text: 'SELECT id, device_id, target_version, status, result, created_at, completed_at FROM upgrade_records WHERE device_id = ? ORDER BY created_at ASC',
      params: [deviceId],
    })
    return c.json({ upgrades })
  })

  app.post('/api/devices/:deviceId/upgrades', async (c) => {
    const deviceId = c.req.param('deviceId')
    if (!(await findDevice(db, deviceId))) return notFound(c, 'device not found')
    const body = await c.req.json<CreateUpgradeRequest>().catch(() => ({} as CreateUpgradeRequest))
    if (!isNonEmptyString(body.target_version)) return badRequest(c, 'target_version is required')
    const id = randomUUID()
    const ts = now()
    await db.run({
      text: 'INSERT INTO upgrade_records (id, device_id, target_version, status, result, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [id, deviceId, body.target_version.trim(), 'pending', null, ts, null],
    })
    const upgrade = await db.queryOne<UpgradeRecord>({
      text: 'SELECT id, device_id, target_version, status, result, created_at, completed_at FROM upgrade_records WHERE id = ?',
      params: [id],
    })
    return c.json(upgrade, 201)
  })

  // ---- 维修工单 ----

  app.get('/api/devices/:deviceId/work-orders', async (c) => {
    const deviceId = c.req.param('deviceId')
    if (!(await findDevice(db, deviceId))) return notFound(c, 'device not found')
    const workOrders = await db.queryAll<RepairOrder>({
      text: 'SELECT id, device_id, content, result, status, created_at, updated_at FROM repair_orders WHERE device_id = ? ORDER BY created_at ASC',
      params: [deviceId],
    })
    return c.json({ work_orders: workOrders })
  })

  app.post('/api/devices/:deviceId/work-orders', async (c) => {
    const deviceId = c.req.param('deviceId')
    if (!(await findDevice(db, deviceId))) return notFound(c, 'device not found')
    const body = await c.req.json<CreateWorkOrderRequest>().catch(() => ({} as CreateWorkOrderRequest))
    if (!isNonEmptyString(body.content)) return badRequest(c, 'content is required')
    const id = randomUUID()
    const ts = now()
    const result = typeof body.result === 'string' && body.result.trim() !== '' ? body.result : null
    await db.run({
      text: 'INSERT INTO repair_orders (id, device_id, content, result, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [id, deviceId, body.content.trim(), result, 'open', ts, ts],
    })
    const workOrder = await db.queryOne<RepairOrder>({
      text: 'SELECT id, device_id, content, result, status, created_at, updated_at FROM repair_orders WHERE id = ?',
      params: [id],
    })
    return c.json(workOrder, 201)
  })

  // ---- 设备履历（跨表聚合，只读） ----

  app.get('/api/devices/:deviceId/history', async (c) => {
    const deviceId = c.req.param('deviceId')
    const device = await findDevice(db, deviceId)
    if (!device) return notFound(c, 'device not found')

    const [faults, upgrades, workOrders] = await Promise.all([
      db.queryAll<FaultDiagnosis>({
        text: 'SELECT id, device_id, fault_description, diagnosis_result, created_at FROM fault_diagnoses WHERE device_id = ?',
        params: [deviceId],
      }),
      db.queryAll<UpgradeRecord>({
        text: 'SELECT id, device_id, target_version, status, result, created_at, completed_at FROM upgrade_records WHERE device_id = ?',
        params: [deviceId],
      }),
      db.queryAll<RepairOrder>({
        text: 'SELECT id, device_id, content, result, status, created_at, updated_at FROM repair_orders WHERE device_id = ?',
        params: [deviceId],
      }),
    ])

    const events: HistoryEvent[] = [
      ...faults.map((f) => ({
        event_type: 'fault' as const,
        event_id: f.id,
        timestamp: f.created_at,
        summary: `故障：${f.fault_description}`,
      })),
      ...upgrades.map((u) => ({
        event_type: 'upgrade' as const,
        event_id: u.id,
        timestamp: u.created_at,
        summary: `远程升级至 ${u.target_version}（状态：${u.status}）`,
      })),
      ...workOrders.map((w) => ({
        event_type: 'work_order' as const,
        event_id: w.id,
        timestamp: w.created_at,
        summary: `维修工单：${w.content}（状态：${w.status}）`,
      })),
      {
        event_type: 'status' as const,
        event_id: device.id,
        timestamp: device.updated_at,
        summary: `设备状态更新为 ${device.current_status}`,
      },
    ]

    events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0))

    return c.json({ device, events })
  })
}

// 认证保护路由预留；当前需求未要求认证，业务路由已在公开注册。
export function registerProtectedRoutes(_app: Hono, _platform: Platform) {}
