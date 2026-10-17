import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2, RefreshCw, X } from 'lucide-react';

/** 加载指示。 */
export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span className="spinner-wrap">
      <Loader2 size={size} className="spin" aria-hidden />
      {label !== undefined && <span className="muted">{label}</span>}
    </span>
  );
}

/** 可重试的错误条。 */
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-banner" role="alert">
      <AlertCircle size={15} className="error-banner-icon" />
      <span className="error-banner-text">{message}</span>
      {onRetry !== undefined && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          <RefreshCw size={13} /> 重试
        </button>
      )}
    </div>
  );
}

/** 空态引导。 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Inbox size={26} className="empty-state-icon" aria-hidden />
      <div className="empty-state-title">{title}</div>
      {hint !== undefined && <div className="empty-state-hint">{hint}</div>}
      {action !== undefined && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

/** 列表骨架屏。 */
export function SkeletonRows({ rows = 7, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label="加载中">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="skeleton-row">
          {Array.from({ length: cols }, (_, c) => (
            <span key={c} className="skeleton-cell" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** 模态对话框。 */
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer !== undefined && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
