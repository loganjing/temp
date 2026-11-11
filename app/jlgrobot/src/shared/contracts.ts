// 平台中立契约：实体接口、状态枚举与状态流转规则表。
// 仅供 src/server 与 src/client 引用；禁止引入 Node/Hono/React/数据库依赖。

/** 设备状态值 */
export type EquipmentStatusValue = 'online' | 'offline' | 'running' | 'fault'

/** 故障状态值 */
export type FaultStatus = 'recorded' | 'diagnosing' | 'diagnosed' | 'closed'

/** 升级状态值 */
export type UpgradeStatus = 'pending' | 'executing' | 'success' | 'failed'

/** 工单状态值 */
export type WorkOrderStatus = 'pending' | 'processing' | 'completed' | 'closed'

export interface Equipment {
  id: string
  name: string
  identifier: string
  type: string | null
  created_at: string
}

export interface EquipmentStatus {
  id: string
  equipment_id: string
  status: EquipmentStatusValue
  params: Record<string, unknown> | null
  recorded_at: string
}

export interface Fault {
  id: string
  equipment_id: string
  description: string
  status: FaultStatus
  diagnosis: string | null
  suggestion: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
}

export interface FaultStatusLog {
  id: string
  fault_id: string
  from_status: FaultStatus | null
  to_status: FaultStatus
  changed_at: string
}

export interface FaultDetail extends Fault {
  status_logs: FaultStatusLog[]
}

export interface UpgradeTask {
  id: string
  equipment_id: string
  package_id: string
  status: UpgradeStatus
  result: string | null
  failure_reason: string | null
  created_at: string
  updated_at: string
}

export interface UpgradeStatusLog {
  id: string
  task_id: string
  from_status: UpgradeStatus | null
  to_status: UpgradeStatus
  changed_at: string
}

export interface UpgradeTaskDetail extends UpgradeTask {
  status_logs: UpgradeStatusLog[]
}

export interface WorkOrder {
  id: string
  equipment_id: string
  fault_id: string | null
  description: string
  status: WorkOrderStatus
  created_at: string
  updated_at: string
  closed_at: string | null
}

export interface WorkOrderStatusLog {
  id: string
  order_id: string
  from_status: WorkOrderStatus | null
  to_status: WorkOrderStatus
  changed_at: string
}

export interface WorkOrderRecord {
  id: string
  order_id: string
  content: string
  created_at: string
}

export interface WorkOrderDetail extends WorkOrder {
  records: WorkOrderRecord[]
  status_logs: WorkOrderStatusLog[]
}

/** 设备履历聚合事件 */
export type HistoryEvent =
  | { type: 'status'; id: string; status: EquipmentStatusValue; params: Record<string, unknown> | null; timestamp: string }
  | { type: 'fault'; id: string; description: string; status: FaultStatus; timestamp: string }
  | { type: 'upgrade'; id: string; package_id: string; status: UpgradeStatus; timestamp: string }
  | { type: 'work_order'; id: string; description: string; status: WorkOrderStatus; timestamp: string }

export interface EquipmentHistory {
  equipment_id: string
  events: HistoryEvent[]
}

/** 合法状态流转规则表：当前状态 → 允许推进到的目标状态列表 */
export const FAULT_TRANSITIONS: Record<FaultStatus, FaultStatus[]> = {
  recorded: ['diagnosing'],
  diagnosing: ['diagnosed'],
  diagnosed: ['closed'],
  closed: [],
}

export const UPGRADE_TRANSITIONS: Record<UpgradeStatus, UpgradeStatus[]> = {
  pending: ['executing'],
  executing: ['success', 'failed'],
  success: [],
  failed: [],
}

export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  pending: ['processing'],
  processing: ['completed'],
  completed: ['closed'],
  closed: [],
}

export const FAULT_TARGET_STATUSES: FaultStatus[] = ['diagnosing', 'diagnosed', 'closed']
export const UPGRADE_TARGET_STATUSES: UpgradeStatus[] = ['executing', 'success', 'failed']
export const WORK_ORDER_TARGET_STATUSES: WorkOrderStatus[] = ['processing', 'completed', 'closed']
export const EQUIPMENT_STATUS_VALUES: EquipmentStatusValue[] = ['online', 'offline', 'running', 'fault']
