import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';
import { applyInitSql, type DB } from '../db.js';
import {
  planPath,
  acquirePath,
  advanceRobot,
  releaseAllLocks,
  currentActiveLock,
  pathProgress,
  activelyLockedSegments,
} from '../services/path-service.js';

function freshDb(): DB {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  applyInitSql(database);
  database
    .prepare('INSERT INTO robots (name, status, current_task_id, created_at) VALUES (?, ?, NULL, ?)')
    .run('R1', 'idle', '2026-01-01T00:00:00.000Z');
  database
    .prepare('INSERT INTO robots (name, status, current_task_id, created_at) VALUES (?, ?, NULL, ?)')
    .run('R2', 'idle', '2026-01-01T00:00:01.000Z');
  database
    .prepare('INSERT INTO delivery_tasks (table_id, status, robot_id, created_at) VALUES (?, ?, NULL, ?)')
    .run('table-1', 'pending', '2026-01-01T00:00:10.000Z');
  database
    .prepare('INSERT INTO delivery_tasks (table_id, status, robot_id, created_at) VALUES (?, ?, NULL, ?)')
    .run('table-2', 'pending', '2026-01-01T00:00:20.000Z');
  return database;
}

// 拓扑（见 001_init.sql）：
//   table-1 默认路径: kitchen(1)-jA(2)-jB(3)-table1(5) → 段 [1,2,3]
//   table-2 默认路径: kitchen(1)-jA(2)-jB(3)-table2(6) → 段 [1,2,4]
//   绕行通道: kitchen(1)-jC(4)-jB(3) → 段 [6,7]，可替代段1、2

describe('路径协调 — BFS 与段锁互斥', () => {
  let db: DB;
  beforeEach(() => {
    db = freshDb();
  });

  it('planPath 返回厨房到桌位的最短无冲突路径', () => {
    const plan = planPath(db, 'table-1');
    expect(plan.conflict).toBe(false);
    expect(plan.segments).toEqual([1, 2, 3]);
  });

  it('acquirePath 写入全部段锁，首段占用、其余待占', () => {
    const plan = planPath(db, 'table-1');
    acquirePath(db, 1, 1, plan.segments!);
    const progress = pathProgress(db, 1);
    expect(progress.totalSegments).toBe(3);
    expect(progress.completedSegments).toBe(0);
    const active = currentActiveLock(db, 1, 1);
    expect(active?.sequence).toBe(1);
    expect(active?.locked_at).not.toBeNull();
    const pending = db
      .prepare(
        'SELECT COUNT(*) AS c FROM segment_locks WHERE robot_id=1 AND task_id=1 AND locked_at IS NULL AND released_at IS NULL'
      )
      .get() as { c: number };
    expect(pending.c).toBe(2);
  });

  it('冲突避免：段1被占用时第二台自动绕行', () => {
    // 机器人1 占用通往 table-1 的路径（首段1活跃）
    acquirePath(db, 1, 1, planPath(db, 'table-1').segments!);
    expect(activelyLockedSegments(db).has(1)).toBe(true);

    // 机器人2 到 table-2：默认 [1,2,4] 被段1阻塞 → 绕行 [6,7,4]
    const plan2 = planPath(db, 'table-2');
    expect(plan2.conflict).toBe(false);
    expect(plan2.segments).toEqual([6, 7, 4]);
  });

  it('运行中段锁互斥：不存在同段两个活跃锁', () => {
    acquirePath(db, 1, 1, planPath(db, 'table-1').segments!);
    acquirePath(db, 2, 2, planPath(db, 'table-2').segments!);
    const dup = db
      .prepare(
        'SELECT segment_id, COUNT(*) AS c FROM segment_locks WHERE released_at IS NULL AND locked_at IS NOT NULL GROUP BY segment_id HAVING c > 1'
      )
      .all();
    expect(dup.length).toBe(0);
    // 机器人2 推进一格（段6 → 段7）
    const r = advanceRobot(db, 2, 2);
    expect(r.advanced).toBe(true);
    expect(currentActiveLock(db, 2, 2)?.sequence).toBe(2);
    // 机器人1 仍在段1
    expect(currentActiveLock(db, 1, 1)?.sequence).toBe(1);
  });

  it('冲突无法绕行时 planPath 返回 conflict', () => {
    acquirePath(db, 1, 1, planPath(db, 'table-1').segments!);
    const ts = new Date().toISOString();
    // 模拟绕行通道也被占用（段6、7 被活跃锁阻塞）
    db.prepare(
      'INSERT INTO segment_locks (segment_id, robot_id, task_id, sequence, locked_at, released_at) VALUES (6,1,1,98,?,NULL)'
    ).run(ts);
    db.prepare(
      'INSERT INTO segment_locks (segment_id, robot_id, task_id, sequence, locked_at, released_at) VALUES (7,1,1,99,?,NULL)'
    ).run(ts);
    // 段1、2（默认路径）与 段6、7（绕行）均被占用 → 无法解决
    const plan2 = planPath(db, 'table-2');
    expect(plan2.conflict).toBe(true);
    expect(plan2.segments).toBeNull();
    expect(plan2.blockedSegmentIds.length).toBeGreaterThan(0);
  });

  it('releaseAllLocks 释放后段可被他人重新占用', () => {
    acquirePath(db, 1, 1, planPath(db, 'table-1').segments!);
    expect(activelyLockedSegments(db).has(1)).toBe(true);
    releaseAllLocks(db, 1, 1);
    expect(activelyLockedSegments(db).has(1)).toBe(false);
    const plan2 = planPath(db, 'table-2');
    expect(plan2.segments).toEqual([1, 2, 4]);
  });

  it('pathProgress 随推进递增，到达目标段后保持', () => {
    acquirePath(db, 1, 1, planPath(db, 'table-1').segments!);
    expect(pathProgress(db, 1)).toEqual({ totalSegments: 3, completedSegments: 0 });
    advanceRobot(db, 1, 1);
    expect(pathProgress(db, 1)).toEqual({ totalSegments: 3, completedSegments: 1 });
    advanceRobot(db, 1, 1);
    expect(pathProgress(db, 1)).toEqual({ totalSegments: 3, completedSegments: 2 });
    const r = advanceRobot(db, 1, 1);
    expect(r.atDestination).toBe(true);
    expect(pathProgress(db, 1)).toEqual({ totalSegments: 3, completedSegments: 2 });
  });
});
