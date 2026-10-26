/**
 * 机器人页 — 机器人卡片网格 + 注册机器人表单
 */
import { useState, useCallback } from 'react';
import { getMonitorRobots, createRobot, updateRobotStatus } from '../api';
import { useFetch } from '../hooks/useFetch';
import { useSSERefresh, useRefreshCallback } from '../hooks/useSSE';
import type { ApiError, RobotStatus } from '../types';
import {
  LoadingSpinner,
  EmptyState,
  ErrorBar,
  SkeletonCards,
  RobotStatusBadge,
  RobotStatusDot,
  formatTime,
} from '../components/ui';

const SSE_REFRESH_EVENTS = [
  'task.assigned',
  'task.delivered',
  'task.cancelled',
  'robot.status_changed',
  'alert.created',
] as const;

export function RobotsPage() {
  const { refreshKey, refresh } = useRefreshCallback();
  const robots = useFetch(() => getMonitorRobots(), [refreshKey]);

  // SSE 事件触发刷新
  useSSERefresh([...SSE_REFRESH_EVENTS], refresh);

  // 注册机器人表单
  const [nameInput, setNameInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setCreateError('请输入机器人名称');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await createRobot(trimmed);
      setNameInput('');
      refresh();
    } catch (err) {
      const apiErr = err as ApiError;
      setCreateError(apiErr.error || '注册失败');
    } finally {
      setCreating(false);
    }
  }, [nameInput, refresh]);

  // 状态更新
  const [updating, setUpdating] = useState<Set<number>>(new Set());

  const handleStatusChange = useCallback(
    async (id: number, status: RobotStatus) => {
      setUpdating((prev) => new Set(prev).add(id));
      try {
        await updateRobotStatus(id, status);
        refresh();
      } catch {
        // 错误由刷新覆盖
      } finally {
        setUpdating((prev) => {
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
      {/* 注册机器人表单 */}
      <div className="card section-gap">
        <div className="card-header">注册机器人</div>
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
              placeholder="输入机器人名称"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !creating) handleCreate();
              }}
              disabled={creating}
            />
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={creating || !nameInput.trim()}
            >
              {creating ? '注册中…' : '注册'}
            </button>
          </div>
        </div>
      </div>

      {/* 错误状态 */}
      {robots.error ? (
        <ErrorBar message={`机器人列表加载失败：${robots.error.error}`} onRetry={refresh} />
      ) : null}

      {/* 机器人卡片网格 */}
      <div className="card">
        <div className="card-header">机器人列表</div>
        <div className="card-body">
          {robots.loading && !robots.data ? (
            <SkeletonCards count={4} />
          ) : robots.data && robots.data.robots.length > 0 ? (
            <div className="robot-grid">
              {robots.data.robots.map((r) => (
                <div key={r.id} className="robot-card">
                  <div className="robot-card-header">
                    <RobotStatusDot status={r.status} />
                    <span className="robot-card-name">{r.name}</span>
                  </div>
                  <div className="robot-card-info">
                    ID: <span className="text-mono">{r.id}</span>
                  </div>
                  <div className="robot-card-info">
                    当前任务:{' '}
                    {r.currentTaskId != null ? (
                      <span className="text-mono">#{r.currentTaskId}</span>
                    ) : (
                      '无'
                    )}
                  </div>
                  <div className="robot-card-info">
                    注册时间: <span className="text-mono">{formatTime(r.createdAt)}</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <RobotStatusBadge status={r.status} />
                  </div>
                  <div className="robot-card-actions">
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => handleStatusChange(r.id, 'idle')}
                      disabled={updating.has(r.id) || r.status === 'idle'}
                    >
                      置空闲
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleStatusChange(r.id, 'offline')}
                      disabled={updating.has(r.id) || r.status === 'offline'}
                    >
                      置离线
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="暂无注册机器人" />
          )}
        </div>
      </div>
    </div>
  );
}
