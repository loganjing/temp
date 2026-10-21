import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { PRIORITY_BADGE_CLASS, PRIORITY_LABEL, STATUS_BADGE_CLASS, STATUS_LABEL, type Priority, type TicketStatus } from './contracts'

// ---------- 通用视觉基元（Tailwind，Modern SaaS：中性色 + 细边 + 少阴影 + 中等圆角） ----------

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${className}`}>{children}</section>
}

export function SectionHeading({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  )
}

export function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge className={PRIORITY_BADGE_CLASS[priority]}>{PRIORITY_LABEL[priority]}</Badge>
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <Badge className={STATUS_BADGE_CLASS[status]}>{STATUS_LABEL[status]}</Badge>
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 dark:bg-slate-700 ${className}`} />
}

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-slate-200 dark:border-slate-700">
              {Array.from({ length: cols }).map((__, c) => (
                <td key={c} className="p-3"><Skeleton className="h-4 w-full" /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-10 text-center text-slate-500 dark:text-slate-400">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-xs">{hint}</p>}
    </div>
  )
}

export function ErrorInline({ message }: { message: string }) {
  return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{message}</p>
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent dark:border-slate-600" />
      {label ?? '加载中…'}
    </span>
  )
}

// ---------- 轻量 Toast（操作成功 / 错误反馈） ----------

type ToastKind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: ToastKind; message: string }
interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])
  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random()
    setToasts((list) => [...list, { id, kind, message }])
    setTimeout(() => dismiss(id), 4200)
  }, [dismiss])
  const api: ToastApi = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-lg border px-3 py-2 text-sm shadow-md ${
              t.kind === 'success'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                : t.kind === 'error'
                  ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/40 dark:text-red-200'
                  : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span>{t.message}</span>
              <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => dismiss(t.id)} aria-label="关闭">✕</button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// ---------- 通用 hook：异步数据加载 ----------

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): {
  data: T | undefined
  loading: boolean
  error: string | undefined
  reload: () => void
} {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(undefined)
    loader()
      .then((value) => { if (!cancelled) { setData(value); setError(undefined) } })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : '加载失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])
  return { data, loading, error, reload }
}

// ---------- 时间格式化 ----------

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDateInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
