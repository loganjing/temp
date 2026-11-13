// 前端 TypeScript 类型定义
// api-client.ts 自动将后端 snake_case 响应键转为 camelCase，因此此处使用 camelCase。

// ===== 设备 =====

export type EquipmentStatus = 'running' | 'standby' | 'fault' | 'offline'

export interface Equipment {
  id: number
  code: string
  name: string
  status: EquipmentStatus
  createdAt: string
  updatedAt: string
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

// ===== 故障记录 =====

export interface FaultRecord {
  id: number
  equipmentId: number
  description: string
  occurredAt: string
  createdAt: string
}

export interface FaultListResponse {
  items: FaultRecord[]
}

export interface CreateFaultRequest {
  description: string
  occurred_at: string
}

// ===== 升级记录 =====

export type UpgradeStatus = 'in_progress' | 'success' | 'failed'

export interface UpgradeRecord {
  id: number
  equipmentId: number
  status: UpgradeStatus
  startedAt: string
  completedAt: string | null
  createdAt: string
}

export interface UpgradeListResponse {
  items: UpgradeRecord[]
}

export interface UpdateUpgradeRequest {
  status: UpgradeStatus
}

// ===== 维修工单 =====

export type WorkOrderStatus = 'pending' | 'in_progress' | 'completed'

export interface WorkOrder {
  id: number
  equipmentId: number
  status: WorkOrderStatus
  result: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkOrderListResponse {
  items: WorkOrder[]
}

export interface UpdateWorkOrderRequest {
  status?: WorkOrderStatus
  result?: string
}

// ===== 设备履历 =====

export type HistoryEventType = 'fault' | 'upgrade' | 'work_order'

export interface HistoryEvent {
  type: HistoryEventType
  id: number
  description?: string
  status?: string
  result?: string
  timestamp: string
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
