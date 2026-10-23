// routes/supplies.js — 耗材管理与库存提醒
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';

const app = new Hono();

/** 将耗材行映射为 API 响应，含 low_stock 计算字段 */
function mapSupplyItem(row) {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    threshold: row.threshold,
    low_stock: row.quantity < row.threshold,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** 将提醒行（含 JOIN 耗材名称）映射为 API 响应 */
function mapSupplyAlert(row) {
  return {
    id: row.id,
    supply_item_id: row.supply_item_id,
    supply_item_name: row.supply_item_name,
    created_at: row.created_at,
    status: row.status,
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

const ALERT_SELECT = `
  SELECT sa.*, si.name AS supply_item_name
  FROM supply_alerts sa
  LEFT JOIN supply_items si ON sa.supply_item_id = si.id
`;

/**
 * 检查库存与阈值关系，自动创建或消除提醒。
 * @param {import('better-sqlite3').Database} db
 * @param {string} supplyItemId
 * @param {number} quantity
 * @param {number} threshold
 */
function checkAndManageAlerts(db, supplyItemId, quantity, threshold) {
  const existingAlert = db
    .prepare('SELECT id FROM supply_alerts WHERE supply_item_id = ? AND status = ?')
    .get(supplyItemId, 'active');

  if (quantity < threshold && !existingAlert) {
    // 低于阈值且无活跃提醒 → 创建提醒
    const alertId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO supply_alerts (id, supply_item_id, created_at, status) VALUES (?, ?, ?, ?)'
    ).run(alertId, supplyItemId, now, 'active');
  } else if (quantity >= threshold && existingAlert) {
    // 高于阈值且有活跃提醒 → 标记为已消除
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE supply_alerts SET status = ?, resolved_at = ? WHERE id = ?'
    ).run('resolved', now, existingAlert.id);
  }
}

// GET /api/supplies — 获取耗材列表（含库存状态）
app.get('/api/supplies', (c) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM supply_items ORDER BY created_at').all();
  return c.json(rows.map(mapSupplyItem));
});

// POST /api/supplies — 创建耗材
app.post('/api/supplies', async (c) => {
  const body = await parseJsonBody(c);
  if (!body) return c.json({ error: '请求体格式错误' }, 400);

  const { name, quantity, unit, threshold } = body;
  if (!name || quantity === undefined || quantity === null || !unit || threshold === undefined || threshold === null) {
    return c.json({ error: '字段缺失' }, 400);
  }

  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO supply_items (id, name, quantity, unit, threshold, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, quantity, unit, threshold, now, now);

  // 创建时若 quantity < threshold，自动生成提醒
  checkAndManageAlerts(db, id, quantity, threshold);

  const row = db.prepare('SELECT * FROM supply_items WHERE id = ?').get(id);
  return c.json(mapSupplyItem(row), 201);
});

// PUT /api/supplies/:id — 更新耗材（含库存数量变更）
app.put('/api/supplies/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const existing = db.prepare('SELECT * FROM supply_items WHERE id = ?').get(id);
  if (!existing) return c.json({ error: '耗材不存在' }, 404);

  const body = await parseJsonBody(c);
  if (!body) return c.json({ error: '请求体格式错误' }, 400);

  const name = body.name ?? existing.name;
  const quantity = body.quantity !== undefined ? body.quantity : existing.quantity;
  const unit = body.unit ?? existing.unit;
  const threshold = body.threshold !== undefined ? body.threshold : existing.threshold;

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE supply_items SET name = ?, quantity = ?, unit = ?, threshold = ?, updated_at = ?
     WHERE id = ?`
  ).run(name, quantity, unit, threshold, now, id);

  // 更新后检查库存与阈值关系
  checkAndManageAlerts(db, id, quantity, threshold);

  const row = db.prepare('SELECT * FROM supply_items WHERE id = ?').get(id);
  return c.json(mapSupplyItem(row));
});

// DELETE /api/supplies/:id — 删除耗材
app.delete('/api/supplies/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const existing = db.prepare('SELECT id FROM supply_items WHERE id = ?').get(id);
  if (!existing) return c.json({ error: '耗材不存在' }, 404);

  db.prepare('DELETE FROM supply_items WHERE id = ?').run(id);
  return c.body(null, 204);
});

// GET /api/supply-alerts — 获取未处理库存提醒列表
app.get('/api/supply-alerts', (c) => {
  const db = getDb();
  const rows = db
    .prepare(`${ALERT_SELECT} WHERE sa.status = 'active' ORDER BY sa.created_at DESC`)
    .all();
  return c.json(rows.map(mapSupplyAlert));
});

// PUT /api/supply-alerts/:id/resolve — 消除提醒（库存补充后手动标记）
app.put('/api/supply-alerts/:id/resolve', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const existing = db.prepare('SELECT * FROM supply_alerts WHERE id = ?').get(id);
  if (!existing) return c.json({ error: '提醒不存在' }, 404);
  if (existing.status === 'resolved') return c.json({ error: '提醒已消除' }, 409);

  const now = new Date().toISOString();
  db.prepare('UPDATE supply_alerts SET status = ?, resolved_at = ? WHERE id = ?').run(
    'resolved',
    now,
    id
  );

  const row = db.prepare(`${ALERT_SELECT} WHERE sa.id = ?`).get(id);
  return c.json(mapSupplyAlert(row));
});

export default app;
