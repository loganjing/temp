import type { AppContext } from '../context';
import type { Task, TaskDetail, TaskStatus, Priority, AssignmentMethod } from '../../../shared/types';
import { BusinessError } from './device-management';

interface TaskRow {
  id: number;
  source_location_code: string;
  target_location_code: string;
  cargo_name: string;
  cargo_quantity: number;
  priority: string;
  status: string;
  created_by: string;
  created_at: string;
  remark: string | null;
  assigned_resource_id: number | null;
  assigned_at: string | null;
  assignment_method: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
}

const PRIORITY_ORDER: Record<string, number> = { highest: 3, urgent: 2, normal: 1 };
const TERMINAL_STATES: Set<string> = new Set(['completed', 'cancelled']);

/**
 * Task management service — CRUD, auto/manual assignment, cancellation,
 * completion, and anomaly recovery. Orchestrates path planning, device
 * management, and execution monitoring.
 */
export class TaskManagementService {
  constructor(private ctx: AppContext) {}

  // --- CRUD ---

  /** Creates a new transport task. Validates locations and priority. */
  createTask(params: {
    sourceLocationCode: string;
    targetLocationCode: string;
    cargoName: string;
    cargoQuantity: number;
    priority: Priority;
    remark?: string;
    createdBy: string;
    autoAssign?: boolean;
  }): Task {
    // Validation
    if (params.sourceLocationCode === params.targetLocationCode) {
      throw new BusinessError('VALIDATION_ERROR', 'Source and target locations must be different', 400);
    }
    if (!this.ctx.map.locationExists(params.sourceLocationCode)) {
      throw new BusinessError('VALIDATION_ERROR', `Source location ${params.sourceLocationCode} does not exist`, 400);
    }
    if (!this.ctx.map.locationExists(params.targetLocationCode)) {
      throw new BusinessError('VALIDATION_ERROR', `Target location ${params.targetLocationCode} does not exist`, 400);
    }
    if (params.cargoQuantity <= 0) {
      throw new BusinessError('VALIDATION_ERROR', 'Cargo quantity must be a positive integer', 400);
    }
    if (!['normal', 'urgent', 'highest'].includes(params.priority)) {
      throw new BusinessError('VALIDATION_ERROR', `Invalid priority: ${params.priority}`, 400);
    }
    if (!params.cargoName?.trim()) {
      throw new BusinessError('VALIDATION_ERROR', 'Cargo name is required', 400);
    }
    if (!params.createdBy?.trim()) {
      throw new BusinessError('VALIDATION_ERROR', 'createdBy is required', 400);
    }

    const now = new Date().toISOString();
    const result = this.ctx.db.prepare(`
      INSERT INTO transport_tasks
        (source_location_code, target_location_code, cargo_name, cargo_quantity, priority, status, created_by, created_at, remark)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      params.sourceLocationCode,
      params.targetLocationCode,
      params.cargoName,
      params.cargoQuantity,
      params.priority,
      params.createdBy,
      now,
      params.remark ?? null
    ) as { lastInsertRowid: number };

    const taskId = Number(result.lastInsertRowid);

    // Auto-assign if requested
    if (params.autoAssign) {
      this.tryAutoAssign();
    }

    return this.serializeTask(this.getTaskByIdInternal(taskId)!);
  }

  /** Returns a paginated, filtered task list. */
  getTasks(params: {
    status?: string;
    priority?: string;
    resourceId?: number;
    page?: number;
    pageSize?: number;
  }): { tasks: Task[]; total: number; page: number; pageSize: number } {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, params.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const sqlParams: (string | number)[] = [];

    if (params.status) {
      conditions.push('status = ?');
      sqlParams.push(params.status);
    }
    if (params.priority) {
      conditions.push('priority = ?');
      sqlParams.push(params.priority);
    }
    if (params.resourceId) {
      conditions.push('assigned_resource_id = ?');
      sqlParams.push(params.resourceId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = (this.ctx.db.prepare(
      `SELECT COUNT(*) as c FROM transport_tasks ${whereClause}`
    ).get(...sqlParams) as { c: number }).c;

    const rows = this.ctx.db.prepare(`
      SELECT * FROM transport_tasks ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...sqlParams, pageSize, offset) as TaskRow[];

    return {
      tasks: rows.map((r) => this.serializeTask(r)),
      total,
      page,
      pageSize,
    };
  }

