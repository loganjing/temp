import type { Task, TaskRow, Robot, RobotRow, Notification, Alert } from '../types.js';

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    tableId: row.table_id,
    status: row.status,
    robotId: row.robot_id,
    createdAt: row.created_at,
    assignedAt: row.assigned_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
  };
}

export function toRobot(row: RobotRow): Robot {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    currentTaskId: row.current_task_id,
    createdAt: row.created_at,
  };
}

export function toNotification(row: {
  id: number;
  task_id: number;
  robot_id: number;
  table_id: string;
  sent_at: string;
}): Notification {
  return {
    id: row.id,
    taskId: row.task_id,
    robotId: row.robot_id,
    tableId: row.table_id,
    sentAt: row.sent_at,
  };
}

export function toAlert(row: {
  id: number;
  type: string;
  message: string;
  robot_id: number | null;
  resolved: number;
  created_at: string;
}): Alert {
  return {
    id: row.id,
    type: row.type as Alert['type'],
    message: row.message,
    robotId: row.robot_id,
    resolved: row.resolved === 1,
    createdAt: row.created_at,
  };
}
