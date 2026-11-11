import type { Context, Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import type { initializePlatform } from './platform/bootstrap'
import { ApiError, badRequest, notFound } from './errors'
import type {
  CreatedFault,
  CreatedRepairOrder,
  CreatedUpgradeTask,
  CreateDeviceRequest,
  CreateFaultRequest,
  CreateRepairOrderRequest,
  CreateUpgradeRequest,
  Device,
  DeviceHistory,
  Fault,
  HistoryEntry,
  HistoryEntryType,
  OnlineStatus,
  RepairOrder,
  RepairStatus,
  RunningStatus,
  UpgradeStatus,
  UpdateDeviceStatusRequest,
  UpdateRepairOrderStatusRequest,
  UpdateUpgradeStatusRequest,
} from '../shared/types'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ONLINE_STATUSES = new Set<OnlineStatus>(['online', 'offline'])
const RUNNING_STATUSES = new Set<RunningStatus>(['idle', 'running', 'error', 'maintenance'])
const UPGRADE_NEXT_STATUSES = new Set(['in_progress', 'success', 'failed'])
const REPAIR_NEXT_STATUSES = new Set(['in_progress', 'completed'])

const UPGRADE_STATUS_LABEL: Record<UpgradeStatus, string> = {
  pending: '待执行',
  in_progress: '执行中',
  success: '成功',
  failed: '失败',
}
const REPAIR_STATUS_LABEL: Record<RepairStatus, string> = {
  created: '已创建',
  in_progress: '处理中',
  completed: '已完成',
}

function nowIso(): string {
  return new Date().toISOString()
}

function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field]
  if (typeof value !== 'string' || value.length === 0) throw badRequest(`${field} is required`)
  return value
}

function optionalString(body: Record<string, unknown>, field: string): string | null {
  const value = body[field]
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw badRequest(`${field} must be a string`)
  return value
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw badRequest(`${field} must be a valid UUID`)
  return value
}

async function parseJsonObject(c: Context): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw badRequest('Request body must be valid JSON')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Request body must be a JSON object')
  }
  return body as Record<string, unknown>
}

