CREATE TABLE ticket_sequences (
  name TEXT PRIMARY KEY,
  next_seq INTEGER NOT NULL
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  department_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL CHECK (status IN ('unassigned', 'in_progress', 'completed', 'cancelled')),
  submitter_id TEXT NOT NULL,
  submitter_name TEXT NOT NULL,
  submitter_email TEXT NOT NULL,
  group_id TEXT,
  assignee_id TEXT,
  assignee_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  first_response_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  satisfaction_score INTEGER CHECK (satisfaction_score BETWEEN 1 AND 5),
  satisfaction_comment TEXT,
  satisfaction_at TEXT
);

CREATE INDEX tickets_company_status_created_idx ON tickets(company_id, status, created_at);
CREATE INDEX tickets_group_status_idx ON tickets(group_id, status);
CREATE INDEX tickets_submitter_created_idx ON tickets(submitter_id, created_at);
CREATE INDEX tickets_category_idx ON tickets(category_id);

CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_replies_ticket_created_idx ON ticket_replies(ticket_id, created_at);

CREATE TABLE ticket_transfers (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  from_group_id TEXT NOT NULL,
  to_group_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_transfers_ticket_idx ON ticket_transfers(ticket_id, created_at);
