-- Initial schema: five core tables, foreign keys, indexes, and seed devices

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  identifier TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'idle',
  status_updated_at TEXT NOT NULL
);

CREATE TABLE fault_diagnoses (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  description TEXT NOT NULL,
  diagnosed_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE upgrade_tasks (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  initiated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE maintenance_orders (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  fault_description TEXT NOT NULL,
  technician TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE equipment_history (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  description TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX idx_fault_diagnoses_device_id ON fault_diagnoses(device_id);
CREATE INDEX idx_upgrade_tasks_device_id ON upgrade_tasks(device_id);
CREATE INDEX idx_maintenance_orders_device_id ON maintenance_orders(device_id);
CREATE INDEX idx_equipment_history_device_id ON equipment_history(device_id);

-- Seed devices for AC-01 verification
INSERT INTO devices (id, name, identifier, status, status_updated_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', '焊接机器人-A01', 'JLG-WELD-A01', 'running', '2026-11-16T08:00:00.000Z'),
  ('550e8400-e29b-41d4-a716-446655440002', '搬运机器人-B02', 'JLG-FORK-B02', 'idle', '2026-11-16T08:00:00.000Z'),
  ('550e8400-e29b-41d4-a716-446655440003', '喷涂机器人-C03', 'JLG-PAINT-C03', 'fault', '2026-11-16T08:00:00.000Z');
