// 前后端共享的 API 契约类型，字段级定义以 technical-contract.md 为唯一来源。

export type OnlineStatus = 'online' | 'offline'
export type RunningStatus = 'idle' | 'running' | 'error' | 'maintenance'
export type UpgradeStatus = 'pending' | 'in_progress' | 'success' | 'failed'
export type RepairStatus = 'created' | 'in_progress' | 'completed'
export type HistoryEntryType = 'status_change' | 'fault' | 'upgrade' | 'repair_order'

export interface Device {
  id: string
  name: string
  model: string | null
  onlineStatus: OnlineStatus
  runningStatus: RunningStatus
  isAbnormal: boolean
  registeredAt: string
  updatedAt: string
}

export interface CreateDeviceRequest {
  name: string
  model?: string | null
}

export interface UpdateDeviceStatusRequest {
  onlineStatus: OnlineStatus
  runningStatus: RunningStatus
}

export interface Fault {
  id: string
  deviceId: string
  deviceName: string
  description: string
  occurredAt: string
  createdAt: string
  repairOrderId: string | null
}

export interface CreatedFault {
  id: string
  deviceId: string
  description: string
  occurredAt: string
  createdAt: string
}

export interface CreateFaultRequest {
  deviceId: string
  description: string
  occurredAt: string
}

export interface UpgradeTask {
  id: string
  deviceId: string
  deviceName: string
  status: UpgradeStatus
  result: string | null
  createdAt: string
  updatedAt: string
}

export interface CreatedUpgradeTask {
  id: string
  deviceId: string
  status: UpgradeStatus
  result: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateUpgradeRequest {
  deviceId: string
}

export interface UpdateUpgradeStatusRequest {
  status: Exclude<UpgradeStatus, 'pending'>
  result?: string | null
}

export interface RepairOrder {
  id: string
  deviceId: string
  deviceName: string
  faultId: string | null
  description: string
  requirement: string | null
  status: RepairStatus
  result: string | null
  createdAt: string
  updatedAt: string
}

export interface CreatedRepairOrder {
  id: string
  deviceId: string
  faultId: string | null
  description: string
  requirement: string | null
  status: RepairStatus
  result: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateRepairOrderRequest {
  deviceId: string
  faultId?: string | null
  description: string
  requirement?: string | null
}

export interface UpdateRepairOrderStatusRequest {
  status: Exclude<RepairStatus, 'created'>
  result?: string | null
}

export interface HistoryEntry {
  type: HistoryEntryType
  id: string
  timestamp: string
  summary: string
  details: Record<string, unknown>
}

export interface DeviceHistory {
  device: {
    id: string
    name: string
    model: string | null
    onlineStatus: OnlineStatus
    runningStatus: RunningStatus
    isAbnormal: boolean
    registeredAt: string
  }
  timeline: HistoryEntry[]
}

export interface ApiErrorBody {
  error: { code: string; message: string }
}
