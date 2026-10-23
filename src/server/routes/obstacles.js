import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';

const app = new Hono();

function mapObstacle(row) {
  return {
    id: row.id,
    task_instance_id: row.task_instance_id,
    description: row.description,
    reported_at: row.reported_at,
    status: row.status,
    resolution_method: row.resolution_method,
    resolution_result: row.resolution_result,
    resolved_at: row.resolved_at,
  };
}

async function parseJsonBody(c) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

// POST /api/obstacles - 上报障碍
app.post('/api/obstacles', async (c) => {
  const body = await parseJsonBody(c);
  if (!body) return c.json({ error: '请求体格式错误' }, 400);

  const { task_instance_id, description } = body;
  if (!task_instance_id || !description) {
    return c.json({ error: '字段缺失' }, 400);
  }

  const db = getDb();
  const instance = db.prepare('SELECT id FROM task_instances WHERE id = ?').get(task_instance_id);
  if (!instance) return c.json({ error: '任务实例不存在' }, 404);

  const id = randomUUID();
  const reportedAt = new Date().toISOString();

  // 事务：创建障碍 + 更新任务实例状态为 has_obstacle_completed
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO obstacles
       (id, task_instance_id, description, reported_at, status, resolution_method, resolution_result, resolved_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)`
    ).run(id, task_instance_id, description, reportedAt, 'pending');

    db.prepare('UPDATE task_instances SET status = ?, updated_at = ? WHERE id = ?').run(
      'has_obstacle_completed',
      reportedAt,
      task_instance_id
    );
  });
  tx();

  const row = db.prepare('SELECT * FROM obstacles WHERE id = ?').get(id);
  return c.json(mapObstacle(row), 201);
});

// GET /api/obstacles - 获取障碍列表（可按状态筛选）
app.get('/api/obstacles', (c) => {
  const db = getDb();
  const status = c.req.query('status');

  let sql = 'SELECT * FROM obstacles';
  const params = [];
  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += ' ORDER BY reported_at DESC';

  const rows = db.prepare(sql).all(...params);
  return c.json(rows.map(mapObstacle));
});

// PUT /api/obstacles/:id/resolve - 标记障碍已处理
app.put('/api/obstacles/:id/resolve', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const existing = db.prepare('SELECT * FROM obstacles WHERE id = ?').get(id);
  if (!existing) return c.json({ error: '障碍不存在' }, 404);
  if (existing.status === 'resolved') return c.json({ error: '障碍已处理' }, 409);

  const body = await parseJsonBody(c);
  if (!body) return c.json({ error: '请求体格式错误' }, 400);

  const { resolution_method, resolution_result } = body;
  if (!resolution_method || !resolution_result) {
    return c.json({ error: '字段缺失' }, 400);
  }

  const resolvedAt = new Date().toISOString();
  db.prepare(
    `UPDATE obstacles
     SET status = ?, resolution_method = ?, resolution_result = ?, resolved_at = ?
     WHERE id = ?`
  ).run('resolved', resolution_method, resolution_result, resolvedAt, id);

  const row = db.prepare('SELECT * FROM obstacles WHERE id = ?').get(id);
  return c.json(mapObstacle(row));
});

export default app;
