// 通用 UI 原子组件：徽章、加载/错误/空态、分页、提示条、星级评分。

import { IconAlertCircle, IconChevronLeft, IconChevronRight, IconRefresh, IconStar } from './icons'
import { PRIORITY_LABELS, ROLE_LABELS, STATUS_LABELS, type Role, type TicketPriority, type TicketStatus } from '../contracts'

const STATUS_BADGE_CLASS: Record<TicketStatus, string> = {
  created: 'border-slate-200 bg-slate-100 text-slate-600',
  pending_assignment: 'border-amber-200 bg-amber-50 text-amber-700',
  in_progress: 'border-blue-200 bg-blue-50 text-blue-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-500',
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge ${STATUS_BADGE_CLASS[status]}`}>{STATUS_LABELS[status]}</span>
}

const PRIORITY_BADGE_CLASS: Record<TicketPriority, string> = {
  P0: 'border-rose-200 bg-rose-50 text-rose-700',
  P1: 'border-orange-200 bg-orange-50 text-orange-700',
  P2: 'border-amber-200 bg-amber-50 text-amber-700',
  P3: 'border-sky-200 bg-sky-50 text-sky-700',
  P4: 'border-slate-200 bg-slate-100 text-slate-500',
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <span className={`badge ${PRIORITY_BADGE_CLASS[priority]}`}>{PRIORITY_LABELS[priority]}</span>
}

const ROLE_BADGE_CLASS: Record<Role, string> = {
  submitter: 'border-slate-200 bg-slate-100 text-slate-600',
  handler: 'border-sky-200 bg-sky-50 text-sky-700',
  ops: 'border-violet-200 bg-violet-50 text-violet-700',
}

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`badge ${ROLE_BADGE_CLASS[role]}`}>{ROLE_LABELS[role]}</span>
}

export function LoadingBlock({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      {label}
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 py-10 text-sm text-rose-600" role="alert">
      <IconAlertCircle size={16} />
      <span className="min-w-0 break-words">{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-xs" onClick={onRetry}>
          <IconRefresh size={12} />
          重试
        </button>
      )}
    </div>
  )
}

export function EmptyBlock({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

export function Notice({ kind, text }: { kind: 'success' | 'error'; text: string }) {
  if (kind === 'success') {
    return (
      <p className="break-words rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
        {text}
      </p>
    )
  }
  return (
    <p className="break-words rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
      {text}
    </p>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
      <span>{total === 0 ? '共 0 条' : `第 ${rangeStart}–${rangeEnd} 条 · 共 ${total} 条`}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" className="btn btn-secondary btn-xs" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <IconChevronLeft size={12} />
          上一页
        </button>
        <span className="tabular-nums">
          {page} / {totalPages}
        </span>
        <button type="button" className="btn btn-secondary btn-xs" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          下一页
          <IconChevronRight size={12} />
        </button>
      </div>
    </div>
  )
}

/** 星级评分：传入 onChange 时为 1–5 分输入控件，否则为只读展示。 */
export function Stars({ value, onChange }: { value: number; onChange?: (score: number) => void }) {
  const interactive = onChange != null
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((score) => {
        const filled = score <= value
        return (
          <button
            key={score}
            type="button"
            aria-label={`${score} 分`}
            disabled={!interactive}
            onClick={() => onChange?.(score)}
            className={interactive ? 'transition-transform hover:scale-110' : 'cursor-default'}
          >
            <IconStar size={20} className={filled ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
          </button>
        )
      })}
      {value > 0 && <span className="ml-1 text-sm text-slate-600">{value} / 5</span>}
    </div>
  )
}
