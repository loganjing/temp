CREATE TABLE visitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  id_card TEXT NOT NULL,
  company TEXT NOT NULL,
  visit_reason TEXT NOT NULL,
  host_person TEXT NOT NULL,
  expected_arrival_time TEXT NOT NULL,
  license_plate TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT NULL
);
