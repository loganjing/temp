-- 工单系统业务表迁移

-- 为 users 表补充工单系统所需的 company 和 department 文本字段
ALTER TABLE users ADD COLUMN department TEXT;
ALTER TABLE users ADD COLUMN company TEXT;

-- 公司表
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 业务组表
CREATE TABLE business_groups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 业务组成员表
CREATE TABLE business_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES business_groups(id),
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(group_id, user_id)
);

-- 分类分配规则表
CREATE TABLE category_assignment_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL,
  group_id TEXT NOT NULL REFERENCES business_groups(id),
  created_at TEXT NOT NULL,
  UNIQUE(company_id, category)
);

-- 工单表
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  sla_priority TEXT NOT NULL CHECK (sla_priority IN ('P0','P1','P2','P3','P4')),
  status TEXT NOT NULL CHECK (status IN ('created','pending_assign','pending_process','completed','cancelled')),
  submitter_id TEXT NOT NULL,
  submitter_name TEXT NOT NULL,
  submitter_email TEXT NOT NULL,
  submitter_company TEXT,
  submitter_department TEXT,
  assigned_group_id TEXT,
  assigned_handler_id TEXT,
  handler_id TEXT,
  handler_name TEXT,
  processed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX tickets_submitter_idx ON tickets(submitter_id);
CREATE INDEX tickets_status_idx ON tickets(status);
CREATE INDEX tickets_assigned_group_idx ON tickets(assigned_group_id);

-- 工单回复表
CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id);

-- 工单转派记录表
CREATE TABLE ticket_transfers (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  from_user_id TEXT NOT NULL,
  from_user_name TEXT NOT NULL,
  to_group_id TEXT,
  to_user_id TEXT,
  to_user_name TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_transfers_ticket_idx ON ticket_transfers(ticket_id);

-- 工单评价表
CREATE TABLE ticket_evaluations (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(ticket_id)
);
