import { Tag } from 'antd'
import { DEVICE_STATUSES, UPGRADE_STATUSES, WORK_ORDER_STATUSES } from '../types'

const DEVICE_STATUS_COLOR: Record<string, string> = {
  online: 'green',
  offline: 'default',
  running: 'blue',
  standby: 'gold',
  fault: 'red',
  unknown: 'default',
}

const UPGRADE_STATUS_COLOR: Record<string, string> = {
  pending: 'gold',
  in_progress: 'blue',
  success: 'green',
  failed: 'red',
}

const WORK_ORDER_STATUS_COLOR: Record<string, string> = {
  open: 'gold',
  in_progress: 'blue',
  completed: 'green',
}

const DEVICE_STATUS_LABEL: Record<string, string> = {
  online: '在线',
  offline: '离线',
  running: '运行中',
  standby: '待机',
  fault: '故障',
  unknown: '未知',
}

const UPGRADE_STATUS_LABEL: Record<string, string> = {
  pending: '待升级',
  in_progress: '升级中',
  success: '成功',
  failed: '失败',
}

const WORK_ORDER_STATUS_LABEL: Record<string, string> = {
  open: '待处理',
  in_progress: '处理中',
  completed: '已完成',
}

export function DeviceStatusTag({ status }: { status: string }) {
  const known = (DEVICE_STATUSES as readonly string[]).includes(status)
  return <Tag color={DEVICE_STATUS_COLOR[status] ?? 'default'}>{known ? DEVICE_STATUS_LABEL[status] : status}</Tag>
}

export function UpgradeStatusTag({ status }: { status: string }) {
  const known = (UPGRADE_STATUSES as readonly string[]).includes(status)
  return <Tag color={UPGRADE_STATUS_COLOR[status] ?? 'default'}>{known ? UPGRADE_STATUS_LABEL[status] : status}</Tag>
}

export function WorkOrderStatusTag({ status }: { status: string }) {
  const known = (WORK_ORDER_STATUSES as readonly string[]).includes(status)
  return <Tag color={WORK_ORDER_STATUS_COLOR[status] ?? 'default'}>{known ? WORK_ORDER_STATUS_LABEL[status] : status}</Tag>
}
