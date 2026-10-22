-- ticket-workflow：工单主数据、公司内编号、回复、分配轨迹与满意度评价
CREATE TABLE ticket_no_sequences (
  company_id TEXT PRIMARY KEY REFERENCES companies(id),
  next_value INTEGER NOT NULL
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  ticket_no TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL CHECK (status IN ('created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled')),
  group_id TEXT REFERENCES business_groups(id),
  assignee_member_id TEXT REFERENCES company_members(id),
  submitter_member_id TEXT NOT NULL REFERENCES company_members(id),
  submitter_name TEXT NOT NULL,
  submitter_department TEXT,
  submitter_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  completed_by_member_id TEXT REFERENCES company_members(id),
  cancelled_at TEXT,
  UNIQUE (company_id, ticket_no)
);

CREATE INDEX tickets_company_status_idx ON tickets(company_id, status);

CREATE INDEX tickets_submitter_idx ON tickets(company_id, submitter_member_id, created_at DESC);

CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  author_member_id TEXT NOT NULL REFERENCES company_members(id),
  author_role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id, created_at);

CREATE TABLE ticket_assignments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  kind TEXT NOT NULL CHECK (kind IN ('auto', 'assign', 'transfer')),
  from_member_id TEXT REFERENCES company_members(id),
  to_member_id TEXT REFERENCES company_members(id),
  to_group_id TEXT REFERENCES business_groups(id),
  actor_member_id TEXT REFERENCES company_members(id),
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_assignments_ticket_idx ON ticket_assignments(ticket_id, created_at);

CREATE TABLE ticket_ratings (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL
);
