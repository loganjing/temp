import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
/**
 * 创建内存数据库并初始化 schema，用于单元/集成测试。
 */
export function createTestDb() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const sqlPath = join(process.cwd(), 'migrations', '001_init.sql');
    const sql = readFileSync(sqlPath, 'utf-8');
    db.exec(sql);
    return db;
}
/**
 * 插入一条地块。
 */
export function insertPlot(db, overrides = {}) {
    const id = overrides.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO plots (id, code, name, variety, area, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, overrides.code ?? 'PLOT-001', overrides.name ?? '测试地块', overrides.variety ?? '草莓', overrides.area ?? 5.5, overrides.created_at ?? now, overrides.updated_at ?? now);
    return id;
}
/**
 * 插入一条成熟度评估记录。
 */
export function insertAssessment(db, plotId, overrides = {}) {
    const id = overrides.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO maturity_assessments
       (id, plot_id, maturity_level, assessment_time, assessor, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, plotId, overrides.maturity_level ?? '成熟', overrides.assessment_time ?? now, overrides.assessor ?? '测试评估人', overrides.notes ?? null, overrides.created_at ?? now);
    return id;
}
/**
 * 插入一条采摘任务。
 */
export function insertTask(db, plotId, overrides = {}) {
    const id = overrides.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO picking_tasks
       (id, task_no, plot_id, planned_quantity, assigned_worker,
        planned_date, priority, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, overrides.task_no ?? 'PT-20261023-001', plotId, overrides.planned_quantity ?? 100, overrides.assigned_worker ?? '测试作业员', overrides.planned_date ?? '2026-10-24', overrides.priority ?? '普通', overrides.status ?? '待执行', overrides.notes ?? null, overrides.created_at ?? now, overrides.updated_at ?? now);
    return id;
}
/**
 * 插入一条进度上报。
 */
export function insertProgress(db, taskId, overrides = {}) {
    const id = overrides.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO progress_reports
       (id, task_id, picked_quantity, report_time, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`).run(id, taskId, overrides.picked_quantity ?? 50, overrides.report_time ?? now, overrides.notes ?? null, overrides.created_at ?? now);
    return id;
}
/**
 * 插入一条异常报告。
 */
export function insertException(db, overrides = {}) {
    const id = overrides.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO exception_reports
       (id, task_id, exception_type, description, reporter,
        report_time, status, resolution_notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, overrides.task_id ?? null, overrides.exception_type ?? '设备故障', overrides.description ?? '测试异常', overrides.reporter ?? '测试上报人', overrides.report_time ?? now, overrides.status ?? '待处理', overrides.resolution_notes ?? null, overrides.created_at ?? now, overrides.updated_at ?? now);
    return id;
}
