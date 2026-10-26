import type { DB } from '../db.js';
import type { SegmentRow, SegmentLockRow } from '../types.js';

/**
 * 路径协调模块。
 *
 * 模型：path_segments 为无向边（一段物理通道，任一方向通行都占用同一把锁）。
 * 占用采用渐进式段锁：
 *  - 任务分配时规划完整路径，为每个段创建一行 segment_locks；
 *    首段 locked_at 设为当前时间（当前占用），其余段 locked_at 为 NULL（已规划待占）。
 *  - 运行推进时：先尝试激活下一段锁，成功后再释放当前段锁（hold-and-wait）。
 *  - 到达/取消：释放该机器人该任务所有未释放锁。
 *
 * 互斥由 partial unique index uq_locks_active_segment 保证：
 *  同一段同一时刻只有一个活跃锁（released_at IS NULL 且 locked_at IS NOT NULL）。
 */

interface AdjEntry {
  segmentId: number;
  neighbor: number;
}

function buildAdjacency(db: DB, exclude: Set<number>): Map<number, AdjEntry[]> {
  const segs = db.prepare('SELECT * FROM path_segments').all() as SegmentRow[];
  const adj = new Map<number, AdjEntry[]>();
  for (const s of segs) {
    if (exclude.has(s.id)) continue;
    pushAdj(adj, s.from_node, s.to_node, s.id);
    pushAdj(adj, s.to_node, s.from_node, s.id);
  }
  return adj;
}

function pushAdj(adj: Map<number, AdjEntry[]>, a: number, b: number, segId: number): void {
  if (!adj.has(a)) adj.set(a, []);
  adj.get(a)!.push({ segmentId: segId, neighbor: b });
}

/** BFS 最短路径，返回有序段 id 列表（起→终方向）。exclude 为禁止使用的段集合。 */
export function bfs(
  db: DB,
  startId: number,
  endId: number,
  exclude: Set<number>
): number[] | null {
  if (startId === endId) return [];
  const adj = buildAdjacency(db, exclude);
  const visited = new Set<number>([startId]);
  const queue: { node: number; path: number[] }[] = [{ node: startId, path: [] }];
  while (queue.length) {
    const { node, path } = queue.shift()!;
    const neighbors = adj.get(node) ?? [];
    for (const e of neighbors) {
      if (visited.has(e.neighbor)) continue;
      visited.add(e.neighbor);
      const nextPath = [...path, e.segmentId];
      if (e.neighbor === endId) return nextPath;
      queue.push({ node: e.neighbor, path: nextPath });
    }
  }
  return null;
}

/** 当前被其它机器人活跃占用的段集合（可选排除某个机器人，默认排除全部其它机器人）。 */
export function activelyLockedSegments(db: DB, exceptRobotId: number | null = null): Set<number> {
  const rows =
    exceptRobotId === null
      ? (db
          .prepare(
            'SELECT DISTINCT segment_id FROM segment_locks WHERE released_at IS NULL AND locked_at IS NOT NULL'
          )
          .all() as { segment_id: number }[])
      : (db
          .prepare(
            'SELECT DISTINCT segment_id FROM segment_locks WHERE released_at IS NULL AND locked_at IS NOT NULL AND robot_id <> ?'
          )
          .all(exceptRobotId) as { segment_id: number }[]);
  return new Set(rows.map((r) => r.segment_id));
}

export function kitchenNodeId(db: DB): number | null {
  const row = db
    .prepare("SELECT id FROM path_nodes WHERE node_type = 'kitchen' LIMIT 1")
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}

export function tableNodeId(db: DB, tableId: string): number | null {
  const row = db
    .prepare('SELECT id FROM path_nodes WHERE label = ? AND node_type = ? LIMIT 1')
    .get(tableId, 'table') as { id: number } | undefined;
  return row?.id ?? null;
}

export interface PlanResult {
  segments: number[] | null;
  conflict: boolean;
  blockedSegmentIds: number[];
}

/**
 * 规划从厨房到目标桌位的路径，避开其它机器人当前活跃占用的段。
 * - 若存在不与任何活跃锁冲突的路径 → 返回 segments。
 * - 若所有可行路径都被占用（无法绕行）→ conflict=true，blockedSegmentIds 给出阻塞段。
 */
export function planPath(db: DB, tableId: string): PlanResult {
  const start = kitchenNodeId(db);
  const end = tableNodeId(db, tableId);
  if (start === null || end === null) {
    return { segments: null, conflict: false, blockedSegmentIds: [] };
  }
  const blocked = activelyLockedSegments(db, null);
  // 优先在不占用任何活跃锁的图上找最短路（完全无冲突）
  const freePath = bfs(db, start, end, blocked);
  if (freePath && freePath.length >= 0) {
    return { segments: freePath, conflict: false, blockedSegmentIds: [] };
  }
  // 无完全无冲突路径：检测是否存在可达路径（占用段之外无可绕行路径）
  const anyPath = bfs(db, start, end, new Set());
  if (anyPath === null) {
    // 目标不可达（无路径图连通性问题）
    return { segments: null, conflict: false, blockedSegmentIds: [] };
  }
  // 存在路径但都被活跃锁阻塞 → 无法解决
  const blockedOnPath = anyPath.filter((s) => blocked.has(s));
  return { segments: null, conflict: true, blockedSegmentIds: blockedOnPath };
}

