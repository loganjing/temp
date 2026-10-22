-- 工单系统业务表：公司/部门/分类、用户业务属性、业务组与成员、分配规则、工单、回复、转派、满意度评价。
-- 时间列统一保存 ISO 8601 UTC 字符串，由应用层写入；DEFAULT 仅作为兜底。

CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX departments_company_idx ON departments(company_id);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 用户业务属性扩展 userkit 用户（users.id 为身份模块的字符串标识）
CREATE TABLE user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company_id INTEGER REFERENCES companies(id),
  department_id INTEGER REFERENCES departments(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX user_profiles_company_idx ON user_profiles(company_id);

CREATE TABLE business_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX business_groups_company_idx ON business_groups(company_id);

CREATE TABLE business_group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (group_id, user_id)
);

CREATE TABLE assignment_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  target_group_id INTEGER NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (company_id, category_id)
);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  sla_priority TEXT NOT NULL CHECK (sla_priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  submitter_user_id TEXT NOT NULL,
  submitter_name TEXT NOT NULL,
  submitter_email TEXT NOT NULL,
  submitter_department TEXT,
  business_group_id INTEGER REFERENCES business_groups(id),
  handler_user_id TEXT,
  handler_name TEXT,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  first_response_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT
);

CREATE INDEX tickets_company_status_idx ON tickets(company_id, status);
CREATE INDEX tickets_company_created_idx ON tickets(company_id, created_at DESC);
CREATE INDEX tickets_submitter_idx ON tickets(company_id, submitter_user_id);

CREATE TABLE ticket_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  replier_user_id TEXT NOT NULL,
  replier_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id, created_at);

CREATE TABLE ticket_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_group_id INTEGER REFERENCES business_groups(id),
  to_group_id INTEGER REFERENCES business_groups(id),
  from_user_id TEXT,
  to_user_id TEXT,
  transferred_by TEXT NOT NULL,
  transferred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX ticket_transfers_ticket_idx ON ticket_transfers(ticket_id, transferred_at);

CREATE TABLE ticket_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  rated_by TEXT NOT NULL,
  rated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);