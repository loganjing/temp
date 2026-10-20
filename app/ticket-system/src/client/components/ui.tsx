import { useState, type ReactNode } from 'react'
import type { NotificationStatus, Priority, TicketStatus } from '../api/types'

const statusMeta: Record<TicketStatus, { label: string; className: string }> = {
  PENDING_ASSIGNMENT: { label: '待分配', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  PROCESSING: { label: '待处理', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  COMPLETED: { label: '已完成', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: '已取消', className: 'border-slate-200 bg-slate-100 text-slate-500' },
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  const meta = statusMeta[status]
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  )
}

const priorityMeta: Record<Priority, { label: string; className: string }> = {
  P0: { label: 'P0', className: 'border-red-200 bg-red-50 text-red-700' },
  P1: { label: 'P1', className: 'border-orange-200 bg-orange-50 text-orange-700' },
  P2: { label: 'P2', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  P3: { label: 'P3', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  P4: { label: 'P4', className: 'border-slate-200 bg-slate-100 text-slate-600' },
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = priorityMeta[priority]
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  )
}

const notificationStatusMeta: Record<NotificationStatus, { label: string; className: string }> = {
  sent: { label: '已发送', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  skipped: { label: '未投递', className: 'border-slate-200 bg-slate-100 text-slate-500' },
  failed: { label: '发送失败', className: 'border-red-200 bg-red-50 text-red-700' },
}

export function NotificationStatusBadge({ status }: { status: NotificationStatus }) {
  const meta = notificationStatusMeta[status]
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  )
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />
}

export function ListSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-3 px-4 py-3">
          {Array.from({ length: cols }, (_, colIndex) => (
            <SkeletonBlock key={colIndex} className={`h-4 ${colIndex === 1 ? 'flex-1' : 'w-16'}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-12 text-center">
      <p className="text-sm text-slate-500">{title}</p>
      {description && <p className="text-xs text-slate-400">{description}</p>}
    </div>
  )
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
      <span className="min-w-0 break-words">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs text-red-700 hover:bg-red-100"
        >
          重试
        </button>
      )}
    </div>
  )
}

export function ExpandableText({ text, className = '' }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const long = text.length > 160 || text.split('\n').length > 3
  return (
    <div className={className}>
      <p className={`whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 ${expanded || !long ? '' : 'line-clamp-3'}`}>
        {text}
      </p>
      {long && (
        <button type="button" className="mt-1 text-xs text-indigo-600 hover:text-indigo-500" onClick={() => setExpanded(value => !value)}>
          {expanded ? '收起' : '展开全文'}
        </button>
      )}
    </div>
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
  width = 'max-w-lg',
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  width?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className={`card-base relative w-full shadow-xl ${width}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-md px-1.5 text-slate-400 hover:text-slate-600" aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const lastPage = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  return (
    <div className="flex shrink-0 items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
      <span>共 {total} 条 · 第 {page}/{lastPage} 页</span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="btn-secondary px-2.5 py-1 text-xs">
          上一页
        </button>
        <button type="button" disabled={page >= lastPage} onClick={() => onPage(page + 1)} className="btn-secondary px-2.5 py-1 text-xs">
          下一页
        </button>
      </div>
    </div>
  )
}
