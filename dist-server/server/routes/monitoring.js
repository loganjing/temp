import { Hono } from 'hono';
import { getDb } from '../db.js';
const monitoring = new Hono();
// GET /api/monitoring/overview — 进度监控概览
monitoring.get('/overview', (c) => {
    const db = getDb();
    // 各状态任务数量
    const statusRows = db
        .prepare('SELECT status, COUNT(*) AS cnt FROM picking_tasks GROUP BY status')
        .all();
    const taskSummary = {
        assigned: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
    };
    for (const row of statusRows) {
        switch (row.status) {
            case '待执行':
                taskSummary.assigned = row.cnt;
                break;
            case '执行中':
                taskSummary.inProgress = row.cnt;
                break;
            case '已完成':
                taskSummary.completed = row.cnt;
                break;
            case '已取消':
                taskSummary.cancelled = row.cnt;
                break;
        }
    }
    // 执行中任务列表
    const inProgressRows = db
        .prepare(`SELECT t.id, t.task_no, t.assigned_worker, t.planned_quantity, t.priority, t.status,
         p.code AS plot_code, p.name AS plot_name,
         COALESCE(
           (SELECT SUM(picked_quantity) FROM progress_reports WHERE task_id = t.id), 0
         ) AS total_picked_quantity,
         EXISTS(
           SELECT 1 FROM exception_reports
            WHERE task_id = t.id AND status = '待处理'
         ) AS has_pending_exception
         FROM picking_tasks t
         JOIN plots p ON p.id = t.plot_id
        WHERE t.status = '执行中'
        ORDER BY t.created_at DESC`)
        .all();
    const inProgressTasks = inProgressRows.map((row) => ({
        id: row.id,
        taskNo: row.task_no,
        plotCode: row.plot_code,
        plotName: row.plot_name,
        assignedWorker: row.assigned_worker,
        plannedQuantity: row.planned_quantity,
        totalPickedQuantity: row.total_picked_quantity ?? 0,
        priority: row.priority,
        status: row.status,
        hasPendingException: Boolean(row.has_pending_exception),
    }));
    // 待处理异常数量
    const pendingRow = db
        .prepare(`SELECT COUNT(*) AS cnt FROM exception_reports WHERE status = '待处理'`)
        .get();
    const response = {
        taskSummary,
        inProgressTasks,
        pendingExceptionCount: pendingRow.cnt,
    };
    return c.json(response, 200);
});
export default monitoring;
