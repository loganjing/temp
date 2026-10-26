/**
 * 通用 UI 组件 — 加载、骨架屏、空数据、错误条、状态标签
 */

/** 加载旋转图标 */
export function LoadingSpinner() {
  return (
    <div className="loading-center">
      <div className="spinner" />
    </div>
  );
}

/** 骨架行（用于表格加载占位） */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i}>
          <td>
            <div className="skeleton skeleton-line short" />
          </td>
          <td>
            <div className="skeleton skeleton-line" />
          </td>
          <td>
            <div className="skeleton skeleton-line" />
          </td>
        </tr>
      ))}
    </>
  );
}

/** 骨架卡片网格 */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="robot-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="robot-card">
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

/** 空数据占位 */
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">∅</div>
      <div>{message}</div>
    </div>
  );
}

/** 错误提示条 + 重试按钮 */
export function ErrorBar({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="error-bar">
      <span className="error-bar-text">{message}</span>
      <button className="btn btn-sm btn-danger" onClick={onRetry}>
        重试
      </button>
    </div>
  );
}

/** 任务状态标签 */
export function TaskStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    pending: { label: '待分配', cls: 'gray' },
    delivering: { label: '配送中', cls: 'orange' },
    delivered: { label: '已送达', cls: 'green' },
    cancelled: { label: '已取消', cls: 'gray' },
  };
  const { label, cls } = config[status] ?? { label: status, cls: 'gray' };
  return <span className={`status-badge ${cls}`}>{label}</span>;
}

/** 机器人状态标签 */
export function RobotStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    idle: { label: '空闲', cls: 'green' },
    delivering: { label: '配送中', cls: 'orange' },
    offline: { label: '离线', cls: 'red' },
  };
  const { label, cls } = config[status] ?? { label: status, cls: 'gray' };
  return <span className={`status-badge ${cls}`}>{label}</span>;
}

/** 机器人状态圆点 */
export function RobotStatusDot({ status }: { status: string }) {
  const cls =
    status === 'idle'
      ? 'green'
      : status === 'delivering'
        ? 'orange'
        : status === 'offline'
          ? 'red'
          : 'gray';
  return <span className={`status-dot ${cls}`} />;
}

/** 格式化时间显示 */
export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch {
    return iso;
  }
}

/** 格式化完整日期时间 */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${mo}-${da} ${hh}:${mm}:${ss}`;
  } catch {
    return iso;
  }
}
