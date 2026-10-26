import { db } from '../db.js';
import { emit } from '../events.js';
import { AppError } from '../errors.js';
import type { Task, TaskRow, TaskStatus } from '../types.js';
import { toTask } from './mappers.js';
import { releaseAllLocks } from './path-service.js';
import { triggerDispatch } from './dispatcher.js';

export interface CreateTaskInput {
  tableId: unknown;
}

/** POST /api/tasks — 创建配送任务并入队。 */
export function createTask(tableId: unknown): Task {
  if (typeof tableId !== 'string' || tableId.trim().length === 0) {
    throw new AppError('INVALID_TABLE_ID');
  }
  const ts = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO delivery_tasks (table_id, status, robot_id, created_at) VALUES (?, ?, NULL, ?)'
    )
    .run(tableId, 'pending', ts);
  const row = db
    .prepare('SELECT * FROM delivery_tasks WHERE id = ?')
    .get(info.lastInsertRowid) as TaskRow;
  const task = toTask(row);
  emit('task.created', task);
  // 创建后立即尝试分配（若有空闲机器人）
  void triggerDispatch();
  return task;
}

/** GET /api/tasks — 查询任务列表（按 createdAt 升序），可按状态过滤。 */
export function listTasks(status: TaskStatus | null): Task[] {
  const rows =
    status === null
      ? (db
          .prepare('SELECT * FROM delivery_tasks ORDER BY created_at ASC')
          .all() as TaskRow[])
      : (db
          .prepare(
            'SELECT * FROM delivery_tasks WHERE status = ? ORDER BY created_at ASC'
          )
          .all(status) as TaskRow[]);
  return rows.map(toTask);
}

/** POST /api/tasks/:id/cancel — 取消任务（待分配移除出队；配送中释放机器人与路径锁）。 */
export function cancelTask(taskId: number): {
  id: number;
  status: 'cancelled';
  robotId: number | null;
  cancelledAt: string;
} {
  const row = db.prepare('SELECT * FROM delivery_tasks WHERE id = ?').get(taskId) as
    | TaskRow
    | undefined;
  if (!row) throw new AppError('TASK_NOT_FOUND');
  if (row.status === 'delivered' || row.status === 'cancelled') {
    throw new AppError('TASK_ALREADY_DONE');
  }
  const ts = new Date().toISOString();

  const tx = db.transaction(() => {
    if (row.status === 'delivering' && row.robot_id !== null) {
      // 配送中：释放路径段锁，机器人回到空闲
      releaseAllLocks(db, row.robot_id, row.id);
      db.prepare(
        'UPDATE robots SET status = ?, current_task_id = NULL WHERE id = ?'
      ).run('idle', row.robot_id);
      const robotRow = db.prepare('SELECT * FROM robots WHERE id = ?').get(row.robot_id) as {
        id: number;
        status: string;
      };
      emit('robot.status_changed', { robotId: robotRow.id, status: robotRow.status });
    }
    db.prepare(
      'UPDATE delivery_tasks SET status = ?, cancelled_at = ? WHERE id = ?'
    ).run('cancelled', ts, row.id);
  });
  tx();

  emit('task.cancelled', { taskId: row.id, robotId: row.robot_id });

  if (row.status === 'delivering') {
    // 配送中取消释放了机器人，立即尝试重新分配
    void triggerDispatch();
  }
  return { id: row.id, status: 'cancelled', robotId: row.robot_id, cancelledAt: ts };
}
