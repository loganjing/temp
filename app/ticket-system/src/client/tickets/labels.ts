// 展示用文案。枚举值本身直接使用契约定义的值，不在此处改值。
import { AUDIT_ACTIONS, AUDIT_OBJECT_TYPES } from '../../shared/contracts'

export const statusLabels: Record<string, string> = {
  created: '创建 / Created',
  pending_assignment: '待分配 / Pending assignment',
  pending_processing: '待处理 / Pending processing',
  completed: '完成 / Completed',
  cancelled: '取消 / Cancelled',
}

export const roleLabels: Record<string, string> = {
  submitter: '提交人 / Submitter',
  agent: '处理人 / Agent',
  configurator: '配置人 / Configurator',
  manager: '管理者 / Manager',
}

export const assignmentKindLabels: Record<string, string> = {
  auto: '自动分配 / Auto',
  assign: '人工分配 / Assigned',
  transfer: '转派 / Transferred',
}

export const objectTypeLabels: Record<string, string> = {
  ticket: '工单 / Ticket',
  business_group: '业务组 / Business group',
  assignment_rule: '分配规则 / Assignment rule',
}

export const notificationStatusLabels: Record<string, string> = {
  success: '成功 / Success',
  failed: '失败 / Failed',
}

// 契约第 5 节的 action 与对象类型取值集合。
export const auditActionOptions: string[] = Object.values(AUDIT_ACTIONS)
export const auditObjectTypeOptions: string[] = Object.values(AUDIT_OBJECT_TYPES)

export function label(map: Record<string, string>, value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  return map[value] ?? value
}

export function statusBadgeClass(status: string): string {
  return `badge status-${status}`
}

export function priorityBadgeClass(priority: string): string {
  return `badge priority-${priority}`
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().replace('T', ' ').slice(0, 16)
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '暂无回复数据 / No replies yet'
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分 ${total % 60} 秒`
  return `${total} 秒`
}
