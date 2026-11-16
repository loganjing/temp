// API 类型契约 — camelCase 字段，供后端序列化和前端消费。
// 数据库字段使用 snake_case，API JSON 字段使用 camelCase，映射在服务层统一处理。

// --- Device (M1) ---

export type DeviceStatus = 'running' | 'idle' | 'fault' | 'offline'

export interface Device {
  id: string
  name: string
  identifier: string
  status: DeviceStatus
  statusUpdatedAt: string
}

export interface UpdateDeviceStatusRequest {
  status: DeviceStatus
}

// --- FaultDiagnosis (M2) ---

export interface FaultDiagnosis {
  id: string
  deviceId: string
  description: string
  diagnosedAt: string
}

export interface CreateFaultDiagnosisRequest {
  description: string
}

// --- UpgradeTask (M3) ---

export type UpgradeTaskStatus = 'pending' | 'executing' | 'success' | 'failed'

export interface UpgradeTask {
  id: string
  deviceId: string
  packageId: string
  status: UpgradeTaskStatus
  initiatedAt: string
  completedAt: string | null
}

export interface CreateUpgradeTaskRequest {
  packageId: string
}

export interface UpdateUpgradeTaskRequest {
  status: 'executing' | 'success' | 'failed'
}

// --- MaintenanceOrder (M4) ---

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

export interface CreateMaintenanceOrderRequest {
  deviceId: string
  faultDescription: string
  technician?: string | null
}

export interface UpdateMaintenanceOrderRequest {
  status: 'processing' | 'completed'
}

// --- EquipmentHistory (M5) ---

export type EventType = 'status_change' | 'fault_diagnosis' | 'remote_upgrade' | 'maintenance_order'

export interface EquipmentHistory {
  id: string
  deviceId: string
  eventType: EventType
  sourceId: string
  description: string
  occurredAt: string
}
