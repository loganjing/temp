import {
  createContext,
  useCallback as _useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import type { Priority, Role, TicketStatus } from './types'

// ---- 当前用户角色推导 ----
export interface CurrentUser {
  id: string
  name: string
  email: string
  phone?: string | null
  companyId?: string | null
  department?: string | null
  roles?: string[]
  role?: string
  passwordChangeRequired?: boolean
}

export function effectiveRole(user: CurrentUser): Role {
  const r = user.role
  if (r === 'admin' || r === 'processor' || r === 'submitter') return r
  const roles = user.roles ?? []
  if (roles.includes('admin')) return 'admin'
  if (roles.includes('processor')) return 'processor'
  if (roles.includes('submitter')) return 'submitter'
  return 'submitter'
}

// ---- 时间格式化 ----
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('zh-CN', { hour12: false })
}

// ---- 状态徽章 ----
const STATUS_LABEL: Record<TicketStatus, string> = {
  created: '创建 / Created',
  pending_assignment: '待分配 / Pending',
  pending_processing: '待处理 / In progress',
  completed: '完成 / Completed',
  cancelled: '取消 / Cancelled',
}

const STATUS_CLASS: Record<TicketStatus, string> = {
  created: 'badge neutral',
  pending_assignment: 'badge warn',
  pending_processing: 'badge info',
  completed: 'badge success',
  cancelled: 'badge muted',
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</span>
}

const PRIORITY_LABEL: Record<Priority, string> = {
  P0: 'P0 最高 / Critical',
  P1: 'P1 高 / High',
  P2: 'P2 中 / Medium',
  P3: 'P3 低 / Low',
  P4: 'P4 最低 / Lowest',
}

const PRIORITY_CLASS: Record<Priority, string> = {
  P0: 'badge danger',
  P1: 'badge warn',
  P2: 'badge info',
  P3: 'badge neutral',
  P4: 'badge muted',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={PRIORITY_CLASS[priority]}>{PRIORITY_LABEL[priority]}</span>
}

// ---- 通用反馈组件 ----
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-block" aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" />
      ))}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {hint ? <p className="empty-hint">{hint}</p> : null}
    </div>
  )
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-card" role="alert">
      <span>{message}</span>
      {onRetry ? (
        <button className="secondary" onClick={onRetry}>
          重试 / Retry
        </button>
      ) : null}
    </div>
  )
}

export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

// ---- Toast ----
type ToastKind = 'success' | 'error'
interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {})
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const notify = _useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, kind }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role="status">
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ---- 模态壳 ----
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="card modal" onClick={(e) => e.stopPropagation()}>
        <div className="section-heading">
          <h2>{title}</h2>
          <button className="secondary" onClick={onClose} aria-label="关闭 / Close">
            ✕
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}
