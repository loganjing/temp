import { db } from '../db.js';
import { emit } from '../events.js';
import { AppError } from '../errors.js';
import type {
  Notification,
  NotificationRow,
  TaskRow,
  RobotRow,
} from '../types.js';
import { toNotification, toTask, toRobot } from './mappers.js';

/** 机器人到达桌位时创建到桌通知记录。 */
export function createNotification(task: TaskRow, robot: RobotRow): Notification {
  const ts = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO notifications (task_id, robot_id, table_id, sent_at) VALUES (?, ?, ?, ?)'
    )
    .run(task.id, robot.id, task.table_id, ts);
  const row = db
    .prepare('SELECT * FROM notifications WHERE id = ?')
    .get(info.lastInsertRowid) as NotificationRow;
  const notification = toNotification(row);
  emit('task.delivered', { taskId: task.id, robotId: robot.id, tableId: task.table_id });
  return notification;
}

export function listNotifications(taskId: number | null): Notification[] {
  const rows =
    taskId === null
      ? (db
          .prepare('SELECT * FROM notifications ORDER BY sent_at DESC')
          .all() as NotificationRow[])
      : (db
          .prepare('SELECT * FROM notifications WHERE task_id = ? ORDER BY sent_at DESC')
          .all(taskId) as NotificationRow[]);
  return rows.map(toNotification);
}

/** 读取一条任务（不存在抛 TASK_NOT_FOUND）。 */
export function getTask(taskId: number): TaskRow {
  const row = db.prepare('SELECT * FROM delivery_tasks WHERE id = ?').get(taskId) as
    | TaskRow
    | undefined;
  if (!row) throw new AppError('TASK_NOT_FOUND');
  return row;
}

/** 读取一条机器人（不存在抛 ROBOT_NOT_FOUND）。 */
export function getRobot(robotId: number): RobotRow {
  const row = db.prepare('SELECT * FROM robots WHERE id = ?').get(robotId) as
    | RobotRow
    | undefined;
  if (!row) throw new AppError('ROBOT_NOT_FOUND');
  return row;
}

export function mapTask(row: TaskRow) {
  return toTask(row);
}

export function mapRobot(row: RobotRow) {
  return toRobot(row);
}
