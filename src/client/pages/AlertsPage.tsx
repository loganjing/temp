/**
 * 告警页 — 告警列表（类型、描述、关联机器人、时间、解决状态）
 */
import { getAlerts } from '../api';
import { useFetch } from '../hooks/useFetch';
import { useSSERefresh, useRefreshCallback } from '../hooks/useSSE';
import {
  LoadingSpinner,
  EmptyState,
  ErrorBar,
  formatDateTime,
} from '../components/ui';

const SSE_REFRESH_EVENTS = ['alert.created', 'robot.status_changed'] as const;

export function AlertsPage() {
  const { refreshKey, refresh } = useRefreshCallback();
  const alerts = useFetch(() => getAlerts(), [refreshKey]);

  // SSE 事件触发刷新
  useSSERefresh([...SSE_REFRESH_EVENTS], refresh);

  const alertTypeLabel = (type: string): string => {
    switch (type) {
      case 'robot_offline':
        return '机器人离线';
      case 'path_conflict_unresolved':
        return '路径冲突未解决';
      default:
        return type;
    }
  };

  return (
    <div>
      {alerts.error ? (
        <ErrorBar message={`告警列表加载失败：${alerts.error.error}`} onRetry={refresh} />
      ) : null}

      <div className="card">
        <div className="card-header">活跃告警</div>
        <div className="card-body" style={{ padding: 0 }}>
          {alerts.loading && !alerts.data ? (
            <LoadingSpinner />
          ) : alerts.data && alerts.data.alerts.length > 0 ? (
            alerts.data.alerts.map((a) => (
              <div key={a.id} className="alert-item">
                <div className="alert-item-icon">!</div>
                <div className="alert-item-content">
                  <div className="alert-item-message">{a.message}</div>
                  <div className="alert-item-meta">
                    <span>类型: {alertTypeLabel(a.type)}</span>
                    <span>
                      关联机器人:{' '}
                      {a.robotId != null ? (
                        <span className="text-mono">#{a.robotId}</span>
                      ) : (
                        '无'
                      )}
                    </span>
                    <span className="text-mono">{formatDateTime(a.createdAt)}</span>
                    <span>
                      状态:{' '}
                      {a.resolved ? (
                        <span style={{ color: 'var(--color-success)' }}>已解决</span>
                      ) : (
                        <span style={{ color: 'var(--color-danger)' }}>未解决</span>
                      )}
                    </span>
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
  );
}
