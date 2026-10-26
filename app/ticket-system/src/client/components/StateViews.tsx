import { useState, type ReactNode } from 'react'

// 骨架屏：加载态占位。
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 rounded bg-[var(--border)] opacity-60"
          style={{ width: `${90 - i * 12}%` }}
        />
      ))}
    </div>
  )
}

// 空态：提示文案与可选创建入口。
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-[var(--muted)]">
      <p className="text-[var(--text)] font-medium">{title}</p>
      {hint && <p className="text-sm">{hint}</p>}
      {action}
    </div>
  )
}

// 错误态：错误提示与重试。
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <p role="alert" className="error">{message}</p>
      {onRetry && <button className="secondary" onClick={onRetry}>重试</button>}
    </div>
  )
}

// 短暂成功提示，2.5 秒后自动清除。
export function useSuccessToast() {
  const [message, setMessage] = useState('')
  const notify = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(''), 2500)
  }
  return { message, notify }
}
