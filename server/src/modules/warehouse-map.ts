import type { AppContext } from '../context';
import type { Location, MapEdge, TopologyResponse } from '../../../shared/types';

interface LocationRow {
  code: string;
  name: string;
  x: number;
  y: number;
  type: string;
}

interface EdgeRow {
  id: number;
  from_location_code: string;
  to_location_code: string;
  distance: number;
  direction: string;
}

/**
 * Warehouse map service — manages locations and map edges topology.
 */
export class WarehouseMapService {
  constructor(private ctx: AppContext) {}

  /** Returns all locations as a list. */
  getLocations(): Location[] {
    const rows = this.ctx.db.prepare(
      'SELECT code, name, x, y, type FROM locations ORDER BY code'
    ).all() as LocationRow[];
    return rows.map(this.serializeLocation);
  }

  /** Returns full topology (nodes + edges). */
  getTopology(): TopologyResponse {
    const nodes = this.getLocations();
    const edgeRows = this.ctx.db.prepare(
      'SELECT id, from_location_code, to_location_code, distance, direction FROM map_edges ORDER BY id'
    ).all() as EdgeRow[];
    const edges: MapEdge[] = edgeRows.map((r) => ({
      fromLocationCode: r.from_location_code,
      toLocationCode: r.to_location_code,
      distance: r.distance,
      direction: r.direction as MapEdge['direction'],
    }));
    return { nodes, edges };
  }

  /** Checks whether a location code exists in the database. */
  locationExists(code: string): boolean {
    const row = this.ctx.db.prepare('SELECT 1 FROM locations WHERE code = ?').get(code);
    return !!row;
  }

  /** Returns a location row by code, or null. */
  getLocationByCode(code: string): LocationRow | null {
    return (this.ctx.db.prepare(
      'SELECT code, name, x, y, type FROM locations WHERE code = ?'
    ).get(code) as LocationRow | undefined) ?? null;
  }

  /**
   * Returns all edges adjacent to a location code (both from and to directions),
   * expanding bidirectional edges so path-planning can traverse both ways.
   */
  getAdjacentEdges(code: string): Array<{ to: string; distance: number }> {
    const rows = this.ctx.db.prepare(`
      SELECT to_location_code AS neighbor, distance, direction, 'forward' AS via
      FROM map_edges WHERE from_location_code = ?
      UNION ALL
      SELECT from_location_code AS neighbor, distance, direction, 'reverse' AS via
      FROM map_edges WHERE to_location_code = ? AND direction = 'bidirectional'
    `).all(code, code) as Array<{ neighbor: string; distance: number; direction: string; via: string }>;

    return rows.map((r) => ({ to: r.neighbor, distance: r.distance }));
  }

  private serializeLocation(r: LocationRow): Location {
    return {
      locationCode: r.code,
      name: r.name,
      x: r.x,
      y: r.y,
      type: r.type as Location['type'],
    };
  }
}
