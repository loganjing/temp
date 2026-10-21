// Modern SaaS 共享 UI 基元：单一主色（蓝）+ 语义状态色、细边界、少阴影、中等圆角。
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import {
  IconAlertCircle,
  IconCheckCircle2,
  IconLoader2,
  IconStar,
} from './icons'
import {
  priorityBadgeTones,
  priorityLabels,
  statusBadgeTones,
  statusLabels,
} from '../contracts/labels'
import type { Priority, TicketStatus } from '../contracts/types'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-60',
  secondary:
    'inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 disabled:cursor-not-allowed disabled:opacity-60',
  danger:
    'inline-flex items-center justify-center gap-1.5 rounded-md bg-rose-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-60',
  ghost:
    'inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 disabled:cursor-not-allowed disabled:opacity-60',
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={`${buttonVariants[variant]} ${className}`} {...props} />
}

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${tone}`}
    >
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={statusBadgeTones[status]}>{statusLabels[status]}</Badge>
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={priorityBadgeTones[priority]}>{priorityLabels[priority]}</Badge>
}

export function Card({
  title,
  description,
  actions,
  className = '',
  bodyClassName = '',
  children,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`px-5 py-4 ${bodyClassName}`}>{children}</div>
    </section>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200/70 ${className}`} />
}

/** 表格骨架屏（全局加载态）。 */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2.5 py-2" role="status" aria-label="加载中">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-5" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 py-2" role="status" aria-label="加载中">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <IconLoader2 className={`animate-spin ${className}`} />
}

/** 空态引导。 */
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
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
      {icon && (
        <div className="flex size-10 items-center justify-center rounded-full bg-white text-slate-400 ring-1 ring-slate-200">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** 错误提示条。 */
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
      <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  )
}

/** 行内成功反馈（轻提示）。 */
export function SuccessNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="status" className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
      <IconCheckCircle2 className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  )
}

/** 表单字段包装。 */
export function Field({
  label,
  hint,
  required,
  children,
  className = '',
}: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:bg-slate-50'

/** 满意度星级展示（1-5）。 */
export function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-400" title={`满意度 ${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <IconStar
          key={value}
          className="size-4"
          {...(value <= rating ? { fill: 'currentColor' } : { fill: 'none' })}
        />
      ))}
    </span>
  )
}
