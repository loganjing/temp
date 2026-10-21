-- 工单系统领域表（companies / groups / group_members / assignment_rules /
-- tickets / replies / ratings / notification_log）及 users.department 扩展。
-- 审计事件表由 auditkit 管理（0003_platform_audit_events.sql），本文件只写应用领域表。

CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- userkit 的 users 表已有 company_id TEXT 列；在此补充部门字段。
ALTER TABLE users ADD COLUMN department TEXT;

CREATE TABLE groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  created_at TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE group_members (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE assignment_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (company_id, category)
);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('P0','P1','P2','P3','P4')),
  status TEXT NOT NULL CHECK (status IN ('pending_assignment','processing','completed','cancelled')),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  submitter_id TEXT NOT NULL REFERENCES users(id),
  current_group_id INTEGER REFERENCES groups(id),
  handler_id TEXT REFERENCES users(id),
  handled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX tickets_company_status_idx ON tickets(company_id, status);
CREATE INDEX tickets_group_status_idx ON tickets(current_group_id, status);
CREATE INDEX tickets_submitter_idx ON tickets(submitter_id);

CREATE TABLE replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX replies_ticket_created_idx ON replies(ticket_id, created_at);

CREATE TABLE ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  rater_id TEXT NOT NULL REFERENCES users(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent','failed')),
  sent_at TEXT NOT NULL,
  detail TEXT
);
