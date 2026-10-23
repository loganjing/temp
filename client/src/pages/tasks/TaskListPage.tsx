import { useCallback, useEffect, useState } from 'react';
import type { Task, TaskStatus, Priority, TaskDetail, ExecutionEvent, Location, Resource } from '@/api/types';
import * as taskApi from '@/api/tasks';
import * as resourceApi from '@/api/resources';
import * as locationApi from '@/api/locations';
import * as eventApi from '@/api/events';
import { LoadingSkeleton, EmptyState, ErrorState } from '@/components/common/Feedback';
import { Pagination } from '@/components/common/Pagination';
import { useToast } from '@/components/common/Toast';
import { formatApiError } from '@/api/client';
import {
  taskStatusLabel,
  taskStatusClass,
  priorityLabel,
  priorityClass,
  assignmentMethodLabel,
  formatDateTime,
} from '@/components/common/labels';
import { TaskCreateModal, type TaskCreateFormState } from './TaskCreateModal';
import { AssignTaskModal } from './AssignTaskModal';
import { TaskDetailDrawer } from './TaskDetailDrawer';

const STATUS_OPTIONS: (TaskStatus | '')[] = ['', 'pending', 'assigned', 'in_transit', 'completed', 'cancelled', 'error'];
const PRIORITY_OPTIONS: (Priority | '')[] = ['', 'normal', 'urgent', 'highest'];
const PAGE_SIZE = 10;

