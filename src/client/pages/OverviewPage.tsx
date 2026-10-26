/**
 * 总览页 — KPI 行 + 三栏（队列摘要、机器人状态卡片、活跃告警）
 */
import { getOverview, getMonitorQueue, getMonitorRobots, getAlerts } from '../api';
import { useFetch } from '../hooks/useFetch';
import { useSSERefresh, useRefreshCallback } from '../hooks/useSSE';
import type { Alert } from '../types';
import {
  LoadingSpinner,
  EmptyState,
  ErrorBar,
  SkeletonRows,
  SkeletonCards,
  RobotStatusBadge,
  RobotStatusDot,
  formatTime,
} from '../components/ui';

const SSE_REFRESH_EVENTS = [
  'task.created',
  'task.assigned',
  'task.delivered',
  'task.cancelled',
  'robot.status_changed',
  'alert.created',
  'path.conflict',
] as const;

export function OverviewPage() {
  const { refreshKey, refresh } = useRefreshCallback();

  // SSE 事件触发刷新所有数据
  useSSERefresh([...SSE_REFRESH_EVENTS], refresh);

  const overview = useFetch(() => getOverview(), [refreshKey]);
  const queue = useFetch(() => getMonitorQueue(), [refreshKey]);
  const robots = useFetch(() => getMonitorRobots(), [refreshKey]);
  const alerts = useFetch(() => getAlerts(), [refreshKey]);

  const hasError = overview.error || queue.error || robots.error || alerts.error;
  if (hasError && !overview.loading && !queue.loading && !robots.loading && !alerts.loading) {
    const errMsg = overview.error?.error || queue.error?.error || robots.error?.error || alerts.error?.error;
    return (
      <ErrorBar message={`数据加载失败：${errMsg}`} onRetry={refresh} />
    );
  }

  return (
    <div>
      {/* KPI 行 */}
      {overview.loading && !overview.data ? (
        <LoadingSpinner />
      ) : overview.error ? (
        <ErrorBar message={`概览加载失败：${overview.error.error}`} onRetry={refresh} />
      ) : overview.data ? (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">待分配任务</div>
            <div className="kpi-value accent-blue">{overview.data.queueCount}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">配送中任务</div>
            <div className="kpi-value accent-orange">{overview.data.activeTaskCount}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">空闲机器人</div>
            <div className="kpi-value accent-green">{overview.data.idleRobotCount}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">活跃告警</div>
            <div className="kpi-value accent-red">{overview.data.activeAlertCount}</div>
          </div>
        </div>
      ) : null}

      {/* 三栏 */}
      <div className="tri-col">
        {/* 队列摘要表 */}
        <div className="card section-gap">
          <div className="card-header">队列摘要</div>
          <div className="card-body">
            {queue.loading && !queue.data ? (
              <table className="data-table">
                <tbody>
                  <SkeletonRows count={2} />
                </tbody>
              </table>
            ) : queue.data && queue.data.pendingTasks.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>桌位</th>
                    <th>创建</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.data.pendingTasks.slice(0, 5).map((t, i) => (
                    <tr key={t.id}>
                      <td>{i + 1}</td>
                      <td>{t.tableId}</td>
                      <td className="text-mono">{formatTime(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState message="暂无待分配任务" />
            )}
          </div>
        </div>

        {/* 机器人状态卡片网格 */}
        <div className="card section-gap">
          <div className="card-header">机器人状态</div>
          <div className="card-body">
            {robots.loading && !robots.data ? (
              <SkeletonCards count={3} />
            ) : robots.data && robots.data.robots.length > 0 ? (
              <div className="robot-grid">
                {robots.data.robots.map((r) => (
                  <div key={r.id} className="robot-card">
                    <div className="robot-card-header">
                      <RobotStatusDot status={r.status} />
                      <span className="robot-card-name">{r.name}</span>
                    </div>
                    <RobotStatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="暂无注册机器人" />
            )}
          </div>
        </div>

        {/* 活跃告警列表 */}
        <div className="card">
          <div className="card-header">活跃告警</div>
          <div className="card-body">
            {alerts.loading && !alerts.data ? (
              <LoadingSpinner />
            ) : alerts.data && alerts.data.alerts.length > 0 ? (
              alerts.data.alerts.slice(0, 5).map((a: Alert) => (
                <div key={a.id} className="alert-item">
                  <div className="alert-item-icon">!</div>
                  <div className="alert-item-content">
                    <div className="alert-item-message">{a.message}</div>
                    <div className="alert-item-meta">
                      <span>{a.type === 'robot_offline' ? '机器人离线' : '路径冲突'}</span>
                      <span className="text-mono">{formatTime(a.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState message="暂无活跃告警" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
