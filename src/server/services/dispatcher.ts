import { db } from '../db.js';
import { emit } from '../events.js';
import type { RobotRow, TaskRow } from '../types.js';
import {
  planPath,
  acquirePath,
  advanceRobot,
  type AdvanceResult,
} from './path-service.js';
import { createAlert } from './alert-service.js';

/**
 * 后台调度器。
 *
 * 职责（1 秒轮询）：
 *  1. 运行推进：对所有 delivering 机器人尝试推进一格（渐进式段锁），检测前方段占用。
 *  2. 自动分配：对所有 idle 机器人，按 FIFO 取 pending 任务，规划无冲突路径并分配。
 *
 * 通过 triggerDispatch() 可在外部事件（任务创建、机器人置空闲、到达、取消）后立即触发一次。
 */

let timer: NodeJS.Timeout | null = null;
let running = false;
const blockedSince = new Map<number, number>(); // robotId -> 连续阻塞起始时间戳(ms)
const BLOCK_TIMEOUT_MS = 60_000; // 连续阻塞超过 60s 视为无法解决

/** 立即触发一次调度循环（非阻塞）。 */
export function triggerDispatch(): void {
  if (running) return;
  void dispatchOnce();
}

/** 启动后台轮询（1 秒间隔）。 */
export function startDispatcher(intervalMs = 1000): void {
  if (timer) return;
  timer = setInterval(() => {
    void dispatchOnce();
  }, intervalMs);
  timer.unref?.();
}

export function stopDispatcher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** 单次调度循环。 */
export async function dispatchOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    runMovementTick();
    runAssignmentTick();
  } finally {
    running = false;
  }
}

function runMovementTick(): void {
  const deliveringRobots = db
    .prepare(
      `SELECT r.* FROM robots r
       WHERE r.status = 'delivering' AND r.current_task_id IS NOT NULL
       ORDER BY r.id ASC`
    )
    .all() as RobotRow[];

  for (const robot of deliveringRobots) {
    if (!robot.current_task_id) continue;
    const res: AdvanceResult = advanceRobot(db, robot.id, robot.current_task_id);
    if (res.advanced) {
      blockedSince.delete(robot.id);
      // 推进成功无需事件；进度通过 monitor/queue 读回
    } else if (res.blocked) {
      // 前方段被占用 → 发布 path.conflict
      emit('path.conflict', {
        robotIds: [robot.id, res.blockedByRobotId],
        segmentId: res.blockedSegmentId,
      });
      const now = Date.now();
      if (!blockedSince.has(robot.id)) blockedSince.set(robot.id, now);
      else if (now - (blockedSince.get(robot.id) ?? now) > BLOCK_TIMEOUT_MS) {
        // 持续阻塞无法解决 → 生成告警
        createAlert(
          'path_conflict_unresolved',
          `机器人 ${robot.id} 在段 ${res.blockedSegmentId} 持续阻塞超过阈值，路径冲突无法解决`,
          robot.id
        );
        blockedSince.delete(robot.id);
      }
    }
    // atDestination: 等待外部 arrive 调用，无事可做
  }
}

function runAssignmentTick(): void {
  const idleRobots = db
    .prepare("SELECT * FROM robots WHERE status = 'idle' ORDER BY id ASC")
    .all() as RobotRow[];
  if (idleRobots.length === 0) return;

  for (const robot of idleRobots) {
    // FIFO：取最早创建的 pending 任务
    const task = db
      .prepare(
        "SELECT * FROM delivery_tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
      )
      .get() as TaskRow | undefined;
    if (!task) break;

    const plan = planPath(db, task.table_id);
    if (plan.conflict) {
      // 路径冲突无法解决 → 生成告警，任务保留 pending
      const segs = plan.blockedSegmentIds.join(',') || 'unknown';
      createAlert(
        'path_conflict_unresolved',
        `任务 ${task.id}(桌位 ${task.table_id}) 无法规划无冲突路径，阻塞段: ${segs}`,
        null
      );
      // 该任务无法分配，FIFO 下停止本轮分配（避免后续任务插队）
      break;
    }
    if (!plan.segments || plan.segments.length === 0) {
      // 目标桌位在路径图中不存在或已在目标位置 → 任务保留 pending
      continue;
    }

    // 分配：占用路径 + 更新任务与机器人状态
    const ts = new Date().toISOString();
    const tx = db.transaction(() => {
      acquirePath(db, robot.id, task.id, plan.segments!);
      db.prepare(
        'UPDATE delivery_tasks SET status = ?, robot_id = ?, assigned_at = ? WHERE id = ?'
      ).run('delivering', robot.id, ts, task.id);
      db.prepare(
        'UPDATE robots SET status = ?, current_task_id = ? WHERE id = ?'
      ).run('delivering', task.id, robot.id);
    });
    tx();

    emit('task.assigned', { taskId: task.id, robotId: robot.id });
    emit('robot.status_changed', { robotId: robot.id, status: 'delivering' });
  }
}
