import type { ReactNode } from 'react'
import { ApiRequestError } from '../platform/api-client'
import type { MailChannel, MailStatus, Priority, TicketStatus } from '../types'

export const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export const TICKET_STATUSES: TicketStatus[] = [
  'created',
  'pending_assignment',
  'pending_processing',
  'completed',
  'cancelled',
]

export const STATUS_META: Record<TicketStatus, { label: string; badge: string }> = {
  created: { label: '创建', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
  pending_assignment: { label: '待分配', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  pending_processing: { label: '待处理', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  completed: { label: '完成', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: '取消', badge: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
}

export const PRIORITY_META: Record<Priority, { badge: string }> = {
  P0: { badge: 'bg-red-50 text-red-700 border-red-200' },
  P1: { badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  P2: { badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  P3: { badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  P4: { badge: 'bg-slate-100 text-slate-600 border-slate-200' },
}

/** 契约第 6 节审计事件集合的展示标签；未列出的 action 原样显示。 */
export const ACTION_LABELS: Record<string, string> = {
  'ticket.created': '创建工单',
  'ticket.assigned': '分配',
  'ticket.replied': '回复',
  'ticket.reassigned': '转派',
  'ticket.completed': '完成',
  'ticket.cancelled': '取消',
  'ticket.rated': '评价',
  'group.created': '创建业务组',
  'group.updated': '更新业务组',
  'rule.created': '创建分配规则',
  'rule.updated': '更新分配规则',
}

export const MAIL_CHANNEL_LABELS: Record<MailChannel, string> = {
  smtp: 'SMTP',
  local: '本地发件箱',
}

export const MAIL_STATUS_LABELS: Record<MailStatus, string> = {
  queued: '已排队',
  sent: '已发送',
  failed: '发送失败',
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  const meta = STATUS_META[status]
  return <span className={`badge ${meta.badge}`}>{meta.label}</span>
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge ${PRIORITY_META[priority].badge}`}>{priority}</span>
}

/**
 * 错误反馈：统一重试入口；FORBIDDEN_COMPANY 按 UI 全局基线提示
 * “无权访问其他公司工单”，并附服务端返回的具体原因。
 */
export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error == null || error === '') return null
  const apiError = error instanceof ApiRequestError ? error : undefined
  const isolated = apiError?.code === 'FORBIDDEN_COMPANY'
  const message = isolated
    ? '无权访问其他公司工单'
    : typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : '请求失败，请重试'
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
      <span>
        {message}
        {isolated && apiError?.message && apiError.message !== message ? `（${apiError.message}）` : ''}
      </span>
      {onRetry && (
        <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  )
}

export function SuccessNotice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
      {children}
    </p>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="加载中">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="space-y-2">
          <div className="h-3.5 w-1/3 animate-pulse rounded bg-slate-200" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  )
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
      {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
    </div>
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
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
      <span>{total === 0 ? '暂无数据' : `第 ${from}–${to} 条，共 ${total} 条 · 第 ${page} / ${totalPages} 页`}</span>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          上一页
        </button>
        <button type="button" className="btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          下一页
        </button>
      </div>
    </div>
  )
}

/** 查询参数构造：跳过空值，保留其余字符串/数字/布尔值。 */
export function buildQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const pairs: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  return pairs.join('&')
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
