/** 共享 UI 组件：骨架屏、空状态、错误状态、徽章、星级评价、分页 */
import { type ReactNode, useState } from 'react'
import { StarIcon, AlertIcon, RefreshIcon, InboxIcon } from './icons'
import type { Priority, TicketStatus, Role } from './types'

// ── 加载骨架屏 ──

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <Skeleton className="skeleton-title" />
          <Skeleton className="skeleton-sub" />
        </div>
      ))}
    </>
  )
}

// ── 空状态 ──

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon ?? <InboxIcon size={32} />}</div>
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
      {action}
    </div>
  )
}

// ── 错误状态 + 重试 ──

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="error-state">
      <AlertIcon size={24} />
      <p className="error-message">{message}</p>
      {onRetry && (
        <button className="secondary" onClick={onRetry}>
          <RefreshIcon size={16} /> 重试
        </button>
      )}
    </div>
  )
}

// ── 无权限提示 ──

export function ForbiddenState() {
  return (
    <div className="error-state">
      <AlertIcon size={24} />
      <p className="error-message">无权限访问此页面</p>
      <p className="empty-hint">您的角色无权执行此操作</p>
    </div>
  )
}

// ── 优先级徽章 ──

const priorityStyles: Record<Priority, string> = {
  P0: 'badge-p0',
  P1: 'badge-p1',
  P2: 'badge-p2',
  P3: 'badge-p3',
  P4: 'badge-p4',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge ${priorityStyles[priority]}`}>{priority}</span>
}

// ── 状态徽章 ──

const statusLabels: Record<TicketStatus, string> = {
  created: '创建',
  pending_assignment: '待分配',
  pending_processing: '待处理',
  completed: '已完成',
  cancelled: '已取消',
}

const statusStyles: Record<TicketStatus, string> = {
  created: 'badge-status-created',
  pending_assignment: 'badge-status-pending-assignment',
  pending_processing: 'badge-status-pending-processing',
  completed: 'badge-status-completed',
  cancelled: 'badge-status-cancelled',
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge ${statusStyles[status]}`}>{statusLabels[status]}</span>
}

// ── 角色标签 ──

const roleLabels: Record<Role, string> = {
  submitter: '提交人',
  handler: '处理人',
  admin: '管理员',
}

export function RoleLabel({ role }: { role: Role }) {
  return <span className="role-label">{roleLabels[role]}</span>
}

// ── 星级评价 ──

export function StarRating({
  value,
  onChange,
  size = 24,
  readonly = false,
}: {
  value: number
  onChange?: (rating: number) => void
  size?: number
  readonly?: boolean
}) {
  const [hover, setHover] = useState(0)
  const display = hover || value
  return (
    <div className="star-rating" role={readonly ? undefined : 'radiogroup'}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          className="star-btn"
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
          onClick={() => !readonly && onChange?.(star)}
          aria-label={`${star} 星`}
        >
          <StarIcon size={size} filled={star <= display} />
        </button>
      ))}
    </div>
  )
}

// ── 分页 ──

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.ceil(total / pageSize) || 1
  if (total === 0) return <p className="subtext">无数据</p>
  return (
    <div className="pagination">
      <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total}</span>
      <div className="row-actions">
        <button className="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</button>
        <button className="secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>下一页</button>
      </div>
    </div>
  )
}

// ── 时间格式化 ──

export function formatTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

// ── 操作日志动作标签 ──

const actionLabels: Record<string, string> = {
  ticket_created: '工单创建',
  ticket_assigned: '工单分配',
  ticket_transferred: '工单转派',
  ticket_processed: '开始处理',
  ticket_completed: '工单完成',
  ticket_cancelled: '工单取消',
}

export function actionLabel(action: string): string {
  return actionLabels[action] ?? action
}
