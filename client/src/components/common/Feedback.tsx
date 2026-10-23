import type { ReactNode } from 'react';

export function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-cell skeleton-cell--sm" />
          <div className="skeleton-cell" />
          <div className="skeleton-cell" />
          <div className="skeleton-cell skeleton-cell--sm" />
          <div className="skeleton-cell skeleton-cell--sm" />
        </div>
      ))}
    </div>
  );
}

export function FullPageLoading() {
  return (
    <div className="full-page-loading">
      <div className="spinner" />
      <span>加载中…</span>
    </div>
  );
}

export function InlineLoading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="inline-loading">
      <div className="spinner spinner--sm" />
      <span>{text}</span>
    </div>
  );
}

export function EmptyState({ message = '暂无数据', action }: { message?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">📭</div>
      <p className="empty-state__text">{message}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <div className="error-state__icon">⚠</div>
      <p className="error-state__text">{message}</p>
      {onRetry && (
        <button className="btn btn--primary" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}
