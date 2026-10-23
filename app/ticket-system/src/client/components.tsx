// 工单系统共享 UI 组件
import { useEffect, useState, type ReactNode } from 'react'
import { STATUS_LABELS, type TicketPriority, type TicketStatus } from './types'

/** 状态色映射：创建（蓝灰）、待分配（琥珀）、待处理（蓝）、完成（绿）、取消（灰） */
export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`status-badge status-${status}`}>{STATUS_LABELS[status]}</span>
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <span className={`priority-badge priority-${priority}`}>{priority}</span>
}

/** 顶部错误提示条，支持关闭 */
export function ErrorBanner({ error, onClose }: { error: string; onClose?: () => void }) {
  if (!error) return null
  return (
    <div className="error-banner" role="alert">
      <span>{error}</span>
      {onClose && (
        <button className="error-close" onClick={onClose} aria-label="关闭">
          ×
        </button>
      )}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return <div className="empty-state">{message}</div>
}

export function Loading({ message = '加载中…' }: { message?: string }) {
  return <div className="loading-state">{message}</div>
}

/** 骨架屏 */
export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  )
}

/** 分页组件 */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return (
    <div className="pagination">
      <span className="pagination-info">
        {total === 0 ? '暂无数据' : `${start}–${end} / 共 ${total} 条`}
      </span>
      <div className="row-actions">
        <button className="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          上一页
        </button>
        <span className="pagination-pages">
          {page} / {totalPages}
        </span>
        <button className="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          下一页
        </button>
      </div>
    </div>
  )
}

/** 成功 Toast 提示，2 秒后自动消失 */
export function useToast(): [string, (msg: string) => void, ReactNode] {
  const [toast, setToast] = useState('')
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2000)
    return () => clearTimeout(timer)
  }, [toast])
  const view = toast ? (
    <div className="toast" role="status">
      {toast}
    </div>
  ) : null
  return [toast, setToast, view]
}

/** 排序选择组件 */
export function SortSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.currentTarget.value)}>
      <option value="createdAt:desc">创建时间 ↓</option>
      <option value="createdAt:asc">创建时间 ↑</option>
      <option value="priority:asc">优先级 ↑</option>
      <option value="priority:desc">优先级 ↓</option>
    </select>
  )
}

/** 格式化时间 */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/** 格式化响应时间（毫秒 → 可读） */
export function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms} 毫秒`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`
  const minutes = seconds / 60
  if (minutes < 60) return `${minutes.toFixed(1)} 分钟`
  const hours = minutes / 60
  if (hours < 24) return `${hours.toFixed(1)} 小时`
  const days = hours / 24
  return `${days.toFixed(1)} 天`
}
