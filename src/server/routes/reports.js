// routes/reports.js — 作业质量报告
import { Hono } from 'hono';
import { getDb } from '../db.js';

const app = new Hono();

// GET /api/reports/quality — 生成作业质量报告
app.get('/api/reports/quality', (c) => {
  const areaId = c.req.query('area_id');
  const from = c.req.query('from');
  const to = c.req.query('to');

  // 校验日期格式
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!from || !to) {
    return c.json({ error: 'from 和 to 参数必填' }, 400);
  }
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    return c.json({ error: '日期格式无效，需 YYYY-MM-DD' }, 400);
  }
  if (from > to) {
    return c.json({ error: 'from 不能晚于 to' }, 400);
  }

  const db = getDb();

  // 构建任务实例查询（可按区域筛选）
  let taskWhere = 'WHERE ti.scheduled_date >= ? AND ti.scheduled_date <= ?';
  const taskParams = [from, to];
  if (areaId) {
    taskWhere += ' AND j.area_id = ?';
    taskParams.push(areaId);
  }

  // 任务实例统计
  const taskStats = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN ti.status IN ('completed', 'has_obstacle_completed') THEN 1 ELSE 0 END) AS completed
       FROM task_instances ti
       LEFT JOIN scheduled_jobs j ON ti.job_id = j.id
       ${taskWhere}`
    )
    .get(...taskParams);

  const totalTaskInstances = taskStats.total || 0;
  const completedTaskInstances = taskStats.completed || 0;
  const taskCompletionRate =
    totalTaskInstances > 0
      ? Math.round((completedTaskInstances / totalTaskInstances) * 100) / 100
      : 0;

  // 障碍统计
  let obstacleWhere = `WHERE o.reported_at >= ? AND o.reported_at <= ?`;
  const obstacleParams = [`${from}T00:00:00.000Z`, `${to}T23:59:59.999Z`];
  if (areaId) {
    obstacleWhere += ` AND j.area_id = ?`;
    obstacleParams.push(areaId);
  }

  const obstacleStats = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN o.status = 'resolved' THEN 1 ELSE 0 END) AS resolved
       FROM obstacles o
       LEFT JOIN task_instances ti ON o.task_instance_id = ti.id
       LEFT JOIN scheduled_jobs j ON ti.job_id = j.id
       ${obstacleWhere}`
    )
    .get(...obstacleParams);

  const obstacleCount = obstacleStats.total || 0;
  const obstacleResolvedCount = obstacleStats.resolved || 0;
  const obstacleResolutionRate =
    obstacleCount > 0
      ? Math.round((obstacleResolvedCount / obstacleCount) * 100) / 100
      : 0;

  // 耗材消耗汇总
  // 由于没有消耗记录表，取时间段内 updated_at 在范围内的耗材，
  // 以当前 quantity 与创建时 quantity(0 假设) 的差值作为消耗量
  let supplyQuery = `
    SELECT
      si.id AS supply_item_id,
      si.name AS supply_item_name,
      CASE WHEN si.quantity < 0 THEN ABS(si.quantity) ELSE 0 END AS consumed
    FROM supply_items si
    WHERE si.updated_at >= ? AND si.updated_at <= ?
  `;
  const supplyParams = [`${from}T00:00:00.000Z`, `${to}T23:59:59.999Z`];
  if (areaId) {
    // 耗材与区域无直接关联，不按区域筛选
  }

  const supplyConsumption = db
    .prepare(supplyQuery)
    .all(...supplyParams)
    .map((row) => ({
      supply_item_id: row.supply_item_id,
      supply_item_name: row.supply_item_name,
      consumed: row.consumed,
    }));

  // 获取区域名称
  let areaName = null;
  if (areaId) {
    const area = db.prepare('SELECT name FROM cleaning_areas WHERE id = ?').get(areaId);
    if (area) areaName = area.name;
  }

  return c.json({
    area_id: areaId || null,
    area_name: areaName,
    from,
    to,
    task_completion_rate: taskCompletionRate,
    total_task_instances: totalTaskInstances,
    completed_task_instances: completedTaskInstances,
    obstacle_count: obstacleCount,
    obstacle_resolved_count: obstacleResolvedCount,
    obstacle_resolution_rate: obstacleResolutionRate,
    supply_consumption: supplyConsumption,
  });
});

export default app;
