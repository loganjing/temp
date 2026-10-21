-- 工单系统业务表（编号排在平台迁移 0001/0003 之后执行）。
-- 表结构与字段以架构基线 3.1 为准；公司隔离维度为 company_id。

CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  department_id INTEGER REFERENCES departments(id),
  cross_company_view INTEGER NOT NULL DEFAULT 0 CHECK (cross_company_view IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  user_id INTEGER NOT NULL REFERENCES user_profiles(id),
  UNIQUE (group_id, user_id)
);

CREATE TABLE assignment_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL,
  target_group_id INTEGER NOT NULL REFERENCES groups(id),
  created_at TEXT NOT NULL,
  UNIQUE (company_id, category)
);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL CHECK (status IN ('created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled')),
  submitter_user_id INTEGER NOT NULL REFERENCES user_profiles(id),
  assigned_group_id INTEGER REFERENCES groups(id),
  current_assignee_id INTEGER REFERENCES user_profiles(id),
  first_reply_at TEXT,
  completed_by INTEGER REFERENCES user_profiles(id),
  completed_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ticket_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  replier_user_id INTEGER NOT NULL REFERENCES user_profiles(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE ticket_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL UNIQUE REFERENCES tickets(id),
  rater_user_id INTEGER NOT NULL REFERENCES user_profiles(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at TEXT NOT NULL
);

CREATE INDEX tickets_company_status_idx ON tickets(company_id, status);
CREATE INDEX tickets_submitter_idx ON tickets(submitter_user_id, created_at);
CREATE INDEX tickets_assignee_idx ON tickets(current_assignee_id);
CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id, created_at);
CREATE INDEX group_members_user_idx ON group_members(user_id);
