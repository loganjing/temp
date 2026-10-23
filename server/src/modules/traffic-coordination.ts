import type { AppContext } from '../context';
import type { TrafficConflict, ConflictType, ConflictStatus, YieldStrategy } from '../../../shared/types';

interface ConflictRow {
  id: number;
  conflict_type: string;
  resource_ids: string;
  location_code: string;
  detected_at: string;
  resolved_at: string | null;
  strategy: string | null;
  status: string;
}

interface ActiveRouteInfo {
  taskId: number;
  resourceId: number;
  nodes: Array<{ code: string; x: number; y: number; order: number }>;
}

/**
 * Traffic coordination service — conflict detection (node/oncoming/tailgating),
 * avoidance scheduling (priority yield + first-arrive + detour), and deadlock
 * detection/resolution.
 */
export class TrafficCoordinationService {
  constructor(private ctx: AppContext) {}

  /** Returns active or resolved conflicts, optionally filtered by status. */
  getConflicts(status?: string): TrafficConflict[] {
    const filterStatus = status || 'active';
    const rows = this.ctx.db.prepare(`
      SELECT id, conflict_type, resource_ids, location_code, detected_at, resolved_at, strategy, status
      FROM traffic_conflicts
      WHERE status = ?
      ORDER BY detected_at DESC
    `).all(filterStatus) as ConflictRow[];

    return rows.map((r) => this.serializeConflict(r));
  }

  /**
   * Detects conflicts among all active routes and records new conflicts.
   * Also resolves conflicts that no longer apply.
   * Called on path planning completion and device position reports.
   */
  detectAndResolveConflicts(): void {
    const activeRoutes = this.getActiveRoutes();
    if (activeRoutes.length < 2) {
      // No multi-device conflicts possible; resolve all active conflicts
      this.resolveAllConflicts();
      return;
    }

    const detected = new Set<string>(); // conflict keys to avoid duplicates
    const newConflicts: Array<{
      type: ConflictType;
      resourceIds: number[];
      locationCode: string;
    }> = [];

    for (let i = 0; i < activeRoutes.length; i++) {
      for (let j = i + 1; j < activeRoutes.length; j++) {
        const r1 = activeRoutes[i];
        const r2 = activeRoutes[j];
        const conflicts = this.detectPairConflicts(r1, r2);
        for (const c of conflicts) {
          const key = `${c.type}:${c.resourceIds.sort().join(',')}:${c.locationCode}`;
          if (!detected.has(key)) {
            detected.add(key);
            newConflicts.push(c);
          }
        }
      }
    }

    // Record new conflicts that don't already exist as active
    for (const c of newConflicts) {
      const existing = this.findActiveConflict(c.type, c.resourceIds, c.locationCode);
      if (!existing) {
        this.recordConflict(c.type, c.resourceIds, c.locationCode);
      }
    }

    // Resolve conflicts whose resources are no longer conflicting
    this.resolveStaleConflicts(activeRoutes);
  }

  /**
   * Detects potential deadlocks and resolves by ordering one device to detour.
   * Called by the background 5-second safety loop.
   */
  detectAndResolveDeadlock(): void {
    const activeRoutes = this.getActiveRoutes();
    if (activeRoutes.length < 2) return;

    // Build a wait graph: resource A waits for resource B if A's next node
    // is occupied by B's current position and B's next node leads toward A.
    // A cycle in this graph indicates deadlock.
    const activeConflicts = this.ctx.db.prepare(`
      SELECT id, conflict_type, resource_ids, location_code, strategy, status
      FROM traffic_conflicts WHERE status = 'active'
    `).all() as ConflictRow[];

    // Simple deadlock detection: check if there's a cycle in the conflict graph
    // where all involved devices are paused (have yield_paused events without yield_resumed)
    const pausedDevices = new Set<number>();
    for (const route of activeRoutes) {
      const lastEvent = this.ctx.db.prepare(`
        SELECT event_type FROM execution_events
        WHERE resource_id = ? AND task_id = ?
        ORDER BY occurred_at DESC LIMIT 1
      `).get(route.resourceId, route.taskId) as { event_type: string } | undefined;

      if (lastEvent?.event_type === 'yield_paused') {
        pausedDevices.add(route.resourceId);
      }
    }

    // If all active conflicts involve only paused devices, it's a potential deadlock
    if (pausedDevices.size >= 2) {
      for (const conflict of activeConflicts) {
        const resourceIds = JSON.parse(conflict.resource_ids) as number[];
        if (resourceIds.every((id) => pausedDevices.has(id))) {
          // Resolve deadlock: pick the device with the lowest-priority task to detour
          this.resolveDeadlockConflict(conflict.id, resourceIds, conflict.location_code);
        }
      }
    }
  }

