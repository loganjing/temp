/**
 * 技术契约类型定义
 * 严格遵循 technical-contract.md 的对象字段与 SSE 事件结构。
 * 实体 ID 对照：任务 ID / 机器人 ID 为 number，桌位标识为 string。
 */

/** 任务状态 */
export type TaskStatus = 'pending' | 'delivering' | 'delivered' | 'cancelled';

/** 机器人状态 */
export type RobotStatus = 'idle' | 'delivering' | 'offline';

/** 告警类型 */
export type AlertType = 'robot_offline' | 'path_conflict_unresolved';

/** Task 对象 — GET /api/tasks, POST /api/tasks, GET /api/monitor/queue.pendingTasks */
export interface Task {
  id: number;
  tableId: string;
  status: TaskStatus;
  robotId: number | null;
  createdAt: string;
  assignedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
}

/** 创建任务响应 — POST /api/tasks (201) */
export interface TaskCreated {
  id: number;
  tableId: string;
  status: 'pending';
  robotId: null;
  createdAt: string;
}

/** 取消任务响应 — POST /api/tasks/:id/cancel (200) */
export interface TaskCancelled {
  id: number;
  status: 'cancelled';
  robotId: number | null;
  cancelledAt: string;
}

/** Robot 对象 — GET /api/robots, GET /api/monitor/robots */
export interface Robot {
  id: number;
  name: string;
  status: RobotStatus;
  currentTaskId: number | null;
  createdAt: string;
}

/** 注册机器人响应 — POST /api/robots (201) */
export interface RobotCreated {
  id: number;
  name: string;
  status: 'idle';
  currentTaskId: null;
  createdAt: string;
}

/** 更新机器人状态响应 — PATCH /api/robots/:id/status (200) */
export interface RobotStatusUpdated {
  id: number;
  status: RobotStatus;
  currentTaskId: number | null;
}

/** 到达响应 — POST /api/robots/:id/arrive (200) */
export interface ArriveNotification {
  notificationId: number;
  taskId: number;
  tableId: string;
  robotId: number;
  sentAt: string;
}

/** Notification 对象 — GET /api/notifications */
export interface Notification {
  id: number;
  taskId: number;
  robotId: number;
  tableId: string;
  sentAt: string;
}

/** Alert 对象 — GET /api/monitor/alerts, SSE alert.created */
export interface Alert {
  id: number;
  type: AlertType;
  message: string;
  robotId: number | null;
  resolved: boolean;
  createdAt: string;
}

/** pathProgress 对象 — ActiveTask.pathProgress */
export interface PathProgress {
  totalSegments: number;
  completedSegments: number;
}

/** ActiveTask 对象 — GET /api/monitor/queue.activeTasks */
export interface ActiveTask {
  id: number;
  tableId: string;
  robotId: number;
  robotName: string;
  status: 'delivering';
  assignedAt: string;
  pathProgress: PathProgress;
}

/** Overview 响应 — GET /api/monitor/overview */
export interface Overview {
  queueCount: number;
  activeTaskCount: number;
  idleRobotCount: number;
  deliveringRobotCount: number;
  offlineRobotCount: number;
  activeAlertCount: number;
}

/** Queue 响应 — GET /api/monitor/queue */
export interface QueueResponse {
  pendingTasks: Task[];
  activeTasks: ActiveTask[];
}

/** Robots 响应 — GET /api/robots, GET /api/monitor/robots */
export interface RobotsResponse {
  robots: Robot[];
}

/** Alerts 响应 — GET /api/monitor/alerts */
export interface AlertsResponse {
  alerts: Alert[];
}

/** Notifications 响应 — GET /api/notifications */
export interface NotificationsResponse {
  notifications: Notification[];
}

/** API 错误响应 */
export interface ApiError {
  error: string;
  code: string;
}

// ── SSE 事件类型 ──────────────────────────────────────────────

/** SSE 事件 data 结构映射 */
export interface SSEEventData {
  'task.created': Task;
  'task.assigned': { taskId: number; robotId: number };
  'task.delivered': { taskId: number; robotId: number; tableId: string };
  'task.cancelled': { taskId: number; robotId: number | null };
  'robot.status_changed': { robotId: number; status: RobotStatus };
  'alert.created': Alert;
  'path.conflict': { robotIds: number[]; segmentId: number };
}

/** SSE 事件类型联合 */
export type SSEEventType = keyof SSEEventData;

/** SSE 事件回调 */
export type SSEEventHandler<K extends SSEEventType> = (data: SSEEventData[K]) => void;

/** SSE 连接状态 */
export type SSEConnectionStatus = 'connecting' | 'connected' | 'disconnected';
