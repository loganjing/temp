/**
 * API 客户端
 * 所有调用遵循 technical-contract.md 的端点、请求体与响应格式。
 * 基础路径 /api，响应体 application/json，错误 { error, code }。
 */
import type {
  TaskCreated,
  TaskCancelled,
  Task,
  RobotCreated,
  RobotStatusUpdated,
  ArriveNotification,
  NotificationsResponse,
  Overview,
  QueueResponse,
  RobotsResponse,
  AlertsResponse,
  RobotStatus,
  ApiError,
} from './types';

const API_BASE = '/api';

/** 从 Response 提取错误 */
async function extractError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiError;
    if (typeof body.error === 'string' && typeof body.code === 'string') {
      return body;
    }
  } catch {
    // 响应体非 JSON
  }
  return { error: `HTTP ${res.status}`, code: 'UNKNOWN' };
}

/** 通用 fetch 封装，统一错误处理 */
async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw await extractError(res);
  }
  return res.json() as Promise<T>;
}

// ── 任务接口 ──────────────────────────────────────────────────

/** POST /api/tasks — 创建配送任务 */
export function createTask(tableId: string): Promise<TaskCreated> {
  return apiFetch<TaskCreated>('/tasks', {
    method: 'POST',
    body: JSON.stringify({ tableId }),
  });
}

/** GET /api/tasks — 查询任务列表（可选 status 过滤） */
export function getTasks(status?: string): Promise<{ tasks: Task[] }> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiFetch<{ tasks: Task[] }>(`/tasks${query}`);
}

/** POST /api/tasks/:id/cancel — 取消任务 */
export function cancelTask(id: number): Promise<TaskCancelled> {
  return apiFetch<TaskCancelled>(`/tasks/${id}/cancel`, { method: 'POST' });
}

// ── 机器人接口 ────────────────────────────────────────────────

/** POST /api/robots — 注册机器人 */
export function createRobot(name: string): Promise<RobotCreated> {
  return apiFetch<RobotCreated>('/robots', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

/** GET /api/robots — 查询所有机器人 */
export function getRobots(): Promise<RobotsResponse> {
  return apiFetch<RobotsResponse>('/robots');
}

/** PATCH /api/robots/:id/status — 更新机器人状态 */
export function updateRobotStatus(
  id: number,
  status: RobotStatus,
): Promise<RobotStatusUpdated> {
  return apiFetch<RobotStatusUpdated>(`/robots/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/** POST /api/robots/:id/arrive — 机器人到达桌位 */
export function arriveRobot(id: number): Promise<ArriveNotification> {
  return apiFetch<ArriveNotification>(`/robots/${id}/arrive`, {
    method: 'POST',
  });
}

// ── 通知接口 ──────────────────────────────────────────────────

/** GET /api/notifications — 查询通知记录（可选 taskId 过滤） */
export function getNotifications(taskId?: number): Promise<NotificationsResponse> {
  const query =
    taskId != null ? `?taskId=${encodeURIComponent(taskId)}` : '';
  return apiFetch<NotificationsResponse>(`/notifications${query}`);
}

// ── 监控接口 ──────────────────────────────────────────────────

/** GET /api/monitor/overview — KPI 汇总 */
export function getOverview(): Promise<Overview> {
  return apiFetch<Overview>('/monitor/overview');
}

/** GET /api/monitor/queue — 待分配 + 配送中任务列表 */
export function getMonitorQueue(): Promise<QueueResponse> {
  return apiFetch<QueueResponse>('/monitor/queue');
}

/** GET /api/monitor/robots — 机器人状态 */
export function getMonitorRobots(): Promise<RobotsResponse> {
  return apiFetch<RobotsResponse>('/monitor/robots');
}

/** GET /api/monitor/alerts — 告警列表（默认未解决） */
export function getAlerts(resolved?: boolean): Promise<AlertsResponse> {
  const query =
    resolved != null ? `?resolved=${resolved}` : '';
  return apiFetch<AlertsResponse>(`/monitor/alerts${query}`);
}
