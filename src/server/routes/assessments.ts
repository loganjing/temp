import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db.js';
import { error } from '../lib/error.js';
import { getLatestMaturityLevel, isHarvestable } from '../lib/maturity.js';
import type { Assessment } from '../../shared/types.js';

const assessments = new Hono();

const maturityLevelEnum = z.enum(['未成熟', '接近成熟', '成熟', '过熟']);

const createAssessmentSchema = z.object({
  plotId: z.string().min(1),
  maturityLevel: maturityLevelEnum,
  assessmentTime: z.string().min(1),
  assessor: z.string().min(1),
  notes: z.string().optional(),
});

// GET /api/assessments — 成熟度评估记录列表
assessments.get('/', (c) => {
  const db = getDb();
  const { plotId, plotCode, maturityLevel, harvestable } = c.req.query();

  let sql = `
    SELECT ma.*, p.code AS plot_code, p.name AS plot_name, p.variety
      FROM maturity_assessments ma
      JOIN plots p ON p.id = ma.plot_id
     WHERE 1=1`;
  const params: string[] = [];

  if (plotId) {
    sql += ` AND ma.plot_id = ?`;
    params.push(plotId);
  }
  if (plotCode) {
    sql += ` AND p.code LIKE ?`;
    params.push(`%${plotCode}%`);
  }
  if (maturityLevel) {
    sql += ` AND ma.maturity_level = ?`;
    params.push(maturityLevel);
  }
  sql += ` ORDER BY ma.assessment_time DESC, ma.created_at DESC`;

  let rows = db.prepare(sql).all(...params) as Record<string, unknown>[];

  // 按可采摘状态筛选
  if (harvestable !== undefined) {
    const want = harvestable === 'true';
    rows = rows.filter((row) => {
      const level = getLatestMaturityLevel(db, row.plot_id as string);
      return isHarvestable(level) === want;
    });
  }

  const items: Assessment[] = rows.map((row) => ({
    id: row.id as string,
    plotId: row.plot_id as string,
    plotCode: row.plot_code as string,
    plotName: row.plot_name as string,
    variety: row.variety as string,
    maturityLevel: row.maturity_level as Assessment['maturityLevel'],
    assessmentTime: row.assessment_time as string,
    assessor: row.assessor as string,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
  }));

  return c.json({ items });
});

// POST /api/assessments — 创建成熟度评估记录
assessments.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return error(c, 400, 'INVALID_PARAMS', '请求体不是有效的 JSON');
  }

  const result = createAssessmentSchema.safeParse(body);
  if (!result.success) {
    return error(c, 400, 'INVALID_PARAMS', '缺少必填字段或 maturityLevel 不在枚举范围');
  }

  const { plotId, maturityLevel, assessmentTime, assessor, notes } = result.data;
  const db = getDb();

  // 验证地块存在
  const plot = db
    .prepare('SELECT id, code, name, variety FROM plots WHERE id = ?')
    .get(plotId) as { id: string; code: string; name: string; variety: string } | undefined;

  if (!plot) {
    return error(c, 404, 'PLOT_NOT_FOUND', `地块 ${plotId} 不存在`);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO maturity_assessments
       (id, plot_id, maturity_level, assessment_time, assessor, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, plotId, maturityLevel, assessmentTime, assessor, notes ?? null, now);

  const assessment: Assessment = {
    id,
    plotId,
    plotCode: plot.code,
    plotName: plot.name,
    variety: plot.variety,
    maturityLevel,
    assessmentTime,
    assessor,
    notes: notes ?? null,
    createdAt: now,
  };

  return c.json(assessment, 201);
});

export default assessments;
