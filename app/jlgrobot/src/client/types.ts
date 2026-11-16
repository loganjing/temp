// API 类型契约 — 基于 technical-contract.md 定义
// 所有实体 ID 为 UUID v4 字符串，字段命名与 API JSON 一致（camelCase）

export type DeviceStatus = 'running' | 'idle' | 'fault' | 'offline'

export interface Device {
  id: string
  name: string
  identifier: string
  status: DeviceStatus
  statusUpdatedAt: string
}

export interface FaultDiagnosis {
  id: string
  deviceId: string
  description: string
  diagnosedAt: string
}

export type UpgradeTaskStatus = 'pending' | 'executing' | 'success' | 'failed'

export interface UpgradeTask {
  id: string
  deviceId: string
  packageId: string
  status: UpgradeTaskStatus
  initiatedAt: string
  completedAt: string | null
}

export type MaintenanceOrderStatus = 'pending' | 'processing' | 'completed'

export interface MaintenanceOrder {
  id: string
  deviceId: string
  faultDescription: string
  technician: string | null
  status: MaintenanceOrderStatus
  createdAt: string
  updatedAt: string
}

export type HistoryEventType = 'status_change' | 'fault_diagnosis' | 'remote_upgrade' | 'maintenance_order'

export interface EquipmentHistoryEvent {
  id: string
  deviceId: string
  eventType: HistoryEventType
  sourceId: string
  description: string
  occurredAt: string
}
