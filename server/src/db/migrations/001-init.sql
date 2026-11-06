CREATE TABLE IF NOT EXISTS visitors (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  phone                  TEXT NOT NULL,
  id_card                TEXT NOT NULL,
  company                TEXT NOT NULL,
  visit_reason           TEXT NOT NULL,
  host_name              TEXT,
  expected_arrival_time  TEXT,
  phone_source           TEXT NOT NULL DEFAULT 'manual',
  status                 TEXT NOT NULL DEFAULT 'pending',
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visitors_status ON visitors(status);
CREATE INDEX IF NOT EXISTS idx_visitors_phone ON visitors(phone);
