import { describe, it, expect } from 'vitest';
import {
  createTestDb,
  insertPlot,
  insertTask,
  insertProgress,
  insertAssessment,
} from './helpers.js';

describe('累计采摘量聚合查询', () => {
  it('无进度上报时累计为 0', () => {
    const db = createTestDb();
    const plotId = insertPlot(db);
    const taskId = insertTask(db, plotId, { status: '执行中' });

    const row = db
      .prepare(
        'SELECT COALESCE(SUM(picked_quantity), 0) AS total FROM progress_reports WHERE task_id = ?',
      )
      .get(taskId) as { total: number };

    expect(row.total).toBe(0);
  });

  it('多条进度上报累加', () => {
    const db = createTestDb();
    const plotId = insertPlot(db);
    const taskId = insertTask(db, plotId, { status: '执行中' });

    insertProgress(db, taskId, { picked_quantity: 50 });
    insertProgress(db, taskId, { picked_quantity: 30 });

    const row = db
      .prepare(
        'SELECT COALESCE(SUM(picked_quantity), 0) AS total FROM progress_reports WHERE task_id = ?',
      )
      .get(taskId) as { total: number };

    expect(row.total).toBe(80);
  });

  it('不同任务的采摘量不混入', () => {
    const db = createTestDb();
    const plotId = insertPlot(db);
    const taskA = insertTask(db, plotId, { status: '执行中' });
    const taskB = insertTask(db, plotId, { task_no: 'PT-20261023-002', status: '执行中' });

    insertProgress(db, taskA, { picked_quantity: 50 });
    insertProgress(db, taskA, { picked_quantity: 30 });
    insertProgress(db, taskB, { picked_quantity: 100 });

    const rowA = db
      .prepare('SELECT COALESCE(SUM(picked_quantity), 0) AS total FROM progress_reports WHERE task_id = ?')
      .get(taskA) as { total: number };
    const rowB = db
      .prepare('SELECT COALESCE(SUM(picked_quantity), 0) AS total FROM progress_reports WHERE task_id = ?')
      .get(taskB) as { total: number };

    expect(rowA.total).toBe(80);
    expect(rowB.total).toBe(100);
  });
});

