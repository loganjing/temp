import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db.js';
import { error } from '../lib/error.js';
import { getLatestMaturityLevel, isHarvestable } from '../lib/maturity.js';
import type { Plot } from '../../shared/types.js';

const plots = new Hono();

const createPlotSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  variety: z.string().min(1),
  area: z.number().positive(),
});

function rowToPlot(
  row: Record<string, unknown>,
  maturityLevel: string | null,
): Plot {
  const level = maturityLevel as Plot['currentMaturityLevel'];
  return {
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    variety: row.variety as string,
    area: row.area as number,
    currentMaturityLevel: level,
    harvestable: isHarvestable(level),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// GET /api/plots — 地块列表（支持按编号、品种、可采摘状态筛选）
plots.get('/', (c) => {
  const db = getDb();
  const { code, variety, harvestable } = c.req.query();

  let sql = `SELECT * FROM plots WHERE 1=1`;
  const params: string[] = [];

  if (code) {
    sql += ` AND code LIKE ?`;
    params.push(`%${code}%`);
  }
  if (variety) {
    sql += ` AND variety = ?`;
    params.push(variety);
  }
  sql += ` ORDER BY created_at DESC`;

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];

  let items = rows.map((row) => {
    const level = getLatestMaturityLevel(db, row.id as string);
    return rowToPlot(row, level);
  });

  if (harvestable !== undefined) {
    const want = harvestable === 'true';
    items = items.filter((p) => p.harvestable === want);
  }

  return c.json({ items });
});

// POST /api/plots — 创建地块
plots.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return error(c, 400, 'INVALID_PARAMS', '请求体不是有效的 JSON');
  }

  const result = createPlotSchema.safeParse(body);
  if (!result.success) {
    return error(c, 400, 'INVALID_PARAMS', '缺少必填字段或 area 不合法');
  }

  const { code, name, variety, area } = result.data;
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    db.prepare(
      `INSERT INTO plots (id, code, name, variety, area, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, code, name, variety, area, now, now);
  } catch (e: unknown) {
    const msg = (e as Error).message ?? '';
    if (msg.includes('UNIQUE constraint failed')) {
      return error(c, 409, 'DUPLICATE_CODE', `地块编号 ${code} 已存在`);
    }
    throw e;
  }

  const plot: Plot = {
    id,
    code,
    name,
    variety,
    area,
    currentMaturityLevel: null,
    harvestable: false,
    createdAt: now,
    updatedAt: now,
  };

  return c.json(plot, 201);
});

export default plots;
