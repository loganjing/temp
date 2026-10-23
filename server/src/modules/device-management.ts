import type { AppContext } from '../context';
import type { DeviceStatus, DeviceType, Resource, ResourceDetail } from '../../../shared/types';

interface ResourceRow {
  id: number;
  name: string;
  type: string;
  status: string;
  current_location_code: string | null;
  last_position_at: string | null;
}

/**
 * Device management service — CRUD, status updates, and position reporting.
 * Position reports trigger traffic conflict reevaluation and event recording.
 */
export class DeviceManagementService {
  constructor(private ctx: AppContext) {}

  /** Returns all resources, optionally filtered by status. */
  getResources(status?: string): Resource[] {
    let sql = 'SELECT id, name, type, status, current_location_code, last_position_at FROM transport_resources';
    const params: string[] = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY id';
    const rows = this.ctx.db.prepare(sql).all(...params) as ResourceRow[];
    return rows.map((r) => this.serializeResource(r));
  }

  /** Returns a single resource by ID (with current task ID). */
  getResourceById(id: number): ResourceDetail | null {
    const row = this.ctx.db.prepare(
      'SELECT id, name, type, status, current_location_code, last_position_at FROM transport_resources WHERE id = ?'
    ).get(id) as ResourceRow | undefined;
    if (!row) return null;

    // Look up the current active task for this resource
    const task = this.ctx.db.prepare(
      `SELECT id FROM transport_tasks
       WHERE assigned_resource_id = ? AND status IN ('assigned', 'in_transit')
       LIMIT 1`
    ).get(id) as { id: number } | undefined;

    return {
      ...this.serializeResource(row),
      currentTaskId: task ? String(task.id) : null,
    };
  }

  /** Creates a new transport resource. Throws on invalid location. */
  createResource(params: {
    name: string;
    type: DeviceType;
    initialLocationCode: string;
  }): Resource {
    if (!params.name?.trim()) {
      throw new BusinessError('VALIDATION_ERROR', 'Device name is required', 400);
    }
    if (!this.ctx.map.locationExists(params.initialLocationCode)) {
      throw new BusinessError('VALIDATION_ERROR', `Location ${params.initialLocationCode} does not exist`, 400);
    }

    const now = new Date().toISOString();
    const result = this.ctx.db.prepare(`
      INSERT INTO transport_resources (name, type, status, current_location_code, last_position_at)
      VALUES (?, ?, 'idle', ?, ?)
    `).run(params.name, params.type, params.initialLocationCode, now) as { lastInsertRowid: number };

    return this.serializeResource({
      id: Number(result.lastInsertRowid),
      name: params.name,
      type: params.type,
      status: 'idle',
      current_location_code: params.initialLocationCode,
      last_position_at: now,
    });
  }

  /** Updates device status and pushes WS message. */
  updateStatus(resourceId: number, newStatus: DeviceStatus): Resource {
    const row = this.ctx.db.prepare(
      'SELECT id, name, type, status, current_location_code, last_position_at FROM transport_resources WHERE id = ?'
    ).get(resourceId) as ResourceRow | undefined;
    if (!row) {
      throw new BusinessError('NOT_FOUND', `Resource ${resourceId} not found`, 404);
    }

    const oldStatus = row.status as DeviceStatus;

    if (oldStatus !== newStatus) {
      this.ctx.db.prepare('UPDATE transport_resources SET status = ? WHERE id = ?')
        .run(newStatus, resourceId);

      this.ctx.events.pushDeviceStatusChange(resourceId, oldStatus, newStatus);

      // When a device transitions to fault, mark any active task as error
      if (newStatus === 'fault') {
        const activeTask = this.ctx.db.prepare(
          `SELECT id FROM transport_tasks
           WHERE assigned_resource_id = ? AND status IN ('assigned', 'in_transit')
           LIMIT 1`
        ).get(resourceId) as { id: number } | undefined;

        if (activeTask) {
          this.ctx.task.markTaskError(activeTask.id, `Device ${row.name} transitioned to fault status`);
        }
      }
    }

    return this.serializeResource({ ...row, status: newStatus });
  }

