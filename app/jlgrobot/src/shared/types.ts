// 设备状态
export const EQUIPMENT_STATUSES = ['running', 'standby', 'fault', 'offline'] as const
export type EquipmentStatus = typeof EQUIPMENT_STATUSES[number]
export function isEquipmentStatus(value: string): value is EquipmentStatus {
  return (EQUIPMENT_STATUSES as readonly string[]).includes(value)
}

// 升级状态
export const UPGRADE_STATUSES = ['in_progress', 'success', 'failed'] as const
export type UpgradeStatus = typeof UPGRADE_STATUSES[number]
export function isUpgradeStatus(value: string): value is UpgradeStatus {
  return (UPGRADE_STATUSES as readonly string[]).includes(value)
}

// 维修工单状态
export const MAINTENANCE_ORDER_STATUSES = ['pending', 'in_progress', 'completed'] as const
export type MaintenanceOrderStatus = typeof MAINTENANCE_ORDER_STATUSES[number]
export function isMaintenanceOrderStatus(value: string): value is MaintenanceOrderStatus {
  return (MAINTENANCE_ORDER_STATUSES as readonly string[]).includes(value)
}

// 设备
export interface Equipment {
  id: number
  code: string
  name: string
  status: EquipmentStatus
  created_at: string
  updated_at: string
}

export interface EquipmentListResponse {
  items: Equipment[]
}

export interface CreateEquipmentRequest {
  code: string
  name: string
  status?: EquipmentStatus
}

export interface UpdateEquipmentRequest {
  status: EquipmentStatus
}

// 故障记录
export interface FaultRecord {
  id: number
  equipment_id: number
  description: string
  occurred_at: string
  created_at: string
}

export interface FaultListResponse {
  items: FaultRecord[]
}

export interface CreateFaultRequest {
  description: string
  occurred_at: string
}

// 升级记录
export interface UpgradeRecord {
  id: number
  equipment_id: number
  status: UpgradeStatus
  started_at: string
  completed_at: string | null
  created_at: string
}

export interface UpgradeListResponse {
  items: UpgradeRecord[]
}

export interface UpdateUpgradeRequest {
  status: UpgradeStatus
}

// 维修工单
export interface MaintenanceOrder {
  id: number
  equipment_id: number
  status: MaintenanceOrderStatus
  result: string | null
  created_at: string
  updated_at: string
}

export interface WorkOrderListResponse {
  items: MaintenanceOrder[]
}

export interface UpdateWorkOrderRequest {
  status?: MaintenanceOrderStatus
  result?: string
}

// 设备履历
export type HistoryEventType = 'fault' | 'upgrade' | 'work_order'

export interface HistoryEvent {
  type: HistoryEventType
  id: number
  timestamp: string
  description?: string
  status?: string
  result?: string | null
}

export interface HistoryEquipment {
  id: number
  code: string
  name: string
  status: EquipmentStatus
}

export interface HistoryResponse {
  equipment: HistoryEquipment
  events: HistoryEvent[]
}

// 通用错误响应
export interface ApiError {
  error: {
    code: string
    message: string
  }
}