  // --- Private helpers ---

  private getActiveRoutes(): ActiveRouteInfo[] {
    const rows = this.ctx.db.prepare(`
      SELECT r.task_id, r.resource_id, r.nodes
      FROM routes r
      JOIN transport_tasks t ON t.id = r.task_id
      WHERE r.is_active = 1 AND t.status = 'in_transit'
    `).all() as Array<{ task_id: number; resource_id: number; nodes: string }>;

    return rows.map((r) => ({
      taskId: r.task_id,
      resourceId: r.resource_id,
      nodes: JSON.parse(r.nodes) as ActiveRouteInfo['nodes'],
    }));
  }

  private detectPairConflicts(r1: ActiveRouteInfo, r2: ActiveRouteInfo): Array<{
    type: ConflictType;
    resourceIds: number[];
    locationCode: string;
  }> {
    const conflicts: Array<{ type: ConflictType; resourceIds: number[]; locationCode: string }> = [];

    // Get device current positions
    const pos1 = this.ctx.device.getCurrentLocation(r1.resourceId);
    const pos2 = this.ctx.device.getCurrentLocation(r2.resourceId);

    // Node conflict: both routes share a common node that both devices will reach
    const nodes1 = new Set(r1.nodes.map((n) => n.code));
    const nodes2 = new Set(r2.nodes.map((n) => n.code));
    for (const node of nodes1) {
      if (nodes2.has(node)) {
        conflicts.push({
          type: 'node',
          resourceIds: [r1.resourceId, r2.resourceId],
          locationCode: node,
        });
      }
    }

    // Oncoming conflict: devices are on adjacent nodes heading toward each other
    if (pos1 && pos2) {
      const idx1 = r1.nodes.findIndex((n) => n.code === pos1);
      const idx2 = r2.nodes.findIndex((n) => n.code === pos2);
      if (idx1 >= 0 && idx2 >= 0) {
        // Check if r1's next node is r2's current node and vice versa
        const next1 = idx1 < r1.nodes.length - 1 ? r1.nodes[idx1 + 1].code : null;
        const next2 = idx2 < r2.nodes.length - 1 ? r2.nodes[idx2 + 1].code : null;
        if (next1 === pos2 && next2 === pos1) {
          conflicts.push({
            type: 'oncoming',
            resourceIds: [r1.resourceId, r2.resourceId],
            locationCode: pos1,
          });
        }
      }
    }

    // Tailgating conflict: both on same edge, same direction, too close
    if (pos1 && pos2) {
      const idx1 = r1.nodes.findIndex((n) => n.code === pos1);
      const idx2 = r2.nodes.findIndex((n) => n.code === pos2);
      if (idx1 >= 0 && idx2 >= 0) {
        // Check if they're on adjacent nodes of the same route segment
        const seg1 = idx1 < r1.nodes.length - 1 ? `${pos1}->${r1.nodes[idx1 + 1].code}` : null;
        const seg2 = idx2 < r2.nodes.length - 1 ? `${pos2}->${r2.nodes[idx2 + 1].code}` : null;
        if (seg1 && seg2 && seg1 === seg2 && Math.abs(idx1 - idx2) <= 1) {
          conflicts.push({
            type: 'tailgating',
            resourceIds: [r1.resourceId, r2.resourceId],
            locationCode: pos1,
          });
        }
      }
    }

    return conflicts;
  }

