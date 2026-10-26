import { Hono } from 'hono';
import { createTask, listTasks, cancelTask } from '../services/task-service.js';
import { errorResponse } from '../errors.js';
import type { TaskStatus } from '../types.js';

export const tasks = new Hono();

const TASK_STATUSES: TaskStatus[] = ['pending', 'delivering', 'delivered', 'cancelled'];

tasks.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, 'INVALID_TABLE_ID');
  }
  const tableId = (body as { tableId?: unknown })?.tableId;
  try {
    const task = createTask(tableId);
    return c.json(task, 201);
  } catch (e) {
    const code = (e as { code?: string }).code ?? 'INTERNAL_ERROR';
    return errorResponse(c, code as never, (e as Error).message);
  }
});

tasks.get('/', (c) => {
  const statusParam = c.req.query('status');
  let status: TaskStatus | null = null;
  if (statusParam) {
    if (!TASK_STATUSES.includes(statusParam as TaskStatus)) {
      return errorResponse(c, 'INVALID_STATUS');
    }
    status = statusParam as TaskStatus;
  }
  return c.json({ tasks: listTasks(status) });
});

tasks.post('/:id/cancel', (c) => {
  const idParam = c.req.param('id');
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return errorResponse(c, 'TASK_NOT_FOUND');
  }
  try {
    const res = cancelTask(id);
    return c.json(res, 200);
  } catch (e) {
    const code = (e as { code?: string }).code ?? 'INTERNAL_ERROR';
    return errorResponse(c, code as never, (e as Error).message);
  }
});
