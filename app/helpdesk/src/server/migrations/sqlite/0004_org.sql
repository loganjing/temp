-- Business organization and people (architecture baseline §4.1).
-- Credential storage stays in the platform `users` table (userkit migration 0001);
-- business attributes live here and are joined by credential_user_id.
CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  parent_id INTEGER REFERENCES companies(id),
  status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE biz_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credential_user_id TEXT NOT NULL UNIQUE,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('requester', 'agent', 'manager', 'admin')),
  company_id INTEGER REFERENCES companies(id),
  status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX biz_users_role_idx ON biz_users(role);
CREATE INDEX biz_users_company_idx ON biz_users(company_id);

CREATE TABLE departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  -- Stored for display only; routing never reads this flag (requirements §6.2/§9).
  assign_mode TEXT NOT NULL DEFAULT 'auto' CHECK (assign_mode IN ('auto', 'manual')),
  status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE department_managers (
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES biz_users(id),
  PRIMARY KEY (department_id, user_id)
);

-- Members attached directly to a department ("introduce new people" entry,
-- requirements §6.6). They widen the in-department candidate pool for teams.
CREATE TABLE department_users (
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES biz_users(id),
  PRIMARY KEY (department_id, user_id)
);

CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  code TEXT NOT NULL,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (department_id, code)
);

CREATE TABLE team_members (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES biz_users(id),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX team_members_user_idx ON team_members(user_id);

CREATE TABLE vacations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES biz_users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  auto_reply_text TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX vacations_user_idx ON vacations(user_id, start_date);
