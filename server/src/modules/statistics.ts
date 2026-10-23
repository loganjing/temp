import type { AppContext } from '../context';
import type { StatisticsResponse, ResourceUtilization, PriorityDistribution, ResourceTaskDistribution } from '../../../shared/types';

/**
 * Statistics service — aggregates completed task metrics and exports CSV.
 */
export class StatisticsService {
  constructor(private ctx: AppContext) {}

  /**
   * Computes aggregated statistics from completed tasks and execution events.
   * Supports filtering by date range, resource, and priority.
   */
  getStatistics(params: {
    startDate?: string;
    endDate?: string;
    resourceId?: number;
    priority?: string;
  }): StatisticsResponse {
    const conditions: string[] = [];
    const sqlParams: (string | number)[] = [];

    if (params.startDate) {
      conditions.push("created_at >= ?");
      sqlParams.push(params.startDate + 'T00:00:00.000Z');
    }
    if (params.endDate) {
      conditions.push("created_at <= ?");
      sqlParams.push(params.endDate + 'T23:59:59.999Z');
    }
    if (params.resourceId) {
      conditions.push("assigned_resource_id = ?");
      sqlParams.push(params.resourceId);
    }
    if (params.priority) {
      conditions.push("priority = ?");
      sqlParams.push(params.priority);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // --- Task counts ---
    const counts = this.ctx.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error
      FROM transport_tasks ${whereClause}
    `).get(...sqlParams) as { total: number; completed: number; cancelled: number; error: number };

    const totalTasks = counts.total || 0;
    const completedTasks = counts.completed || 0;
    const cancelledTasks = counts.cancelled || 0;
    const errorTasks = counts.error || 0;

    const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;
    const anomalyRate = totalTasks > 0 ? errorTasks / totalTasks : 0;

    // --- Average duration (from assigned_at to completed_at) ---
    const avgRow = this.ctx.db.prepare(`
      SELECT AVG(
        (julianday(completed_at) - julianday(assigned_at)) * 86400
      ) as avg_duration
      FROM transport_tasks
      WHERE status = 'completed' AND completed_at IS NOT NULL AND assigned_at IS NOT NULL
      ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
    `).get(...sqlParams) as { avg_duration: number | null };

    const averageDuration = avgRow.avg_duration ? Math.round(avgRow.avg_duration) : 0;

    // --- Resource utilization ---
    const resourceUtilization = this.computeResourceUtilization(params);

    // --- Priority distribution ---
    const priorityDist = this.computePriorityDistribution(whereClause, sqlParams);

    // --- Resource task distribution ---
    const resourceTaskDist = this.computeResourceTaskDistribution(whereClause, sqlParams);

    return {
      totalTasks,
      completedTasks,
      cancelledTasks,
      errorTasks,
      completionRate: Math.round(completionRate * 1000) / 1000,
      averageDuration,
      anomalyRate: Math.round(anomalyRate * 1000) / 1000,
      resourceUtilization,
      priorityDistribution: priorityDist,
      resourceTaskDistribution: resourceTaskDist,
    };
  }

  /** Exports statistics as a CSV string. */
  exportCSV(params: {
    startDate?: string;
    endDate?: string;
    resourceId?: number;
    priority?: string;
  }): string {
    const stats = this.getStatistics(params);
    const lines: string[] = [];

    lines.push('Metric,Value');
    lines.push(`Total Tasks,${stats.totalTasks}`);
    lines.push(`Completed Tasks,${stats.completedTasks}`);
    lines.push(`Cancelled Tasks,${stats.cancelledTasks}`);
    lines.push(`Error Tasks,${stats.errorTasks}`);
    lines.push(`Completion Rate,${stats.completionRate}`);
    lines.push(`Average Duration (seconds),${stats.averageDuration}`);
    lines.push(`Anomaly Rate,${stats.anomalyRate}`);
    lines.push('');

    lines.push('Resource Utilization');
    lines.push('Resource ID,Resource Name,Busy Duration (seconds),Online Duration (seconds),Utilization Rate');
    for (const r of stats.resourceUtilization) {
      lines.push(`${r.resourceId},${r.resourceName},${r.busyDuration},${r.onlineDuration},${r.utilizationRate}`);
    }
    lines.push('');

    lines.push('Priority Distribution');
    lines.push('Priority,Count,Percentage');
    for (const p of stats.priorityDistribution) {
      lines.push(`${p.priority},${p.count},${p.percentage}`);
    }
    lines.push('');

    lines.push('Resource Task Distribution');
    lines.push('Resource ID,Resource Name,Task Count');
    for (const r of stats.resourceTaskDistribution) {
      lines.push(`${r.resourceId},${r.resourceName},${r.taskCount}`);
    }

    return lines.join('\n');
  }

  private computeResourceUtilization(params: {
    startDate?: string;
    endDate?: string;
  }): ResourceUtilization[] {
    // For each resource, compute busy duration (sum of task durations) and
    // online duration (time from first to last event, or since creation)
    const resources = this.ctx.db.prepare(
      'SELECT id, name, last_position_at FROM transport_resources ORDER BY id'
    ).all() as Array<{ id: number; name: string; last_position_at: string | null }>;

    const now = new Date();
    const result: ResourceUtilization[] = [];

    for (const res of resources) {
      // Sum of completed task durations for this resource
      const taskConditions: string[] = [
        'assigned_resource_id = ?',
        "status = 'completed'",
        'completed_at IS NOT NULL',
        'assigned_at IS NOT NULL',
      ];
      const taskParams: (string | number)[] = [res.id];
      if (params.startDate) {
        taskConditions.push("created_at >= ?");
        taskParams.push(params.startDate + 'T00:00:00.000Z');
      }
      if (params.endDate) {
        taskConditions.push("created_at <= ?");
        taskParams.push(params.endDate + 'T23:59:59.999Z');
      }

      const busyRow = this.ctx.db.prepare(`
        SELECT COALESCE(SUM(
          (julianday(completed_at) - julianday(assigned_at)) * 86400
        ), 0) as busy_duration
        FROM transport_tasks WHERE ${taskConditions.join(' AND ')}
      `).get(...taskParams) as { busy_duration: number };

      const busyDuration = Math.round(busyRow.busy_duration || 0);

      // Online duration: estimate from resource creation to now (or end of period)
      const onlineEnd = params.endDate
        ? new Date(params.endDate + 'T23:59:59.999Z').getTime()
        : now.getTime();

      // Use earliest event or creation time as start
      const firstEvent = this.ctx.db.prepare(`
        SELECT MIN(occurred_at) as first FROM execution_events WHERE resource_id = ?
      `).get(res.id) as { first: string | null };

      const onlineStart = firstEvent.first
        ? new Date(firstEvent.first).getTime()
        : now.getTime();

      const onlineDuration = Math.max(0, Math.round((onlineEnd - onlineStart) / 1000));
      const utilizationRate = onlineDuration > 0
        ? Math.round((busyDuration / onlineDuration) * 1000) / 1000
        : 0;

      result.push({
        resourceId: String(res.id),
        resourceName: res.name,
        busyDuration,
        onlineDuration,
        utilizationRate,
      });
    }

    return result;
  }

  private computePriorityDistribution(whereClause: string, sqlParams: (string | number)[]): PriorityDistribution[] {
    const rows = this.ctx.db.prepare(`
      SELECT priority, COUNT(*) as count
      FROM transport_tasks ${whereClause}
      GROUP BY priority
    `).all(...sqlParams) as Array<{ priority: string; count: number }>;

    const total = rows.reduce((sum, r) => sum + r.count, 0);
    const priorities = ['normal', 'urgent', 'highest'];

    return priorities.map((p) => {
      const row = rows.find((r) => r.priority === p);
      const count = row?.count || 0;
      return {
        priority: p as PriorityDistribution['priority'],
        count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 1000 : 0,
      };
    });
  }

  private computeResourceTaskDistribution(whereClause: string, sqlParams: (string | number)[]): ResourceTaskDistribution[] {
    const rows = this.ctx.db.prepare(`
      SELECT t.assigned_resource_id AS res_id, r.name AS res_name, COUNT(*) AS task_count
      FROM transport_tasks t
      LEFT JOIN transport_resources r ON r.id = t.assigned_resource_id
      ${whereClause ? whereClause.replace('WHERE', 'WHERE t.assigned_resource_id IS NOT NULL AND') : 'WHERE t.assigned_resource_id IS NOT NULL'}
      GROUP BY t.assigned_resource_id
      ORDER BY t.assigned_resource_id
    `).all(...sqlParams) as Array<{ res_id: number; res_name: string; task_count: number }>;

    return rows.map((r) => ({
      resourceId: String(r.res_id),
      resourceName: r.res_name,
      taskCount: r.task_count,
    }));
  }
}
