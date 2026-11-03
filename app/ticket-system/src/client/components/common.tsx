import type { ReactNode } from 'react'
import type { Role, SlaPriority, TicketStatus } from '../types'

export const STATUS_LABELS: Record<TicketStatus, string> = {
  pending_assignment: '待分配',
  pending_processing: '待处理',
  completed: '完成',
  cancelled: '取消',
}

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'pending_assignment', label: '待分配' },
  { value: 'pending_processing', label: '待处理' },
  { value: 'completed', label: '完成' },
  { value: 'cancelled', label: '取消' },
]

export const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部优先级' },
  { value: 'P0', label: 'P0' },
  { value: 'P1', label: 'P1' },
  { value: 'P2', label: 'P2' },
  { value: 'P3', label: 'P3' },
  { value: 'P4', label: 'P4' },
]

export const PRIORITY_VALUES: SlaPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export const ROLE_LABELS: Record<Role, string> = {
  submitter: '提交人',
  handler: '处理人',
  admin: '管理员',
}

export const LOG_ACTION_LABELS: Record<string, string> = {
  ticket_created: '创建工单',
  ticket_assigned: '分配工单',
  ticket_transferred: '转派工单',
  ticket_processed: '处理工单',
  ticket_completed: '完成工单',
  ticket_cancelled: '取消工单',
  ticket_rated: '评价工单',
  ticket_replied: '回复工单',
}

export const LOG_ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部操作' },
  ...Object.entries(LOG_ACTION_LABELS).map(([value, label]) => ({ value, label })),
]

export const SORT_FIELDS: { value: string; label: string }[] = [
  { value: 'createdAt', label: '创建时间' },
  { value: 'slaPriority', label: '优先级' },
  { value: 'status', label: '状态' },
]

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function statusClass(status: TicketStatus): string {
  return `badge badge-${status}`
}

export function priorityClass(priority: SlaPriority): string {
  const map: Record<SlaPriority, string> = {
    P0: 'badge-priority-high',
    P1: 'badge-priority-high',
    P2: 'badge-priority-mid',
    P3: 'badge-priority-low',
    P4: 'badge-priority-low',
  }
  return `badge ${map[priority]}`
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" />
      ))}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <p>{message}</p>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p role="alert" className="error error-block">{message}</p>
  )
}

export function PageCard({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card page-card">
      <div className="section-heading">
        <h2>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return (
    <div className="section-heading pagination">
      <span>{total === 0 ? '无数据' : `${start}–${end} / ${total}`}</span>
      <div className="row-actions">
        <button className="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button>
        <button className="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>下一页</button>
      </div>
    </div>
  )
}
