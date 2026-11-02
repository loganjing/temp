-- 工单系统业务表迁移
-- 所有业务表包含 company_id 字段以实现公司隔离

-- 扩展 users 表：部门与角色（userkit 迁移已包含 company_id）
ALTER TABLE users ADD COLUMN department_id TEXT;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'submitter';

-- 公司
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 部门
CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX departments_company_idx ON departments(company_id);

-- 问题分类（公司级）
CREATE TABLE ticket_categories (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_categories_company_idx ON ticket_categories(company_id);

-- 工单
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES ticket_categories(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  submitter_id TEXT NOT NULL,
  sla_priority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_assignment',
  assigned_group_id TEXT,
  assigned_handler_id TEXT,
  handler_id TEXT,
  handled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX tickets_company_idx ON tickets(company_id);
CREATE INDEX tickets_status_idx ON tickets(company_id, status);
CREATE INDEX tickets_submitter_idx ON tickets(submitter_id);
CREATE INDEX tickets_handler_idx ON tickets(assigned_handler_id, status);

-- 工单回复
CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  replier_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id, created_at);

-- 业务组
CREATE TABLE business_groups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX business_groups_company_idx ON business_groups(company_id);

-- 业务组成员
CREATE TABLE business_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (group_id, user_id)
);

CREATE INDEX business_group_members_group_idx ON business_group_members(group_id);
CREATE INDEX business_group_members_user_idx ON business_group_members(user_id);

-- 自动分配规则（同 company_id + category_id 仅一条）
CREATE TABLE auto_assign_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES ticket_categories(id) ON DELETE CASCADE,
  target_group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (company_id, category_id)
);

CREATE INDEX auto_assign_rules_company_idx ON auto_assign_rules(company_id);

-- 转派记录
CREATE TABLE ticket_transfers (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  transferred_by TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_user_id TEXT,
  target_group_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_transfers_ticket_idx ON ticket_transfers(ticket_id, created_at);

-- 工单评价（同工单仅一条）
CREATE TABLE ticket_evaluations (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  evaluator_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (ticket_id)
);

CREATE INDEX ticket_evaluations_ticket_idx ON ticket_evaluations(ticket_id);
