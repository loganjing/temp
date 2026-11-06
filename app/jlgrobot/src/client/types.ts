// 前端 TypeScript 类型，基于 docs/wi-t1000031/technical-contract.md 的 API 契约定义。
// 字段名与 API JSON 保持一致（snake_case），不依赖 src/shared/，不发明 API 行为。

/** 设备当前状态值（technical-contract.md 数据模型 current_status） */
export const DEVICE_STATUSES = ['online', 'offline', 'running', 'standby', 'fault', 'unknown'] as const
export type DeviceStatus = (typeof DEVICE_STATUSES)[number]

/** 升级记录状态值（upgrade_records.status，默认 'pending'） */
export const UPGRADE_STATUSES = ['pending', 'in_progress', 'success', 'failed'] as const
export type UpgradeStatus = (typeof UPGRADE_STATUSES)[number]

/** 维修工单状态值（repair_orders.status，默认 'open'） */
export const WORK_ORDER_STATUSES = ['open', 'in_progress', 'completed'] as const
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number]

/** 设备履历事件来源模块（technical-contract.md 2.5 event_type） */
export const HISTORY_EVENT_TYPES = ['fault', 'upgrade', 'work_order', 'status'] as const
export type HistoryEventType = (typeof HISTORY_EVENT_TYPES)[number]

export interface Device {
  id: string
  name: string
  model: string | null
  current_status: string
  created_at: string
  updated_at: string
}

export interface FaultDiagnosis {
  id: string
  device_id: string
  fault_description: string
  diagnosis_result: string | null
  created_at: string
}

export interface UpgradeRecord {
  id: string
  device_id: string
  target_version: string
  status: string
  result: string | null
  created_at: string
  completed_at: string | null
}

export interface RepairOrder {
  id: string
  device_id: string
  content: string
  result: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface HistoryEvent {
  event_type: HistoryEventType
  event_id: string
  timestamp: string
  summary: string
}

export interface DeviceHistory {
  device: Device
  events: HistoryEvent[]
}

export interface DeviceListResponse {
  devices: Device[]
}

export interface FaultListResponse {
  faults: FaultDiagnosis[]
}

export interface UpgradeListResponse {
  upgrades: UpgradeRecord[]
}

export interface WorkOrderListResponse {
  work_orders: RepairOrder[]
}
