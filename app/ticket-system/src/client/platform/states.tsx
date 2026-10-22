import type { ReactNode } from 'react'

export function LoadingState({ label = '加载中 / Loading…' }: { label?: string }) {
  return <p className="state" role="status">{label}</p>
}

export function ErrorState({ message, onRetry, retryLabel = '重试 / Retry' }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="state" role="alert">
      <p className="error">{message}</p>
      {onRetry && <button className="secondary" onClick={onRetry}>{retryLabel}</button>}
    </div>
  )
}

export function EmptyState({ message, hint, action }: { message: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="state">
      <p>{message}</p>
      {hint && <p className="subtext">{hint}</p>}
      {action}
    </div>
  )
}

export function NoPermissionState({ message = '不存在或无权访问 / Not found or no access' }: { message?: string }) {
  return (
    <div className="state" role="alert">
      <p>{message}</p>
      <p className="subtext">当前账号没有查看该内容的权限。/ Your account cannot access this content.</p>
    </div>
  )
}

export function Notice({ kind, text }: { kind: 'success' | 'error' | 'info'; text: string }) {
  if (!text) return null
  const className = kind === 'success' ? 'notice notice--success' : kind === 'error' ? 'notice notice--error' : 'notice'
  return <p className={className} role={kind === 'error' ? 'alert' : 'status'}>{text}</p>
}
