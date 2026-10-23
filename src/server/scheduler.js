// scheduler.js — 定时作业调度检查器
import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';

let intervalId = null;

/**
 * 获取当前星期几（1=周一..7=周日）。
 */
function getDayOfWeek(date = new Date()) {
  const jsDay = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * 获取当前本地日期 YYYY-MM-DD。
 */
function getCurrentDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 获取当前本地时间 HH:MM。
 */
function getCurrentTime(date = new Date()) {
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${mi}`;
}

/**
 * 扫描活跃作业，匹配调度周期和起始时间，生成当日任务实例。
 * 按 job_id + scheduled_date 去重。
 *
 * @param {object} [context] — 测试时可注入 date/time/dayOfWeek
 * @param {Date} [context.now]
 * @param {string} [context.date] — YYYY-MM-DD
 * @param {string} [context.time] — HH:MM
 * @param {number} [context.dayOfWeek] — 1..7
 */
export function checkAndGenerateInstances(context = {}) {
  const now = context.now ? new Date(context.now) : new Date();
  const today = context.date || getCurrentDate(now);
  const currentTime = context.time || getCurrentTime(now);
  const dayOfWeek =
    context.dayOfWeek !== undefined ? context.dayOfWeek : getDayOfWeek(now);

  const db = getDb();
  const jobs = db.prepare('SELECT * FROM scheduled_jobs WHERE active = 1').all();

  for (const job of jobs) {
    // 匹配调度周期
    let scheduleMatches = false;
    if (job.schedule_type === 'daily') {
      scheduleMatches = true;
    } else if (job.schedule_type === 'weekly') {
      const days = job.schedule_days ? JSON.parse(job.schedule_days) : [];
      scheduleMatches = Array.isArray(days) && days.includes(dayOfWeek);
    }
    if (!scheduleMatches) continue;

    // 匹配起始时间
    if (job.start_time !== currentTime) continue;

    // 按 job_id + scheduled_date 去重
    const existing = db
      .prepare('SELECT id FROM task_instances WHERE job_id = ? AND scheduled_date = ?')
      .get(job.id, today);
    if (existing) continue;

    // 生成任务实例
    const id = randomUUID();
    const nowIso = now.toISOString();
    db.prepare(
      'INSERT INTO task_instances (id, job_id, scheduled_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, job.id, today, 'pending', nowIso, nowIso);
  }
}

/**
 * 启动调度器，每 60 秒执行一次扫描。
 */
export function startScheduler() {
  if (intervalId) return;
  checkAndGenerateInstances();
  intervalId = setInterval(checkAndGenerateInstances, 60_000);

  const cleanup = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
  process.on('exit', cleanup);
}

/**
 * 停止调度器。
 */
export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
