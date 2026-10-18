-- Category catalog and assignment routing (architecture baseline §4.1).
-- Categories carry no assignment fields; routing lives in assignment_rules.
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  department_id INTEGER REFERENCES departments(id),
  ticket_type TEXT NOT NULL CHECK (ticket_type IN ('service_request', 'incident')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
  is_skeleton INTEGER NOT NULL DEFAULT 0 CHECK (is_skeleton IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX categories_department_idx ON categories(department_id);
CREATE INDEX categories_skeleton_idx ON categories(is_skeleton);

CREATE TABLE subcategories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  category_id INTEGER NOT NULL REFERENCES categories(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (category_id, code)
);

-- One rule per top-level category; multiple target teams allowed.
CREATE TABLE assignment_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL UNIQUE REFERENCES categories(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE assignment_rule_targets (
  rule_id INTEGER NOT NULL REFERENCES assignment_rules(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  PRIMARY KEY (rule_id, team_id)
);

-- Persisted round-robin cursors: `rule:<id>` rotates among target teams,
-- `member:<teamId>` rotates among members of the selected team.
-- Values survive restarts (requirements §6.2 / AC-03).
CREATE TABLE round_robin_cursors (
  scope TEXT PRIMARY KEY,
  last_value INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