  /** Returns task detail with current route and recent events. */
  getTaskDetail(taskId: number): TaskDetail | null {
    const row = this.getTaskByIdInternal(taskId);
    if (!row) return null;

    const task = this.serializeTask(row);
    const currentRoute = this.ctx.path.getActiveRoute(taskId);
    const recentEvents = this.ctx.events.getRecentEvents(taskId);

    return { ...task, currentRoute, recentEvents };
  }

  // --- Assignment ---

  /**
   * Assigns a task to a device — auto or manual.
   * Auto: selects the nearest idle device to the source location.
   * Manual: uses the specified device, which must be idle.
   */
  assignTask(taskId: number, params: { resourceId?: string; autoAssign?: boolean }): Task {
    const task = this.getTaskByIdInternal(taskId);
    if (!task) {
      throw new BusinessError('NOT_FOUND', `Task ${taskId} not found`, 404);
    }
    if (task.status !== 'pending') {
      throw new BusinessError('CONFLICT', `Task is already assigned (status: ${task.status})`, 409);
    }

    let resourceId: number;
    let method: AssignmentMethod;

    if (params.autoAssign) {
      // Auto-assign: find nearest idle device to source location
      const nearest = this.findNearestIdleDevice(task.source_location_code);
      if (!nearest) {
        throw new BusinessError('NO_AVAILABLE_DEVICE', 'No idle devices available', 409);
      }
      resourceId = nearest;
      method = 'auto';
    } else {
      // Manual assign
      if (!params.resourceId) {
        throw new BusinessError('VALIDATION_ERROR', 'resourceId is required for manual assignment', 400);
      }
      resourceId = parseInt(params.resourceId, 10);
      if (isNaN(resourceId)) {
        throw new BusinessError('VALIDATION_ERROR', `Invalid resourceId: ${params.resourceId}`, 400);
      }
      const device = this.ctx.device.getResourceById(resourceId);
      if (!device) {
        throw new BusinessError('NOT_FOUND', `Resource ${resourceId} not found`, 404);
      }
      if (device.status !== 'idle') {
        throw new BusinessError('CONFLICT', `Device ${resourceId} is not idle (status: ${device.status})`, 409);
      }
      if (this.ctx.device.hasActiveTask(resourceId)) {
        throw new BusinessError('CONFLICT', `Device ${resourceId} already has an active task`, 409);
      }
      method = 'manual';
    }

    const now = new Date().toISOString();

    // Update task
    this.ctx.db.prepare(`
      UPDATE transport_tasks
      SET status = 'assigned', assigned_resource_id = ?, assigned_at = ?, assignment_method = ?
      WHERE id = ?
    `).run(resourceId, now, method, taskId);

    // Set device to busy
    this.ctx.device.updateStatus(resourceId, 'busy');

    // Record assignment event
    this.ctx.events.recordEvent({
      taskId,
      resourceId,
      eventType: 'task_assigned',
      description: `Task assigned to device ${resourceId} via ${method} assignment`,
      metadata: { method, resourceId: String(resourceId), assignedAt: now },
    });

    // Push status change
    this.ctx.events.pushTaskStatusChange(taskId, 'pending' as TaskStatus, 'assigned' as TaskStatus);

    // Plan route and start transit
    try {
      this.ctx.path.planRoute(taskId, resourceId);
      this.startTransit(taskId);
    } catch (err) {
      // If path planning fails, mark task as error
      this.markTaskError(taskId, `Path planning failed: ${(err as Error).message}`);
    }

    return this.serializeTask(this.getTaskByIdInternal(taskId)!);
  }