describe('产量统计聚合查询', () => {
  it('仅汇总已完成任务', () => {
    const db = createTestDb();
    const plotId = insertPlot(db, { code: 'PLOT-001', variety: '草莓' });

    // 已完成任务 A：进度 200
    const taskA = insertTask(db, plotId, {
      task_no: 'PT-20261023-001',
      status: '已完成',
      assigned_worker: '李四',
      planned_date: '2026-10-20',
    });
    insertProgress(db, taskA, { picked_quantity: 120 });
    insertProgress(db, taskA, { picked_quantity: 80 });

    // 执行中任务 B：进度 50（不应计入统计）
    const taskB = insertTask(db, plotId, {
      task_no: 'PT-20261023-002',
      status: '执行中',
      assigned_worker: '王五',
      planned_date: '2026-10-22',
    });
    insertProgress(db, taskB, { picked_quantity: 50 });

    // 待执行任务 C（不应计入统计）
    insertTask(db, plotId, {
      task_no: 'PT-20261023-003',
      status: '待执行',
      assigned_worker: '赵六',
      planned_date: '2026-10-25',
    });

    const summary = db
      .prepare(
        `SELECT
           COALESCE(SUM(pr.picked_quantity), 0) AS total_picked_quantity,
           COUNT(DISTINCT t.id) AS completed_task_count,
           COUNT(DISTINCT t.assigned_worker) AS worker_count
           FROM picking_tasks t
           JOIN plots p ON p.id = t.plot_id
           LEFT JOIN progress_reports pr ON pr.task_id = t.id
          WHERE t.status = '已完成'`,
      )
      .get() as {
      total_picked_quantity: number;
      completed_task_count: number;
      worker_count: number;
    };

    expect(summary.total_picked_quantity).toBe(200);
    expect(summary.completed_task_count).toBe(1);
    expect(summary.worker_count).toBe(1);
  });

  it('按地块维度汇总产量', () => {
    const db = createTestDb();
    const plotA = insertPlot(db, { code: 'PLOT-001', variety: '草莓' });
    const plotB = insertPlot(db, { code: 'PLOT-002', variety: '蓝莓' });

    // Plot A: 2 个已完成任务，总量 300
    const taskA1 = insertTask(db, plotA, {
      task_no: 'PT-20261023-001', status: '已完成', assigned_worker: '李四',
    });
    insertProgress(db, taskA1, { picked_quantity: 100 });
    const taskA2 = insertTask(db, plotA, {
      task_no: 'PT-20261023-002', status: '已完成', assigned_worker: '王五',
    });
    insertProgress(db, taskA2, { picked_quantity: 200 });

    // Plot B: 1 个已完成任务，总量 550
    const taskB1 = insertTask(db, plotB, {
      task_no: 'PT-20261023-003', status: '已完成', assigned_worker: '李四',
    });
    insertProgress(db, taskB1, { picked_quantity: 550 });

    const byPlot = db
      .prepare(
        `SELECT
           p.id AS plot_id, p.code AS plot_code, p.name AS plot_name, p.variety,
           COALESCE(SUM(pr.picked_quantity), 0) AS total_picked_quantity,
           COUNT(DISTINCT t.id) AS completed_task_count
           FROM picking_tasks t
           JOIN plots p ON p.id = t.plot_id
           LEFT JOIN progress_reports pr ON pr.task_id = t.id
          WHERE t.status = '已完成'
          GROUP BY p.id, p.code, p.name, p.variety
          ORDER BY total_picked_quantity DESC`,
      )
      .all() as Record<string, unknown>[];

    expect(byPlot).toHaveLength(2);
    // PLOT-002 总量更大，排第一
    expect(byPlot[0].plot_code).toBe('PLOT-002');
    expect(byPlot[0].total_picked_quantity).toBe(550);
    expect(byPlot[0].completed_task_count).toBe(1);
    expect(byPlot[1].plot_code).toBe('PLOT-001');
    expect(byPlot[1].total_picked_quantity).toBe(300);
    expect(byPlot[1].completed_task_count).toBe(2);
  });

  it('支持按品种和时间范围筛选', () => {
    const db = createTestDb();
    const plotA = insertPlot(db, { code: 'PLOT-001', variety: '草莓' });
    const plotB = insertPlot(db, { code: 'PLOT-002', variety: '蓝莓' });

    const taskA = insertTask(db, plotA, {
      task_no: 'PT-20261020-001', status: '已完成', assigned_worker: '李四',
      planned_date: '2026-10-15',
    });
    insertProgress(db, taskA, { picked_quantity: 100 });

    const taskB = insertTask(db, plotB, {
      task_no: 'PT-20261025-001', status: '已完成', assigned_worker: '王五',
      planned_date: '2026-10-28',
    });
    insertProgress(db, taskB, { picked_quantity: 200 });

    // 按品种筛选
    const byVariety = db
      .prepare(
        `SELECT COALESCE(SUM(pr.picked_quantity), 0) AS total
           FROM picking_tasks t
           JOIN plots p ON p.id = t.plot_id
           LEFT JOIN progress_reports pr ON pr.task_id = t.id
          WHERE t.status = '已完成' AND p.variety = ?`,
      )
      .get('草莓') as { total: number };
    expect(byVariety.total).toBe(100);

    // 按时间范围筛选
    const byDate = db
      .prepare(
        `SELECT COALESCE(SUM(pr.picked_quantity), 0) AS total
           FROM picking_tasks t
           JOIN plots p ON p.id = t.plot_id
           LEFT JOIN progress_reports pr ON pr.task_id = t.id
          WHERE t.status = '已完成'
            AND t.planned_date >= ? AND t.planned_date <= ?`,
      )
      .get('2026-10-01', '2026-10-20') as { total: number };
    expect(byDate.total).toBe(100);
  });

  it('workerCount 统计去重作业人员', () => {
    const db = createTestDb();
    const plotId = insertPlot(db);

    const t1 = insertTask(db, plotId, {
      task_no: 'PT-001', status: '已完成', assigned_worker: '李四',
    });
    insertProgress(db, t1, { picked_quantity: 100 });

    const t2 = insertTask(db, plotId, {
      task_no: 'PT-002', status: '已完成', assigned_worker: '李四',
    });
    insertProgress(db, t2, { picked_quantity: 50 });

    const t3 = insertTask(db, plotId, {
      task_no: 'PT-003', status: '已完成', assigned_worker: '王五',
    });
    insertProgress(db, t3, { picked_quantity: 200 });

    const row = db
      .prepare(
        `SELECT COUNT(DISTINCT t.assigned_worker) AS worker_count
           FROM picking_tasks t
          WHERE t.status = '已完成'`,
      )
      .get() as { worker_count: number };

    expect(row.worker_count).toBe(2);
  });
});
