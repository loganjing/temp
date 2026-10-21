import { AlertCircle, Inbox, RefreshCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      role="status"
      aria-label="加载中"
    />
  )
}

export function SkeletonRow() {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0">
      <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
      <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
    </div>
  )
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-label="加载中" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  )
}

export function SkeletonBlock({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />
}

export function SkeletonPanel() {
  return (
    <div className="space-y-6 px-6 py-6" role="status" aria-label="详情加载中">
      <div className="space-y-3">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-6 w-2/3" />
        <SkeletonBlock className="h-3 w-1/2" />
      </div>
      <div className="space-y-2">
        <SkeletonBlock className="h-3 w-full" />
        <SkeletonBlock className="h-3 w-full" />
        <SkeletonBlock className="h-3 w-5/6" />
      </div>
      <div className="space-y-2">
        <SkeletonBlock className="h-3 w-full" />
        <SkeletonBlock className="h-3 w-4/5" />
      </div>
    </div>
  )
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  action,
}: {
  icon?: LucideIcon
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <Icon className="h-10 w-10 text-slate-300" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint ? <p className="max-w-sm text-xs leading-5 text-slate-400">{hint}</p> : null}
      {action}
    </div>
  )
}

export function ErrorBanner({
  message,
  onRetry,
  retrying,
}: {
  message: string
  onRetry?: () => void
  retrying?: boolean
}) {
  return (
    <div className="m-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3" role="alert">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-red-700">{message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            {retrying ? <Spinner className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
            重试
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function InlineNotice({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  const classes =
    kind === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : kind === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-slate-200 bg-slate-50 text-slate-600'
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-5 ${classes}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      {kind === 'error' ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0">{children}</div>
    </div>
  )
}
