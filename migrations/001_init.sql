-- 001_init.sql — 建表与初始路径图数据
-- 幂等：可重复执行（CREATE TABLE IF NOT EXISTS + INSERT OR IGNORE）

-- 迁移跟踪表（供 runMigrations 使用；本文件幂等，可重复应用）
CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  applied_at TEXT NOT NULL
);

-- 3.1 delivery_tasks
CREATE TABLE IF NOT EXISTS delivery_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  robot_id INTEGER NULL REFERENCES robots(id),
  created_at TEXT NOT NULL,
  assigned_at TEXT NULL,
  delivered_at TEXT NULL,
  cancelled_at TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON delivery_tasks(status, created_at);

-- 3.2 robots
CREATE TABLE IF NOT EXISTS robots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  current_task_id INTEGER NULL REFERENCES delivery_tasks(id),
  created_at TEXT NOT NULL
);

-- 3.3 path_nodes
CREATE TABLE IF NOT EXISTS path_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL UNIQUE,
  node_type TEXT NOT NULL CHECK (node_type IN ('kitchen','table','junction'))
);

-- 3.4 path_segments（无向边：一段物理通道，任一方向通行均占用同一把锁）
CREATE TABLE IF NOT EXISTS path_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_node INTEGER NOT NULL REFERENCES path_nodes(id),
  to_node INTEGER NOT NULL REFERENCES path_nodes(id),
  label TEXT NOT NULL,
  CHECK (from_node <> to_node)
);

-- 3.5 segment_locks
-- 实现说明：locked_at 为 NULL 表示“已规划但尚未到达的待占段”，
-- 非 NULL 表示“当前正持有（占用）的段”。released_at 非 NULL 表示“已通过/已释放”。
-- 互斥通过 partial unique index 保证：同一段同一时刻只能有一个活跃锁
-- （released_at IS NULL 且 locked_at IS NOT NULL）。
-- 这是相对设计文档“唯一约束 segment_id + released_at IS NULL”的细化实现，
-- 以支持“机器人通过段时获取锁、通过后释放锁”的渐进式占用模型。
CREATE TABLE IF NOT EXISTS segment_locks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  segment_id INTEGER NOT NULL REFERENCES path_segments(id),
  robot_id INTEGER NOT NULL REFERENCES robots(id),
  task_id INTEGER NOT NULL REFERENCES delivery_tasks(id),
  sequence INTEGER NOT NULL,
  locked_at TEXT NULL,
  released_at TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_locks_robot_task ON segment_locks(robot_id, task_id);
CREATE INDEX IF NOT EXISTS idx_locks_segment ON segment_locks(segment_id);
CREATE INDEX IF NOT EXISTS idx_locks_active ON segment_locks(segment_id) WHERE released_at IS NULL AND locked_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_locks_active_segment ON segment_locks(segment_id) WHERE released_at IS NULL AND locked_at IS NOT NULL;

-- 3.6 notifications
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES delivery_tasks(id),
  robot_id INTEGER NOT NULL REFERENCES robots(id),
  table_id TEXT NOT NULL,
  sent_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_task ON notifications(task_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sent ON notifications(sent_at);

-- 3.7 alerts
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('robot_offline','path_conflict_unresolved')),
  message TEXT NOT NULL,
  robot_id INTEGER NULL REFERENCES robots(id),
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved_created ON alerts(resolved, created_at);

-- 初始路径图：厨房 + 交叉口 + 桌位
-- 拓扑：kitchen -- jA -- jB -- table-1 / table-2
--       kitchen -- jC -- jB（替代干道，用于冲突绕行）
--       jA -- table-3
INSERT OR IGNORE INTO path_nodes (id, label, node_type) VALUES
  (1, 'kitchen', 'kitchen'),
  (2, 'junction-A', 'junction'),
  (3, 'junction-B', 'junction'),
  (4, 'junction-C', 'junction'),
  (5, 'table-1', 'table'),
  (6, 'table-2', 'table'),
  (7, 'table-3', 'table');

INSERT OR IGNORE INTO path_segments (id, from_node, to_node, label) VALUES
  (1, 1, 2, 'kitchen-junctionA'),
  (2, 2, 3, 'junctionA-junctionB'),
  (3, 3, 5, 'junctionB-table1'),
  (4, 3, 6, 'junctionB-table2'),
  (5, 2, 7, 'junctionA-table3'),
  (6, 1, 4, 'kitchen-junctionC'),
  (7, 4, 3, 'junctionC-junctionB');
