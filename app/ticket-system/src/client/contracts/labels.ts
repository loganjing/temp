// 状态 / 优先级 / 操作类型 / 角色的中文静态映射（契约第 8 节：由前端静态映射）。
// 未知取值回退显示原始字符串，不猜测语义。
import type { Priority, Role, TicketStatus } from './types'

export const statusLabels: Record<TicketStatus, string> = {
  created: '创建',
  pending_assignment: '待分配',
  in_progress: '待处理',
  completed: '完成',
  cancelled: '取消',
}

export const statusBadgeTones: Record<TicketStatus, string> = {
  created: 'bg-slate-100 text-slate-700 ring-slate-300',
  pending_assignment: 'bg-amber-50 text-amber-700 ring-amber-300',
  in_progress: 'bg-blue-50 text-blue-700 ring-blue-300',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-300',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-300',
}

export const priorityLabels: Record<Priority, string> = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
}

export const priorityBadgeTones: Record<Priority, string> = {
  P0: 'bg-red-50 text-red-700 ring-red-300',
  P1: 'bg-orange-50 text-orange-700 ring-orange-300',
  P2: 'bg-amber-50 text-amber-800 ring-amber-300',
  P3: 'bg-sky-50 text-sky-700 ring-sky-300',
  P4: 'bg-slate-100 text-slate-600 ring-slate-300',
}

/** ticket_logs.action 的中文标签；未知 action 显示原值。 */
export const actionLabels: Record<string, string> = {
  created: '创建工单',
  queued: '进入分配队列',
  auto_assigned: '自动分配',
  transferred: '转派',
  replied: '回复',
  completed: '完成处理',
  cancelled: '取消工单',
  rated: '满意度评价',
}

export function actionLabel(action: string): string {
  return actionLabels[action] ?? action
}

export const roleLabels: Record<Role, string> = {
  submitter: '提交人',
  agent: '处理人',
  admin: '配置管理员',
  viewer: '统计查看者',
}

export function roleLabel(role: string | null | undefined): string {
  if (role === null || role === undefined) return '未配置角色'
  return roleLabels[role as Role] ?? role
}

export const sideLabels: Record<'submitter' | 'agent', string> = {
  submitter: '提交人',
  agent: '处理人',
}

/** email_logs.status 的中文标签；未知状态显示原值。 */
export function emailStatusLabel(status: string): string {
  if (status === 'sent') return '已发送'
  if (status === 'failed') return '发送失败'
  if (status === 'skipped') return '未发送'
  return status
}

export const dimensionLabels: Record<'company' | 'department', string> = {
  company: '按公司',
  department: '按部门',
}

/** ISO 8601 UTC 时间 → 本地时间「YYYY-MM-DD HH:mm」展示；空值显示 “—”。 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
