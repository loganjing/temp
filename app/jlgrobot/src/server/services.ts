import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type {
  Device,
  DeviceStatus,
  FaultDiagnosis,
  UpgradeTask,
  UpgradeTaskStatus,
  MaintenanceOrder,
  MaintenanceOrderStatus,
  EquipmentHistory,
  EventType,
} from '../shared/types'

// --- Row types (snake_case, from database) ---

interface DeviceRow {
  id: string
  name: string
  identifier: string
  status: string
  status_updated_at: string
}
interface FaultDiagnosisRow {
  id: string
  device_id: string
  description: string
  diagnosed_at: string
}
interface UpgradeTaskRow {
  id: string
  device_id: string
  package_id: string
  status: string
  initiated_at: string
  completed_at: string | null
}
interface MaintenanceOrderRow {
  id: string
  device_id: string
  fault_description: string
  technician: string | null
  status: string
  created_at: string
  updated_at: string
}
interface HistoryRow {
  id: string
  device_id: string
  event_type: string
  source_id: string
  description: string
  occurred_at: string
}

// --- Mappers (snake_case → camelCase) ---

const toDevice = (r: DeviceRow): Device => ({
  id: r.id,
  name: r.name,
  identifier: r.identifier,
  status: r.status as DeviceStatus,
  statusUpdatedAt: r.status_updated_at,
})

const toFaultDiagnosis = (r: FaultDiagnosisRow): FaultDiagnosis => ({
  id: r.id,
  deviceId: r.device_id,
  description: r.description,
  diagnosedAt: r.diagnosed_at,
})

const toUpgradeTask = (r: UpgradeTaskRow): UpgradeTask => ({
  id: r.id,
  deviceId: r.device_id,
  packageId: r.package_id,
  status: r.status as UpgradeTaskStatus,
  initiatedAt: r.initiated_at,
  completedAt: r.completed_at,
})

