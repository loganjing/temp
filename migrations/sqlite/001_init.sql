-- 001_init.sql: 初始迁移 - 商场清洁系统 6 张核心表

-- 清洁区域
CREATE TABLE IF NOT EXISTS cleaning_areas (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  location_desc   TEXT NOT NULL,
  requirements    TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

-- 定时作业
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id              TEXT PRIMARY KEY,
  area_id         TEXT NOT NULL,
  assignee        TEXT NOT NULL,
  schedule_type   TEXT NOT NULL,
  schedule_days   TEXT,
  start_time      TEXT NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  FOREIGN KEY (area_id) REFERENCES cleaning_areas(id)
);

-- 任务实例
CREATE TABLE IF NOT EXISTS task_instances (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL,
  scheduled_date  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES scheduled_jobs(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_instances_job_date
  ON task_instances (job_id, scheduled_date);

-- 障碍
CREATE TABLE IF NOT EXISTS obstacles (
  id                  TEXT PRIMARY KEY,
  task_instance_id    TEXT NOT NULL,
  description         TEXT NOT NULL,
  reported_at         TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  resolution_method   TEXT,
  resolution_result   TEXT,
  resolved_at         TEXT,
  FOREIGN KEY (task_instance_id) REFERENCES task_instances(id)
);

-- 耗材
CREATE TABLE IF NOT EXISTS supply_items (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  quantity        REAL NOT NULL DEFAULT 0,
  unit            TEXT NOT NULL,
  threshold       REAL NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- 库存提醒
CREATE TABLE IF NOT EXISTS supply_alerts (
  id              TEXT PRIMARY KEY,
  supply_item_id  TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  resolved_at     TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  FOREIGN KEY (supply_item_id) REFERENCES supply_items(id)
);
