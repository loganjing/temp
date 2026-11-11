-- 设备管理平台初始 schema：设备、状态、故障、升级、工单及其流转日志/处理记录。

CREATE TABLE equipment (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  identifier TEXT NOT NULL UNIQUE,
  type TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE equipment_status (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES equipment(id),
  status TEXT NOT NULL,
  params TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX idx_equipment_status_equipment_recorded
  ON equipment_status(equipment_id, recorded_at DESC);

CREATE TABLE faults (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES equipment(id),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recorded',
  diagnosis TEXT,
  suggestion TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE INDEX idx_faults_equipment_created
  ON faults(equipment_id, created_at DESC);

CREATE TABLE fault_status_logs (
  id TEXT PRIMARY KEY,
  fault_id TEXT NOT NULL REFERENCES faults(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE INDEX idx_fault_status_logs_fault_changed
  ON fault_status_logs(fault_id, changed_at ASC);

CREATE TABLE upgrade_tasks (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES equipment(id),
  package_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_upgrade_tasks_equipment_created
  ON upgrade_tasks(equipment_id, created_at DESC);

CREATE TABLE upgrade_status_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES upgrade_tasks(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE INDEX idx_upgrade_status_logs_task_changed
  ON upgrade_status_logs(task_id, changed_at ASC);

CREATE TABLE work_orders (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES equipment(id),
  fault_id TEXT REFERENCES faults(id),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE INDEX idx_work_orders_equipment_created
  ON work_orders(equipment_id, created_at DESC);

CREATE TABLE work_order_status_logs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES work_orders(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE INDEX idx_work_order_status_logs_order_changed
  ON work_order_status_logs(order_id, changed_at ASC);

CREATE TABLE work_order_records (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES work_orders(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_work_order_records_order_created
  ON work_order_records(order_id, created_at ASC);
