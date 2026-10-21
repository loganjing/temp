// 通用 UI 小组件与 API 错误文案转换。
import { useEffect, useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { ApiRequestError } from './platform/api-client'

export type Tone = 'blue' | 'green' | 'amber' | 'red' | 'orange' | 'gray'

const toneClasses: Record<Tone, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  gray: 'bg-slate-100 text-slate-600 border-slate-200',
}

export function Badge({ tone = 'gray', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${toneClasses[tone]}`} title={title}>
      {children}
    </span>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-slate-200 ${className}`} />
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-label="加载中">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="rounded-lg border border-slate-200 bg-white p-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center">
      {icon && <div className="text-slate-400">{icon}</div>}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-sm break-words text-xs text-slate-500">{description}</p>}
      {action}
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  )
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  )
}

export function apiErrorMessage(cause: unknown, fallback = '请求失败，请稍后重试'): string {
  if (cause instanceof ApiRequestError) {
    switch (cause.status) {
      case 401:
        return '登录状态已失效，请重新登录'
      case 403:
        return '没有权限执行此操作'
      case 404:
        return '内容不存在或不可见'
      case 409:
        return `当前状态不允许此操作：${cause.message}`
      case 422:
        return `输入校验未通过：${cause.message}`
      default:
        return cause.message || fallback
    }
  }
  if (cause instanceof Error && cause.message) return cause.message
  return fallback
}

// 两段式确认按钮：先点击进入确认态，再次点击才执行，超时自动恢复。
export function ConfirmButton({
  label,
  confirmLabel = '再次点击确认',
  tone = 'secondary',
  busy = false,
  disabled = false,
  onConfirm,
}: {
  label: string
  confirmLabel?: string
  tone?: 'secondary' | 'danger' | 'primary'
  busy?: boolean
  disabled?: boolean
  onConfirm: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(timer)
  }, [confirming])

  const toneClass =
    tone === 'danger'
      ? 'btn-danger'
      : tone === 'primary'
        ? 'btn-primary'
        : confirming
          ? 'btn-danger'
          : 'btn-secondary'

  return (
    <button
      type="button"
      className={toneClass}
      disabled={busy || disabled}
      onClick={() => {
        if (confirming) {
          setConfirming(false)
          onConfirm()
        } else {
          setConfirming(true)
        }
      }}
    >
      {busy ? '处理中…' : confirming ? confirmLabel : label}
    </button>
  )
}
