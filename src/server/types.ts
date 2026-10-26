/** 领域对象类型（与 technical-contract.md 字段一一对应）。 */

export type TaskStatus = 'pending' | 'delivering' | 'delivered' | 'cancelled';
export type RobotStatus = 'idle' | 'delivering' | 'offline';
export type AlertType = 'robot_offline' | 'path_conflict_unresolved';

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

export interface TaskRow {
  id: number;
  table_id: string;
  status: TaskStatus;
  robot_id: number | null;
  created_at: string;
  assigned_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
}

export interface Robot {
  id: number;
  name: string;
  status: RobotStatus;
  currentTaskId: number | null;
  createdAt: string;
}

export interface RobotRow {
  id: number;
  name: string;
  status: RobotStatus;
  current_task_id: number | null;
  created_at: string;
}

export interface Notification {
  id: number;
  taskId: number;
  robotId: number;
  tableId: string;
  sentAt: string;
}

export interface NotificationRow {
  id: number;
  task_id: number;
  robot_id: number;
  table_id: string;
  sent_at: string;
}

export interface Alert {
  id: number;
  type: AlertType;
  message: string;
  robotId: number | null;
  resolved: boolean;
  createdAt: string;
}

export interface AlertRow {
  id: number;
  type: AlertType;
  message: string;
  robot_id: number | null;
  resolved: number;
  created_at: string;
}

export interface ActiveTask {
  id: number;
  tableId: string;
  robotId: number;
  robotName: string;
  status: 'delivering';
  assignedAt: string;
  pathProgress: { totalSegments: number; completedSegments: number };
}

export interface SegmentRow {
  id: number;
  from_node: number;
  to_node: number;
  label: string;
}

export interface SegmentLockRow {
  id: number;
  segment_id: number;
  robot_id: number;
  task_id: number;
  sequence: number;
  locked_at: string | null;
  released_at: string | null;
}

export interface Overview {
  queueCount: number;
  activeTaskCount: number;
  idleRobotCount: number;
  deliveringRobotCount: number;
  offlineRobotCount: number;
  activeAlertCount: number;
}