  /**
   * Attempts to auto-assign all pending tasks.
   * Sorts by priority (highest first), then assigns to nearest idle device.
   */
  tryAutoAssign(): void {
    const pendingTasks = this.ctx.db.prepare(`
      SELECT id, source_location_code, priority FROM transport_tasks
      WHERE status = 'pending'
      ORDER BY
        CASE priority WHEN 'highest' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
        created_at ASC
    `).all() as Array<{ id: number; source_location_code: string; priority: string }>;

    for (const task of pendingTasks) {
      const nearest = this.findNearestIdleDevice(task.source_location_code);
      if (!nearest) break; // no more idle devices

      const now = new Date().toISOString();
      this.ctx.db.prepare(`
        UPDATE transport_tasks
        SET status = 'assigned', assigned_resource_id = ?, assigned_at = ?, assignment_method = 'auto'
        WHERE id = ?
      `).run(nearest, now, task.id);

      this.ctx.device.updateStatus(nearest, 'busy');

      this.ctx.events.recordEvent({
        taskId: task.id,
        resourceId: nearest,
        eventType: 'task_assigned',
        description: `Task auto-assigned to device ${nearest}`,
        metadata: { method: 'auto', resourceId: String(nearest) },
      });

      this.ctx.events.pushTaskStatusChange(task.id, 'pending', 'assigned');

      try {
        this.ctx.path.planRoute(task.id, nearest);
        this.startTransit(task.id);
      } catch (err) {
        this.markTaskError(task.id, `Path planning failed: ${(err as Error).message}`);
      }
    }
  }

  // --- Lifecycle transitions ---

  /** Starts transit (moves task from 'assigned' to 'in_transit'). */
  startTransit(taskId: number): void {
    const task = this.getTaskByIdInternal(taskId);
    if (!task || task.status !== 'assigned') return;

    const now = new Date().toISOString();
    this.ctx.db.prepare("UPDATE transport_tasks SET status = 'in_transit' WHERE id = ?")
      .run(taskId);

    this.ctx.events.pushTaskStatusChange(taskId, 'assigned' as TaskStatus, 'in_transit' as TaskStatus);

    if (task.assigned_resource_id) {
      this.ctx.events.recordEvent({
        taskId,
        resourceId: task.assigned_resource_id,
        eventType: 'device_departed',
        description: `Device departed from ${task.source_location_code}`,
      });
    }
  }

  /** Cancels a task. Requires confirm=true for in_transit tasks. */
  cancelTask(taskId: number, params: { cancelledBy: string; confirm?: boolean }): Task {
    const task = this.getTaskByIdInternal(taskId);
    if (!task) {
      throw new BusinessError('NOT_FOUND', `Task ${taskId} not found`, 404);
    }
    if (TERMINAL_STATES.has(task.status)) {
      throw new BusinessError('CONFLICT', `Cannot cancel task in terminal state: ${task.status}`, 409);
    }
    if (task.status === 'in_transit' && !params.confirm) {
      throw new BusinessError('CONFIRMATION_REQUIRED', 'Cancellation of in-transit task requires confirm=true', 409);
    }

    const now = new Date().toISOString();
    const oldStatus = task.status as TaskStatus;

    this.ctx.db.prepare(`
      UPDATE transport_tasks SET status = 'cancelled', cancelled_by = ?, cancelled_at = ? WHERE id = ?
    `).run(params.cancelledBy, now, taskId);

    // Restore device to idle if it was assigned
    if (task.assigned_resource_id) {
      this.ctx.device.updateStatus(task.assigned_resource_id, 'idle');
    }

    // Record event
    this.ctx.events.recordEvent({
      taskId,
      resourceId: task.assigned_resource_id ?? undefined,
      eventType: 'task_cancelled',
      description: `Task cancelled by ${params.cancelledBy}`,
      metadata: { cancelledBy: params.cancelledBy, previousStatus: oldStatus },
    });

    this.ctx.events.pushTaskStatusChange(taskId, oldStatus, 'cancelled' as TaskStatus);

    return this.serializeTask(this.getTaskByIdInternal(taskId)!);
  }

