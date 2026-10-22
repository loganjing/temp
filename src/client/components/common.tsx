import type { ReactNode } from 'react'
import type { Priority, TicketStatus, AssignedMode, LogAction } from '../api/types'

export function Loading({ text = '加载中...' }: { text?: string }) {
  return (
    <div className="loading">
      <span className="loading-spinner" />
      {text}
    </div>
  )
}

export function EmptyState({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">○</div>
      <div className="empty-state-text">{text}</div>
      {hint && <div className="empty-state-hint">{hint}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <div className="error-state-icon">!</div>
      <div>{message}</div>
      {onRetry && <button className="btn btn-secondary btn-sm mt-8" onClick={onRetry}>重试</button>}
    </div>
  )
}

const priorityLabels: Record<Priority, string> = { P0: 'P0', P1: 'P1', P2: 'P2', P3: 'P3', P4: 'P4' }
const statusLabels: Record<TicketStatus, string> = {
  created: '已创建', pending_assignment: '待分配', pending_handling: '待处理',
  completed: '已完成', cancelled: '已取消',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge badge-${priority.toLowerCase()}`}>{priorityLabels[priority]}</span>
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge badge-${status}`}>{statusLabels[status]}</span>
}

export function AssignModeBadge({ mode }: { mode: AssignedMode }) {
  return <span className={`badge badge-${mode}`}>{mode === 'auto' ? '自动' : '人工'}</span>
}

const logActionLabels: Record<LogAction, string> = {
  ticket_created: '工单创建',
  ticket_assigned: '自动分配',
  ticket_transferred: '转派',
  ticket_replied: '回复',
  ticket_status_changed: '状态变更',
  ticket_completed: '处理完成',
  ticket_cancelled: '取消',
  rating_submitted: '评价提交',
}

export function logActionLabel(action: LogAction): string {
  return logActionLabels[action] || action
}

export function fmtTime(s: string | null | undefined): string {
  if (!s) return '-'
  try {
    const d = new Date(s)
    return d.toLocaleString('zh-CN', { hour12: false })
  } catch {
    return s
  }
}

export function Alert({ type, children }: { type: 'error' | 'success' | 'warning' | 'info'; children: ReactNode }) {
  return <div className={`alert alert-${type}`}>{children}</div>
}

export function Modal({ title, children, onClose, footer }: {
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          {title}
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
