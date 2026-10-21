-- 工单域迁移（docs/wi-t1000333/technical-contract.md 第 6 节）
-- 用户与凭证表由 userkit 拥有（0001_platform_users.sql）；审计事件表由 auditkit 拥有（0003_platform_audit_events.sql）。
-- 本迁移仅创建工单域表与固定分类种子，不复制用户 schema。

CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE user_org (
  user_id TEXT PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  department TEXT NOT NULL,
  is_company_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE business_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(company_id, name)
);

CREATE TABLE group_members (
  group_id INTEGER NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  PRIMARY KEY(group_id, user_id)
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE assignment_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  group_id INTEGER NOT NULL REFERENCES business_groups(id),
  UNIQUE(company_id, category_id)
);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  priority TEXT NOT NULL CHECK(priority IN ('P0','P1','P2','P3','P4')),
  status TEXT NOT NULL CHECK(status IN ('awaiting_assignment','pending','completed','cancelled')),
  submitter_user_id TEXT NOT NULL,
  assigned_group_id INTEGER REFERENCES business_groups(id),
  handler_user_id TEXT,
  handled_at TEXT,
  first_reply_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE ticket_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  author_user_id TEXT NOT NULL,
  author_side TEXT NOT NULL CHECK(author_side IN ('submitter','handler')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE ticket_ratings (
  ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id),
  submitter_user_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_tickets_company_status ON tickets(company_id, status);
CREATE INDEX idx_tickets_group_status ON tickets(assigned_group_id, status);
CREATE INDEX idx_tickets_submitter ON tickets(submitter_user_id, created_at);
CREATE INDEX idx_replies_ticket_time ON ticket_replies(ticket_id, created_at);

-- 固定分类集合（迁移种子，契约 6.2）
INSERT INTO categories (name) VALUES
  ('账号与权限'),
  ('功能缺陷'),
  ('数据问题'),
  ('性能问题'),
  ('集成对接'),
  ('使用咨询');
