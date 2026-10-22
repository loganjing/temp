-- Migration 0001: Initial schema for ticket system

CREATE TABLE IF NOT EXISTS company (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES company(id),
  department TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('submitter','handler','admin'))
);

CREATE TABLE IF NOT EXISTS business_group (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id),
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS business_group_member (
  group_id TEXT NOT NULL REFERENCES business_group(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_user(id),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS assignment_rule (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id),
  category TEXT NOT NULL,
  group_id TEXT NOT NULL REFERENCES business_group(id),
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE(company_id, category) ON CONFLICT ABORT
);

CREATE TABLE IF NOT EXISTS ticket (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('P0','P1','P2','P3','P4')),
  status TEXT NOT NULL CHECK(status IN ('created','pending_assignment','pending_handling','completed','cancelled')),
  submitter_id TEXT NOT NULL REFERENCES app_user(id),
  created_at TEXT NOT NULL,
  group_id TEXT REFERENCES business_group(id),
  assigned_at TEXT,
  assigned_mode TEXT CHECK(assigned_mode IN ('auto','manual')),
  assignee_id TEXT REFERENCES app_user(id),
  handler_id TEXT REFERENCES app_user(id),
  handled_at TEXT,
  cancelled_at TEXT,
  resolution TEXT,
  cancel_reason TEXT
);

CREATE TABLE IF NOT EXISTS ticket_reply (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES app_user(id),
  author_role TEXT NOT NULL CHECK(author_role IN ('submitter','handler')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_transfer (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  from_group_id TEXT REFERENCES business_group(id),
  from_user_id TEXT REFERENCES app_user(id),
  to_group_id TEXT REFERENCES business_group(id),
  to_user_id TEXT REFERENCES app_user(id),
  transferred_by TEXT NOT NULL REFERENCES app_user(id),
  transferred_at TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS ticket_rating (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  rated_by TEXT NOT NULL REFERENCES app_user(id),
  score INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
  rated_at TEXT NOT NULL,
  UNIQUE(ticket_id) ON CONFLICT ABORT
);

CREATE TABLE IF NOT EXISTS operation_log (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN (
    'ticket_created','ticket_assigned','ticket_transferred',
    'ticket_replied','ticket_status_changed','ticket_completed',
    'ticket_cancelled','rating_submitted'
  )),
  actor_id TEXT NOT NULL REFERENCES app_user(id),
  created_at TEXT NOT NULL,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','sent','failed')),
  created_at TEXT NOT NULL,
  sent_at TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_ticket_company ON ticket(company_id);
CREATE INDEX IF NOT EXISTS idx_ticket_status ON ticket(status);
CREATE INDEX IF NOT EXISTS idx_ticket_category ON ticket(category);
CREATE INDEX IF NOT EXISTS idx_ticket_priority ON ticket(priority);
CREATE INDEX IF NOT EXISTS idx_ticket_submitter ON ticket(submitter_id);
CREATE INDEX IF NOT EXISTS idx_ticket_reply_ticket ON ticket_reply(ticket_id);
CREATE INDEX IF NOT EXISTS idx_operation_log_ticket ON operation_log(ticket_id);
CREATE INDEX IF NOT EXISTS idx_email_outbox_ticket ON email_outbox(ticket_id);
