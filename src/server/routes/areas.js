// routes/areas.js — 清洁区域 CRUD
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';

const app = new Hono();

function mapArea(row) {
  return {
    id: row.id,
    name: row.name,
    location_desc: row.location_desc,
    requirements: row.requirements,
    created_at: row.created_at,
  };
}

async function parseJsonBody(c) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

// GET /api/areas
app.get('/api/areas', (c) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM cleaning_areas ORDER BY created_at').all();
  return c.json(rows.map(mapArea));
});

// GET /api/areas/:id
app.get('/api/areas/:id', (c) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM cleaning_areas WHERE id = ?').get(c.req.param('id'));
  if (!row) return c.json({ error: '区域不存在' }, 404);
  return c.json(mapArea(row));
});

// POST /api/areas
app.post('/api/areas', async (c) => {
  const body = await parseJsonBody(c);
  if (!body) return c.json({ error: '请求体格式错误' }, 400);

  const { name, location_desc, requirements } = body;
  if (!name || !location_desc || !requirements) {
    return c.json({ error: '字段缺失或为空' }, 400);
  }

  const db = getDb();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO cleaning_areas (id, name, location_desc, requirements, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, location_desc, requirements, createdAt);

  const row = db.prepare('SELECT * FROM cleaning_areas WHERE id = ?').get(id);
  return c.json(mapArea(row), 201);
});

// PUT /api/areas/:id
app.put('/api/areas/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const existing = db.prepare('SELECT * FROM cleaning_areas WHERE id = ?').get(id);
  if (!existing) return c.json({ error: '区域不存在' }, 404);

  const body = await parseJsonBody(c);
  if (!body) return c.json({ error: '请求体格式错误' }, 400);

  const name = body.name ?? existing.name;
  const location_desc = body.location_desc ?? existing.location_desc;
  const requirements = body.requirements ?? existing.requirements;

  if (!name || !location_desc || !requirements) {
    return c.json({ error: '字段校验失败' }, 400);
  }

  db.prepare(
    'UPDATE cleaning_areas SET name = ?, location_desc = ?, requirements = ? WHERE id = ?'
  ).run(name, location_desc, requirements, id);

  const row = db.prepare('SELECT * FROM cleaning_areas WHERE id = ?').get(id);
  return c.json(mapArea(row));
});

// DELETE /api/areas/:id
app.delete('/api/areas/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const existing = db.prepare('SELECT * FROM cleaning_areas WHERE id = ?').get(id);
  if (!existing) return c.json({ error: '区域不存在' }, 404);

  db.prepare('DELETE FROM cleaning_areas WHERE id = ?').run(id);
  return c.body(null, 204);
});

export default app;