  /**
   * Handles device position reports.
   * Side effects: updates location, triggers conflict reevaluation,
   * records position_update event (only on location change),
   * pushes device_position_update WS message.
   */
  reportPosition(resourceId: number, locationCode: string): {
    acknowledged: boolean;
    routeProgress: { currentIndex: number; totalNodes: number; remainingDistance: number; estimatedRemainingTime: number } | null;
  } {
    const row = this.ctx.db.prepare(
      'SELECT id, name, type, status, current_location_code, last_position_at FROM transport_resources WHERE id = ?'
    ).get(resourceId) as ResourceRow | undefined;
    if (!row) {
      throw new BusinessError('NOT_FOUND', `Resource ${resourceId} not found`, 404);
    }

    if (!this.ctx.map.locationExists(locationCode)) {
      throw new BusinessError('VALIDATION_ERROR', `Location ${locationCode} does not exist`, 400);
    }

    const now = new Date().toISOString();
    const locationChanged = row.current_location_code !== locationCode;

    // Update device position
    this.ctx.db.prepare(`
      UPDATE transport_resources SET current_location_code = ?, last_position_at = ? WHERE id = ?
    `).run(locationCode, now, resourceId);

    // Push position update WS message
    this.ctx.events.pushDevicePositionUpdate(resourceId, locationCode);

    // Record position_update event only when location changes
    if (locationChanged) {
      // Find active task for this resource
      const activeTask = this.ctx.db.prepare(
        `SELECT id FROM transport_tasks WHERE assigned_resource_id = ? AND status = 'in_transit' LIMIT 1`
      ).get(resourceId) as { id: number } | undefined;

      if (activeTask) {
        this.ctx.events.recordEvent({
          taskId: activeTask.id,
          resourceId,
          eventType: 'position_update',
          description: `Device ${row.name} arrived at ${locationCode}`,
          metadata: { locationCode, previousLocation: row.current_location_code },
        });
      }
    }

    // Trigger traffic conflict reevaluation
    this.ctx.traffic.detectAndResolveConflicts();

    // Compute route progress if there is an active route
    let routeProgress: { currentIndex: number; totalNodes: number; remainingDistance: number; estimatedRemainingTime: number } | null = null;

    const activeRoute = this.ctx.db.prepare(`
      SELECT r.id, r.nodes, r.planned_distance, r.planned_duration
      FROM routes r
      JOIN transport_tasks t ON t.id = r.task_id
      WHERE r.resource_id = ? AND r.is_active = 1 AND t.status = 'in_transit'
      LIMIT 1
    `).get(resourceId) as { id: number; nodes: string; planned_distance: number; planned_duration: number } | undefined;

    if (activeRoute) {
      const nodes = JSON.parse(activeRoute.nodes) as Array<{ code: string; x: number; y: number; order: number }>;
      const currentIndex = nodes.findIndex((n) => n.code === locationCode);
      if (currentIndex >= 0) {
        // Calculate remaining distance from current node to end
        let remainingDistance = 0;
        for (let i = currentIndex; i < nodes.length - 1; i++) {
          const dx = nodes[i + 1].x - nodes[i].x;
          const dy = nodes[i + 1].y - nodes[i].y;
          remainingDistance += Math.sqrt(dx * dx + dy * dy);
        }
        const totalDistance = activeRoute.planned_distance || 1;
        const remainingRatio = remainingDistance / totalDistance;
        routeProgress = {
          currentIndex,
          totalNodes: nodes.length,
          remainingDistance,
          estimatedRemainingTime: activeRoute.planned_duration * remainingRatio,
        };

        // Check if device reached the target (last node)
        if (currentIndex === nodes.length - 1) {
          const activeTask = this.ctx.db.prepare(
            `SELECT id FROM transport_tasks WHERE assigned_resource_id = ? AND status = 'in_transit' LIMIT 1`
          ).get(resourceId) as { id: number } | undefined;
          if (activeTask) {
            this.ctx.events.recordEvent({
              taskId: activeTask.id,
              resourceId,
              eventType: 'target_arrived',
              description: `Device arrived at target location ${locationCode}`,
            });
          }
        }
      }
    }

    return { acknowledged: true, routeProgress };
  }

  /** Checks whether a device is currently assigned to any active task. */
  hasActiveTask(resourceId: number): boolean {
    const row = this.ctx.db.prepare(
      `SELECT 1 FROM transport_tasks WHERE assigned_resource_id = ? AND status IN ('pending', 'assigned', 'in_transit') LIMIT 1`
    ).get(resourceId);
    return !!row;
  }

  /** Returns the current location code of a device. */
  getCurrentLocation(resourceId: number): string | null {
    const row = this.ctx.db.prepare(
      'SELECT current_location_code FROM transport_resources WHERE id = ?'
    ).get(resourceId) as { current_location_code: string | null } | undefined;
    return row?.current_location_code ?? null;
  }

  private serializeResource(r: ResourceRow): Resource {
    return {
      resourceId: String(r.id),
      name: r.name,
      type: r.type as DeviceType,
      status: r.status as DeviceStatus,
      currentLocationCode: r.current_location_code ?? null,
      lastPositionAt: r.last_position_at ?? null,
    };
  }
}

/** Business error with HTTP status code. */
export class BusinessError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
  }
}
