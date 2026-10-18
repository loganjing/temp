import { createContext, useCallback, useContext, useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import type { Priority, SlaBadge, TicketStatus } from '../domain/types'

// ---- 按钮与表单控件 ----

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50 disabled:text-red-300',
}

export function Button({
  variant = 'secondary',
  icon,
  className = '',
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: IconName }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} className="h-4 w-4" />}
      {children}
    </button>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none disabled:bg-slate-100'

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} min-h-[80px] ${props.className ?? ''}`} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

export function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  )
}

// ---- 徽标体系 ----

const STATUS_BADGE: Record<TicketStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  pending_assign: 'bg-amber-50 text-amber-700 border-amber-200',
  assigned: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  on_hold: 'bg-violet-50 text-violet-700 border-violet-200',
  pending_confirm: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
  closed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const PRIORITY_BADGE: Record<Priority, string> = {
  low: 'bg-slate-50 text-slate-600 border-slate-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  high: 'bg-amber-50 text-amber-700 border-amber-200',
  urgent: 'bg-red-50 text-red-700 border-red-200',
}

const SLA_BADGE: Record<SlaBadge['state'], string> = {
  normal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  breached: 'bg-red-50 text-red-700 border-red-200',
  met: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  missed: 'bg-red-50 text-red-700 border-red-200',
  paused: 'bg-slate-100 text-slate-600 border-slate-200',
}

export function StatusBadge({ status, label }: { status: TicketStatus; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status]}`}>
      {label}
    </span>
  )
}

export function PriorityBadge({ priority, label }: { priority: Priority; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[priority]}`}>
      {label}
    </span>
  )
}

/** SLA 徽标：文案由服务端按 Accept-Language 生成，前端只负责呈现 */
export function SlaBadgeView({ badge }: { badge: SlaBadge }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${SLA_BADGE[badge.state]}`}
      title={badge.text}
    >
      {badge.text}
    </span>
  )
}

// ---- 全局状态呈现 ----

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 ${className}`}
      role="status"
    />
  )
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Spinner />
      {label}
    </div>
  )
}

export function ErrorBlock({ error, onRetry, retryLabel }: { error: unknown; onRetry?: () => void; retryLabel: string }) {
  const message = error instanceof Error && error.message ? error.message : String(error)
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-sm text-slate-500">
      <Icon name="alert" className="h-8 w-8 text-red-400" />
      <span className="max-w-md break-all">{message}</span>
      {onRetry && (
        <Button icon="refresh" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}

export function EmptyBlock({ label, icon = 'inbox' }: { label: string; icon?: IconName }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-sm text-slate-400">
      <Icon name={icon} className="h-8 w-8" />
      {label}
    </div>
  )
}

export function NoPermissionBlock({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-sm text-slate-500">
      <Icon name="alert" className="h-8 w-8 text-amber-400" />
      {label}
    </div>
  )
}

// ---- 模态框 ----

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div
        className={`flex max-h-[86vh] w-full flex-col rounded-xl bg-white shadow-xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="close">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  )
}

// ---- Toast ----

interface ToastItem {
  id: number
  kind: 'success' | 'error'
  text: string
}

interface ToastValue {
  success: (text: string) => void
  error: (text: string) => void
}

const ToastContext = createContext<ToastValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = Date.now() + Math.random()
    setItems((current) => [...current, { id, kind, text }])
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 3200)
  }, [])
  const value: ToastValue = {
    success: (text) => push('success', text),
    error: (text) => push('error', text),
  }
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-md ${
              item.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            <Icon name={item.kind === 'success' ? 'check' : 'alert'} className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-all">{item.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('ToastProvider is missing')
  return context
}

// ---- 分页 ----

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  pageSizeOptions,
  unit,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  onPageSize?: (size: number) => void
  pageSizeOptions?: number[]
  unit: string
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)))
  const current = Math.min(page, pages)
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-2 text-sm text-slate-600">
      <span>
        {total} {unit}
      </span>
      {onPageSize && pageSizeOptions && (
        <Select
          value={pageSize}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onPageSize(Number(event.target.value))}
          className="w-20"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size} / {unit}
            </option>
          ))}
        </Select>
      )}
      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={() => onPage(current - 1)} disabled={current <= 1} aria-label="prev">
          <Icon name="chevronLeft" className="h-4 w-4" />
        </Button>
        <span>
          {current} / {pages}
        </span>
        <Button variant="ghost" onClick={() => onPage(current + 1)} disabled={current >= pages} aria-label="next">
          <Icon name="chevronRight" className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ---- 表格辅助 ----

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, help }: { children?: ReactNode; help?: string }) {
  return (
    <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium text-slate-600">
      <span className="inline-flex items-center gap-1">
        {children}
        {help && (
          <span className="group relative inline-flex">
            <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-500">
              ?
            </span>
            <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-72 -translate-x-1/2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-normal leading-5 text-slate-100 group-hover:block">
              {help}
            </span>
          </span>
        )}
      </span>
    </th>
  )
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`border-b border-slate-100 px-3 py-2 text-slate-700 ${className}`}>{children}</td>
}

/** 长文本截断 + title 悬停查看全文 */
export function Truncate({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`block max-w-[22rem] truncate ${className}`} title={text}>
      {text || '—'}
    </span>
  )
}