  /** Confirms task completion. Restores device to idle. */
  completeTask(taskId: number, params: { completedBy: string }): Task {
    const task = this.getTaskByIdInternal(taskId);
    if (!task) {
      throw new BusinessError('NOT_FOUND', `Task ${taskId} not found`, 404);
    }
    if (task.status !== 'in_transit') {
      throw new BusinessError('CONFLICT', `Task must be in_transit to complete (current: ${task.status})`, 409);
    }

    const now = new Date().toISOString();
    const oldStatus = task.status as TaskStatus;

    this.ctx.db.prepare(`
      UPDATE transport_tasks SET status = 'completed', completed_at = ? WHERE id = ?
    `).run(now, taskId);

    // Restore device to idle
    if (task.assigned_resource_id) {
      this.ctx.device.updateStatus(task.assigned_resource_id, 'idle');
    }

    // Record completion event
    this.ctx.events.recordEvent({
      taskId,
      resourceId: task.assigned_resource_id ?? undefined,
      eventType: 'task_completed',
      description: `Task completed by ${params.completedBy}`,
      metadata: { completedBy: params.completedBy, completedAt: now },
    });

    // Record target_arrived if not already recorded
    this.ctx.events.recordEvent({
      taskId,
      resourceId: task.assigned_resource_id ?? undefined,
      eventType: 'target_arrived',
      description: `Device arrived at target location ${task.target_location_code}`,
    });

    this.ctx.events.pushTaskStatusChange(taskId, oldStatus, 'completed' as TaskStatus);

    // Try auto-assign next pending tasks (device is now idle)
    this.tryAutoAssign();

    return this.serializeTask(this.getTaskByIdInternal(taskId)!);
  }

  /** Recovers a task from error state — resume or cancel. */
  recoverTask(taskId: number, params: { recoveredBy: string; action: 'resume' | 'cancel' }): Task {
    const task = this.getTaskByIdInternal(taskId);
    if (!task) {
      throw new BusinessError('NOT_FOUND', `Task ${taskId} not found`, 404);
    }
    if (task.status !== 'error') {
      throw new BusinessError('CONFLICT', `Task must be in error state to recover (current: ${task.status})`, 409);
    }

    const oldStatus = task.status as TaskStatus;
    const now = new Date().toISOString();

    if (params.action === 'resume') {
      this.ctx.db.prepare("UPDATE transport_tasks SET status = 'in_transit' WHERE id = ?")
        .run(taskId);

      this.ctx.events.recordEvent({
        taskId,
        resourceId: task.assigned_resource_id ?? undefined,
        eventType: 'yield_resumed',
        description: `Task recovered and resumed by ${params.recoveredBy}`,
        metadata: { recoveredBy: params.recoveredBy, action: 'resume' },
      });

      this.ctx.events.pushTaskStatusChange(taskId, oldStatus, 'in_transit' as TaskStatus);
    } else {
      this.ctx.db.prepare(`
        UPDATE transport_tasks SET status = 'cancelled', cancelled_by = ?, cancelled_at = ? WHERE id = ?
      `).run(params.recoveredBy, now, taskId);

      if (task.assigned_resource_id) {
        this.ctx.device.updateStatus(task.assigned_resource_id, 'idle');
      }

      this.ctx.events.recordEvent({
        taskId,
        resourceId: task.assigned_resource_id ?? undefined,
        eventType: 'task_cancelled',
        description: `Task cancelled via error recovery by ${params.recoveredBy}`,
        metadata: { recoveredBy: params.recoveredBy, action: 'cancel' },
      });

      this.ctx.events.pushTaskStatusChange(taskId, oldStatus, 'cancelled' as TaskStatus);
    }

    return this.serializeTask(this.getTaskByIdInternal(taskId)!);
  }

