-- 工单系统初始化 Schema：10 张核心表
-- 主键统一 TEXT(UUID v4)，时间戳 TEXT(ISO 8601)，外键约束声明

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company_id TEXT NOT NULL,
  department TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE TABLE business_groups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE TABLE business_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (group_id) REFERENCES business_groups(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE category_assignment_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (group_id) REFERENCES business_groups(id)
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL,
  submitter_id TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  assigned_group_id TEXT,
  assigned_handler_id TEXT,
  processed_by TEXT,
  processed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (submitter_id) REFERENCES users(id),
  FOREIGN KEY (assigned_group_id) REFERENCES business_groups(id),
  FOREIGN KEY (assigned_handler_id) REFERENCES users(id),
  FOREIGN KEY (processed_by) REFERENCES users(id)
);

CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  replier_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (replier_id) REFERENCES users(id)
);

CREATE TABLE ticket_transfers (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  from_group_id TEXT,
  from_handler_id TEXT,
  to_group_id TEXT,
  to_handler_id TEXT,
  transferred_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (from_group_id) REFERENCES business_groups(id),
  FOREIGN KEY (from_handler_id) REFERENCES users(id),
  FOREIGN KEY (to_group_id) REFERENCES business_groups(id),
  FOREIGN KEY (to_handler_id) REFERENCES users(id),
  FOREIGN KEY (transferred_by) REFERENCES users(id)
);

CREATE TABLE ticket_evaluations (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  submitter_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (submitter_id) REFERENCES users(id)
);

-- 唯一约束：业务组成员不重复、公司+分类规则唯一、工单评价唯一
CREATE UNIQUE INDEX idx_bgm_group_user ON business_group_members(group_id, user_id);
CREATE UNIQUE INDEX idx_car_company_category ON category_assignment_rules(company_id, category_id);
CREATE UNIQUE INDEX idx_eval_ticket ON ticket_evaluations(ticket_id);
