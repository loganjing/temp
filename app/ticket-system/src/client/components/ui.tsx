import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiRequestError } from '../platform/api-client'
import {
  priorityTones,
  roleLabels,
  statusLabels,
  statusTones,
  type Priority,
  type Role,
  type Status,
} from '../types'

// ---------------------------------------------------------------------------
// 徽章与基础展示
// ---------------------------------------------------------------------------

type Tone = 'slate' | 'blue' | 'green' | 'amber' | 'red' | 'orange'

const toneClasses: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-600',
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  orange: 'bg-orange-50 text-orange-700',
}

export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${toneClasses[tone]}`}>
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: Status }) {
  return <Badge tone={statusTones[status]}>{statusLabels[status]}</Badge>
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={priorityTones[priority]}>{priority}</Badge>
}

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone="slate">{roleLabels[role]}</Badge>
}

// ---------------------------------------------------------------------------
// 全局状态：骨架、空数据、错误
// ---------------------------------------------------------------------------

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-lg border border-slate-200 bg-white p-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      {hint && <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-400">{hint}</p>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
      <p className="text-sm text-red-700">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary border-red-200 text-red-700 hover:bg-red-100" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  )
}

export function Panel({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label-text">{label}</span>
      {children}
    </label>
  )
}

// ---------------------------------------------------------------------------
// 文案与格式化辅助
// ---------------------------------------------------------------------------

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.round(totalSeconds)} 秒`
  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = Math.round(totalSeconds % 60)
    return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`
  }
  if (totalSeconds < 86400) {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.round((totalSeconds % 3600) / 60)
    return minutes > 0 ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`
  }
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.round((totalSeconds % 86400) / 3600)
  return hours > 0 ? `${days} 天 ${hours} 小时` : `${days} 天`
}

/** 将 API 错误转换为面向用户的提示（含 401/403/404 统一文案）。 */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return '登录状态已失效，请重新登录'
    if (error.status === 403) return '当前账号没有执行此操作的权限'
    if (error.status === 404) return '内容不存在或不在当前公司范围内'
    return error.message
  }
  return '无法连接服务，请稍后重试'
}

// ---------------------------------------------------------------------------
// 成功 toast
// ---------------------------------------------------------------------------

interface ToastApi {
  show: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([])
  const counter = useRef(0)

  const show = useCallback((message: string) => {
    const id = ++counter.current
    setToasts((current) => [...current, { id, message }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3200)
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('ToastProvider 未挂载')
  return context
}
