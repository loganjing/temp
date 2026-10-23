import type { ReactNode } from 'react'

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-wrap">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">📋</div>
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <p role="alert" className="error">{message}</p>
      {onRetry && <button className="secondary" onClick={onRetry}>重试 / Retry</button>}
    </div>
  )
}

export function Badge({ children, variant = 'neutral' }: { children: ReactNode; variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}
