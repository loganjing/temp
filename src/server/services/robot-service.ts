import { db } from '../db.js';
import { emit } from '../events.js';
import { AppError } from '../errors.js';
import type { Robot, RobotRow, RobotStatus } from '../types.js';
import { toRobot } from './mappers.js';
import { createAlert } from './alert-service.js';
import { getTask } from './notification-service.js';
import { releaseAllLocks } from './path-service.js';
import { triggerDispatch } from './dispatcher.js';

const ALLOWED: RobotStatus[] = ['idle', 'delivering', 'offline'];

/** POST /api/robots — 注册机器人。 */
export function registerRobot(name: unknown): Robot {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new AppError('INVALID_NAME');
  }
  const ts = new Date().toISOString();
  const info = db
    .prepare('INSERT INTO robots (name, status, current_task_id, created_at) VALUES (?, ?, NULL, ?)')
    .run(name, 'idle', ts);
  const row = db.prepare('SELECT * FROM robots WHERE id = ?').get(info.lastInsertRowid) as RobotRow;
  return toRobot(row);
}

/** GET /api/robots — 查询所有机器人。 */
export function listRobots(): Robot[] {
  const rows = db.prepare('SELECT * FROM robots ORDER BY id ASC').all() as RobotRow[];
  return rows.map(toRobot);
}

/** PATCH /api/robots/:id/status — 更新机器人状态。 */
export function updateRobotStatus(
  robotId: number,
  status: unknown
): { id: number; status: RobotStatus; currentTaskId: number | null } {
  if (typeof status !== 'string' || !ALLOWED.includes(status as RobotStatus)) {
    throw new AppError('INVALID_STATUS');
  }
  const newStatus = status as RobotStatus;
  const row = db.prepare('SELECT * FROM robots WHERE id = ?').get(robotId) as
    | RobotRow
    | undefined;
  if (!row) throw new AppError('ROBOT_NOT_FOUND');

  // 配送中的机器人不能直接置为空闲（需通过 arrive 或 cancel 完成/取消任务）
  if (newStatus === 'idle' && row.status === 'delivering') {
    throw new AppError('ROBOT_DELIVERING');
  }

  db.prepare('UPDATE robots SET status = ? WHERE id = ?').run(newStatus, row.id);
  const updated = db.prepare('SELECT * FROM robots WHERE id = ?').get(robotId) as RobotRow;

  emit('robot.status_changed', { robotId: updated.id, status: updated.status });

  // 副作用：置 offline 生成离线告警
  if (newStatus === 'offline') {
    createAlert('robot_offline', `机器人 ${updated.name}(${updated.id}) 进入离线状态`, updated.id);
  }
  // 副作用：置 idle 触发 Dispatcher 检查待分配任务
  if (newStatus === 'idle') {
    void triggerDispatch();
  }
  return { id: updated.id, status: updated.status, currentTaskId: updated.current_task_id };
}

/** POST /api/robots/:id/arrive — 到达触发通知并释放路径锁。 */
export function arrive(robotId: number): {
  notificationId: number;
  taskId: number;
  tableId: string;
  robotId: number;
  sentAt: string;
} {
  const row = db.prepare('SELECT * FROM robots WHERE id = ?').get(robotId) as
    | RobotRow
    | undefined;
  if (!row) throw new AppError('ROBOT_NOT_FOUND');
  if (row.status !== 'delivering') throw new AppError('ROBOT_NOT_DELIVERING');
  if (row.current_task_id === null) throw new AppError('NO_CURRENT_TASK');

  const task = getTask(row.current_task_id);
  const ts = new Date().toISOString();

  let notificationId = 0;
  const tx = db.transaction(() => {
    // 释放该机器人该任务所有未释放锁
    releaseAllLocks(db, row.id, task.id);
    // 任务状态变为 delivered
    db.prepare(
      'UPDATE delivery_tasks SET status = ?, delivered_at = ? WHERE id = ?'
    ).run('delivered', ts, task.id);
    // 机器人状态变为 idle
    db.prepare(
      'UPDATE robots SET status = ?, current_task_id = NULL WHERE id = ?'
    ).run('idle', row.id);
    // 创建通知记录
    const robotRow = db.prepare('SELECT * FROM robots WHERE id = ?').get(row.id) as RobotRow;
    const taskRow = db.prepare('SELECT * FROM delivery_tasks WHERE id = ?').get(task.id) as {
      id: number;
      table_id: string;
    };
    const info = db
      .prepare(
        'INSERT INTO notifications (task_id, robot_id, table_id, sent_at) VALUES (?, ?, ?, ?)'
      )
      .run(taskRow.id, robotRow.id, taskRow.table_id, ts);
    notificationId = Number(info.lastInsertRowid);
  });
  tx();

  emit('task.delivered', { taskId: task.id, robotId: row.id, tableId: task.table_id });
  emit('robot.status_changed', { robotId: row.id, status: 'idle' });

  // 到达后释放了机器人，立即尝试分配下一个待分配任务
  void triggerDispatch();

  const notif = db
    .prepare('SELECT * FROM notifications WHERE id = ?')
    .get(notificationId) as { sent_at: string };
  return {
    notificationId,
    taskId: task.id,
    tableId: task.table_id,
    robotId: row.id,
    sentAt: notif.sent_at,
  };
}