export function TaskListPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('');
  const [resourceIdFilter, setResourceIdFilter] = useState('');

  const [resources, setResources] = useState<Resource[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [detailTask, setDetailTask] = useState<TaskDetail | null>(null);
  const [detailEvents, setDetailEvents] = useState<ExecutionEvent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assignTaskId, setAssignTaskId] = useState<string | null>(null);

  const toast = useToast();

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await taskApi.fetchTasks({
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        resourceId: resourceIdFilter || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setTasks(res.tasks);
      setTotal(res.total);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, resourceIdFilter, page]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    resourceApi.fetchResources().then((r) => setResources(r.resources)).catch(() => {});
    locationApi.fetchLocations().then((l) => setLocations(l.locations)).catch(() => {});
  }, []);

  function handleFilterChange() {
    setPage(1);
  }

  async function handleCreate(form: TaskCreateFormState) {
    await taskApi.createTask({
      sourceLocationCode: form.sourceLocationCode,
      targetLocationCode: form.targetLocationCode,
      cargoName: form.cargoName,
      cargoQuantity: Number(form.cargoQuantity),
      priority: form.priority,
      remark: form.remark || undefined,
      createdBy: form.createdBy,
      autoAssign: form.autoAssign,
    });
    toast.showSuccess('任务创建成功');
    await loadTasks();
  }

  async function openDetail(task: Task) {
    setDetailLoading(true);
    setDetailTask(null);
    setDetailEvents([]);
    try {
      const [detail, eventsRes] = await Promise.all([
        taskApi.fetchTaskDetail(task.taskId),
        eventApi.fetchExecutionEvents(task.taskId),
      ]);
      setDetailTask(detail);
      setDetailEvents(eventsRes.events);
    } catch (err) {
      toast.showError(formatApiError(err));
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshDetail() {
    if (!detailTask) return;
    try {
      const [detail, eventsRes] = await Promise.all([
        taskApi.fetchTaskDetail(detailTask.taskId),
        eventApi.fetchExecutionEvents(detailTask.taskId),
      ]);
      setDetailTask(detail);
      setDetailEvents(eventsRes.events);
    } catch (err) {
      toast.showError(formatApiError(err));
    }
  }

  async function handleAssign(taskId: string, opts: { autoAssign: boolean; resourceId?: string }) {
    await taskApi.assignTask(taskId, opts);
    toast.showSuccess('任务分配成功');
    setAssignTaskId(null);
    await loadTasks();
    if (detailTask?.taskId === taskId) await refreshDetail();
  }

  async function handleCancel(taskId: string, confirm: boolean) {
    try {
      await taskApi.cancelTask(taskId, { cancelledBy: '调度员', confirm });
      toast.showSuccess('任务已取消');
      await loadTasks();
      if (detailTask?.taskId === taskId) {
        setDetailTask(null);
      }
    } catch (err) {
      toast.showError(formatApiError(err));
    }
  }

  async function handleComplete(taskId: string) {
    try {
      await taskApi.completeTask(taskId, { completedBy: '调度员' });
      toast.showSuccess('任务已完成');
      await loadTasks();
      if (detailTask?.taskId === taskId) {
        setDetailTask(null);
      }
    } catch (err) {
      toast.showError(formatApiError(err));
    }
  }

  async function handleRecover(taskId: string, action: 'resume' | 'cancel') {
    try {
      await taskApi.recoverTask(taskId, { recoveredBy: '调度员', action });
      toast.showSuccess(action === 'resume' ? '任务已恢复执行' : '任务已取消');
      await loadTasks();
      if (detailTask?.taskId === taskId) {
        setDetailTask(null);
      }
    } catch (err) {
      toast.showError(formatApiError(err));
    }
  }

  return (
    <div className="page">
      <div className="page__toolbar">
        <div className="filter-group">
          <select
            className="filter-control"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as TaskStatus | ''); handleFilterChange(); }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s ? taskStatusLabel(s as TaskStatus) : '全部状态'}</option>
            ))}
          </select>
          <select
            className="filter-control"
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value as Priority | ''); handleFilterChange(); }}
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{p ? priorityLabel(p as Priority) : '全部优先级'}</option>
            ))}
          </select>
          <select
            className="filter-control"
            value={resourceIdFilter}
            onChange={(e) => { setResourceIdFilter(e.target.value); handleFilterChange(); }}
          >
            <option value="">全部设备</option>
            {resources.map((r) => (
              <option key={r.resourceId} value={r.resourceId}>{r.name}</option>
            ))}
          </select>
          <button className="btn btn--sm" onClick={loadTasks}>刷新</button>
        </div>
        <button className="btn btn--primary" onClick={() => setShowCreate(true)}>
          + 创建任务
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton rows={8} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadTasks} />
      ) : tasks.length === 0 ? (
        <EmptyState message="暂无搬运任务" />
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>任务ID</th>
                <th>状态</th>
                <th>优先级</th>
                <th>源→目标</th>
                <th>货物</th>
                <th>分配方式</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.taskId}>
                  <td className="mono">#{task.taskId}</td>
                  <td>
                    <span className={`status-badge ${taskStatusClass(task.status)}`}>
                      {taskStatusLabel(task.status)}
                    </span>
                  </td>
                  <td>
                    <span className={`priority-badge ${priorityClass(task.priority)}`}>
                      {priorityLabel(task.priority)}
                    </span>
                  </td>
                  <td>
                    <span className="mono">{task.sourceLocationCode}</span>
                    <span className="route-arrow">→</span>
                    <span className="mono">{task.targetLocationCode}</span>
                  </td>
                  <td>{task.cargoName} ×{task.cargoQuantity}</td>
                  <td>{assignmentMethodLabel(task.assignmentMethod)}</td>
                  <td className="text-sm">{formatDateTime(task.createdAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn--sm btn--link" onClick={() => openDetail(task)}>详情</button>
                      {task.status === 'pending' && (
                        <button className="btn btn--sm btn--link" onClick={() => setAssignTaskId(task.taskId)}>分配</button>
                      )}
                      {task.status === 'in_transit' && (
                        <button className="btn btn--sm btn--link" onClick={() => handleComplete(task.taskId)}>完成</button>
                      )}
                      {(task.status === 'pending' || task.status === 'assigned' || task.status === 'in_transit') && (
                        <button className="btn btn--sm btn--link btn--danger-link" onClick={() => handleCancel(task.taskId, task.status === 'in_transit')}>取消</button>
                      )}
                      {task.status === 'error' && (
                        <button className="btn btn--sm btn--link" onClick={() => openDetail(task)}>处理</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      )}

      {showCreate && (
        <TaskCreateModal
          locations={locations}
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}

      {assignTaskId && (
        <AssignTaskModal
          taskId={assignTaskId}
          resources={resources}
          onClose={() => setAssignTaskId(null)}
          onAssign={handleAssign}
        />
      )}

      {detailTask && (
        <TaskDetailDrawer
          task={detailTask}
          events={detailEvents}
          loading={detailLoading}
          onClose={() => setDetailTask(null)}
          onAssign={() => {
            setAssignTaskId(detailTask.taskId);
            setDetailTask(null);
          }}
          onCancel={(confirm) => {
            handleCancel(detailTask.taskId, confirm);
          }}
          onComplete={() => handleComplete(detailTask.taskId)}
          onRecover={(action) => handleRecover(detailTask.taskId, action)}
        />
      )}
    </div>
  );
}
