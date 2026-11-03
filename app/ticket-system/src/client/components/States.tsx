export function Loading({ label = '加载中…' }: { label?: string }) {
  return <div className="state-box"><span className="spinner" aria-hidden />{label}</div>
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="state-box">
      <p>{message}</p>
      {hint && <p className="subtext">{hint}</p>}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return <div className="state-box error">{message}</div>
}
