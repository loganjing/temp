import { Tag } from 'antd'
import type {
  EquipmentStatusValue,
  FaultStatus,
  UpgradeStatus,
  WorkOrderStatus,
} from '../../shared/contracts'

const STATUS_LABELS: Record<string, string> = {
  online: '在线',
  offline: '离线',
  running: '运行中',
  fault: '故障',
  recorded: '已记录',
  diagnosing: '诊断中',
  diagnosed: '已诊断',
  closed: '已关闭',
  pending: '待处理',
  executing: '执行中',
  success: '成功',
  failed: '失败',
  processing: '处理中',
  completed: '已完成',
}

const STATUS_COLORS: Record<string, string> = {
  online: 'green',
  running: 'blue',
  offline: 'default',
  fault: 'red',
  recorded: 'default',
  diagnosing: 'processing',
  diagnosed: 'blue',
  closed: 'default',
  pending: 'default',
  executing: 'processing',
  success: 'green',
  failed: 'red',
  processing: 'processing',
  completed: 'blue',
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

export function StatusTag({ status }: { status: EquipmentStatusValue | FaultStatus | UpgradeStatus | WorkOrderStatus }) {
  return <Tag color={STATUS_COLORS[status] ?? 'default'}>{statusLabel(status)}</Tag>
}
