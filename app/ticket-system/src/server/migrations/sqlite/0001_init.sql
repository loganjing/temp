-- 工单管理系统初始 schema（ticket-1）。
-- schema 变更只通过新增递增编号迁移文件，已执行的迁移不得修改。
-- 字段与约束来源：docs/wi-t1000058/architecture-baseline.md 第 4.1 节。

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  department TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE business_groups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES business_groups(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (group_id, user_id)
);

CREATE TABLE assignment_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL,
  group_id TEXT NOT NULL REFERENCES business_groups(id),
  created_at TEXT NOT NULL,
  UNIQUE (company_id, category)
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  submitter_id TEXT NOT NULL REFERENCES users(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  assigned_group_id TEXT REFERENCES business_groups(id),
  handler_id TEXT REFERENCES users(id),
  handled_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE ticket_transfers (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  from_group_id TEXT REFERENCES business_groups(id),
  to_group_id TEXT REFERENCES business_groups(id),
  to_user_id TEXT REFERENCES users(id),
  operator_id TEXT NOT NULL REFERENCES users(id),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE ticket_evaluations (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id),
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 初始数据：一个示例公司与身份选择器所需的最小用户/业务组。
-- 契约未提供公司创建端点，公司记录只能来自迁移；运行时新建用户/业务组/工单均以该公司为上下文。
INSERT INTO companies (id, name, created_at) VALUES ('c_1', '示例公司', '2026-10-17T00:00:00.000Z');

INSERT INTO users (id, name, email, company_id, department, created_at) VALUES
  ('u_1', '张三', 'zhangsan@example.com', 'c_1', 'IT部', '2026-10-17T00:00:00.000Z'),
  ('u_2', '王五', 'wangwu@example.com', 'c_1', '网络部', '2026-10-17T00:00:00.000Z');

INSERT INTO business_groups (id, company_id, name, created_at) VALUES ('g_1', 'c_1', '网络组', '2026-10-17T00:00:00.000Z');

INSERT INTO group_members (id, group_id, user_id, created_at) VALUES ('gm_1', 'g_1', 'u_2', '2026-10-17T00:00:00.000Z');
