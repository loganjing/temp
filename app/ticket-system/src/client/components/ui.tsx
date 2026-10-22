import type { ReactNode } from 'react'
import type { SlaPriority, TicketStatus } from '../api/types'

const statusLabels: Record<TicketStatus, string> = {
  created: '创建',
  pending_assignment: '待分配',
  pending_processing: '待处理',
  completed: '完成',
  cancelled: '取消',
}

export function statusLabel(status: TicketStatus): string {
  return statusLabels[status] ?? status
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge status-${status}`}>{statusLabel(status)}</span>
}

export function PriorityBadge({ priority }: { priority: SlaPriority }) {
  return <span className={`badge priority-${priority}`}>{priority}</span>
}

export function Loading({ label = '加载中…' }: { label?: string }) {
  return <p className="state muted">{label}</p>
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="state muted">{children}</p>
}

export function Notice({ tone = 'success', children }: { tone?: 'success' | 'error'; children: ReactNode }) {
  return (
    <p className={tone === 'error' ? 'notice notice-error' : 'notice notice-success'} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}

export function FieldError({ children }: { children: ReactNode }) {
  return <p className="field-error">{children}</p>
}
