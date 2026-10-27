-- 工单系统应用管理表。所有主键使用 TEXT (UUID v4)，由应用层生成。
-- 外键约束由 SQLite foreign_keys = ON（dbkit 创建客户端时启用）强制执行。

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX departments_company_idx ON departments(company_id);

CREATE TABLE user_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX user_profiles_user_idx ON user_profiles(user_id);
CREATE INDEX user_profiles_company_idx ON user_profiles(company_id);

CREATE TABLE business_groups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX business_groups_company_idx ON business_groups(company_id);

CREATE TABLE business_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX business_group_members_group_user_idx ON business_group_members(group_id, user_id);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  sla_priority TEXT NOT NULL CHECK (sla_priority IN ('P0','P1','P2','P3','P4')),
  submitter_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('created','pending_assignment','pending_processing','completed','cancelled')),
  assigned_group_id TEXT REFERENCES business_groups(id) ON DELETE SET NULL,
  handler_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX tickets_company_idx ON tickets(company_id);
CREATE INDEX tickets_status_idx ON tickets(status);
CREATE INDEX tickets_category_idx ON tickets(category_id);
CREATE INDEX tickets_submitter_idx ON tickets(submitter_id);
CREATE INDEX tickets_assigned_group_idx ON tickets(assigned_group_id);
CREATE INDEX tickets_sla_priority_idx ON tickets(sla_priority);
CREATE INDEX tickets_created_at_idx ON tickets(created_at);

CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  replier_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id, created_at);

CREATE TABLE processing_records (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  handler_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  processed_at TEXT NOT NULL
);

CREATE INDEX processing_records_ticket_idx ON processing_records(ticket_id);

CREATE TABLE satisfaction_ratings (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE category_assignment_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  target_group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX category_assignment_rules_company_category_idx ON category_assignment_rules(company_id, category_id);

CREATE TABLE ticket_transfers (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_group_id TEXT REFERENCES business_groups(id) ON DELETE SET NULL,
  to_group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE RESTRICT,
  transferred_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  transferred_at TEXT NOT NULL,
  reason TEXT
);

CREATE INDEX ticket_transfers_ticket_idx ON ticket_transfers(ticket_id);
