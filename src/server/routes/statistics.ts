import { Hono } from 'hono';
import { getDb } from '../db.js';
import type { StatisticsResponse, PlotStatistics } from '../../shared/types.js';

const statistics = new Hono();

// GET /api/statistics — 产量统计（仅基于已完成任务）
statistics.get('/', (c) => {
  const db = getDb();
  const { plotId, variety, startDate, endDate } = c.req.query();

  const conditions: string[] = [`t.status = '已完成'`];
  const params: (string | number)[] = [];

  if (plotId) {
    conditions.push(`t.plot_id = ?`);
    params.push(plotId);
  }
  if (variety) {
    conditions.push(`p.variety = ?`);
    params.push(variety);
  }
  if (startDate) {
    conditions.push(`t.planned_date >= ?`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`t.planned_date <= ?`);
    params.push(endDate);
  }

  const whereClause = conditions.join(' AND ');

  // 汇总：总采摘量、完成任务数、参与作业人员数
  const summaryRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(pr.picked_quantity), 0) AS total_picked_quantity,
         COUNT(DISTINCT t.id) AS completed_task_count,
         COUNT(DISTINCT t.assigned_worker) AS worker_count
         FROM picking_tasks t
         JOIN plots p ON p.id = t.plot_id
         LEFT JOIN progress_reports pr ON pr.task_id = t.id
        WHERE ${whereClause}`,
    )
    .get(...params) as {
    total_picked_quantity: number;
    completed_task_count: number;
    worker_count: number;
  };

  // 按地块维度的产量明细
  const byPlotRows = db
    .prepare(
      `SELECT
         p.id AS plot_id, p.code AS plot_code, p.name AS plot_name, p.variety,
         COALESCE(SUM(pr.picked_quantity), 0) AS total_picked_quantity,
         COUNT(DISTINCT t.id) AS completed_task_count
         FROM picking_tasks t
         JOIN plots p ON p.id = t.plot_id
         LEFT JOIN progress_reports pr ON pr.task_id = t.id
        WHERE ${whereClause}
        GROUP BY p.id, p.code, p.name, p.variety
        ORDER BY total_picked_quantity DESC`,
    )
    .all(...params) as Record<string, unknown>[];

  const byPlot: PlotStatistics[] = byPlotRows.map((row) => ({
    plotId: row.plot_id as string,
    plotCode: row.plot_code as string,
    plotName: row.plot_name as string,
    variety: row.variety as string,
    totalPickedQuantity: row.total_picked_quantity as number,
    completedTaskCount: row.completed_task_count as number,
  }));

  const response: StatisticsResponse = {
    summary: {
      totalPickedQuantity: summaryRow.total_picked_quantity,
      completedTaskCount: summaryRow.completed_task_count,
      workerCount: summaryRow.worker_count,
    },
    byPlot,
  };

  return c.json(response, 200);
});

export default statistics;
