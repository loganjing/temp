import type { Priority, Role, TicketStatus } from '../platform/types'

// P0–P4 与五状态的约定强调色/语义色（架构基线 §3）：
// 状态：待处理蓝、完成绿、取消灰、待分配橙、创建中性；
// 优先级：P0–P4 递进强调色。
export const STATUS_LABELS: Record<string, string> = {
  created: '已创建',
  pending_assignment: '待分配',
  processing: '待处理',
  completed: '已完成',
  cancelled: '已取消',
}

export const STATUS_BADGE_CLASS: Record<string, string> = {
  created: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300',
  pending_assignment: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/30',
  processing: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/30',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/30',
  cancelled: 'bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-300',
}

export const PRIORITY_LABELS: Record<string, string> = {
  P0: 'P0（紧急）',
  P1: 'P1（高）',
  P2: 'P2（中）',
  P3: 'P3（低）',
  P4: 'P4（最低）',
}

export const PRIORITY_BADGE_CLASS: Record<string, string> = {
  P0: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/30',
  P1: 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/30',
  P2: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/30',
  P3: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/30',
  P4: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-300',
}

export const PRIORITY_OPTIONS: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export const ACTION_LABELS: Record<string, string> = {
  created: '创建工单',
  dispatched: '进入分配',
  assigned: '归属业务组',
  replied: '回复',
  transferred: '转派',
  completed: '完成',
  cancelled: '取消',
  rated: '满意度评价',
}

export const NOTIFICATION_STATUS_LABELS: Record<string, string> = {
  sent: '已发送',
  skipped: '已跳过（邮件服务未配置）',
  failed: '发送失败',
}

export const NOTIFICATION_STATUS_CLASS: Record<string, string> = {
  sent: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/30',
  skipped: 'bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-300',
  failed: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/30',
}

export const ROLE_LABELS: Record<Role, string> = {
  submitter: '提交人',
  agent: '处理人',
  company_admin: '公司配置员',
}

export const TICKET_STATUS_OPTIONS: TicketStatus[] = [
  'created',
  'pending_assignment',
  'processing',
  'completed',
  'cancelled',
]

export function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return '暂无数据'
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const rest = Math.round((minutes % 60) * 10) / 10
    return rest > 0 ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
  }
  return `${Math.round(minutes * 10) / 10} 分钟`
}
