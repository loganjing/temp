CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  submitter_profile_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  sla_priority TEXT NOT NULL CHECK(sla_priority IN ('P0','P1','P2','P3','P4')),
  status TEXT NOT NULL DEFAULT 'pending_assignment' CHECK(status IN ('pending_assignment','pending_processing','completed','cancelled')),
  assigned_group_id TEXT,
  assigned_handler_id TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  completed_by TEXT
);

CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  replier_profile_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE ticket_evaluations (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL UNIQUE,
  evaluator_profile_id TEXT NOT NULL,
  satisfaction_score INTEGER NOT NULL CHECK(satisfaction_score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX tickets_company_idx ON tickets(company_id);
CREATE INDEX tickets_status_idx ON tickets(status);
CREATE INDEX tickets_submitter_idx ON tickets(submitter_profile_id);
CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id);
