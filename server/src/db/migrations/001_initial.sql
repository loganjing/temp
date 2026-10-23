-- ============================================================================
-- Migration 001: Initial schema — Warehouse Transport System
-- Creates all 7 tables: transport_tasks, transport_resources, locations,
-- map_edges, routes, execution_events, traffic_conflicts
-- ============================================================================

CREATE TABLE IF NOT EXISTS transport_tasks (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  source_location_code  TEXT    NOT NULL,
  target_location_code  TEXT    NOT NULL,
  cargo_name            TEXT    NOT NULL,
  cargo_quantity        INTEGER NOT NULL,
  priority              TEXT    NOT NULL DEFAULT 'normal',
  status                TEXT    NOT NULL DEFAULT 'pending',
  created_by            TEXT    NOT NULL,
  created_at            TEXT    NOT NULL,
  remark                TEXT,
  assigned_resource_id  INTEGER,
  assigned_at           TEXT,
  assignment_method     TEXT,
  cancelled_by          TEXT,
  cancelled_at          TEXT,
  completed_at          TEXT,
  FOREIGN KEY (source_location_code) REFERENCES locations(code),
  FOREIGN KEY (target_location_code) REFERENCES locations(code),
  FOREIGN KEY (assigned_resource_id) REFERENCES transport_resources(id)
);

CREATE TABLE IF NOT EXISTS transport_resources (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT    NOT NULL,
  type                  TEXT    NOT NULL,
  status                TEXT    NOT NULL DEFAULT 'idle',
  current_location_code TEXT,
  last_position_at      TEXT,
  FOREIGN KEY (current_location_code) REFERENCES locations(code)
);

CREATE TABLE IF NOT EXISTS locations (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  x    REAL NOT NULL,
  y    REAL NOT NULL,
  type TEXT NOT NULL DEFAULT 'storage'
);

CREATE TABLE IF NOT EXISTS map_edges (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  from_location_code  TEXT NOT NULL,
  to_location_code    TEXT NOT NULL,
  distance            REAL NOT NULL,
  direction           TEXT NOT NULL DEFAULT 'bidirectional',
  FOREIGN KEY (from_location_code) REFERENCES locations(code),
  FOREIGN KEY (to_location_code) REFERENCES locations(code)
);

CREATE TABLE IF NOT EXISTS routes (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id               INTEGER NOT NULL,
  resource_id           INTEGER NOT NULL,
  nodes                 TEXT    NOT NULL,
  planned_distance      REAL    NOT NULL,
  planned_duration      REAL    NOT NULL,
  is_active             INTEGER NOT NULL DEFAULT 1,
  replan_reason         TEXT,
  replaced_by_route_id  INTEGER,
  created_at            TEXT    NOT NULL,
  FOREIGN KEY (task_id) REFERENCES transport_tasks(id),
  FOREIGN KEY (resource_id) REFERENCES transport_resources(id)
);

CREATE TABLE IF NOT EXISTS execution_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER NOT NULL,
  resource_id INTEGER,
  event_type  TEXT    NOT NULL,
  occurred_at TEXT    NOT NULL,
  description TEXT,
  metadata    TEXT,
  FOREIGN KEY (task_id) REFERENCES transport_tasks(id),
  FOREIGN KEY (resource_id) REFERENCES transport_resources(id)
);

CREATE TABLE IF NOT EXISTS traffic_conflicts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  conflict_type  TEXT NOT NULL,
  resource_ids   TEXT NOT NULL,
  location_code  TEXT NOT NULL,
  detected_at    TEXT NOT NULL,
  resolved_at    TEXT,
  strategy       TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  FOREIGN KEY (location_code) REFERENCES locations(code)
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_tasks_status ON transport_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON transport_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_resource ON transport_tasks(assigned_resource_id);
CREATE INDEX IF NOT EXISTS idx_resources_status ON transport_resources(status);
CREATE INDEX IF NOT EXISTS idx_edges_from ON map_edges(from_location_code);
CREATE INDEX IF NOT EXISTS idx_edges_to ON map_edges(to_location_code);
CREATE INDEX IF NOT EXISTS idx_routes_task ON routes(task_id);
CREATE INDEX IF NOT EXISTS idx_routes_active ON routes(is_active);
CREATE INDEX IF NOT EXISTS idx_events_task ON execution_events(task_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON execution_events(event_type);
CREATE INDEX IF NOT EXISTS idx_conflicts_status ON traffic_conflicts(status);
