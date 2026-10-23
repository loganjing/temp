CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_assign',
  submitter_id TEXT NOT NULL,
  business_group_id TEXT,
  handler_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  handled_at TEXT,
  completed_at TEXT
);

CREATE INDEX tickets_company_idx
  ON tickets(company_id);

CREATE INDEX tickets_status_idx
  ON tickets(company_id, status);

CREATE INDEX tickets_submitter_idx
  ON tickets(submitter_id);

CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  replier_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_replies_ticket_idx
  ON ticket_replies(ticket_id, created_at);

CREATE TABLE ticket_transfers (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_handler_id TEXT,
  to_handler_id TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_transfers_ticket_idx
  ON ticket_transfers(ticket_id, created_at);

CREATE TABLE ticket_evaluations (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL
);
