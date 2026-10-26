/**
 * 任务队列页 — 待分配表格 + 配送中列表 + 创建任务表单
 */
import { useState, useCallback } from 'react';
import { getMonitorQueue, createTask, cancelTask } from '../api';
import { useFetch } from '../hooks/useFetch';
import { useSSERefresh, useRefreshCallback } from '../hooks/useSSE';
import type { ApiError } from '../types';
import {
  LoadingSpinner,
  EmptyState,
  ErrorBar,
  TaskStatusBadge,
  formatTime,
} from '../components/ui';

const SSE_REFRESH_EVENTS = [
  'task.created',
  'task.assigned',
  'task.delivered',
  'task.cancelled',
  'robot.status_changed',
] as const;

export function QueuePage() {
  const { refreshKey, refresh } = useRefreshCallback();
  const queue = useFetch(() => getMonitorQueue(), [refreshKey]);

  // SSE 事件触发刷新
  useSSERefresh([...SSE_REFRESH_EVENTS], refresh);

  // 创建任务表单状态
  const [tableIdInput, setTableIdInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    const trimmed = tableIdInput.trim();
    if (!trimmed) {
      setCreateError('请输入桌位标识');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await createTask(trimmed);
      setTableIdInput('');
      refresh();
    } catch (err) {
      const apiErr = err as ApiError;
      setCreateError(apiErr.error || '创建失败');
    } finally {
      setCreating(false);
    }
  }, [tableIdInput, refresh]);

  // 取消任务
  const [canceling, setCanceling] = useState<Set<number>>(new Set());

  const handleCancel = useCallback(
    async (id: number) => {
      setCanceling((prev) => new Set(prev).add(id));
      try {
        await cancelTask(id);
        refresh();
      } catch {
        // 错误时由刷新覆盖
      } finally {
        setCanceling((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [refresh],
  );

  return (
    <div>
      {/* 创建任务表单 */}
      <div className="card section-gap">
        <div className="card-header">创建配送任务</div>
        <div className="card-body">
          {createError && (
            <div className="error-bar" style={{ marginBottom: 12 }}>
              <span className="error-bar-text">{createError}</span>
            </div>
          )}
          <div className="form-inline">
            <input
              className="form-input"
              type="text"
              placeholder="输入桌位标识（如 table-5）"
              value={tableIdInput}
              onChange={(e) => setTableIdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !creating) handleCreate();
              }}
              disabled={creating}
            />
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={creating || !tableIdInput.trim()}
            >
              {creating ? '创建中…' : '创建任务'}
            </button>
          </div>
        </div>
      </div>

      {/* 加载/错误状态 */}
      {queue.error ? (
        <ErrorBar message={`队列加载失败：${queue.error.error}`} onRetry={refresh} />
      ) : null}

      {/* 待分配任务表格 */}
      <div className="card section-gap">
        <div className="card-header">待分配任务</div>
        <div className="card-body" style={{ padding: 0 }}>
          {queue.loading && !queue.data ? (
            <LoadingSpinner />
          ) : queue.data && queue.data.pendingTasks.length > 0 ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>桌位</th>
                    <th>创建时间</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.data.pendingTasks.map((t, i) => (
                    <tr key={t.id}>
                      <td>{i + 1}</td>
                      <td>{t.tableId}</td>
                      <td className="text-mono">{formatTime(t.createdAt)}</td>
                      <td>
                        <TaskStatusBadge status={t.status} />
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleCancel(t.id)}
                          disabled={canceling.has(t.id)}
                        >
                          {canceling.has(t.id) ? '取消中…' : '取消'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="暂无待分配任务" />
          )}
        </div>
      </div>

      {/* 配送中任务列表 */}
      <div className="card">
        <div className="card-header">配送中任务</div>
        <div className="card-body" style={{ padding: 0 }}>
          {queue.loading && !queue.data ? (
            <LoadingSpinner />
          ) : queue.data && queue.data.activeTasks.length > 0 ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>机器人</th>
                    <th>桌位</th>
                    <th>进度</th>
                    <th>分配时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.data.activeTasks.map((t) => {
                    const progress =
                      t.pathProgress.totalSegments > 0
                        ? Math.round(
                            (t.pathProgress.completedSegments /
                              t.pathProgress.totalSegments) *
                              100,
                          )
                        : 0;
                    return (
                      <tr key={t.id}>
                        <td>{t.robotName}</td>
                        <td>{t.tableId}</td>
                        <td>
                          <div className="progress-bar">
                            <div
                              className="progress-bar-fill"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="progress-text">
                            {t.pathProgress.completedSegments}/
                            {t.pathProgress.totalSegments} 段 ({progress}%)
                          </div>
                        </td>
                        <td className="text-mono">{formatTime(t.assignedAt)}</td>
                        <td>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleCancel(t.id)}
                            disabled={canceling.has(t.id)}
                          >
                            {canceling.has(t.id) ? '取消中…' : '取消'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="暂无配送中任务" />
          )}
        </div>
      </div>
    </div>
  );
}
