-- 工单系统业务表迁移。结构与 docs/wi-t1000083/architecture-baseline.md 数据模型一致。

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

-- users 表由平台迁移 0001 创建；此处补充部门维度以支持按部门统计与提交人部门展示。
ALTER TABLE users ADD COLUMN department_id TEXT REFERENCES departments(id);

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
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE(group_id, user_id)
);

CREATE INDEX business_group_members_group_idx ON business_group_members(group_id);
CREATE INDEX business_group_members_user_idx ON business_group_members(user_id);

CREATE TABLE category_assignment_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  business_group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(company_id, category)
);

CREATE INDEX category_rules_company_idx ON category_assignment_rules(company_id);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  sla_priority TEXT NOT NULL DEFAULT 'P3' CHECK (sla_priority IN ('P0','P1','P2','P3','P4')),
  status TEXT NOT NULL DEFAULT 'pending_assignment' CHECK (status IN ('created','pending_assignment','pending_processing','completed','cancelled')),
  submitter_id TEXT NOT NULL REFERENCES users(id),
  assigned_group_id TEXT REFERENCES business_groups(id),
  assignee_id TEXT REFERENCES users(id),
  handler_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  handled_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT REFERENCES users(id)
);

CREATE INDEX tickets_company_idx ON tickets(company_id);
CREATE INDEX tickets_status_idx ON tickets(company_id, status);
CREATE INDEX tickets_submitter_idx ON tickets(submitter_id);
CREATE INDEX tickets_assigned_group_idx ON tickets(assigned_group_id);

CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  replier_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  replied_at TEXT NOT NULL
);

CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id);

CREATE TABLE ticket_transfers (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_group_id TEXT,
  from_assignee_id TEXT REFERENCES users(id),
  to_group_id TEXT REFERENCES business_groups(id),
  to_assignee_id TEXT REFERENCES users(id),
  transferred_by TEXT NOT NULL REFERENCES users(id),
  transferred_at TEXT NOT NULL,
  reason TEXT
);

CREATE INDEX ticket_transfers_ticket_idx ON ticket_transfers(ticket_id);

CREATE TABLE ticket_evaluations (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  submitter_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  evaluated_at TEXT NOT NULL,
  UNIQUE(ticket_id)
);

CREATE INDEX ticket_evaluations_ticket_idx ON ticket_evaluations(ticket_id);
