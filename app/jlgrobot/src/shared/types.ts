// 设备管理平台共享类型：实体、API 请求与响应契约。
// 字段命名与数据库列、API JSON 一致（snake_case），ID 与时间戳均为 string。

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

export type HistoryEventType = 'fault' | 'upgrade' | 'work_order' | 'status'

export interface HistoryEvent {
  event_type: HistoryEventType
  event_id: string
  timestamp: string
  summary: string
}

export interface HistoryResponse {
  device: Device
  events: HistoryEvent[]
}

// ---- API 请求/响应类型 ----

export interface DeviceListResponse {
  devices: Device[]
}

export interface CreateDeviceRequest {
  name: string
  model?: string
  current_status?: string
}

export interface UpdateDeviceStatusRequest {
  current_status: string
}

export interface FaultListResponse {
  faults: FaultDiagnosis[]
}

export interface CreateFaultRequest {
  fault_description: string
  diagnosis_result?: string
}

export interface UpgradeListResponse {
  upgrades: UpgradeRecord[]
}

export interface CreateUpgradeRequest {
  target_version: string
}

export interface WorkOrderListResponse {
  work_orders: RepairOrder[]
}

export interface CreateWorkOrderRequest {
  content: string
  result?: string
}

export interface ApiErrorBody {
  error: { code: string; message: string }
}