const toMaintenanceOrder = (r: MaintenanceOrderRow): MaintenanceOrder => ({
  id: r.id,
  deviceId: r.device_id,
  faultDescription: r.fault_description,
  technician: r.technician,
  status: r.status as MaintenanceOrderStatus,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const toHistory = (r: HistoryRow): EquipmentHistory => ({
  id: r.id,
  deviceId: r.device_id,
  eventType: r.event_type as EventType,
  sourceId: r.source_id,
  description: r.description,
  occurredAt: r.occurred_at,
})

// --- Error ---

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: 400 | 404,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// --- Valid status sets ---

const DEVICE_STATUSES = ['running', 'idle', 'fault', 'offline']
const UPGRADE_NEXT_STATUSES = ['executing', 'success', 'failed']
const ORDER_NEXT_STATUSES = ['processing', 'completed']

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// --- State transition validators ---

function isValidUpgradeTransition(current: string, next: string): boolean {
  if (current === 'pending' && next === 'executing') return true
  if (current === 'executing' && (next === 'success' || next === 'failed')) return true
  return false
}

function isValidOrderTransition(current: string, next: string): boolean {
  if (current === 'pending' && next === 'processing') return true
  if (current === 'processing' && next === 'completed') return true
  return false
}

// --- M1: Device services ---

export async function listDevices(db: DbClient): Promise<Device[]> {
  const rows = await db.queryAll<DeviceRow>({
    text: 'SELECT id, name, identifier, status, status_updated_at FROM devices ORDER BY identifier',
  })
  return rows.map(toDevice)
}

export async function getDevice(db: DbClient, id: string): Promise<Device> {
  const row = await db.queryOne<DeviceRow>({
    text: 'SELECT id, name, identifier, status, status_updated_at FROM devices WHERE id = ?',
    params: [id],
  })
  if (!row) throw new ApiError('not_found', '设备不存在', 404)
  return toDevice(row)
}

export async function updateDeviceStatus(db: DbClient, id: string, status: string): Promise<Device> {
  if (!DEVICE_STATUSES.includes(status)) {
    throw new ApiError('invalid_status', '状态值非法', 400)
  }
  const now = new Date().toISOString()
  return db.transaction(async (tx) => {
    const row = await tx.queryOne<DeviceRow>({
      text: 'SELECT id, name, identifier, status, status_updated_at FROM devices WHERE id = ?',
      params: [id],
    })
    if (!row) throw new ApiError('not_found', '设备不存在', 404)
    await tx.run({
      text: 'UPDATE devices SET status = ?, status_updated_at = ? WHERE id = ?',
      params: [status, now, id],
    })
    await tx.run({
      text: 'INSERT INTO equipment_history (id, device_id, event_type, source_id, description, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [randomUUID(), id, 'status_change', id, `设备状态变更为${status}`, now],
    })
    return { id: row.id, name: row.name, identifier: row.identifier, status: status as DeviceStatus, statusUpdatedAt: now }
  })
}

// --- M2: Fault diagnosis services ---

export async function createFaultDiagnosis(
  db: DbClient,
  deviceId: string,
  description: string,
): Promise<FaultDiagnosis> {
  if (!isNonEmptyString(description)) {
    throw new ApiError('invalid_input', '故障描述不能为空', 400)
  }
  const now = new Date().toISOString()
  const id = randomUUID()
  return db.transaction(async (tx) => {
    const device = await tx.queryOne<{ id: string }>({
      text: 'SELECT id FROM devices WHERE id = ?',
      params: [deviceId],
    })
    if (!device) throw new ApiError('not_found', '设备不存在', 404)
    await tx.run({
      text: 'INSERT INTO fault_diagnoses (id, device_id, description, diagnosed_at) VALUES (?, ?, ?, ?)',
      params: [id, deviceId, description, now],
    })
    await tx.run({
      text: 'INSERT INTO equipment_history (id, device_id, event_type, source_id, description, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [randomUUID(), deviceId, 'fault_diagnosis', id, `故障诊断：${description}`, now],
    })
    return { id, deviceId, description, diagnosedAt: now }
  })
}

export async function listFaultDiagnoses(db: DbClient, deviceId: string): Promise<FaultDiagnosis[]> {
  const rows = await db.queryAll<FaultDiagnosisRow>({
    text: 'SELECT id, device_id, description, diagnosed_at FROM fault_diagnoses WHERE device_id = ? ORDER BY diagnosed_at DESC',
    params: [deviceId],
  })
  return rows.map(toFaultDiagnosis)
}

// --- M3: Upgrade task services ---

export async function createUpgradeTask(
  db: DbClient,
  deviceId: string,
  packageId: string,
): Promise<UpgradeTask> {
  if (!isNonEmptyString(packageId)) {
    throw new ApiError('invalid_input', '升级包标识不能为空', 400)
  }
  const now = new Date().toISOString()
  const id = randomUUID()
  return db.transaction(async (tx) => {
    const device = await tx.queryOne<{ id: string }>({
      text: 'SELECT id FROM devices WHERE id = ?',
      params: [deviceId],
    })
    if (!device) throw new ApiError('not_found', '设备不存在', 404)
    await tx.run({
      text: 'INSERT INTO upgrade_tasks (id, device_id, package_id, status, initiated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [id, deviceId, packageId, 'pending', now, null],
    })
    await tx.run({
      text: 'INSERT INTO equipment_history (id, device_id, event_type, source_id, description, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [randomUUID(), deviceId, 'remote_upgrade', id, `创建升级任务，升级包：${packageId}`, now],
    })
    return { id, deviceId, packageId, status: 'pending' as UpgradeTaskStatus, initiatedAt: now, completedAt: null }
  })
}

export async function listUpgradeTasks(db: DbClient, deviceId: string): Promise<UpgradeTask[]> {
  const rows = await db.queryAll<UpgradeTaskRow>({
    text: 'SELECT id, device_id, package_id, status, initiated_at, completed_at FROM upgrade_tasks WHERE device_id = ? ORDER BY initiated_at DESC',
    params: [deviceId],
  })
  return rows.map(toUpgradeTask)
}

export async function updateUpgradeTask(db: DbClient, id: string, status: string): Promise<UpgradeTask> {
  if (!UPGRADE_NEXT_STATUSES.includes(status)) {
    throw new ApiError('invalid_status', '状态值非法或非法流转', 400)
  }
  const now = new Date().toISOString()
  return db.transaction(async (tx) => {
    const row = await tx.queryOne<UpgradeTaskRow>({
      text: 'SELECT id, device_id, package_id, status, initiated_at, completed_at FROM upgrade_tasks WHERE id = ?',
      params: [id],
    })
    if (!row) throw new ApiError('not_found', '任务不存在', 404)
    if (!isValidUpgradeTransition(row.status, status)) {
      throw new ApiError('invalid_status', '状态值非法或非法流转', 400)
    }
    const completedAt = status === 'success' || status === 'failed' ? now : null
    await tx.run({
      text: 'UPDATE upgrade_tasks SET status = ?, completed_at = ? WHERE id = ?',
      params: [status, completedAt, id],
    })
    await tx.run({
      text: 'INSERT INTO equipment_history (id, device_id, event_type, source_id, description, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [randomUUID(), row.device_id, 'remote_upgrade', id, `升级任务状态变更为${status}`, now],
    })
    return {
      id: row.id,
      deviceId: row.device_id,
      packageId: row.package_id,
      status: status as UpgradeTaskStatus,
      initiatedAt: row.initiated_at,
      completedAt,
    }
  })
}

// --- M4: Maintenance order services ---

export async function createMaintenanceOrder(
  db: DbClient,
  deviceId: string,
  faultDescription: string,
  technician: string | null,
): Promise<MaintenanceOrder> {
  if (!isNonEmptyString(deviceId) || !isNonEmptyString(faultDescription)) {
    throw new ApiError('invalid_input', '设备ID和故障描述不能为空', 400)
  }
  const now = new Date().toISOString()
  const id = randomUUID()
  return db.transaction(async (tx) => {
    const device = await tx.queryOne<{ id: string }>({
      text: 'SELECT id FROM devices WHERE id = ?',
      params: [deviceId],
    })
    if (!device) throw new ApiError('not_found', '设备不存在', 404)
    await tx.run({
      text: 'INSERT INTO maintenance_orders (id, device_id, fault_description, technician, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [id, deviceId, faultDescription, technician, 'pending', now, now],
    })
    await tx.run({
      text: 'INSERT INTO equipment_history (id, device_id, event_type, source_id, description, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [randomUUID(), deviceId, 'maintenance_order', id, `创建维修工单：${faultDescription}`, now],
    })
    return {
      id,
      deviceId,
      faultDescription,
      technician,
      status: 'pending' as MaintenanceOrderStatus,
      createdAt: now,
      updatedAt: now,
    }
  })
}

export async function listMaintenanceOrders(
  db: DbClient,
  deviceId?: string,
): Promise<MaintenanceOrder[]> {
  if (deviceId) {
    const rows = await db.queryAll<MaintenanceOrderRow>({
      text: 'SELECT id, device_id, fault_description, technician, status, created_at, updated_at FROM maintenance_orders WHERE device_id = ? ORDER BY created_at DESC',
      params: [deviceId],
    })
    return rows.map(toMaintenanceOrder)
  }
  const rows = await db.queryAll<MaintenanceOrderRow>({
    text: 'SELECT id, device_id, fault_description, technician, status, created_at, updated_at FROM maintenance_orders ORDER BY created_at DESC',
  })
  return rows.map(toMaintenanceOrder)
}

export async function getMaintenanceOrder(db: DbClient, id: string): Promise<MaintenanceOrder> {
  const row = await db.queryOne<MaintenanceOrderRow>({
    text: 'SELECT id, device_id, fault_description, technician, status, created_at, updated_at FROM maintenance_orders WHERE id = ?',
    params: [id],
  })
  if (!row) throw new ApiError('not_found', '工单不存在', 404)
  return toMaintenanceOrder(row)
}

export async function updateMaintenanceOrder(
  db: DbClient,
  id: string,
  status: string,
): Promise<MaintenanceOrder> {
  if (!ORDER_NEXT_STATUSES.includes(status)) {
    throw new ApiError('invalid_status', '状态值非法或非法流转', 400)
  }
  const now = new Date().toISOString()
  return db.transaction(async (tx) => {
    const row = await tx.queryOne<MaintenanceOrderRow>({
      text: 'SELECT id, device_id, fault_description, technician, status, created_at, updated_at FROM maintenance_orders WHERE id = ?',
      params: [id],
    })
    if (!row) throw new ApiError('not_found', '工单不存在', 404)
    if (!isValidOrderTransition(row.status, status)) {
      throw new ApiError('invalid_status', '状态值非法或非法流转', 400)
    }
    await tx.run({
      text: 'UPDATE maintenance_orders SET status = ?, updated_at = ? WHERE id = ?',
      params: [status, now, id],
    })
    await tx.run({
      text: 'INSERT INTO equipment_history (id, device_id, event_type, source_id, description, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [randomUUID(), row.device_id, 'maintenance_order', id, `工单状态变更为${status}`, now],
    })
    return {
      id: row.id,
      deviceId: row.device_id,
      faultDescription: row.fault_description,
      technician: row.technician,
      status: status as MaintenanceOrderStatus,
      createdAt: row.created_at,
      updatedAt: now,
    }
  })
}

// --- M5: Equipment history services ---

export async function listEquipmentHistory(
  db: DbClient,
  deviceId: string,
): Promise<EquipmentHistory[]> {
  const device = await db.queryOne<{ id: string }>({
    text: 'SELECT id FROM devices WHERE id = ?',
    params: [deviceId],
  })
  if (!device) throw new ApiError('not_found', '设备不存在', 404)
  const rows = await db.queryAll<HistoryRow>({
    text: 'SELECT id, device_id, event_type, source_id, description, occurred_at FROM equipment_history WHERE device_id = ? ORDER BY occurred_at DESC',
    params: [deviceId],
  })
  return rows.map(toHistory)
}
