-- SLA policies, work calendar and holidays (architecture baseline §4.1).
CREATE TABLE sla_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL UNIQUE REFERENCES categories(id) ON DELETE CASCADE,
  first_response_minutes INTEGER NOT NULL CHECK (first_response_minutes >= 0),
  resolution_minutes INTEGER NOT NULL CHECK (resolution_minutes >= 0),
  warn_threshold_percent INTEGER NOT NULL DEFAULT 80 CHECK (warn_threshold_percent BETWEEN 0 AND 100),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE work_calendar (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  weekdays TEXT NOT NULL,
  work_start_time TEXT NOT NULL,
  work_end_time TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  updated_at TEXT NOT NULL
);

CREATE TABLE holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (date)
);
