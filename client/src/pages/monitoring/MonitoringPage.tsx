import { useCallback, useEffect, useState } from 'react';
import type { Task, Resource, Priority, Conflict, WsMessage, WsPayloadMap } from '@/api/types';
import * as taskApi from '@/api/tasks';
import * as resourceApi from '@/api/resources';
import * as trafficApi from '@/api/traffic';
import { LoadingSkeleton, EmptyState, ErrorState } from '@/components/common/Feedback';
import { useMonitoring } from '@/hooks/useMonitoring';
import { useToast } from '@/components/common/Toast';
import { formatApiError } from '@/api/client';
import {
  taskStatusLabel,
  taskStatusClass,
  resourceStatusLabel,
  resourceStatusClass,
  priorityLabel,
  priorityClass,
  conflictTypeLabel,
  strategyLabel,
  formatDateTime,
} from '@/components/common/labels';

const STATUS_OPTIONS = ['', 'pending', 'assigned', 'in_transit', 'error'] as const;
const PRIORITY_OPTIONS = ['', 'normal', 'urgent', 'highest'] as const;

export function MonitoringPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [resourceIdFilter, setResourceIdFilter] = useState('');

  const [wsMsgs, setWsMsgs] = useState<WsMessage[]>([]);
  const toast = useToast();

  const { connected, reconnect, latestAnomalyAlert } = useMonitoring({
    onMessage: (msg) => {
      setWsMsgs((prev) => {
        const next = [...prev, msg];
        return next.length > 50 ? next.slice(-50) : next;
      });
      if (msg.type === 'anomaly_alert') {
        const p = msg.payload as WsPayloadMap['anomaly_alert'];
        toast.showError(`异常告警: ${p.description}`);
      }
      if (msg.type === 'traffic_alert') {
        const p = msg.payload as WsPayloadMap['traffic_alert'];
        toast.showInfo(`交通告警: ${conflictTypeLabel(p.conflictType)} @ ${p.locationCode}`);
      }
      // Refresh data on relevant updates
      if (msg.type === 'task_status_change' || msg.type === 'device_status_change' || msg.type === 'anomaly_alert') {
        loadAll();
      }
      if (msg.type === 'device_position_update') {
        loadResources();
      }
    },
  });

  const loadTasks = useCallback(async () => {
    try {
      const res = await taskApi.fetchTasks({
        status: (statusFilter || undefined) as Task['status'] | undefined,
        priority: (priorityFilter || undefined) as Priority | undefined,
        resourceId: resourceIdFilter || undefined,
        page: 1,
        pageSize: 100,
      });
      setTasks(res.tasks);
    } catch (err) {
      setError(formatApiError(err));
    }
  }, [statusFilter, priorityFilter, resourceIdFilter]);

  const loadResources = useCallback(async () => {
    try {
      const res = await resourceApi.fetchResources();
      setResources(res.resources);
    } catch {
      // silent refresh
    }
  }, []);

  const loadConflicts = useCallback(async () => {
    try {
      const res = await trafficApi.fetchConflicts('active');
      setConflicts(res.conflicts);
    } catch {
      // silent
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([loadTasks(), loadResources(), loadConflicts()]);
    setLoading(false);
  }, [loadTasks, loadResources, loadConflicts]);

  useEffect(() => {
    loadAll();
    const interval = setInterval(() => {
      loadResources();
      loadConflicts();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadAll, loadResources, loadConflicts]);

  // Also reload tasks when filters change
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const activeTasks = tasks.filter((t) => ['pending', 'assigned', 'in_transit', 'error'].includes(t.status));
  const inTransitTasks = tasks.filter((t) => t.status === 'in_transit');
  const errorTasks = tasks.filter((t) => t.status === 'error');
  const faultResources = resources.filter((r) => r.status === 'fault' || r.status === 'offline');

  return (
    <div className="page monitoring-page">
      {/* WS status bar */}
      <div className={`ws-status ${connected ? 'ws-status--connected' : 'ws-status--disconnected'}`}>
        <span className="ws-status__dot" />
        <span>{connected ? 'WebSocket 已连接' : 'WebSocket 断开'}</span>
        {!connected && (
          <button className="btn btn--sm btn--link" onClick={reconnect}>重新连接</button>
        )}
      </div>

      {/* Summary cards */}
      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-card__label">活跃任务</span>
          <span className="stat-card__value">{activeTasks.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">搬运中</span>
          <span className="stat-card__value">{inTransitTasks.length}</span>
        </div>
        <div className="stat-card stat-card--danger">
          <span className="stat-card__label">异常任务</span>
          <span className="stat-card__value">{errorTasks.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">空闲设备</span>
          <span className="stat-card__value">{resources.filter((r) => r.status === 'idle').length}</span>
        </div>
        <div className="stat-card stat-card--warning">
          <span className="stat-card__label">故障/离线设备</span>
          <span className="stat-card__value">{faultResources.length}</span>
        </div>
        <div className="stat-card stat-card--warning">
          <span className="stat-card__label">活跃冲突</span>
          <span className="stat-card__value">{conflicts.length}</span>
        </div>
      </div>

      {/* Error tasks & fault resources alerts */}
      {(errorTasks.length > 0 || faultResources.length > 0 || latestAnomalyAlert) && (
        <div className="alert-banner">
          {latestAnomalyAlert && (
            <div className="alert-item alert-item--error">
              <span className="alert-icon">🚨</span>
              <span>异常告警: {latestAnomalyAlert.payload.description}</span>
              <span className="alert-time">{formatDateTime(latestAnomalyAlert.payload.timestamp)}</span>
            </div>
          )}
          {errorTasks.map((t) => (
            <div key={t.taskId} className="alert-item alert-item--error">
              <span className="alert-icon">⚠</span>
              <span>任务 #{t.taskId} 处于异常状态，需人工介入</span>
            </div>
          ))}
          {faultResources.map((r) => (
            <div key={r.resourceId} className="alert-item alert-item--warning">
              <span className="alert-icon">⚠</span>
              <span>设备 {r.name} (#{r.resourceId}) 状态: {resourceStatusLabel(r.status)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="page__toolbar">
        <div className="filter-group">
          <select className="filter-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s ? taskStatusLabel(s as Task['status']) : '全部状态'}</option>
            ))}
          </select>
          <select className="filter-control" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{p ? priorityLabel(p as Priority) : '全部优先级'}</option>
            ))}
          </select>
          <select className="filter-control" value={resourceIdFilter} onChange={(e) => setResourceIdFilter(e.target.value)}>
            <option value="">全部设备</option>
            {resources.map((r) => (
              <option key={r.resourceId} value={r.resourceId}>{r.name}</option>
            ))}
          </select>
          <button className="btn btn--sm" onClick={loadAll}>刷新</button>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadAll} />
      ) : (
        <div className="monitoring-grid">
          {/* Active tasks */}
          <div className="monitoring-panel">
            <h3 className="panel-title">活跃任务</h3>
            {activeTasks.length === 0 ? (
              <EmptyState message="暂无活跃任务" />
            ) : (
              <div className="table-wrapper">
                <table className="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th>任务ID</th>
                      <th>状态</th>
                      <th>优先级</th>
                      <th>源→目标</th>
                      <th>设备</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTasks.map((t) => (
                      <tr key={t.taskId} className={t.status === 'error' ? 'row--error' : ''}>
                        <td className="mono">#{t.taskId}</td>
                        <td><span className={`status-badge ${taskStatusClass(t.status)}`}>{taskStatusLabel(t.status)}</span></td>
                        <td><span className={`priority-badge ${priorityClass(t.priority)}`}>{priorityLabel(t.priority)}</span></td>
                        <td>
                          <span className="mono">{t.sourceLocationCode}</span>
                          <span className="route-arrow">→</span>
                          <span className="mono">{t.targetLocationCode}</span>
                        </td>
                        <td>{t.assignedResourceId ? `#${t.assignedResourceId}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Resources */}
          <div className="monitoring-panel">
            <h3 className="panel-title">设备状态</h3>
            {resources.length === 0 ? (
              <EmptyState message="暂无设备" />
            ) : (
              <div className="resource-cards">
                {resources.map((r) => (
                  <div key={r.resourceId} className={`resource-card ${resourceStatusClass(r.status)}`}>
                    <div className="resource-card__header">
                      <span className="resource-card__name">{r.name}</span>
                      <span className={`status-badge ${resourceStatusClass(r.status)}`}>{resourceStatusLabel(r.status)}</span>
                    </div>
                    <div className="resource-card__body">
                      <span className="text-sm">#{r.resourceId} · {r.type === 'agv' ? 'AGV' : '叉车'}</span>
                      <span className="text-sm">位置: <span className="mono">{r.currentLocationCode ?? '—'}</span></span>
                      {r.currentTaskId && <span className="text-sm">当前任务: #{r.currentTaskId}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active conflicts */}
          {conflicts.length > 0 && (
            <div className="monitoring-panel monitoring-panel--full">
              <h3 className="panel-title">交通冲突</h3>
              <div className="table-wrapper">
                <table className="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th>冲突ID</th>
                      <th>类型</th>
                      <th>位置</th>
                      <th>涉及设备</th>
                      <th>策略</th>
                      <th>检测时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conflicts.map((c) => (
                      <tr key={c.conflictId}>
                        <td className="mono">#{c.conflictId}</td>
                        <td>{conflictTypeLabel(c.conflictType)}</td>
                        <td className="mono">{c.locationCode}</td>
                        <td>{c.resourceIds.map((id) => `#${id}`).join(', ')}</td>
                        <td>{strategyLabel(c.strategy)}</td>
                        <td className="text-sm">{formatDateTime(c.detectedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* WS message log */}
          <div className="monitoring-panel monitoring-panel--full">
            <h3 className="panel-title">实时消息</h3>
            {wsMsgs.length === 0 ? (
              <p className="empty-text">等待实时消息…</p>
            ) : (
              <div className="ws-log">
                {wsMsgs.slice().reverse().map((msg, i) => (
                  <div key={i} className={`ws-log-item ws-log-item--${msg.type}`}>
                    <span className="ws-log-type">{msg.type}</span>
                    <span className="ws-log-payload">{JSON.stringify(msg.payload)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
