-- 128-ticket 工单系统业务表（契约 §2）
-- 公司隔离边界：所有业务表以 company_id 贯穿。

CREATE TABLE companies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  department TEXT,
  role TEXT NOT NULL CHECK (role IN ('submitter', 'agent', 'company_admin'))
);

CREATE TABLE groups (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE group_members (
  group_id INTEGER NOT NULL REFERENCES groups(id),
  user_id TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE company_categories (
  company_id INTEGER NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL,
  PRIMARY KEY (company_id, category)
);

CREATE TABLE category_rules (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  UNIQUE (company_id, category)
);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY,
  ticket_no TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL CHECK (status IN ('created', 'pending_assignment', 'processing', 'completed', 'cancelled')),
  submitter_user_id TEXT NOT NULL,
  submitter_name TEXT NOT NULL,
  submitter_email TEXT NOT NULL,
  submitter_department TEXT,
  group_id INTEGER REFERENCES groups(id),
  assignee_user_id TEXT,
  handler_user_id TEXT,
  handler_name TEXT,
  created_at TEXT NOT NULL,
  dispatched_at TEXT,
  assigned_at TEXT,
  first_reply_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT
);

CREATE INDEX tickets_company_status_idx ON tickets(company_id, status);
CREATE INDEX tickets_company_submitter_idx ON tickets(company_id, submitter_user_id);

CREATE TABLE ticket_replies (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  company_id INTEGER NOT NULL,
  author_user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_kind TEXT NOT NULL CHECK (author_kind IN ('submitter', 'agent')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id);

CREATE TABLE ratings (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL UNIQUE REFERENCES tickets(id),
  company_id INTEGER NOT NULL,
  rater_user_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE ticket_activity (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  company_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'dispatched', 'assigned', 'replied', 'transferred', 'completed', 'cancelled', 'rated')),
  operator_user_id TEXT,
  operator_name TEXT NOT NULL,
  detail TEXT,
  occurred_at TEXT NOT NULL
);

CREATE INDEX ticket_activity_ticket_idx ON ticket_activity(ticket_id);

CREATE TABLE notification_log (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  company_id INTEGER NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'skipped', 'failed')),
  sent_at TEXT NOT NULL
);

CREATE INDEX notification_log_ticket_idx ON notification_log(ticket_id);
