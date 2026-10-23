-- 165-农业采摘 初始化 Schema

CREATE TABLE IF NOT EXISTS plots (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  variety     TEXT NOT NULL,
  area        REAL NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS maturity_assessments (
  id              TEXT PRIMARY KEY,
  plot_id         TEXT NOT NULL REFERENCES plots(id),
  maturity_level  TEXT NOT NULL,
  assessment_time TEXT NOT NULL,
  assessor        TEXT NOT NULL,
  notes           TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_maturity_assessments_plot_id
  ON maturity_assessments(plot_id, assessment_time DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS picking_tasks (
  id                TEXT PRIMARY KEY,
  task_no           TEXT NOT NULL UNIQUE,
  plot_id           TEXT NOT NULL REFERENCES plots(id),
  planned_quantity  REAL NOT NULL,
  assigned_worker   TEXT NOT NULL,
  planned_date      TEXT NOT NULL,
  priority          TEXT NOT NULL,
  status            TEXT NOT NULL,
  notes             TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_picking_tasks_status ON picking_tasks(status);
CREATE INDEX IF NOT EXISTS idx_picking_tasks_plot_id ON picking_tasks(plot_id);
CREATE INDEX IF NOT EXISTS idx_picking_tasks_task_no ON picking_tasks(task_no);

CREATE TABLE IF NOT EXISTS progress_reports (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES picking_tasks(id),
  picked_quantity REAL NOT NULL,
  report_time     TEXT NOT NULL,
  notes           TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_progress_reports_task_id ON progress_reports(task_id);

CREATE TABLE IF NOT EXISTS exception_reports (
  id               TEXT PRIMARY KEY,
  task_id          TEXT REFERENCES picking_tasks(id),
  exception_type   TEXT NOT NULL,
  description      TEXT NOT NULL,
  reporter         TEXT NOT NULL,
  report_time      TEXT NOT NULL,
  status           TEXT NOT NULL,
  resolution_notes TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exception_reports_status ON exception_reports(status);
CREATE INDEX IF NOT EXISTS idx_exception_reports_task_id ON exception_reports(task_id);
