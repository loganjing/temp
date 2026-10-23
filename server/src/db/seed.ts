import { getDatabase } from './database';

/**
 * Seeds the database with sample warehouse map (locations + edges)
 * and transport resources if the tables are empty.
 */
export function runSeed(): void {
  const db = getDatabase();

  const locCount = db.prepare('SELECT COUNT(*) as c FROM locations').get() as { c: number };
  if (locCount.c > 0) return; // already seeded

  const now = new Date().toISOString();

  // --- Locations ---
  // Grid layout:
  //   [A1] -- T1 -- [A2]
  //    |              |
  //   T2             T3
  //    |              |
  //   [B1] -- T4 -- [B2]
  //    |              |
  //   T5             T6
  //    |              |
  //   [C1] -- T7 -- [C2]

  const locations: Array<[string, string, number, number, string]> = [
    ['A1', 'Storage A1', 0, 0, 'storage'],
    ['A2', 'Storage A2', 4, 0, 'storage'],
    ['T1', 'Corridor T1', 2, 0, 'transit'],
    ['T2', 'Corridor T2', 0, 2, 'transit'],
    ['T3', 'Corridor T3', 4, 2, 'transit'],
    ['B1', 'Storage B1', 0, 4, 'storage'],
    ['B2', 'Storage B2', 4, 4, 'storage'],
    ['T4', 'Corridor T4', 2, 4, 'transit'],
    ['T5', 'Corridor T5', 0, 6, 'transit'],
    ['T6', 'Corridor T6', 4, 6, 'transit'],
    ['T7', 'Corridor T7', 2, 6, 'transit'],
    ['C1', 'Storage C1', 0, 8, 'storage'],
    ['C2', 'Storage C2', 4, 8, 'storage'],
  ];

  const insertLoc = db.prepare(
    'INSERT INTO locations (code, name, x, y, type) VALUES (?, ?, ?, ?, ?)'
  );
  for (const [code, name, x, y, type] of locations) {
    insertLoc.run(code, name, x, y, type);
  }

  // --- Map Edges (bidirectional) ---
  // distance = Euclidean distance between coordinates
  const edges: Array<[string, string, number]> = [
    ['A1', 'T1', 2.0],
    ['T1', 'A2', 2.0],
    ['A1', 'T2', 2.0],
    ['A2', 'T3', 2.0],
    ['T2', 'B1', 2.0],
    ['T3', 'B2', 2.0],
    ['B1', 'T4', 2.0],
    ['T4', 'B2', 2.0],
    ['B1', 'T5', 2.0],
    ['B2', 'T6', 2.0],
    ['T5', 'C1', 2.0],
    ['T6', 'C2', 2.0],
    ['C1', 'T7', 2.0],
    ['T7', 'C2', 2.0],
  ];

  const insertEdge = db.prepare(
    'INSERT INTO map_edges (from_location_code, to_location_code, distance, direction) VALUES (?, ?, ?, ?)'
  );
  for (const [from, to, dist] of edges) {
    insertEdge.run(from, to, dist, 'bidirectional');
  }

  // --- Transport Resources ---
  const resources: Array<[string, string, string, string]> = [
    ['AGV-01', 'agv', 'idle', 'A1'],
    ['AGV-02', 'agv', 'idle', 'B2'],
    ['FL-01', 'forklift', 'idle', 'C1'],
  ];

  const insertRes = db.prepare(
    `INSERT INTO transport_resources (name, type, status, current_location_code, last_position_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const [name, type, status, loc] of resources) {
    insertRes.run(name, type, status, loc, now);
  }

  console.log('[seed] Sample warehouse map and transport resources inserted.');
}

// Allow running directly: `tsx src/db/run-migrations.ts` or `tsx src/db/seed.ts`
if (require.main === module) {
  runSeed();
  console.log('[seed] Done.');
  process.exit(0);
}
