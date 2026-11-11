// 前端 API 类型定义，基于 docs/wi-t1000049/technical-contract.md 的字段级契约。
// 所有 ID 为 UUID v4 字符串，由服务端生成，前端只读。

export type OnlineStatus = 'online' | 'offline'
export type RunningStatus = 'idle' | 'running' | 'error' | 'maintenance'
export type UpgradeStatus = 'pending' | 'in_progress' | 'success' | 'failed'
export type RepairOrderStatus = 'created' | 'in_progress' | 'completed'
export type TimelineType = 'status_change' | 'fault' | 'upgrade' | 'repair_order'

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

export interface Fault {
  id: string
  deviceId: string
  deviceName: string
  description: string
  occurredAt: string
  createdAt: string
  repairOrderId: string | null
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

export interface RepairOrder {
  id: string
  deviceId: string
  deviceName: string
  faultId: string | null
  description: string
  requirement: string | null
  status: RepairOrderStatus
  result: string | null
  createdAt: string
  updatedAt: string
}

export interface TimelineEntry {
  type: TimelineType
  id: string
  timestamp: string
  summary: string
  details: Record<string, unknown>
}

// 履历中的 device 对象不含 updatedAt（见契约 GET /api/devices/:id/history 响应）。
export interface DeviceHistory {
  device: Omit<Device, 'updatedAt'>
  timeline: TimelineEntry[]
}
