-- 初始迁移：建立设备管理平台五张表及外键索引。
-- schema 严格遵循 docs/wi-t1000049/architecture-baseline.md 第3节。

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT,
  online_status TEXT NOT NULL DEFAULT 'offline',
  running_status TEXT NOT NULL DEFAULT 'idle',
  is_abnormal INTEGER NOT NULL DEFAULT 0,
  registered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE device_status_logs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  online_status TEXT NOT NULL,
  running_status TEXT NOT NULL,
  is_abnormal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE faults (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  description TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE upgrade_tasks (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE repair_orders (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  fault_id TEXT,
  description TEXT NOT NULL,
  requirement TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  result TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id),
  FOREIGN KEY (fault_id) REFERENCES faults(id)
);

CREATE INDEX idx_device_status_logs_device_id ON device_status_logs(device_id);
CREATE INDEX idx_device_status_logs_created_at ON device_status_logs(created_at);
CREATE INDEX idx_faults_device_id ON faults(device_id);
CREATE INDEX idx_faults_occurred_at ON faults(occurred_at);
CREATE INDEX idx_upgrade_tasks_device_id ON upgrade_tasks(device_id);
CREATE INDEX idx_upgrade_tasks_status ON upgrade_tasks(status);
CREATE INDEX idx_repair_orders_device_id ON repair_orders(device_id);
CREATE INDEX idx_repair_orders_fault_id ON repair_orders(fault_id);
CREATE INDEX idx_repair_orders_status ON repair_orders(status);
CREATE INDEX idx_devices_is_abnormal ON devices(is_abnormal);
