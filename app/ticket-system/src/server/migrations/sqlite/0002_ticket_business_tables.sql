-- 工单系统业务表（架构基线第 3 节）。
-- platform_users（users 表）已由 0001_platform_users.sql 建立，本迁移只新增项目业务表。

CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  display_name TEXT NOT NULL,
  email TEXT,
  company_id INTEGER REFERENCES companies(id),
  department TEXT,
  role TEXT NOT NULL CHECK (role IN ('submitter', 'agent', 'admin', 'viewer')),
  created_at TEXT NOT NULL
);

CREATE INDEX user_profiles_company ON user_profiles(company_id);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO categories (name, sort_order) VALUES
  ('账号问题', 1),
  ('登录故障', 2),
  ('数据异常', 3),
  ('功能咨询', 4),
  ('付款与账单', 5),
  ('其他', 6);

CREATE TABLE business_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES business_groups(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (group_id, user_id)
);

CREATE INDEX group_members_user ON group_members(user_id);

CREATE TABLE routing_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  group_id INTEGER NOT NULL REFERENCES business_groups(id),
  UNIQUE (company_id, category_id)
);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL CHECK (status IN ('created', 'pending_assignment', 'in_progress', 'completed', 'cancelled')),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  submitter_id TEXT NOT NULL REFERENCES users(id),
  assigned_group_id INTEGER REFERENCES business_groups(id),
  completed_by TEXT REFERENCES users(id),
  completed_at TEXT,
  cancelled_by TEXT REFERENCES users(id),
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX tickets_company_status ON tickets(company_id, status);
CREATE INDEX tickets_group_status ON tickets(assigned_group_id, status);
CREATE INDEX tickets_submitter ON tickets(submitter_id);

CREATE TABLE ticket_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  author_name TEXT NOT NULL,
  author_side TEXT NOT NULL CHECK (author_side IN ('submitter', 'agent')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_replies_ticket_created ON ticket_replies(ticket_id, created_at);

CREATE TABLE ticket_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  action TEXT NOT NULL CHECK (action IN ('created', 'queued', 'auto_assigned', 'transferred', 'replied', 'completed', 'cancelled', 'rated')),
  operator_id TEXT,
  operator_name TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_logs_ticket_created ON ticket_logs(ticket_id, created_at);

CREATE TABLE satisfaction_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL UNIQUE REFERENCES tickets(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  rated_by TEXT NOT NULL REFERENCES users(id),
  rated_at TEXT NOT NULL
);

CREATE TABLE email_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error TEXT,
  created_at TEXT NOT NULL
);
