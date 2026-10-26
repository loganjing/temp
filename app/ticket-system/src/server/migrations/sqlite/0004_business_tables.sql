-- 工单系统业务表

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE business_groups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE business_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (group_id, user_id)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE assignment_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  target_group_id TEXT NOT NULL REFERENCES business_groups(id),
  created_at TEXT NOT NULL,
  UNIQUE (company_id, category_id)
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  submitter_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  assigned_group_id TEXT,
  assignee_id TEXT,
  processor_id TEXT,
  processed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX tickets_company_idx ON tickets(company_id);
CREATE INDEX tickets_submitter_idx ON tickets(submitter_id);
CREATE INDEX tickets_status_idx ON tickets(status);

CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  replier_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id);

CREATE TABLE satisfaction_ratings (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  submitted_at TEXT NOT NULL,
  UNIQUE (ticket_id)
);

-- 用户表补充部门字段
ALTER TABLE users ADD COLUMN department TEXT;
