CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  department TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX user_profiles_company_department_idx
  ON user_profiles(company_id, department);

CREATE TABLE ticket_categories (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE INDEX ticket_categories_company_enabled_idx
  ON ticket_categories(company_id, enabled);

CREATE TABLE business_groups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE INDEX business_groups_company_enabled_idx
  ON business_groups(company_id, enabled);

CREATE TABLE business_group_members (
  group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX business_group_members_user_idx
  ON business_group_members(user_id, company_id);

CREATE TABLE assignment_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  category_id TEXT NOT NULL REFERENCES ticket_categories(id),
  group_id TEXT NOT NULL REFERENCES business_groups(id),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (company_id, category_id)
);

CREATE TABLE counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

INSERT INTO counters (name, value) VALUES ('ticket_code', 0);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES ticket_categories(id),
  priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL CHECK (status IN ('pending_assignment', 'pending', 'completed', 'cancelled')),
  submitter_id TEXT NOT NULL REFERENCES users(id),
  group_id TEXT REFERENCES business_groups(id),
  assignee_id TEXT REFERENCES users(id),
  first_reply_at TEXT,
  completed_by TEXT REFERENCES users(id),
  completed_at TEXT,
  cancelled_by TEXT REFERENCES users(id),
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX tickets_company_status_created_idx
  ON tickets(company_id, status, created_at);

CREATE INDEX tickets_company_group_status_idx
  ON tickets(company_id, group_id, status);

CREATE INDEX tickets_company_submitter_created_idx
  ON tickets(company_id, submitter_id, created_at);

CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_replies_ticket_created_idx
  ON ticket_replies(ticket_id, created_at);

CREATE TABLE ticket_logs (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_logs_ticket_created_idx
  ON ticket_logs(ticket_id, created_at);

CREATE TABLE ticket_ratings (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  submitter_id TEXT NOT NULL REFERENCES users(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE ticket_notifications (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  attempt INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX ticket_notifications_ticket_created_idx
  ON ticket_notifications(ticket_id, created_at);
