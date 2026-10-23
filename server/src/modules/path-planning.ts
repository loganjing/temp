import type { AppContext } from '../context';
import type { RouteNode, Route } from '../../../shared/types';
import { BusinessError } from './device-management';

interface RouteRow {
  id: number;
  task_id: number;
  resource_id: number;
  nodes: string;
  planned_distance: number;
  planned_duration: number;
  is_active: number;
  replan_reason: string | null;
  replaced_by_route_id: number | null;
  created_at: string;
}

interface LocationCoord {
  code: string;
  x: number;
  y: number;
}

const DEFAULT_SPEED = 1.0; // units per second

/**
 * Path planning service — Dijkstra shortest-path computation and route replanning.
 * Computes: device current position → source location → target location.
 */
export class PathPlanningService {
  constructor(private ctx: AppContext) {}

  /**
   * Plans a route for a task: from device's current position through the
   * source location to the target location.
   * Stores the route and triggers traffic conflict detection.
   * Returns the planned route, or throws if no path exists.
   */
  planRoute(taskId: number, resourceId: number): Route {
    // Get task info
    const task = this.ctx.db.prepare(
      'SELECT source_location_code, target_location_code FROM transport_tasks WHERE id = ?'
    ).get(taskId) as { source_location_code: string; target_location_code: string } | undefined;

    if (!task) {
      throw new BusinessError('NOT_FOUND', `Task ${taskId} not found`, 404);
    }

    // Get device current position
    const deviceLoc = this.ctx.device.getCurrentLocation(resourceId);
    if (!deviceLoc) {
      throw new BusinessError('VALIDATION_ERROR', 'Device has no current position', 400);
    }

    // Deactivate any existing active route for this task
    this.ctx.db.prepare('UPDATE routes SET is_active = 0 WHERE task_id = ?').run(taskId);

    // Build adjacency graph
    const graph = this.buildGraph();

    // Compute path: current → source → target
    const pathSegment1 = this.dijkstra(graph, deviceLoc, task.source_location_code);
    if (!pathSegment1) {
      throw new BusinessError('PATH_PLANNING_FAILED', `No path from ${deviceLoc} to ${task.source_location_code}`, 400);
    }

    const pathSegment2 = this.dijkstra(graph, task.source_location_code, task.target_location_code);
    if (!pathSegment2) {
      throw new BusinessError('PATH_PLANNING_FAILED', `No path from ${task.source_location_code} to ${task.target_location_code}`, 400);
    }

    // Merge segments (skip the overlapping source node)
    const fullPathCodes = [...pathSegment1.path, ...pathSegment2.path.slice(1)];
    const totalDistance = pathSegment1.distance + pathSegment2.distance;

    // Build route nodes with coordinates and order
    const locationCoords = this.getAllLocationCoords();
    const nodes: RouteNode[] = fullPathCodes.map((code, index) => {
      const coord = locationCoords.get(code)!;
      return { code, x: coord.x, y: coord.y, order: index };
    });

    const plannedDuration = totalDistance / DEFAULT_SPEED;
    const now = new Date().toISOString();

    const result = this.ctx.db.prepare(`
      INSERT INTO routes (task_id, resource_id, nodes, planned_distance, planned_duration, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(taskId, resourceId, JSON.stringify(nodes), totalDistance, plannedDuration, now) as { lastInsertRowid: number };

    const routeId = Number(result.lastInsertRowid);

    // Record route_planned event
    this.ctx.events.recordEvent({
      taskId,
      resourceId,
      eventType: 'route_planned',
      description: `Route planned: ${fullPathCodes.join(' → ')}`,
      metadata: { plannedDistance: totalDistance, plannedDuration, nodeCount: nodes.length },
    });

    // Trigger conflict detection
    this.ctx.traffic.detectAndResolveConflicts();

    return this.serializeRoute({
      id: routeId,
      task_id: taskId,
      resource_id: resourceId,
      nodes: JSON.stringify(nodes),
      planned_distance: totalDistance,
      planned_duration: plannedDuration,
      is_active: 1,
      replan_reason: null,
      replaced_by_route_id: null,
      created_at: now,
    });
  }

  /**
   * Replans the route for a task, avoiding blocked nodes.
   * Deactivates the old route and creates a new one.
   */
  replanRoute(taskId: number, blockedNodes: string[], reason: string): Route | null {
    const task = this.ctx.db.prepare(
      'SELECT source_location_code, target_location_code, assigned_resource_id, status FROM transport_tasks WHERE id = ?'
    ).get(taskId) as {
      source_location_code: string;
      target_location_code: string;
      assigned_resource_id: number | null;
      status: string;
    } | undefined;

    if (!task || task.status !== 'in_transit' || !task.assigned_resource_id) {
      return null;
    }

    const resourceId = task.assigned_resource_id;
    const deviceLoc = this.ctx.device.getCurrentLocation(resourceId);
    if (!deviceLoc) return null;

    // Get old route to find the next target (source or target depending on progress)
    const oldRoute = this.getActiveRouteRow(taskId);
    if (!oldRoute) return null;

    const oldNodes = JSON.parse(oldRoute.nodes) as RouteNode[];
    const currentIdx = oldNodes.findIndex((n) => n.code === deviceLoc);

    // Determine target: if past source, go to target; otherwise go to source then target
    const sourceIdx = oldNodes.findIndex((n) => n.code === task.source_location_code);
    const isPastSource = currentIdx >= sourceIdx;
    const intermediateTarget = isPastSource ? null : task.source_location_code;

    // Build graph excluding blocked nodes
    const graph = this.buildGraph(blockedNodes);

    const segment1 = this.dijkstra(graph, deviceLoc, intermediateTarget || task.target_location_code);
    if (!segment1) {
      // Replan failed → task goes to error
      this.ctx.task.markTaskError(taskId, `Route replanning failed: no path avoiding ${blockedNodes.join(', ')}`);
      return null;
    }

    let fullPathCodes: string[];
    let totalDistance: number;

    if (intermediateTarget) {
      const segment2 = this.dijkstra(graph, intermediateTarget, task.target_location_code);
      if (!segment2) {
        this.ctx.task.markTaskError(taskId, `Route replanning failed: no path from ${intermediateTarget} to ${task.target_location_code}`);
        return null;
      }
      fullPathCodes = [...segment1.path, ...segment2.path.slice(1)];
      totalDistance = segment1.distance + segment2.distance;
    } else {
      fullPathCodes = segment1.path;
      totalDistance = segment1.distance;
    }

    // Deactivate old route and link it to the new one
    const now = new Date().toISOString();
    const plannedDuration = totalDistance / DEFAULT_SPEED;

    const locationCoords = this.getAllLocationCoords();
    const nodes: RouteNode[] = fullPathCodes.map((code, index) => {
      const coord = locationCoords.get(code)!;
      return { code, x: coord.x, y: coord.y, order: index };
    });

    const result = this.ctx.db.prepare(`
      INSERT INTO routes (task_id, resource_id, nodes, planned_distance, planned_duration, is_active, replan_reason, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(taskId, resourceId, JSON.stringify(nodes), totalDistance, plannedDuration, reason, now) as { lastInsertRowid: number };

    const newRouteId = Number(result.lastInsertRowid);

    // Deactivate old route and link
    this.ctx.db.prepare('UPDATE routes SET is_active = 0, replaced_by_route_id = ? WHERE id = ?')
      .run(newRouteId, oldRoute.id);

    // Record route_replanned event
    this.ctx.events.recordEvent({
      taskId,
      resourceId,
      eventType: 'route_replanned',
      description: `Route replanned due to ${reason}`,
      metadata: { reason, blockedNodes, newPath: fullPathCodes },
    });

    // Trigger conflict detection
    this.ctx.traffic.detectAndResolveConflicts();

    return this.serializeRoute({
      id: newRouteId,
      task_id: taskId,
      resource_id: resourceId,
      nodes: JSON.stringify(nodes),
      planned_distance: totalDistance,
      planned_duration: plannedDuration,
      is_active: 1,
      replan_reason: reason,
      replaced_by_route_id: null,
      created_at: now,
    });
  }

  /** Returns the active route for a task, or null. */
  getActiveRoute(taskId: number): Route | null {
    const row = this.getActiveRouteRow(taskId);
    return row ? this.serializeRoute(row) : null;
  }

  private getActiveRouteRow(taskId: number): RouteRow | null {
    const row = this.ctx.db.prepare(`
      SELECT id, task_id, resource_id, nodes, planned_distance, planned_duration, is_active, replan_reason, replaced_by_route_id, created_at
      FROM routes WHERE task_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1
    `).get(taskId) as RouteRow | undefined;
    return row ?? null;
  }

  // --- Graph building and Dijkstra ---

  private buildGraph(blockedNodes: string[] = []): Map<string, Array<{ to: string; distance: number }>> {
    const blocked = new Set(blockedNodes);
    const graph = new Map<string, Array<{ to: string; distance: number }>>();

    const edges = this.ctx.db.prepare(`
      SELECT from_location_code, to_location_code, distance, direction FROM map_edges
    `).all() as Array<{ from_location_code: string; to_location_code: string; distance: number; direction: string }>;

    for (const edge of edges) {
      if (blocked.has(edge.from_location_code) || blocked.has(edge.to_location_code)) continue;

      // Forward direction
      if (!graph.has(edge.from_location_code)) graph.set(edge.from_location_code, []);
      graph.get(edge.from_location_code)!.push({ to: edge.to_location_code, distance: edge.distance });

      // Reverse direction (bidirectional only)
      if (edge.direction === 'bidirectional') {
        if (!graph.has(edge.to_location_code)) graph.set(edge.to_location_code, []);
        graph.get(edge.to_location_code)!.push({ to: edge.from_location_code, distance: edge.distance });
      }
    }

    return graph;
  }

  private dijkstra(
    graph: Map<string, Array<{ to: string; distance: number }>>,
    start: string,
    end: string
  ): { path: string[]; distance: number } | null {
    if (start === end) return { path: [start], distance: 0 };

    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    const visited = new Set<string>();

    // Initialize
    for (const node of graph.keys()) {
      distances.set(node, Infinity);
      previous.set(node, null);
    }
    if (!distances.has(start)) {
      // Start node might not have outgoing edges but still exist
      distances.set(start, 0);
    }
    distances.set(start, 0);

    // Simple priority queue (array-based, sufficient for small graphs)
    const queue: Array<{ node: string; dist: number }> = [{ node: start, dist: 0 }];

    while (queue.length > 0) {
      // Sort and pick minimum
      queue.sort((a, b) => a.dist - b.dist);
      const { node: current, dist: currentDist } = queue.shift()!;

      if (visited.has(current)) continue;
      visited.add(current);

      if (current === end) {
        // Reconstruct path
        const path: string[] = [];
        let curr: string | null = end;
        while (curr) {
          path.unshift(curr);
          curr = previous.get(curr) ?? null;
        }
        return { path, distance: currentDist };
      }

      const neighbors = graph.get(current) || [];
      for (const { to, distance } of neighbors) {
        if (visited.has(to)) continue;
        const newDist = currentDist + distance;
        if (newDist < (distances.get(to) ?? Infinity)) {
          distances.set(to, newDist);
          previous.set(to, current);
          queue.push({ node: to, dist: newDist });
        }
      }
    }

    return null; // No path found
  }

  private getAllLocationCoords(): Map<string, LocationCoord> {
    const rows = this.ctx.db.prepare('SELECT code, x, y FROM locations').all() as LocationCoord[];
    const map = new Map<string, LocationCoord>();
    for (const r of rows) {
      map.set(r.code, { code: r.code, x: r.x, y: r.y });
    }
    return map;
  }

  private serializeRoute(r: RouteRow): Route {
    return {
      routeId: String(r.id),
      taskId: String(r.task_id),
      resourceId: String(r.resource_id),
      nodes: JSON.parse(r.nodes) as RouteNode[],
      plannedDistance: r.planned_distance,
      plannedDuration: r.planned_duration,
      replanReason: r.replan_reason ?? null,
    };
  }
}
