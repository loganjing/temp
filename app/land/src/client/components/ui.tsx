import { useEffect, useRef, useState, type ReactNode } from 'react'
import { errorText } from '../platform/api-client'

export type BadgeTone = 'neutral' | 'ok' | 'warning' | 'danger' | 'info'

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

/** 业务状态 → 颜色基调（封闭枚举的统一映射，标签文本由调用方传 format.ts 的映射）。 */
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'completed':
    case 'adopted':
    case 'formalized':
    case 'PASS':
    case 'approved':
    case 'verified':
    case 'confirmed':
    case 'feasible':
    case 'transacted':
    case 'continue':
      return 'ok'
    case 'in_review':
    case 'saved':
    case 'marginal':
    case 'probable':
    case 'pending':
    case 'listing':
    case 'assumed':
    case 'processing':
    case 'warning':
      return 'warning'
    case 'abandoned':
    case 'returned':
    case 'REJECT':
    case 'DROP':
    case 'INSUFFICIENT':
    case 'infeasible':
    case 'unverified':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={statusTone(status)}>{label ?? status}</Badge>
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>
}

export function ErrorBox({ cause }: { cause: unknown }) {
  if (cause === null || cause === undefined) return null
  return <div role="alert" className="error-box">{errorText(cause)}</div>
}

export function Loading({ text = '加载中…' }: { text?: string }) {
  return <div className="busy">{text}</div>
}

export function Banner({ tone, children }: { tone: 'info' | 'warn'; children: ReactNode }) {
  return <div className={`banner banner-${tone}`}>{children}</div>
}

/** 通用数据加载 hook：仅 reload/挂载/deps 变化触发；loader 引用变化不重跑；卸载后丢弃迟到结果。 */
export function useResource<T>(loader: () => Promise<T>, deps: readonly unknown[] = []): { data: T | null; error: unknown; busy: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(true)
  const [tick, setTick] = useState(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setError(null)
    loaderRef.current()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setBusy(false)
      })
      .catch((cause) => {
        if (cancelled) return
        setError(cause)
        setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [tick, ...deps])
  return { data, error, busy, reload: () => setTick((value) => value + 1) }
}

/** 键值展示网格（档案/结果面板复用）。 */
export function KeyValue({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="kv-grid">
      {rows.map(([key, value]) => (
        <div className="kv" key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