function mapDevice(row: Record<string, unknown>): Device {
  return {
    id: row.id as string,
    name: row.name as string,
    model: (row.model as string | null) ?? null,
    onlineStatus: row.online_status as OnlineStatus,
    runningStatus: row.running_status as RunningStatus,
    isAbnormal: Boolean(row.is_abnormal),
    registeredAt: row.registered_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapFault(row: Record<string, unknown>): Fault {
  return {
    id: row.id as string,
    deviceId: row.device_id as string,
    deviceName: row.device_name as string,
    description: row.description as string,
    occurredAt: row.occurred_at as string,
    createdAt: row.created_at as string,
    repairOrderId: (row.repair_order_id as string | null) ?? null,
  }
}

function mapUpgrade(row: Record<string, unknown>): UpgradeTaskShape {
  return {
    id: row.id as string,
    deviceId: row.device_id as string,
    deviceName: (row.device_name as string) ?? null,
    status: row.status as UpgradeStatus,
    result: (row.result as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapRepair(row: Record<string, unknown>): RepairOrder {
  return {
    id: row.id as string,
    deviceId: row.device_id as string,
    deviceName: row.device_name as string,
    faultId: (row.fault_id as string | null) ?? null,
    description: row.description as string,
    requirement: (row.requirement as string | null) ?? null,
    status: row.status as RepairStatus,
    result: (row.result as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

type UpgradeTaskShape = {
  id: string
  deviceId: string
  deviceName: string | null
  status: UpgradeStatus
  result: string | null
  createdAt: string
  updatedAt: string
}

function validateUpgradeTransition(current: UpgradeStatus, next: string): void {
  if (current === 'success' || current === 'failed') {
    throw badRequest('Upgrade task is already in a terminal state')
  }
  if (current === 'pending') {
    if (next !== 'in_progress') throw badRequest('Upgrade task can only transition from pending to in_progress')
    return
  }
  if (current === 'in_progress') {
    if (next !== 'success' && next !== 'failed') {
      throw badRequest('Upgrade task can only transition from in_progress to success or failed')
    }
    return
  }
  throw badRequest('Invalid upgrade task state')
}

function validateRepairTransition(current: RepairStatus, next: string): void {
  if (current === 'completed') throw badRequest('Repair order is already completed')
  if (current === 'created') {
    if (next !== 'in_progress') throw badRequest('Repair order can only transition from created to in_progress')
    return
  }
  if (current === 'in_progress') {
    if (next !== 'completed') throw badRequest('Repair order can only transition from in_progress to completed')
    return
  }
  throw badRequest('Invalid repair order state')
}

// 登录/SSO 等公开端点只在此注册；本项目未选择认证模块，无公开端点。
export function registerPublicRoutes(_app: Hono, _platform: Platform) {}

// 业务路由：本项目未引入认证模块，业务 API 直接挂载在 /api 下。
export function registerProtectedRoutes(app: Hono, platform: Platform) {
  const db = platform.db

  // ---------- 设备模块 ----------

  app.get('/api/devices', async (c) => {
    const rows = await db.queryAll<Record<string, unknown>>({
      text: 'SELECT * FROM devices ORDER BY registered_at DESC, id DESC',
    })
    return c.json(rows.map(mapDevice))
  })

  app.get('/api/devices/:id', async (c) => {
    const id = requireUuid(c.req.param('id'), 'id')
    const row = await db.queryOne<Record<string, unknown>>({
      text: 'SELECT * FROM devices WHERE id = ?',
      params: [id],
    })
    if (!row) throw notFound('Device not found')
    return c.json(mapDevice(row))
  })

  app.post('/api/devices', async (c) => {
    const body = await parseJsonObject(c)
    const name = requireString(body, 'name')
    const model = optionalString(body, 'model')
    const id = randomUUID()
    const ts = nowIso()
    await db.run({
      text: 'INSERT INTO devices (id, name, model, online_status, running_status, is_abnormal, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      params: [id, name, model, 'offline', 'idle', 0, ts, ts],
    })
    const row = await db.queryOne<Record<string, unknown>>({ text: 'SELECT * FROM devices WHERE id = ?', params: [id] })
    return c.json(mapDevice(row!), 201)
  })

  app.patch('/api/devices/:id/status', async (c) => {
    const id = requireUuid(c.req.param('id'), 'id')
    const body = await parseJsonObject(c)
    const onlineStatus = requireString(body, 'onlineStatus')
    const runningStatus = requireString(body, 'runningStatus')
    if (!ONLINE_STATUSES.has(onlineStatus as OnlineStatus)) throw badRequest('onlineStatus must be online or offline')
    if (!RUNNING_STATUSES.has(runningStatus as RunningStatus)) {
      throw badRequest('runningStatus must be idle, running, error or maintenance')
    }
    const isAbnormal = runningStatus === 'error' ? 1 : 0
    const ts = nowIso()

    await db.transaction(async (tx) => {
      const result = await tx.run({
        text: 'UPDATE devices SET online_status = ?, running_status = ?, is_abnormal = ?, updated_at = ? WHERE id = ?',
        params: [onlineStatus, runningStatus, isAbnormal, ts, id],
      })
      if (result.changes === 0) throw notFound('Device not found')
      await tx.run({
        text: 'INSERT INTO device_status_logs (id, device_id, online_status, running_status, is_abnormal, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        params: [randomUUID(), id, onlineStatus, runningStatus, isAbnormal, ts],
      })
    })

    const row = await db.queryOne<Record<string, unknown>>({ text: 'SELECT * FROM devices WHERE id = ?', params: [id] })
    return c.json(mapDevice(row!))
  })

  // ---------- 故障模块 ----------

  app.get('/api/faults', async (c) => {
    const deviceId = c.req.query('deviceId')
    if (deviceId !== undefined) requireUuid(deviceId, 'deviceId')
    const text = deviceId
      ? 'SELECT f.id, f.device_id, d.name AS device_name, f.description, f.occurred_at, f.created_at, ro.id AS repair_order_id FROM faults f JOIN devices d ON d.id = f.device_id LEFT JOIN repair_orders ro ON ro.fault_id = f.id WHERE f.device_id = ? ORDER BY f.created_at DESC, f.id DESC'
      : 'SELECT f.id, f.device_id, d.name AS device_name, f.description, f.occurred_at, f.created_at, ro.id AS repair_order_id FROM faults f JOIN devices d ON d.id = f.device_id LEFT JOIN repair_orders ro ON ro.fault_id = f.id ORDER BY f.created_at DESC, f.id DESC'
    const rows = await db.queryAll<Record<string, unknown>>(deviceId ? { text, params: [deviceId] } : { text })
    return c.json(rows.map(mapFault))
  })

  app.post('/api/faults', async (c) => {
    const body = await parseJsonObject(c)
    const deviceId = requireUuid(body['deviceId'], 'deviceId')
    const description = requireString(body, 'description')
    const occurredAt = requireString(body, 'occurredAt')
    const device = await db.queryOne({ text: 'SELECT id FROM devices WHERE id = ?', params: [deviceId] })
    if (!device) throw badRequest('deviceId does not reference an existing device')
    const id = randomUUID()
    const ts = nowIso()
    await db.run({
      text: 'INSERT INTO faults (id, device_id, description, occurred_at, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [id, deviceId, description, occurredAt, ts],
    })
    const response: CreatedFault = { id, deviceId, description, occurredAt, createdAt: ts }
    return c.json(response, 201)
  })

  // ---------- 升级模块 ----------

  app.get('/api/upgrades', async (c) => {
    const deviceId = c.req.query('deviceId')
    if (deviceId !== undefined) requireUuid(deviceId, 'deviceId')
    const text = deviceId
      ? 'SELECT u.id, u.device_id, d.name AS device_name, u.status, u.result, u.created_at, u.updated_at FROM upgrade_tasks u JOIN devices d ON d.id = u.device_id WHERE u.device_id = ? ORDER BY u.created_at DESC, u.id DESC'
      : 'SELECT u.id, u.device_id, d.name AS device_name, u.status, u.result, u.created_at, u.updated_at FROM upgrade_tasks u JOIN devices d ON d.id = u.device_id ORDER BY u.created_at DESC, u.id DESC'
    const rows = await db.queryAll<Record<string, unknown>>(deviceId ? { text, params: [deviceId] } : { text })
    return c.json(rows.map(mapUpgrade))
  })

  app.post('/api/upgrades', async (c) => {
    const body = await parseJsonObject(c)
    const deviceId = requireUuid(body['deviceId'], 'deviceId')
    const device = await db.queryOne({ text: 'SELECT id FROM devices WHERE id = ?', params: [deviceId] })
    if (!device) throw badRequest('deviceId does not reference an existing device')
    const id = randomUUID()
    const ts = nowIso()
    await db.run({
      text: 'INSERT INTO upgrade_tasks (id, device_id, status, result, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)',
      params: [id, deviceId, 'pending', ts, ts],
    })
    const response: CreatedUpgradeTask = { id, deviceId, status: 'pending', result: null, createdAt: ts, updatedAt: ts }
    return c.json(response, 201)
  })

  app.patch('/api/upgrades/:id/status', async (c) => {
    const id = requireUuid(c.req.param('id'), 'id')
    const body = await parseJsonObject(c)
    const next = requireString(body, 'status')
    if (!UPGRADE_NEXT_STATUSES.has(next)) throw badRequest('status must be in_progress, success or failed')
    const result = optionalString(body, 'result')
    const current = await db.queryOne<Record<string, unknown>>({
      text: 'SELECT id, device_id, status, created_at FROM upgrade_tasks WHERE id = ?',
      params: [id],
    })
    if (!current) throw notFound('Upgrade task not found')
    validateUpgradeTransition(current.status as UpgradeStatus, next)
    const ts = nowIso()
    await db.run({
      text: 'UPDATE upgrade_tasks SET status = ?, result = ?, updated_at = ? WHERE id = ?',
      params: [next, result, ts, id],
    })
    const response: CreatedUpgradeTask = {
      id,
      deviceId: current.device_id as string,
      status: next as UpgradeStatus,
      result,
      createdAt: current.created_at as string,
      updatedAt: ts,
    }
    return c.json(response)
  })

  // ---------- 维修工单模块 ----------

  app.get('/api/repair-orders', async (c) => {
    const status = c.req.query('status')
    if (status !== undefined && !REPAIR_NEXT_STATUSES.has(status) && status !== 'created') {
      throw badRequest('status must be created, in_progress or completed')
    }
    const text = status
      ? 'SELECT r.id, r.device_id, d.name AS device_name, r.fault_id, r.description, r.requirement, r.status, r.result, r.created_at, r.updated_at FROM repair_orders r JOIN devices d ON d.id = r.device_id WHERE r.status = ? ORDER BY r.created_at DESC, r.id DESC'
      : 'SELECT r.id, r.device_id, d.name AS device_name, r.fault_id, r.description, r.requirement, r.status, r.result, r.created_at, r.updated_at FROM repair_orders r JOIN devices d ON d.id = r.device_id ORDER BY r.created_at DESC, r.id DESC'
    const rows = await db.queryAll<Record<string, unknown>>(status ? { text, params: [status] } : { text })
    return c.json(rows.map(mapRepair))
  })

  app.post('/api/repair-orders', async (c) => {
    const body = await parseJsonObject(c)
    const deviceId = requireUuid(body['deviceId'], 'deviceId')
    const description = requireString(body, 'description')
    const requirement = optionalString(body, 'requirement')
    const faultIdRaw = body['faultId']
    let faultId: string | null = null
    if (faultIdRaw !== undefined && faultIdRaw !== null) {
      faultId = requireUuid(faultIdRaw, 'faultId')
    }
    const device = await db.queryOne({ text: 'SELECT id FROM devices WHERE id = ?', params: [deviceId] })
    if (!device) throw badRequest('deviceId does not reference an existing device')
    if (faultId) {
      const fault = await db.queryOne({ text: 'SELECT id FROM faults WHERE id = ?', params: [faultId] })
      if (!fault) throw badRequest('faultId does not reference an existing fault')
    }
    const id = randomUUID()
    const ts = nowIso()
    await db.run({
      text: 'INSERT INTO repair_orders (id, device_id, fault_id, description, requirement, status, result, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)',
      params: [id, deviceId, faultId, description, requirement, 'created', ts, ts],
    })
    const response: CreatedRepairOrder = {
      id,
      deviceId,
      faultId,
      description,
      requirement,
      status: 'created',
      result: null,
      createdAt: ts,
      updatedAt: ts,
    }
    return c.json(response, 201)
  })

  app.patch('/api/repair-orders/:id/status', async (c) => {
    const id = requireUuid(c.req.param('id'), 'id')
    const body = await parseJsonObject(c)
    const next = requireString(body, 'status')
    if (!REPAIR_NEXT_STATUSES.has(next)) throw badRequest('status must be in_progress or completed')
    const result = optionalString(body, 'result')
    const current = await db.queryOne<Record<string, unknown>>({
      text: 'SELECT id, device_id, fault_id, description, requirement, status, created_at FROM repair_orders WHERE id = ?',
      params: [id],
    })
    if (!current) throw notFound('Repair order not found')
    validateRepairTransition(current.status as RepairStatus, next)
    const ts = nowIso()
    await db.run({
      text: 'UPDATE repair_orders SET status = ?, result = ?, updated_at = ? WHERE id = ?',
      params: [next, result, ts, id],
    })
    const response: CreatedRepairOrder = {
      id,
      deviceId: current.device_id as string,
      faultId: (current.fault_id as string | null) ?? null,
      description: current.description as string,
      requirement: (current.requirement as string | null) ?? null,
      status: next as RepairStatus,
      result,
      createdAt: current.created_at as string,
      updatedAt: ts,
    }
    return c.json(response)
  })

  // ---------- 设备履历模块 ----------

  app.get('/api/devices/:id/history', async (c) => {
    const id = requireUuid(c.req.param('id'), 'id')
    const device = await db.queryOne<Record<string, unknown>>({ text: 'SELECT * FROM devices WHERE id = ?', params: [id] })
    if (!device) throw notFound('Device not found')

    const [logs, faults, upgrades, repairs] = await Promise.all([
      db.queryAll<Record<string, unknown>>({
        text: 'SELECT id, online_status, running_status, is_abnormal, created_at FROM device_status_logs WHERE device_id = ?',
        params: [id],
      }),
      db.queryAll<Record<string, unknown>>({
        text: 'SELECT id, description, occurred_at FROM faults WHERE device_id = ?',
        params: [id],
      }),
      db.queryAll<Record<string, unknown>>({
        text: 'SELECT id, status, result, created_at FROM upgrade_tasks WHERE device_id = ?',
        params: [id],
      }),
      db.queryAll<Record<string, unknown>>({
        text: 'SELECT id, description, requirement, status, result, created_at FROM repair_orders WHERE device_id = ?',
        params: [id],
      }),
    ])

    const timeline: HistoryEntry[] = []
    for (const row of logs) {
      const running = row.running_status as RunningStatus
      const abnormal = Boolean(row.is_abnormal)
      timeline.push({
        type: 'status_change',
        id: row.id as string,
        timestamp: row.created_at as string,
        summary: `状态更新：在线 ${row.online_status}，运行 ${running}${abnormal ? '（异常）' : ''}`,
        details: {
          onlineStatus: row.online_status,
          runningStatus: running,
          isAbnormal: abnormal,
        },
      })
    }
    for (const row of faults) {
      timeline.push({
        type: 'fault',
        id: row.id as string,
        timestamp: row.occurred_at as string,
        summary: `故障：${row.description}`,
        details: { description: row.description, occurredAt: row.occurred_at },
      })
    }
    for (const row of upgrades) {
      const status = row.status as UpgradeStatus
      timeline.push({
        type: 'upgrade',
        id: row.id as string,
        timestamp: row.created_at as string,
        summary: `升级任务：${UPGRADE_STATUS_LABEL[status]}`,
        details: { status, result: (row.result as string | null) ?? null },
      })
    }
    for (const row of repairs) {
      const status = row.status as RepairStatus
      timeline.push({
        type: 'repair_order',
        id: row.id as string,
        timestamp: row.created_at as string,
        summary: `维修工单：${REPAIR_STATUS_LABEL[status]} — ${row.description}`,
        details: {
          status,
          description: row.description,
          requirement: (row.requirement as string | null) ?? null,
          result: (row.result as string | null) ?? null,
        },
      })
    }

    timeline.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0))

    const history: DeviceHistory = {
      device: {
        id: device.id as string,
        name: device.name as string,
        model: (device.model as string | null) ?? null,
        onlineStatus: device.online_status as OnlineStatus,
        runningStatus: device.running_status as RunningStatus,
        isAbnormal: Boolean(device.is_abnormal),
        registeredAt: device.registered_at as string,
      },
      timeline,
    }
    return c.json(history)
  })
}

// 防止未使用的类型导入在 isolatedModules 下被擦除时报错。
export type { CreateDeviceRequest, CreateFaultRequest, CreateRepairOrderRequest, CreateUpgradeRequest, UpdateDeviceStatusRequest, UpdateUpgradeStatusRequest, UpdateRepairOrderStatusRequest, HistoryEntryType }
