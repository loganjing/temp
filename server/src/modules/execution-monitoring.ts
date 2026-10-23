import type { AppContext } from '../context';
import type {
  ExecutionEvent,
  EventType,
  DeviceStatus,
  TaskStatus,
  ConflictType,
  AnomalyAlertPayload,
} from '../../../shared/types';

interface EventRow {
  id: number;
  task_id: number;
  resource_id: number | null;
  event_type: string;
  occurred_at: string;
  description: string | null;
  metadata: string | null;
}

/**
 * Execution monitoring service — records execution events and pushes
 * real-time WebSocket messages (6 message types).
 */
export class ExecutionMonitoringService {
  constructor(private ctx: AppContext) {}

  /** Records an execution event and pushes it via WebSocket. */
  recordEvent(params: {
    taskId: number;
    resourceId?: number | null;
    eventType: EventType;
    description?: string;
    metadata?: Record<string, unknown>;
  }): number {
    const occurredAt = new Date().toISOString();
    const result = this.ctx.db.prepare(`
      INSERT INTO execution_events (task_id, resource_id, event_type, occurred_at, description, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      params.taskId,
      params.resourceId ?? null,
      params.eventType,
      occurredAt,
      params.description ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null
    ) as { lastInsertRowid: number };

    const eventId = Number(result.lastInsertRowid);

    // Push execution_event WS message
    this.ctx.ws.broadcast('execution_event', {
      eventId: String(eventId),
      taskId: String(params.taskId),
      eventType: params.eventType,
      description: params.description ?? null,
      timestamp: occurredAt,
    });

    return eventId;
  }

  /** Returns all events for a task, ordered by time ascending. */
  getEventsByTaskId(taskId: number): ExecutionEvent[] {
    const rows = this.ctx.db.prepare(`
      SELECT id, task_id, resource_id, event_type, occurred_at, description, metadata
      FROM execution_events
      WHERE task_id = ?
      ORDER BY occurred_at ASC, id ASC
    `).all(taskId) as EventRow[];

    return rows.map((r) => ({
      eventId: String(r.id),
      taskId: String(r.task_id),
      resourceId: r.resource_id != null ? String(r.resource_id) : null,
      eventType: r.event_type as EventType,
      occurredAt: r.occurred_at,
      description: r.description,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
    }));
  }

  /** Returns the N most recent events for a task (for task detail view). */
  getRecentEvents(taskId: number, limit = 10): ExecutionEvent[] {
    const rows = this.ctx.db.prepare(`
      SELECT id, task_id, resource_id, event_type, occurred_at, description, metadata
      FROM execution_events
      WHERE task_id = ?
      ORDER BY occurred_at DESC, id DESC
      LIMIT ?
    `).all(taskId, limit) as EventRow[];

    return rows.reverse().map((r) => ({
      eventId: String(r.id),
      taskId: String(r.task_id),
      resourceId: r.resource_id != null ? String(r.resource_id) : null,
      eventType: r.event_type as EventType,
      occurredAt: r.occurred_at,
      description: r.description,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
    }));
  }

  // --- WebSocket push helpers ---

  pushTaskStatusChange(taskId: number, oldStatus: TaskStatus, newStatus: TaskStatus): void {
    this.ctx.ws.broadcast('task_status_change', {
      taskId: String(taskId),
      oldStatus,
      newStatus,
      timestamp: new Date().toISOString(),
    });
  }

  pushDevicePositionUpdate(resourceId: number, locationCode: string): void {
    this.ctx.ws.broadcast('device_position_update', {
      resourceId: String(resourceId),
      locationCode,
      timestamp: new Date().toISOString(),
    });
  }

  pushDeviceStatusChange(resourceId: number, oldStatus: DeviceStatus, newStatus: DeviceStatus): void {
    this.ctx.ws.broadcast('device_status_change', {
      resourceId: String(resourceId),
      oldStatus,
      newStatus,
      timestamp: new Date().toISOString(),
    });
  }

  pushTrafficAlert(conflictId: number, conflictType: ConflictType, resourceIds: number[], locationCode: string): void {
    this.ctx.ws.broadcast('traffic_alert', {
      conflictId: String(conflictId),
      conflictType,
      resourceIds: resourceIds.map(String),
      locationCode,
      timestamp: new Date().toISOString(),
    });
  }

  pushAnomalyAlert(payload: AnomalyAlertPayload): void {
    this.ctx.ws.broadcast('anomaly_alert', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }
}
