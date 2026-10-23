import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db.js';
import { error } from '../lib/error.js';
import { generateTaskNo } from '../lib/taskNo.js';
import {
  canTransitionTaskStatus,
  VALID_TASK_STATUSES_FOR_TRANSITION,
} from '../lib/status.js';
import { isPlotHarvestable } from '../lib/maturity.js';
import type { PickingTask, UpdateTaskStatusResponse } from '../../shared/types.js';
import progressRoute from './progress.js';

const tasks = new Hono();

const priorityEnum = z.enum(['普通', '紧急']);
const taskStatusEnum = z.enum(['待执行', '执行中', '已完成', '已取消']);

const createTaskSchema = z.object({
  plotId: z.string().min(1),
  plannedQuantity: z.number().positive(),
  assignedWorker: z.string().min(1),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: priorityEnum,
  notes: z.string().optional(),
});

const updateTaskStatusSchema = z.object({
  status: z.enum(VALID_TASK_STATUSES_FOR_TRANSITION as [string, ...string[]]),
});

// 将数据库行映射为 PickingTask
function rowToTask(row: Record<string, unknown>): PickingTask {
  return {
    id: row.id as string,
    taskNo: row.task_no as string,
    plotId: row.plot_id as string,
    plotCode: row.plot_code as string,
    plotName: row.plot_name as string,
    variety: row.variety as string,
    plannedQuantity: row.planned_quantity as number,
    assignedWorker: row.assigned_worker as string,
    plannedDate: row.planned_date as string,
    priority: row.priority as PickingTask['priority'],
    status: row.status as PickingTask['status'],
    notes: (row.notes as string | null) ?? null,
    totalPickedQuantity: (row.total_picked_quantity as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const TASK_SELECT = `
  SELECT t.*, p.code AS plot_code, p.name AS plot_name, p.variety,
    COALESCE(
      (SELECT SUM(picked_quantity) FROM progress_reports WHERE task_id = t.id),
      0
    ) AS total_picked_quantity
    FROM picking_tasks t
    JOIN plots p ON p.id = t.plot_id`;

// GET /api/tasks — 采摘任务列表
tasks.get('/', (c) => {
  const db = getDb();
  const { status, plotId, assignedWorker, plannedDate } = c.req.query();

  let sql = `${TASK_SELECT} WHERE 1=1`;
  const params: string[] = [];

  if (status) {
    sql += ` AND t.status = ?`;
    params.push(status);
  }
  if (plotId) {
    sql += ` AND t.plot_id = ?`;
    params.push(plotId);
  }
  if (assignedWorker) {
    sql += ` AND t.assigned_worker = ?`;
    params.push(assignedWorker);
  }
  if (plannedDate) {
    sql += ` AND t.planned_date = ?`;
    params.push(plannedDate);
  }
  sql += ` ORDER BY t.created_at DESC`;

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  const items = rows.map(rowToTask);

  return c.json({ items });
});

// POST /api/tasks — 创建采摘任务（仅允许可采摘地块）
tasks.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return error(c, 400, 'INVALID_PARAMS', '请求体不是有效的 JSON');
  }

  const result = createTaskSchema.safeParse(body);
  if (!result.success) {
    return error(c, 400, 'INVALID_PARAMS', '缺少必填字段或值不合法');
  }

  const { plotId, plannedQuantity, assignedWorker, plannedDate, priority, notes } = result.data;
  const db = getDb();

  // 验证地块存在且可采摘
  const plot = db
    .prepare('SELECT id, code, name, variety FROM plots WHERE id = ?')
    .get(plotId) as { id: string; code: string; name: string; variety: string } | undefined;

  if (!plot) {
    return error(c, 400, 'INVALID_PARAMS', `地块 ${plotId} 不存在`);
  }

  if (!isPlotHarvestable(db, plotId)) {
    return error(c, 409, 'PLOT_NOT_HARVESTABLE', `地块 ${plot.code} 不可采摘`);
  }

  const id = crypto.randomUUID();
  const taskNo = generateTaskNo(db);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO picking_tasks
       (id, task_no, plot_id, planned_quantity, assigned_worker,
        planned_date, priority, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, taskNo, plotId, plannedQuantity, assignedWorker, plannedDate, priority, '待执行', notes ?? null, now, now);

  const task: PickingTask = {
    id,
    taskNo,
    plotId,
    plotCode: plot.code,
    plotName: plot.name,
    variety: plot.variety,
    plannedQuantity,
    assignedWorker,
    plannedDate,
    priority: priority as PickingTask['priority'],
    status: '待执行',
    notes: notes ?? null,
    totalPickedQuantity: 0,
    createdAt: now,
    updatedAt: now,
  };

  return c.json(task, 201);
});

// PATCH /api/tasks/:id — 更新任务状态
tasks.patch('/:id', async (c) => {
  const taskId = c.req.param('id');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return error(c, 400, 'INVALID_PARAMS', '请求体不是有效的 JSON');
  }

  const result = updateTaskStatusSchema.safeParse(body);
  if (!result.success) {
    return error(c, 400, 'INVALID_PARAMS', 'status 不在枚举范围内');
  }

  const targetStatus = result.data.status as PickingTask['status'];
  const db = getDb();

  const row = db
    .prepare('SELECT id, task_no, status FROM picking_tasks WHERE id = ?')
    .get(taskId) as { id: string; task_no: string; status: string } | undefined;

  if (!row) {
    return error(c, 404, 'TASK_NOT_FOUND', `任务 ${taskId} 不存在`);
  }

  const currentStatus = row.status as PickingTask['status'];
  if (!canTransitionTaskStatus(currentStatus, targetStatus)) {
    return error(c, 409, 'INVALID_STATUS_TRANSITION', `不允许从 ${currentStatus} 转换为 ${targetStatus}`);
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE picking_tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run(targetStatus, now, taskId);

  const response: UpdateTaskStatusResponse = {
    id: row.id,
    taskNo: row.task_no,
    status: targetStatus,
    updatedAt: now,
  };

  return c.json(response, 200);
});

// 挂载进度上报路由 → /api/tasks/:id/progress
tasks.route('/:id/progress', progressRoute);

export default tasks;
