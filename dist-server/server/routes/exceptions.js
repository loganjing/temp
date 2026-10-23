import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db.js';
import { error } from '../lib/error.js';
import { canTransitionExceptionStatus, VALID_EXCEPTION_STATUSES_FOR_UPDATE, } from '../lib/status.js';
const exceptions = new Hono();
const exceptionTypeEnum = z.enum(['天气', '病虫害', '设备故障', '人员', '其他']);
const createExceptionSchema = z.object({
    taskId: z.string().optional(),
    exceptionType: exceptionTypeEnum,
    description: z.string().min(1),
    reporter: z.string().min(1),
    reportTime: z.string().min(1),
});
const updateExceptionSchema = z.object({
    status: z.enum(VALID_EXCEPTION_STATUSES_FOR_UPDATE),
    resolutionNotes: z.string().optional(),
});
// GET /api/exceptions — 异常报告列表
exceptions.get('/', (c) => {
    const db = getDb();
    const { status, exceptionType, taskId } = c.req.query();
    let sql = `
    SELECT er.*, pt.task_no
      FROM exception_reports er
      LEFT JOIN picking_tasks pt ON pt.id = er.task_id
     WHERE 1=1`;
    const params = [];
    if (status) {
        sql += ` AND er.status = ?`;
        params.push(status);
    }
    if (exceptionType) {
        sql += ` AND er.exception_type = ?`;
        params.push(exceptionType);
    }
    if (taskId) {
        sql += ` AND er.task_id = ?`;
        params.push(taskId);
    }
    sql += ` ORDER BY er.report_time DESC, er.created_at DESC`;
    const rows = db.prepare(sql).all(...params);
    const items = rows.map((row) => ({
        id: row.id,
        taskId: row.task_id ?? null,
        taskNo: row.task_no ?? null,
        exceptionType: row.exception_type,
        description: row.description,
        reporter: row.reporter,
        reportTime: row.report_time,
        status: row.status,
        resolutionNotes: row.resolution_notes ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }));
    return c.json({ items });
});
// POST /api/exceptions — 提交异常报告
exceptions.post('/', async (c) => {
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return error(c, 400, 'INVALID_PARAMS', '请求体不是有效的 JSON');
    }
    const result = createExceptionSchema.safeParse(body);
    if (!result.success) {
        return error(c, 400, 'INVALID_PARAMS', '缺少必填字段或 exceptionType 不在枚举范围');
    }
    const { taskId, exceptionType, description, reporter, reportTime } = result.data;
    const db = getDb();
    let taskNo = null;
    if (taskId) {
        const task = db
            .prepare('SELECT id, task_no FROM picking_tasks WHERE id = ?')
            .get(taskId);
        if (!task) {
            return error(c, 404, 'TASK_NOT_FOUND', `任务 ${taskId} 不存在`);
        }
        taskNo = task.task_no;
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO exception_reports
       (id, task_id, exception_type, description, reporter,
        report_time, status, resolution_notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, taskId ?? null, exceptionType, description, reporter, reportTime, '待处理', null, now, now);
    const report = {
        id,
        taskId: taskId ?? null,
        taskNo,
        exceptionType: exceptionType,
        description,
        reporter,
        reportTime,
        status: '待处理',
        resolutionNotes: null,
        createdAt: now,
        updatedAt: now,
    };
    return c.json(report, 201);
});
// PATCH /api/exceptions/:id — 更新异常处理状态和说明
exceptions.patch('/:id', async (c) => {
    const exceptionId = c.req.param('id');
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return error(c, 400, 'INVALID_PARAMS', '请求体不是有效的 JSON');
    }
    const result = updateExceptionSchema.safeParse(body);
    if (!result.success) {
        return error(c, 400, 'INVALID_PARAMS', 'status 不在枚举范围');
    }
    const targetStatus = result.data.status;
    const resolutionNotes = result.data.resolutionNotes ?? null;
    const db = getDb();
    const row = db
        .prepare('SELECT id, status, resolution_notes FROM exception_reports WHERE id = ?')
        .get(exceptionId);
    if (!row) {
        return error(c, 404, 'EXCEPTION_NOT_FOUND', `异常报告 ${exceptionId} 不存在`);
    }
    const currentStatus = row.status;
    if (!canTransitionExceptionStatus(currentStatus, targetStatus)) {
        return error(c, 409, 'INVALID_STATUS_TRANSITION', `不允许从 ${currentStatus} 转换为 ${targetStatus}`);
    }
    const now = new Date().toISOString();
    // 如果新提供了 resolutionNotes 则用新值，否则保留原值
    const newNotes = resolutionNotes ?? row.resolution_notes;
    db.prepare('UPDATE exception_reports SET status = ?, resolution_notes = ?, updated_at = ? WHERE id = ?').run(targetStatus, newNotes, now, exceptionId);
    const response = {
        id: row.id,
        status: targetStatus,
        resolutionNotes: newNotes,
        updatedAt: now,
    };
    return c.json(response, 200);
});
export default exceptions;
