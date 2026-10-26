import { db } from '../db.js';
import type {
  ActiveTask,
  Alert,
  Overview,
  Robot,
  Task,
  TaskRow,
  RobotRow,
} from '../types.js';
import { toTask, toRobot } from './mappers.js';
import { pathProgress } from './path-service.js';
import { listAlerts } from './alert-service.js';

/** GET /api/monitor/overview — KPI 汇总。 */
export function overview(): Overview {
  const queueCount = (
    db
      .prepare("SELECT COUNT(*) AS c FROM delivery_tasks WHERE status = 'pending'")
      .get() as { c: number }
  ).c;
  const activeTaskCount = (
    db
      .prepare("SELECT COUNT(*) AS c FROM delivery_tasks WHERE status = 'delivering'")
      .get() as { c: number }
  ).c;
  const idleRobotCount = (
    db
      .prepare("SELECT COUNT(*) AS c FROM robots WHERE status = 'idle'")
      .get() as { c: number }
  ).c;
  const deliveringRobotCount = (
    db
      .prepare("SELECT COUNT(*) AS c FROM robots WHERE status = 'delivering'")
      .get() as { c: number }
  ).c;
  const offlineRobotCount = (
    db
      .prepare("SELECT COUNT(*) AS c FROM robots WHERE status = 'offline'")
      .get() as { c: number }
  ).c;
  const activeAlertCount = (
    db
      .prepare('SELECT COUNT(*) AS c FROM alerts WHERE resolved = 0')
      .get() as { c: number }
  ).c;
  return {
    queueCount,
    activeTaskCount,
    idleRobotCount,
    deliveringRobotCount,
    offlineRobotCount,
    activeAlertCount,
  };
}

/** GET /api/monitor/queue — 待分配 + 配送中任务列表（含 pathProgress）。 */
export function queue(): {
  pendingTasks: Task[];
  activeTasks: ActiveTask[];
} {
  const pendingRows = db
    .prepare(
      "SELECT * FROM delivery_tasks WHERE status = 'pending' ORDER BY created_at ASC"
    )
    .all() as TaskRow[];
  const pendingTasks = pendingRows.map(toTask);

  const activeRows = db
    .prepare(
      `SELECT t.*, r.name AS robot_name
       FROM delivery_tasks t JOIN robots r ON t.robot_id = r.id
       WHERE t.status = 'delivering'
       ORDER BY t.assigned_at ASC`
    )
    .all() as (TaskRow & { robot_name: string })[];
  const activeTasks: ActiveTask[] = activeRows.map((r) => ({
    id: r.id,
    tableId: r.table_id,
    robotId: r.robot_id as number,
    robotName: r.robot_name,
    status: 'delivering',
    assignedAt: r.assigned_at as string,
    pathProgress: pathProgress(db, r.id),
  }));
  return { pendingTasks, activeTasks };
}

/** GET /api/monitor/robots — 机器人状态。 */
export function monitorRobots(): Robot[] {
  const rows = db.prepare('SELECT * FROM robots ORDER BY id ASC').all() as RobotRow[];
  return rows.map(toRobot);
}

/** GET /api/monitor/alerts — 告警列表。 */
export function monitorAlerts(resolved: boolean | null): Alert[] {
  return listAlerts(resolved);
}
