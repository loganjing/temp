/**
 * Shared small UI components: badges, skeleton, empty/error/forbidden
 * states, pagination, rating stars, loading spinner.
 */

import type { ReactNode } from 'react';
import type { TicketStatus, SlaPriority } from '../types';

// ── Status Badge ────────────────────────────────────────────────────────────

const statusConfig: Record<TicketStatus, { label: string; cls: string }> = {
  pending_assignment: { label: '待分配', cls: 'badge-warning' },
  pending_processing: { label: '待处理', cls: 'badge-info' },
  completed: { label: '已完成', cls: 'badge-success' },
  cancelled: { label: '已取消', cls: 'badge-neutral' },
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  const c = statusConfig[status] ?? { label: status, cls: 'badge-neutral' };
  return <span className={`badge ${c.cls}`}>{c.label}</span>;
}

// ── Priority Badge ───────────────────────────────────────────────────────────

const priorityOrder: SlaPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4'];

const priorityConfig: Record<SlaPriority, { cls: string }> = {
  P0: { cls: 'badge-danger' },
  P1: { cls: 'badge-danger' },
  P2: { cls: 'badge-warning' },
  P3: { cls: 'badge-info' },
  P4: { cls: 'badge-neutral' },
};

export function PriorityBadge({ priority }: { priority: SlaPriority }) {
  const c = priorityConfig[priority] ?? { cls: 'badge-neutral' };
  return <span className={`badge ${c.cls}`}>{priority}</span>;
}

export { priorityOrder };

// ── Skeleton ─────────────────────────────────────────────────────────────────

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton skeleton-line" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div style={{ padding: '16px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ marginBottom: '16px' }}>
          <Skeleton lines={3} />
        </div>
      ))}
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────

export function EmptyState({
  title = '暂无数据',
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-container">
      <div className="state-icon">📭</div>
      <div className="state-title">{title}</div>
      {description && <div className="state-desc">{description}</div>}
      {action}
    </div>
  );
}

// ── Error State ───────────────────────────────────────────────────────────────

export function ErrorState({
  message = '加载失败',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state-container">
      <div className="state-icon">⚠️</div>
      <div className="state-title">{message}</div>
      {onRetry && (
        <button className="btn btn-outline btn-sm" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

// ── Forbidden State ───────────────────────────────────────────────────────────

export function ForbiddenState({ message }: { message?: string }) {
  return (
    <div className="state-container">
      <div className="state-icon">🔒</div>
      <div className="state-title">无权限</div>
      <div className="state-desc">{message ?? '您没有权限访问此页面'}</div>
    </div>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────────

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize) || 1;
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="pagination">
      <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        上一页
      </button>
      {start > 1 && (
        <>
          <button onClick={() => onPageChange(1)} className={page === 1 ? 'active' : ''}>1</button>
          {start > 2 && <span>…</span>}
        </>
      )}
      {pages.map((p) => (
        <button key={p} onClick={() => onPageChange(p)} className={p === page ? 'active' : ''}>
          {p}
        </button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span>…</span>}
          <button onClick={() => onPageChange(totalPages)} className={page === totalPages ? 'active' : ''}>
            {totalPages}
          </button>
        </>
      )}
      <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        下一页
      </button>
      <span className="pagination-info">共 {total} 条</span>
    </div>
  );
}

// ── Rating Stars ──────────────────────────────────────────────────────────────

export function RatingStars({
  value,
  onChange,
  readonly = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  readonly?: boolean;
}) {
  return (
    <span className={readonly ? 'rating-display' : 'rating'}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`rating-star ${star <= value ? 'active' : ''}`}
          onClick={() => !readonly && onChange?.(star)}
        >
          {star <= value ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}

// ── Loading Spinner ───────────────────────────────────────────────────────────

export function LoadingSpinner() {
  return (
    <div className="state-container">
      <div className="state-icon">⏳</div>
      <div className="state-title">加载中…</div>
    </div>
  );
}
