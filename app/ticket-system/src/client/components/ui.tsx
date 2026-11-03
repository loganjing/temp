import type { ReactNode } from 'react'
import type { Priority, TicketStatus } from '../platform/api-client'

export const STATUS_LABELS: Record<TicketStatus, string> = {
  created: '创建',
  pending_assignment: '待分配',
  pending_processing: '待处理',
  completed: '已完成',
  cancelled: '已取消',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  P0: 'P0 紧急',
  P1: 'P1 高',
  P2: 'P2 中',
  P3: 'P3 低',
  P4: 'P4 最低',
}

export const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export const STATUS_VALUES: TicketStatus[] = ['created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled']

export const EVENT_LABELS: Record<string, string> = {
  'ticket.created': '创建工单',
  'ticket.assigned': '分配工单',
  'ticket.transferred': '转派工单',
  'ticket.replied': '添加回复',
  'ticket.completed': '完成工单',
  'ticket.cancelled': '取消工单',
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms <= 0) return '0'
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  const days = Math.round(hours / 24)
  return `${days} 天`
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge badge-priority-${priority}`}>{priority}</span>
}

export function Spinner({ label = '加载中…' }: { label?: string }) {
  return <p className="muted">{label}</p>
}

export function EmptyState({ message }: { message: string }) {
  return <p className="muted empty">{message}</p>
}

export function ErrorBanner({ message }: { message: string }) {
  return <p role="alert" className="error">{message}</p>
}

export function SectionCard({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="section-heading">
        <h2>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label>{label}{children}</label>
}
