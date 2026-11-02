import type { ReactNode } from 'react'
import { describeError } from '../platform/errors'
import {
  notificationStatusLabels,
  priorityLabels,
  statusLabels,
  type NotificationStatus,
  type TicketPriority,
  type TicketStatus,
} from '../tickets/types'

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge status-${status}`}>{statusLabels[status] ?? status}</span>
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <span className={`badge priority-${priority}`} title={priorityLabels[priority]}>{priority}</span>
}

export function NotificationBadge({ status }: { status: NotificationStatus }) {
  return <span className={`badge notice-${status}`}>{notificationStatusLabels[status] ?? status}</span>
}

export function RatingBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="badge badge-pending">待评价</span>
  return <span className="badge badge-rated" aria-label={`满意度 ${score} 分`}>{'★'.repeat(score)}{'☆'.repeat(Math.max(5 - score, 0))}</span>
}

export function LoadingBlock({ label = '加载中…', rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div className="loading-block" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => <span key={index} className="skeleton-line" aria-hidden="true" />)}
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty-state" role="status">
      <strong>{title}</strong>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  )
}

export function ErrorNotice({ error, onRetry, title = '加载失败' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="notice notice-error" role="alert">
      <div>
        <strong>{title}</strong>
        <p>{describeError(error)}</p>
      </div>
      {onRetry && <button type="button" className="secondary btn-sm" onClick={onRetry}>重试</button>}
    </div>
  )
}

export function ForbiddenNotice({ hint = '该工单可能属于其他公司或不在你的可见范围内。' }: { hint?: string }) {
  return (
    <div className="state-panel" role="alert">
      <h2>无权访问</h2>
      <p>你没有查看该内容的权限。{hint}</p>
    </div>
  )
}

export function NotFoundNotice({ what = '内容' }: { what?: string }) {
  return (
    <div className="state-panel" role="alert">
      <h2>{what}不存在</h2>
      <p>它可能已被移除，或链接中的编号不正确。</p>
    </div>
  )
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return <div className="notice notice-success" role="status">{children}</div>
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(Math.ceil(total / pageSize), 1)
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)
  return (
    <div className="pagination">
      <span>共 {total} 条{total > 0 ? ` · 第 ${first}–${last} 条` : ''}</span>
      <div className="row-actions">
        <button type="button" className="secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button>
        <span className="page-number">第 {page} / {pages} 页</span>
        <button type="button" className="secondary btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>下一页</button>
      </div>
    </div>
  )
}