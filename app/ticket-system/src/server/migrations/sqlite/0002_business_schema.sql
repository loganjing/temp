-- 工单系统业务 schema（编号自 0002 起，遵循 architecture-baseline.md §4）。
-- 0001 为 userkit 平台 users 表；本迁移创建工单业务全部表。

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- 用户角色/部门扩展：每用户一行，部门支撑提交人信息与部门统计，角色支撑授权。
CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  department TEXT,
  role TEXT NOT NULL CHECK (role IN ('submitter', 'handler', 'admin'))
);

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES groups(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE category_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL,
  group_id TEXT NOT NULL REFERENCES groups(id),
  UNIQUE (company_id, category)
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,                    -- 工单号 TK-xxxxxx（ticket_sequence 事务内发号）
  company_id TEXT NOT NULL REFERENCES companies(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL CHECK (status IN ('PENDING_ASSIGNMENT', 'PROCESSING', 'COMPLETED', 'CANCELLED')),
  submitter_id TEXT NOT NULL REFERENCES users(id),
  assigned_group_id TEXT REFERENCES groups(id),
  assignee_id TEXT REFERENCES users(id),
  completed_by TEXT REFERENCES users(id),
  completed_at TEXT,
  first_reply_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX tickets_company_status_idx ON tickets(company_id, status);

-- 工单号发号表：单行，创建事务内原子递增。
CREATE TABLE ticket_sequence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_value INTEGER NOT NULL
);
INSERT INTO ticket_sequence (id, current_value) VALUES (1, 10);

CREATE TABLE replies (
  id INTEGER PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX replies_ticket_idx ON replies(ticket_id);

-- 一工单一评（UNIQUE ticket_id）。
CREATE TABLE ratings (
  id INTEGER PRIMARY KEY,
  ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id),
  rater_id TEXT NOT NULL REFERENCES users(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE ticket_logs (
  id INTEGER PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN (
    'ticket.created', 'ticket.assigned', 'ticket.reassigned', 'ticket.replied',
    'ticket.completed', 'ticket.cancelled', 'ticket.rated'
  )),
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ticket_logs_ticket_idx ON ticket_logs(ticket_id);

-- 通知 outbox：emailkit 发送结果记录（sent/skipped/failed）。
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'skipped', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX notifications_ticket_idx ON notifications(ticket_id);
