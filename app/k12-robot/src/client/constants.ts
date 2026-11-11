import type { OnlineStatus, RepairOrderStatus, RunningStatus, TimelineType, UpgradeStatus } from './types'

// Tag 的 color prop 接受 PresetColor 或自定义字符串；统一用 string 避免字面量收窄。
type TagColor = string

export const onlineStatusLabel: Record<OnlineStatus, string> = {
  online: '在线',
  offline: '离线',
}

export const onlineStatusColor: Record<OnlineStatus, TagColor> = {
  online: 'green',
  offline: 'default',
}

export const runningStatusLabel: Record<RunningStatus, string> = {
  idle: '空闲',
  running: '运行中',
  error: '异常',
  maintenance: '维护中',
}

export const runningStatusColor: Record<RunningStatus, TagColor> = {
  idle: 'default',
  running: 'processing',
  error: 'error',
  maintenance: 'warning',
}

export const upgradeStatusLabel: Record<UpgradeStatus, string> = {
  pending: '待执行',
  in_progress: '执行中',
  success: '成功',
  failed: '失败',
}

export const upgradeStatusColor: Record<UpgradeStatus, TagColor> = {
  pending: 'default',
  in_progress: 'processing',
  success: 'success',
  failed: 'error',
}

export const repairOrderStatusLabel: Record<RepairOrderStatus, string> = {
  created: '已创建',
  in_progress: '处理中',
  completed: '已完成',
}

export const repairOrderStatusColor: Record<RepairOrderStatus, TagColor> = {
  created: 'default',
  in_progress: 'processing',
  completed: 'success',
}

export const timelineTypeLabel: Record<TimelineType, string> = {
  status_change: '状态变更',
  fault: '故障',
  upgrade: '升级',
  repair_order: '维修工单',
}

export const timelineTypeColor: Record<TimelineType, TagColor> = {
  status_change: 'blue',
  fault: 'red',
  upgrade: 'purple',
  repair_order: 'orange',
}

// 升级状态流转：pending → in_progress → success / failed（终态不可变更）
export function nextUpgradeStatuses(current: UpgradeStatus): UpgradeStatus[] {
  if (current === 'pending') return ['in_progress']
  if (current === 'in_progress') return ['success', 'failed']
  return []
}

// 工单状态流转：created → in_progress → completed（终态不可变更）
export function nextRepairOrderStatuses(current: RepairOrderStatus): RepairOrderStatus[] {
  if (current === 'created') return ['in_progress']
  if (current === 'in_progress') return ['completed']
  return []
}
