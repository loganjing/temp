-- 工单系统业务域表结构（架构基线 §4.1；时间戳为 ISO-8601 UTC 文本）。
CREATE TABLE companies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  department TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE business_groups (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(company_id, name)
);

CREATE TABLE business_group_members (
  group_id INTEGER NOT NULL REFERENCES business_groups(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(group_id, user_id)
);

CREATE TABLE assignment_rules (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  group_id INTEGER NOT NULL REFERENCES business_groups(id),
  created_at TEXT NOT NULL,
  UNIQUE(company_id, category_id)
);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY,
  ticket_no TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id INTEGER NOT NULL REFERENCES categories(id),
  priority TEXT NOT NULL CHECK(priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL CHECK(status IN ('created', 'pending_assignment', 'pending_process', 'completed', 'cancelled')),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  submitter_id INTEGER NOT NULL REFERENCES users(id),
  assigned_group_id INTEGER REFERENCES business_groups(id),
  completed_by INTEGER REFERENCES users(id),
  completed_at TEXT,
  first_reply_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ticket_replies (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE ticket_ratings (
  ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  rated_by INTEGER NOT NULL REFERENCES users(id),
  rated_at TEXT NOT NULL
);

CREATE TABLE mail_outbox (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER REFERENCES tickets(id),
  kind TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX tickets_company_status_idx ON tickets(company_id, status);
CREATE INDEX tickets_submitter_idx ON tickets(submitter_id);
CREATE INDEX tickets_assigned_group_idx ON tickets(assigned_group_id);
CREATE INDEX ticket_replies_ticket_created_idx ON ticket_replies(ticket_id, created_at);
CREATE INDEX mail_outbox_ticket_idx ON mail_outbox(ticket_id);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);
