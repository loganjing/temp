-- 初始 schema：设备管理平台四张核心表。
-- 外键约束在连接层由 dbkit (createSqliteClient) 以 PRAGMA foreign_keys = ON 启用；
-- 此处再次声明以显式记录契约要求（在迁移事务内为幂等声明）。
PRAGMA foreign_keys = ON;

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT,
  current_status TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE fault_diagnoses (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  fault_description TEXT NOT NULL,
  diagnosis_result TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE upgrade_records (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  target_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE repair_orders (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  content TEXT NOT NULL,
  result TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);