/** 为整条规划路径写入段锁行：首段立即占用，其余待占。 */
export function acquirePath(
  db: DB,
  robotId: number,
  taskId: number,
  segments: number[]
): void {
  if (segments.length === 0) return;
  const ts = new Date().toISOString();
  const insert = db.prepare(
    'INSERT INTO segment_locks (segment_id, robot_id, task_id, sequence, locked_at, released_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const tx = db.transaction((segs: number[]) => {
    segs.forEach((segId, idx) => {
      insert.run(segId, robotId, taskId, idx + 1, idx === 0 ? ts : null, null);
    });
  });
  tx(segments);
}

/** 当前正持有的活跃锁（locked_at 非 NULL, released_at NULL）。 */
export function currentActiveLock(
  db: DB,
  robotId: number,
  taskId: number
): SegmentLockRow | null {
  const row = db
    .prepare(
      `SELECT * FROM segment_locks
       WHERE robot_id = ? AND task_id = ? AND locked_at IS NOT NULL AND released_at IS NULL
       ORDER BY sequence DESC LIMIT 1`
    )
    .get(robotId, taskId) as SegmentLockRow | undefined;
  return row ?? null;
}

/** 下一个待占段（locked_at NULL, released_at NULL），按 sequence 升序。 */
export function nextPendingLock(
  db: DB,
  robotId: number,
  taskId: number
): SegmentLockRow | null {
  const row = db
    .prepare(
      `SELECT * FROM segment_locks
       WHERE robot_id = ? AND task_id = ? AND locked_at IS NULL AND released_at IS NULL
       ORDER BY sequence ASC LIMIT 1`
    )
    .get(robotId, taskId) as SegmentLockRow | undefined;
  return row ?? null;
}

export interface AdvanceResult {
  advanced: boolean;
  blocked: boolean;
  blockedSegmentId: number | null;
  blockedByRobotId: number | null;
  atDestination: boolean;
}

/**
 * 推进机器人一格：先激活下一段锁，成功后释放当前段锁（hold-and-wait）。
 * 下一段被其它机器人占用时阻塞等待（返回 blocked=true，不改变状态）。
 */
export function advanceRobot(db: DB, robotId: number, taskId: number): AdvanceResult {
  const result: AdvanceResult = {
    advanced: false,
    blocked: false,
    blockedSegmentId: null,
    blockedByRobotId: null,
    atDestination: false,
  };
  const current = currentActiveLock(db, robotId, taskId);
  if (!current) {
    result.atDestination = true;
    return result;
  }
  const next = nextPendingLock(db, robotId, taskId);
  if (!next) {
    result.atDestination = true;
    return result;
  }
  const ts = new Date().toISOString();
  const activate = db.prepare(
    'UPDATE segment_locks SET locked_at = ? WHERE id = ? AND locked_at IS NULL AND released_at IS NULL'
  );
  const release = db.prepare(
    'UPDATE segment_locks SET released_at = ? WHERE id = ? AND released_at IS NULL'
  );
  const tx = db.transaction(() => {
    const info = activate.run(ts, next.id);
    if (info.changes === 0) {
      // 该段被其它机器人活跃占用 → partial unique index 阻止了激活
      result.blocked = true;
      result.blockedSegmentId = next.segment_id;
      const holder = db
        .prepare(
          'SELECT robot_id FROM segment_locks WHERE segment_id = ? AND released_at IS NULL AND locked_at IS NOT NULL LIMIT 1'
        )
        .get(next.segment_id) as { robot_id: number } | undefined;
      result.blockedByRobotId = holder?.robot_id ?? null;
      return;
    }
    release.run(ts, current.id);
    result.advanced = true;
  });
  tx();
  return result;
}

/** 释放该机器人该任务所有未释放锁（到达/取消时调用）。 */
export function releaseAllLocks(db: DB, robotId: number, taskId: number): void {
  const ts = new Date().toISOString();
  db.prepare(
    'UPDATE segment_locks SET released_at = ? WHERE robot_id = ? AND task_id = ? AND released_at IS NULL'
  ).run(ts, robotId, taskId);
}

/** 路径进度：总段数 = 该任务规划段数；已通过段数 = 已释放段数。 */
export function pathProgress(db: DB, taskId: number): {
  totalSegments: number;
  completedSegments: number;
} {
  const total = (
    db
      .prepare('SELECT COUNT(*) AS c FROM segment_locks WHERE task_id = ?')
      .get(taskId) as { c: number }
  ).c;
  const completed = (
    db
      .prepare('SELECT COUNT(*) AS c FROM segment_locks WHERE task_id = ? AND released_at IS NOT NULL')
      .get(taskId) as { c: number }
  ).c;
  return { totalSegments: total, completedSegments: completed };
}

/** 当前所有冲突（某段被多于一个机器人... 实际上 partial unique index 保证至多一个活跃锁；
 *  这里返回被阻塞的机器人：即有 pending 但无法激活的等待者）。 */
export function checkConflicts(db: DB): { robotId: number; segmentId: number; holderRobotId: number }[] {
  const pending = db
    .prepare(
      `SELECT sl.robot_id, sl.segment_id FROM segment_locks sl
       WHERE sl.locked_at IS NULL AND sl.released_at IS NULL`
    )
    .all() as { robot_id: number; segment_id: number }[];
  const out: { robotId: number; segmentId: number; holderRobotId: number }[] = [];
  for (const p of pending) {
    const holder = db
      .prepare(
        'SELECT robot_id FROM segment_locks WHERE segment_id = ? AND released_at IS NULL AND locked_at IS NOT NULL LIMIT 1'
      )
      .get(p.segment_id) as { robot_id: number } | undefined;
    if (holder) {
      out.push({ robotId: p.robot_id, segmentId: p.segment_id, holderRobotId: holder.robot_id });
    }
  }
  return out;
}
