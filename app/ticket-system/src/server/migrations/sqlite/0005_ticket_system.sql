-- 工单系统项目表（127-ticket，契约第 3 节）。
-- 模块表 users / audit_events 由模块迁移 0001 / 0003 建立，此处不重复定义。
-- 说明：契约将 user_profiles.user_id 标注为 INTEGER；userkit 平台用户主键实际为 TEXT(UUID)，
-- 为保证登录身份与业务档案的真实外键关联，项目表对用户的外键统一使用 TEXT。

CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  display_name TEXT NOT NULL,
  department TEXT,
  role TEXT NOT NULL CHECK (role IN ('submitter', 'handler', 'ops')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX user_profiles_company_idx ON user_profiles(company_id);

CREATE TABLE business_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE business_group_members (
  group_id INTEGER NOT NULL REFERENCES business_groups(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  added_at TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE assignment_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL,
  group_id INTEGER NOT NULL REFERENCES business_groups(id),
  created_at TEXT NOT NULL,
  UNIQUE (company_id, category)
);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL CHECK (status IN ('created', 'pending_assignment', 'in_progress', 'completed', 'cancelled')),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  submitter_user_id TEXT NOT NULL REFERENCES users(id),
  submitter_name TEXT NOT NULL,
  submitter_department TEXT,
  submitter_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  assigned_group_id INTEGER REFERENCES business_groups(id),
  assigned_handler_id TEXT REFERENCES users(id),
  handled_by TEXT REFERENCES users(id),
  handled_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT
);

CREATE INDEX tickets_company_status_idx ON tickets(company_id, status);
CREATE INDEX tickets_submitter_idx ON tickets(submitter_user_id);

CREATE TABLE ticket_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  author_user_id TEXT NOT NULL REFERENCES users(id),
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id, id);

CREATE TABLE ticket_ratings (
  ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- 推荐基线分类种子（契约第 3 节）。
INSERT INTO categories (name, created_at) VALUES
  ('账户与权限', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('功能使用', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('数据问题', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('性能问题', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('集成对接', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('其他', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
