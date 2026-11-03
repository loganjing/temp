-- 0004_init_business.sql: 业务组织表（公司、部门、业务组、成员、分类、分配规则）
-- 所有主键和外键使用 TEXT，与平台一致。

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
  business_group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE(business_group_id, user_id)
);

CREATE TABLE ticket_categories (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE category_assignment_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  category_id TEXT NOT NULL REFERENCES ticket_categories(id),
  business_group_id TEXT NOT NULL REFERENCES business_groups(id),
  created_at TEXT NOT NULL,
  UNIQUE(category_id, company_id)
);

-- 为 users 表追加 department_id 列，支持按部门维度统计工单分布。
-- userkit 的 users 表由 0001 迁移创建，此处仅追加列，不修改已有列。
ALTER TABLE users ADD COLUMN department_id TEXT;
