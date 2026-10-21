import type { ReactNode } from 'react'
import type { AsyncHandle } from '../app/useAsyncData'
import { ApiRequestError, describeError } from '../platform/api-client'
import type { Priority, TicketStatus } from '../contract'
import { STATUS_LABELS, STATUS_STYLES, PRIORITY_STYLES, categoryLabel } from '../labels'

export interface FeedbackMessage {
  tone: 'success' | 'warning' | 'error'
  message: string
}

export function Card(props: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${props.className ?? ''}`}>
      {(props.title !== undefined || props.actions !== undefined) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">{props.title}</h2>
          {props.actions}
        </header>
      )}
      <div className="p-4">{props.children}</div>
    </section>
  )
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[priority]}`}>
      {priority}
    </span>
  )
}

export function CategoryChip({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
      {categoryLabel(category)}
    </span>
  )
}

export function Feedback({ tone, children }: { tone: 'success' | 'warning' | 'error'; children: ReactNode }) {
  const styles: Record<'success' | 'warning' | 'error', string> = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    error: 'border-red-200 bg-red-50 text-red-700',
  }
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm ${styles[tone]}`}>
      {children}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="field-label">{label}</span>
      <div className="mt-1">{children}</div>
      {hint !== undefined && hint !== null && hint !== false ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  )
}

export function DataState<T>(props: {
  state: AsyncHandle<T>
  isEmpty?: (data: T) => boolean
  empty?: ReactNode
  children: (data: T) => ReactNode
}) {
  const { state } = props
  if (state.phase === 'loading') {
    return (
      <div className="px-4 py-6" aria-busy="true">
        <span className="sr-only">加载中</span>
        <div className="space-y-3">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="space-y-2">
              <div className="h-4 w-3/5 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-2/5 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (state.phase === 'error') {
    if (state.error instanceof ApiRequestError && state.error.code === 'COMPANY_FORBIDDEN') {
      return (
        <div className="px-4 py-10 text-center">
          <h3 className="text-sm font-semibold text-slate-800">无权访问其他公司的工单</h3>
          <p className="mt-1 text-sm text-slate-500">{state.error.message}</p>
        </div>
      )
    }
    return (
      <div className="px-4 py-10 text-center">
        <h3 className="text-sm font-semibold text-slate-800">加载失败</h3>
        <p className="mt-1 text-sm text-slate-500">{describeError(state.error)}</p>
        <button type="button" className="btn-secondary mt-3" onClick={state.reload}>重试</button>
      </div>
    )
  }
  if (props.isEmpty !== undefined && props.isEmpty(state.data)) {
    return (
      <div className="px-4 py-10 text-center">
        <h3 className="text-sm font-semibold text-slate-800">暂无数据</h3>
        {props.empty !== undefined && <div className="mt-1 text-sm text-slate-500">{props.empty}</div>}
      </div>
    )
  }
  return <>{props.children(state.data)}</>
}

export function Pagination(props: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(props.total / props.pageSize))
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 text-xs text-slate-500">
      <span>共 {props.total} 条 · 第 {props.page} / {pageCount} 页</span>
      <span className="flex gap-2">
        <button type="button" className="btn-secondary" disabled={props.page <= 1} onClick={() => props.onChange(props.page - 1)}>上一页</button>
        <button type="button" className="btn-secondary" disabled={props.page >= pageCount} onClick={() => props.onChange(props.page + 1)}>下一页</button>
      </span>
    </div>
  )
}

export function Stars({ score }: { score: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${score} / 5 分`}>
      {[1, 2, 3, 4, 5].map((index) => (
        <span key={index} className={`text-lg leading-none ${index <= score ? 'text-amber-500' : 'text-slate-300'}`}>★</span>
      ))}
    </span>
  )
}

export function StarPicker(props: { value: number | null; onChange: (score: number) => void; disabled?: boolean }) {
  return (
    <span className="inline-flex gap-1" role="radiogroup" aria-label="满意度评分（1-5 分）">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          type="button"
          role="radio"
          aria-checked={props.value === score}
          aria-label={`${score} 分`}
          disabled={props.disabled === true}
          className={`px-0.5 text-2xl leading-none transition ${props.value !== null && score <= props.value ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
          onClick={() => props.onChange(score)}
        >
          ★
        </button>
      ))}
    </span>
  )
}
