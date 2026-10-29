import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { AlertIcon, InboxIcon, RefreshIcon } from './icons'
import type { TicketStatus, Priority } from '../platform/types'
import { STATUS_LABELS } from '../platform/types'

/* ── Toast ────────────────────────────────────────── */

interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error'
}

const ToastContext = createContext<{
  showToast: (message: string, type?: 'success' | 'error') => void
}>({ showToast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded-lg shadow-md text-sm text-white flex items-center gap-2 ${
              t.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {t.type === 'success' ? '✓' : <AlertIcon className="w-4 h-4" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

/* ── Spinner ──────────────────────────────────────── */

export function Spinner({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <div
      className={`border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin ${className}`}
    />
  )
}

/* ── Skeleton ─────────────────────────────────────── */

export function TicketCardSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-3 animate-pulse">
          <div className="h-3 bg-gray-200 rounded w-20 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="flex gap-2">
            <div className="h-5 bg-gray-200 rounded w-10" />
            <div className="h-5 bg-gray-200 rounded w-12" />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── EmptyState ───────────────────────────────────── */

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <InboxIcon className="w-12 h-12 text-gray-300 mb-3" />
      <p className="text-sm font-medium text-gray-600">{title}</p>
      {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

/* ── ErrorBanner ──────────────────────────────────── */

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
      <AlertIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
      <span className="text-sm text-red-700 flex-1">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800 font-medium"
        >
          <RefreshIcon className="w-4 h-4" />
          重试
        </button>
      )}
    </div>
  )
}

/* ── ExpandableText ───────────────────────────────── */

export function ExpandableText({
  text,
  maxChars = 200,
}: {
  text: string
  maxChars?: number
}) {
  const [expanded, setExpanded] = useState(false)
  if (text.length <= maxChars) {
    return <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{text}</p>
  }
  return (
    <div>
      <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">
        {expanded ? text : text.slice(0, maxChars) + '…'}
      </p>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-600 hover:text-blue-800 mt-1 font-medium"
      >
        {expanded ? '收起' : '展开'}
      </button>
    </div>
  )
}

/* ── Badges ───────────────────────────────────────── */

const STATUS_STYLES: Record<string, string> = {
  created: 'bg-gray-100 text-gray-700',
  pending_assignment: 'bg-amber-100 text-amber-700',
  pending_processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  const cls = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

const PRIORITY_STYLES: Record<Priority, string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-orange-100 text-orange-700',
  P2: 'bg-amber-100 text-amber-700',
  P3: 'bg-blue-100 text-blue-700',
  P4: 'bg-gray-100 text-gray-700',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLES[priority]}`}
    >
      {priority}
    </span>
  )
}

/* ── SectionTitle ─────────────────────────────────── */

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2 mb-3">
      {children}
    </h3>
  )
}

/* ── Collapsible ──────────────────────────────────── */

export function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        {title}
        <svg
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && <div className="px-3 py-2 border-t border-gray-100">{children}</div>}
    </div>
  )
}

/* ── formatDate ───────────────────────────────────── */

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
