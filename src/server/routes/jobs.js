import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';

const app = new Hono();

/** 将作业行（含 JOIN area_name）映射为 API 响应，含 schedule_days JSON 反序列化和 active 转换 */
function mapJob(row) {
  return {
    id: row.id,
    area_id: row.area_id,
    area_name: row.area_name,
    assignee: row.assignee,
    schedule_type: row.schedule_type,
    schedule_days: row.schedule_days ? JSON.parse(row.schedule_days) : [],
    start_time: row.start_time,
    active: row.active === 1,
    created_at: row.created_at,
  };
}

/** 将任务实例行（含 JOIN assignee / area_name）映射为 API 响应 */
function mapTaskInstance(row) {
  return {
    id: row.id,
    job_id: row.job_id,
    scheduled_date: row.scheduled_date,
    status: row.status,
    assignee: row.assignee,
    area_name: row.area_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function parseJsonBody(c) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

const JOB_SELECT = `
  SELECT j.*, a.name AS area_name
  FROM scheduled_jobs j
  LEFT JOIN cleaning_areas a ON j.area_id = a.id
`;

// GET /api/jobs - 获取作业列表（含关联区域名称）
app.get('/api/jobs', (c) => {
  const db = getDb();
  const rows = db.prepare(`${JOB_SELECT} ORDER BY j.created_at`).all();
  return c.json(rows.map(mapJob));
});

// POST /api/jobs - 创建定时作业
app.post('/api/jobs', async (c) => {
  const body = await parseJsonBody(c);
  if (!body) return c.json({ error: '请求体格式错误' }, 400);

  const { area_id, assignee, schedule_type, schedule_days, start_time } = body;

  if (!area_id || !assignee || !schedule_type || !start_time) {
    return c.json({ error: '字段缺失' }, 400);
  }

  if (schedule_type !== 'daily' && schedule_type !== 'weekly') {
    return c.json({ error: 'schedule_type 必须为 daily 或 weekly' }, 400);
  }

  if (schedule_type === 'weekly') {
    if (!Array.isArray(schedule_days) || schedule_days.length === 0) {
      return c.json({ error: 'weekly 作业需要 schedule_days' }, 400);
    }
    for (const d of schedule_days) {
      if (!Number.isInteger(d) || d < 1 || d > 7) {
        return c.json({ error: 'schedule_days 值须在 1-7 之间' }, 400);
      }
    }
  }

  const db = getDb();
  const area = db.prepare('SELECT id FROM cleaning_areas WHERE id = ?').get(area_id);
  if (!area) return c.json({ error: '关联区域不存在' }, 404);

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const daysJson = schedule_type === 'weekly' ? JSON.stringify(schedule_days) : null;

  db.prepare(
    `INSERT INTO scheduled_jobs
     (id, area_id, assignee, schedule_type, schedule_days, start_time, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, area_id, assignee, schedule_type, daysJson, start_time, 1, createdAt);

  const row = db.prepare(`${JOB_SELECT} WHERE j.id = ?`).get(id);
  return c.json(mapJob(row), 201);
});

// PUT /api/jobs/:id - 编辑或停用作业
app.put('/api/jobs/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const existing = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(id);
  if (!existing) return c.json({ error: '作业不存在' }, 404);

  const body = await parseJsonBody(c);
  if (!body) return c.json({ error: '请求体格式错误' }, 400);

  const areaId = body.area_id ?? existing.area_id;
  const assignee = body.assignee ?? existing.assignee;
  const scheduleType = body.schedule_type ?? existing.schedule_type;
  const startTime = body.start_time ?? existing.start_time;
  const active = body.active !== undefined ? (body.active ? 1 : 0) : existing.active;

  // 处理 schedule_days
  let scheduleDays = existing.schedule_days;
  if (body.schedule_days !== undefined) {
    if (scheduleType === 'weekly') {
      if (!Array.isArray(body.schedule_days) || body.schedule_days.length === 0) {
        return c.json({ error: 'weekly 作业需要 schedule_days' }, 400);
      }
      for (const d of body.schedule_days) {
        if (!Number.isInteger(d) || d < 1 || d > 7) {
          return c.json({ error: 'schedule_days 值须在 1-7 之间' }, 400);
        }
      }
    }
    scheduleDays = scheduleType === 'weekly' ? JSON.stringify(body.schedule_days) : null;
  }

  // 校验关联区域
  if (body.area_id) {
    const area = db.prepare('SELECT id FROM cleaning_areas WHERE id = ?').get(areaId);
    if (!area) return c.json({ error: '关联区域不存在' }, 404);
  }

  db.prepare(
    `UPDATE scheduled_jobs
     SET area_id = ?, assignee = ?, schedule_type = ?, schedule_days = ?, start_time = ?, active = ?
     WHERE id = ?`
  ).run(areaId, assignee, scheduleType, scheduleDays, startTime, active, id);

  const row = db.prepare(`${JOB_SELECT} WHERE j.id = ?`).get(id);
  return c.json(mapJob(row));
});

// GET /api/task-instances - 获取任务实例列表（可按作业和状态筛选）
app.get('/api/task-instances', (c) => {
  const db = getDb();
  const jobId = c.req.query('job_id');
  const status = c.req.query('status');

  let sql = `
    SELECT ti.*, j.assignee, a.name AS area_name
    FROM task_instances ti
    LEFT JOIN scheduled_jobs j ON ti.job_id = j.id
    LEFT JOIN cleaning_areas a ON j.area_id = a.id
    WHERE 1=1
  `;
  const params = [];

  if (jobId) {
    sql += ' AND ti.job_id = ?';
    params.push(jobId);
  }
  if (status) {
    sql += ' AND ti.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY ti.scheduled_date DESC, ti.created_at DESC';

  const rows = db.prepare(sql).all(...params);
  return c.json(rows.map(mapTaskInstance));
});

export default app;
