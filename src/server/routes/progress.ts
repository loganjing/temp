import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db.js';
import { error } from '../lib/error.js';
import type {
  CreateProgressResponse,
  ProgressReport,
  ProgressReportListResponse,
} from '../../shared/types.js';

const progress = new Hono();

const createProgressSchema = z.object({
  pickedQuantity: z.number().positive(),
  reportTime: z.string().min(1),
  notes: z.string().optional(),
});

// POST / — 提交采摘进度上报（任务必须为"执行中"状态）
progress.post('/', async (c) => {
  const taskId = c.req.param('id') as string;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return error(c, 400, 'INVALID_PARAMS', '请求体不是有效的 JSON');
  }

  const result = createProgressSchema.safeParse(body);
  if (!result.success) {
    return error(c, 400, 'INVALID_PARAMS', 'pickedQuantity <= 0 或缺少必填字段');
  }

  const { pickedQuantity, reportTime, notes } = result.data;
  const db = getDb();

  const row = db
    .prepare('SELECT id, status FROM picking_tasks WHERE id = ?')
    .get(taskId) as { id: string; status: string } | undefined;

  if (!row) {
    return error(c, 404, 'TASK_NOT_FOUND', `任务 ${taskId} 不存在`);
  }

  if (row.status !== '执行中') {
    return error(c, 409, 'TASK_NOT_IN_PROGRESS', `任务不在"执行中"状态`);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO progress_reports (id, task_id, picked_quantity, report_time, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, taskId, pickedQuantity, reportTime, notes ?? null, now);

  // 累计采摘量
  const sumRow = db
    .prepare('SELECT COALESCE(SUM(picked_quantity), 0) AS total FROM progress_reports WHERE task_id = ?')
    .get(taskId) as { total: number };

  const response: CreateProgressResponse = {
    id,
    taskId,
    pickedQuantity,
    reportTime,
    notes: notes ?? null,
    totalPickedQuantity: sumRow.total,
    createdAt: now,
  };

  return c.json(response, 201);
});

// GET / — 查看指定任务的进度上报历史
progress.get('/', (c) => {
  const taskId = c.req.param('id') as string;
  const db = getDb();

  // 验证任务存在
  const task = db
    .prepare('SELECT id FROM picking_tasks WHERE id = ?')
    .get(taskId) as { id: string } | undefined;

  if (!task) {
    return error(c, 404, 'TASK_NOT_FOUND', `任务 ${taskId} 不存在`);
  }

  const rows = db
    .prepare(
      `SELECT * FROM progress_reports WHERE task_id = ? ORDER BY report_time ASC, created_at ASC`,
    )
    .all(taskId) as Record<string, unknown>[];

  const items: ProgressReport[] = rows.map((row) => ({
    id: row.id as string,
    taskId: row.task_id as string,
    pickedQuantity: row.picked_quantity as number,
    reportTime: row.report_time as string,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
  }));

  const sumRow = db
    .prepare('SELECT COALESCE(SUM(picked_quantity), 0) AS total FROM progress_reports WHERE task_id = ?')
    .get(taskId) as { total: number };

  const response: ProgressReportListResponse = {
    items,
    totalPickedQuantity: sumRow.total,
  };

  return c.json(response, 200);
});

export default progress;
