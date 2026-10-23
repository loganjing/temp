CREATE TABLE patrol_routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  waypoints TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX patrol_routes_created_at_idx ON patrol_routes(created_at DESC);
CREATE INDEX patrol_routes_name_idx ON patrol_routes(name);