  /** Marks a task as error (used by path planning, traffic coordination, and device management). */
  markTaskError(taskId: number, reason: string): void {
    const task = this.getTaskByIdInternal(taskId);
    if (!task) return;

    const oldStatus = task.status as TaskStatus;

    this.ctx.db.prepare("UPDATE transport_tasks SET status = 'error' WHERE id = ?")
      .run(taskId);

    this.ctx.events.recordEvent({
      taskId,
      resourceId: task.assigned_resource_id ?? undefined,
      eventType: 'anomaly',
      description: reason,
      metadata: { reason },
    });

    this.ctx.events.pushTaskStatusChange(taskId, oldStatus, 'error' as TaskStatus);

    // Push anomaly alert
    this.ctx.events.pushAnomalyAlert({
      taskId: String(taskId),
      resourceId: task.assigned_resource_id ? String(task.assigned_resource_id) : null,
      anomalyType: 'task_error',
      description: reason,
      timestamp: now(),
    });
  }

  // --- Private helpers ---

  private getTaskByIdInternal(taskId: number): TaskRow | null {
    const row = this.ctx.db.prepare('SELECT * FROM transport_tasks WHERE id = ?')
      .get(taskId) as TaskRow | undefined;
    return row ?? null;
  }

  /**
   * Finds the nearest idle device to a given location code.
   * Distance is computed via the graph (Dijkstra), falling back to
   * Euclidean distance if no graph path exists.
   */
  private findNearestIdleDevice(targetLocationCode: string): number | null {
    const idleDevices = this.ctx.db.prepare(`
      SELECT id, current_location_code FROM transport_resources WHERE status = 'idle'
    `).all() as Array<{ id: number; current_location_code: string | null }>;

    if (idleDevices.length === 0) return null;

    // Filter out devices that already have active tasks
    const available = idleDevices.filter((d) => !this.ctx.device.hasActiveTask(d.id));
    if (available.length === 0) return null;

    // Compute distances
    const targetLoc = this.ctx.map.getLocationByCode(targetLocationCode);
    if (!targetLoc) return available[0]?.id ?? null;

    let best: { id: number; dist: number } | null = null;

    for (const device of available) {
      if (!device.current_location_code) continue;
      const devLoc = this.ctx.map.getLocationByCode(device.current_location_code);
      if (!devLoc) continue;

      // Euclidean distance as the metric
      const dist = Math.sqrt(
        Math.pow(targetLoc.x - devLoc.x, 2) + Math.pow(targetLoc.y - devLoc.y, 2)
      );

      if (!best || dist < best.dist) {
        best = { id: device.id, dist };
      }
    }

    return best?.id ?? available[0]?.id ?? null;
  }

  private serializeTask(r: TaskRow): Task {
    return {
      taskId: String(r.id),
      sourceLocationCode: r.source_location_code,
      targetLocationCode: r.target_location_code,
      cargoName: r.cargo_name,
      cargoQuantity: r.cargo_quantity,
      priority: r.priority as Priority,
      status: r.status as TaskStatus,
      createdBy: r.created_by,
      createdAt: r.created_at,
      remark: r.remark ?? null,
      assignedResourceId: r.assigned_resource_id != null ? String(r.assigned_resource_id) : null,
      assignedAt: r.assigned_at ?? null,
      assignmentMethod: (r.assignment_method as AssignmentMethod) ?? null,
      cancelledBy: r.cancelled_by ?? null,
      cancelledAt: r.cancelled_at ?? null,
      completedAt: r.completed_at ?? null,
    };
  }
}

function now(): string {
  return new Date().toISOString();
}
