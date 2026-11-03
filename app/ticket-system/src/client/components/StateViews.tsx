import type { ReactNode } from 'react'

export function LoadingView({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="state-view">
      <div className="spinner" />
      <p>{text}</p>
    </div>
  )
}

export function EmptyView({ text = '暂无数据', hint, action }: { text?: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="state-view">
      <p className="empty-text">{text}</p>
      {hint && <p className="empty-hint">{hint}</p>}
      {action}
    </div>
  )
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-view">
      <p className="error">{message}</p>
      {onRetry && <button className="secondary" onClick={onRetry}>重试</button>}
    </div>
  )
}

export function Toast({ message, type = 'success' }: { message: string; type?: 'success' | 'error' }) {
  if (!message) return null
  return <p role="status" className={type === 'error' ? 'error' : 'success'}>{message}</p>
}
