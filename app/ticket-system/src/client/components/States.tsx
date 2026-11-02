import type { ReactNode } from 'react'
import { AlertIcon, InboxIcon, RefreshIcon } from './Icon'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-6 py-12 text-center">
      <InboxIcon size={28} className="text-slate-400" />
      <div>
        <p className="text-sm font-medium text-slate-700">{title}</p>
        {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-rose-200 bg-rose-50/50 px-6 py-10 text-center">
      <AlertIcon size={26} className="text-rose-500" />
      <p className="text-sm font-medium text-rose-700">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="secondary inline-flex items-center gap-1.5">
          <RefreshIcon size={15} /> 重试
        </button>
      )}
    </div>
  )
}

export function ForbiddenState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-6 py-16 text-center">
      <AlertIcon size={26} className="text-amber-500" />
      <p className="text-sm font-medium text-amber-700">无权限</p>
      <p className="text-xs text-amber-600">你没有访问该资源的权限，请联系管理员。</p>
    </div>
  )
}
