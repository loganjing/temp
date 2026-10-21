-- 工单系统业务表（契约 docs/wi-t1000327/technical-contract.md 第 5 节）
-- 编号衔接 userkit 的 0001_platform_users.sql，不修改其结构。

CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_user_id INTEGER NOT NULL UNIQUE,      -- 关联 userkit platform_users
  company_id INTEGER NOT NULL REFERENCES companies(id),
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  department TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('submitter','agent','company_admin','platform_ops')),
  created_at TEXT NOT NULL
);

CREATE TABLE business_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES business_groups(id),
  user_profile_id INTEGER NOT NULL REFERENCES user_profiles(id),
  UNIQUE (group_id, user_profile_id)
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE assignment_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  group_id INTEGER NOT NULL REFERENCES business_groups(id),
  UNIQUE (company_id, category_id)
);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT NOT NULL UNIQUE,                -- 'TKT-' + 6 位零填充
  company_id INTEGER NOT NULL REFERENCES companies(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  priority TEXT NOT NULL CHECK (priority IN ('P0','P1','P2','P3','P4')),
  status TEXT NOT NULL CHECK (status IN ('pending_assign','processing','completed','cancelled')),
  submitter_id INTEGER NOT NULL REFERENCES user_profiles(id),
  group_id INTEGER REFERENCES business_groups(id),
  handler_id INTEGER REFERENCES user_profiles(id),
  first_reply_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tickets_company_status ON tickets (company_id, status);
CREATE INDEX idx_tickets_company_created ON tickets (company_id, created_at);
CREATE INDEX idx_tickets_group ON tickets (group_id);

CREATE TABLE ticket_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  author_id INTEGER NOT NULL REFERENCES user_profiles(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_replies_ticket ON ticket_replies (ticket_id, created_at);

CREATE TABLE ticket_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  actor_id INTEGER REFERENCES user_profiles(id),  -- NULL = 系统操作（自动分配）
  action TEXT NOT NULL CHECK (action IN ('created','auto_assigned','assigned','transferred','replied','completed','cancelled','rated')),
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_logs_ticket ON ticket_logs (ticket_id, created_at);

CREATE TABLE ticket_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL UNIQUE REFERENCES tickets(id),
  rater_id INTEGER NOT NULL REFERENCES user_profiles(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE email_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_user_id INTEGER NOT NULL REFERENCES user_profiles(id),
  recipient_email TEXT NOT NULL,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notifications_recipient ON email_notifications (recipient_user_id, created_at);
