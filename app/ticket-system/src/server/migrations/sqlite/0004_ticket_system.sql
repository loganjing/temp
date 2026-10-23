-- 工单系统业务表

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- users 表已有 company_id，补充 department 列
ALTER TABLE users ADD COLUMN department TEXT;

CREATE TABLE business_groups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL
);

CREATE INDEX business_groups_company_idx ON business_groups(company_id);

CREATE TABLE business_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id)
);

CREATE INDEX business_group_members_group_idx ON business_group_members(group_id);
CREATE INDEX business_group_members_user_idx ON business_group_members(user_id);

CREATE TABLE ticket_categories (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL
);

CREATE INDEX ticket_categories_company_idx ON ticket_categories(company_id);

CREATE TABLE assignment_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  category_id TEXT NOT NULL REFERENCES ticket_categories(id),
  group_id TEXT NOT NULL REFERENCES business_groups(id)
);

CREATE INDEX assignment_rules_company_category_idx ON assignment_rules(company_id, category_id);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  subject TEXT NOT NULL,
  description TEXT,
  category_id TEXT REFERENCES ticket_categories(id),
  priority TEXT NOT NULL CHECK (priority IN ('P0','P1','P2','P3','P4')),
  status TEXT NOT NULL CHECK (status IN ('created','pending_assignment','pending_processing','completed','cancelled')),
  submitter_id TEXT NOT NULL REFERENCES users(id),
  submitter_name TEXT NOT NULL,
  submitter_email TEXT NOT NULL,
  submitter_company TEXT NOT NULL,
  submitter_department TEXT,
  assigned_group_id TEXT REFERENCES business_groups(id),
  assigned_handler_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  processed_at TEXT,
  completed_at TEXT,
  completed_by TEXT REFERENCES users(id)
);

CREATE INDEX tickets_company_idx ON tickets(company_id);
CREATE INDEX tickets_submitter_idx ON tickets(submitter_id);
CREATE INDEX tickets_status_idx ON tickets(status);
CREATE INDEX tickets_handler_idx ON tickets(assigned_handler_id);

CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  replier_id TEXT NOT NULL REFERENCES users(id),
  replier_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id, created_at);

CREATE TABLE ticket_transfers (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_user_id TEXT NOT NULL REFERENCES users(id),
  to_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_transfers_ticket_idx ON ticket_transfers(ticket_id, created_at);

CREATE TABLE ticket_evaluations (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  evaluator_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_evaluations_ticket_idx ON ticket_evaluations(ticket_id);