  private recordConflict(type: ConflictType, resourceIds: number[], locationCode: string): void {
    const now = new Date().toISOString();
    const result = this.ctx.db.prepare(`
      INSERT INTO traffic_conflicts (conflict_type, resource_ids, location_code, detected_at, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(type, JSON.stringify(resourceIds), locationCode, now) as { lastInsertRowid: number };

    const conflictId = Number(result.lastInsertRowid);

    // Determine and apply yield strategy
    const strategy = this.determineStrategy(resourceIds);
    this.ctx.db.prepare('UPDATE traffic_conflicts SET strategy = ? WHERE id = ?')
      .run(strategy, conflictId);

    this.applyYieldStrategy(conflictId, strategy, resourceIds, locationCode);

    // Push traffic_alert WS message
    this.ctx.events.pushTrafficAlert(conflictId, type, resourceIds, locationCode);
  }

  private determineStrategy(resourceIds: number[]): YieldStrategy {
    // Get task priorities for each resource
    const priorities: Array<{ resourceId: number; priority: string }> = [];
    for (const resId of resourceIds) {
      const task = this.ctx.db.prepare(`
        SELECT id, priority FROM transport_tasks
        WHERE assigned_resource_id = ? AND status IN ('assigned', 'in_transit')
        LIMIT 1
      `).get(resId) as { id: number; priority: string } | undefined;
      if (task) {
        priorities.push({ resourceId: resId, priority: task.priority });
      }
    }

    // If priorities differ, lower priority yields
    const priorityOrder: Record<string, number> = { normal: 0, urgent: 1, highest: 2 };
    const uniquePriorities = new Set(priorities.map((p) => p.priority));
    if (uniquePriorities.size > 1) {
      return 'priority_yield';
    }

    // Same priority → first arrive first go
    return 'first_arrive';
  }

  private applyYieldStrategy(conflictId: number, strategy: YieldStrategy, resourceIds: number[], locationCode: string): void {
    if (strategy === 'priority_yield') {
      // Lower priority device pauses
      const priorities: Array<{ resourceId: number; priority: number }> = [];
      for (const resId of resourceIds) {
        const task = this.ctx.db.prepare(`
          SELECT id, priority FROM transport_tasks
          WHERE assigned_resource_id = ? AND status IN ('assigned', 'in_transit')
          LIMIT 1
        `).get(resId) as { id: number; priority: string } | undefined;
        const order = task ? { normal: 0, urgent: 1, highest: 2 }[task.priority] ?? 0 : 0;
        priorities.push({ resourceId: resId, priority: order });
      }
      // The device with lowest priority pauses
      priorities.sort((a, b) => a.priority - b.priority);
      const yieldDevice = priorities[0].resourceId;
      this.pauseDevice(yieldDevice, locationCode, conflictId);
    } else if (strategy === 'first_arrive') {
      // The device that arrived later pauses
      const times: Array<{ resourceId: number; lastPositionAt: string }> = [];
      for (const resId of resourceIds) {
        const row = this.ctx.db.prepare(
          'SELECT last_position_at FROM transport_resources WHERE id = ?'
        ).get(resId) as { last_position_at: string | null } | undefined;
        times.push({ resourceId: resId, lastPositionAt: row?.last_position_at || '' });
      }
      times.sort((a, b) => b.lastPositionAt.localeCompare(a.lastPositionAt));
      const yieldDevice = times[0].resourceId;
      this.pauseDevice(yieldDevice, locationCode, conflictId);
    }
  }

  private pauseDevice(resourceId: number, locationCode: string, conflictId: number): void {
    // Find active task for this resource
    const task = this.ctx.db.prepare(`
      SELECT id FROM transport_tasks
      WHERE assigned_resource_id = ? AND status = 'in_transit'
      LIMIT 1
    `).get(resourceId) as { id: number } | undefined;
    if (task) {
      this.ctx.events.recordEvent({
        taskId: task.id,
        resourceId,
        eventType: 'yield_paused',
        description: `Device paused for traffic avoidance at ${locationCode}`,
        metadata: { conflictId: String(conflictId), locationCode },
      });
    }
  }

  private resolveDeadlockConflict(conflictId: number, resourceIds: number[], locationCode: string): void {
    // Pick the lowest priority device to detour
    const priorities: Array<{ resourceId: number; priority: number }> = [];
    for (const resId of resourceIds) {
      const task = this.ctx.db.prepare(`
        SELECT id, priority FROM transport_tasks
        WHERE assigned_resource_id = ? AND status IN ('assigned', 'in_transit')
        LIMIT 1
      `).get(resId) as { id: number; priority: string } | undefined;
      const order = task ? { normal: 0, urgent: 1, highest: 2 }[task.priority] ?? 0 : 0;
      priorities.push({ resourceId: resId, priority: order });
    }
    priorities.sort((a, b) => a.priority - b.priority);
    const detourDevice = priorities[0].resourceId;

    // Record detour strategy
    this.ctx.db.prepare('UPDATE traffic_conflicts SET strategy = ? WHERE id = ?')
      .run('detour', conflictId);

    // Find active task and trigger replan
    const task = this.ctx.db.prepare(`
      SELECT id FROM transport_tasks
      WHERE assigned_resource_id = ? AND status = 'in_transit'
      LIMIT 1
    `).get(detourDevice) as { id: number } | undefined;

    if (task) {
      this.ctx.events.recordEvent({
        taskId: task.id,
        resourceId: detourDevice,
        eventType: 'yield_paused',
        description: `Deadlock detected — device rerouted to detour`,
        metadata: { conflictId: String(conflictId), locationCode, deadlockResolution: true },
      });

      // Attempt replan to avoid blocked node
      this.ctx.path.replanRoute(task.id, [locationCode], 'deadlock_avoidance');
    }

    // Resolve the conflict
    this.resolveConflict(conflictId);
  }

  private findActiveConflict(type: string, resourceIds: number[], locationCode: string): ConflictRow | null {
    const rows = this.ctx.db.prepare(`
      SELECT id, conflict_type, resource_ids, location_code, detected_at, resolved_at, strategy, status
      FROM traffic_conflicts WHERE status = 'active' AND conflict_type = ? AND location_code = ?
    `).all(type, locationCode) as ConflictRow[];

    for (const row of rows) {
      const existing = JSON.parse(row.resource_ids) as number[];
      if (existing.length === resourceIds.length &&
          existing.every((id) => resourceIds.includes(id))) {
        return row;
      }
    }
    return null;
  }

  private resolveAllConflicts(): void {
    const now = new Date().toISOString();
    this.ctx.db.prepare(`
      UPDATE traffic_conflicts SET status = 'resolved', resolved_at = ? WHERE status = 'active'
    `).run(now);
  }

  private resolveStaleConflicts(activeRoutes: ActiveRouteInfo[]): void {
    // Get all active conflicts
    const conflicts = this.ctx.db.prepare(`
      SELECT id, conflict_type, resource_ids, location_code
      FROM traffic_conflicts WHERE status = 'active'
    `).all() as Array<{ id: number; conflict_type: string; resource_ids: string; location_code: string }>;

    const activeResourceIds = new Set(activeRoutes.map((r) => r.resourceId));

    for (const conflict of conflicts) {
      const resourceIds = JSON.parse(conflict.resource_ids) as number[];
      // If any involved device no longer has an active route, resolve the conflict
      if (!resourceIds.every((id) => activeResourceIds.has(id))) {
        this.resolveConflict(conflict.id);
      }
    }
  }

  private resolveConflict(conflictId: number): void {
    const now = new Date().toISOString();
    this.ctx.db.prepare(`
      UPDATE traffic_conflicts SET status = 'resolved', resolved_at = ? WHERE id = ?
    `).run(now, conflictId);

    // Record yield_resumed for affected devices
    const conflict = this.ctx.db.prepare(
      'SELECT resource_ids, location_code FROM traffic_conflicts WHERE id = ?'
    ).get(conflictId) as { resource_ids: string; location_code: string } | undefined;

    if (conflict) {
      const resourceIds = JSON.parse(conflict.resource_ids) as number[];
      for (const resId of resourceIds) {
        const task = this.ctx.db.prepare(`
          SELECT id FROM transport_tasks
          WHERE assigned_resource_id = ? AND status = 'in_transit'
          LIMIT 1
        `).get(resId) as { id: number } | undefined;
        if (task) {
          this.ctx.events.recordEvent({
            taskId: task.id,
            resourceId: resId,
            eventType: 'yield_resumed',
            description: `Device resumed after traffic conflict resolved at ${conflict.location_code}`,
            metadata: { conflictId: String(conflictId) },
          });
        }
      }
    }
  }

  private serializeConflict(r: ConflictRow): TrafficConflict {
    return {
      conflictId: String(r.id),
      conflictType: r.conflict_type as ConflictType,
      resourceIds: (JSON.parse(r.resource_ids) as number[]).map(String),
      locationCode: r.location_code,
      detectedAt: r.detected_at,
      resolvedAt: r.resolved_at ?? null,
      strategy: (r.strategy as YieldStrategy) ?? null,
      status: r.status as ConflictStatus,
    };
  }
}
