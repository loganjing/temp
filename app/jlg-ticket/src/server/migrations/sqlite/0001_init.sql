-- Initial schema for ticket system (T1000487)
-- 8 tables: companies, business_groups, group_members, assignment_rules,
-- tickets, ticket_replies, ticket_transfers, evaluations

CREATE TABLE companies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE business_groups (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE group_members (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL REFERENCES business_groups(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE assignment_rules (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL,
  target_group_id TEXT NOT NULL REFERENCES business_groups(id),
  created_at TEXT NOT NULL,
  UNIQUE(company_id, category)
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  sla_priority TEXT NOT NULL,
  submitter_name TEXT NOT NULL,
  submitter_company_id TEXT NOT NULL REFERENCES companies(id),
  submitter_department TEXT NOT NULL,
  submitter_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_assign',
  current_group_id TEXT REFERENCES business_groups(id),
  handler_member_id TEXT REFERENCES group_members(id),
  handler_name TEXT,
  processed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  replier_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE ticket_transfers (
  id TEXT PRIMARY KEY NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  from_group_id TEXT NOT NULL REFERENCES business_groups(id),
  to_group_id TEXT NOT NULL REFERENCES business_groups(id),
  transferred_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE evaluations (
  id TEXT PRIMARY KEY NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_sla_priority ON tickets(sla_priority);
CREATE INDEX idx_tickets_category ON tickets(category);
CREATE INDEX idx_tickets_current_group_id ON tickets(current_group_id);
CREATE INDEX idx_tickets_submitter_email ON tickets(submitter_email);
CREATE INDEX idx_tickets_submitter_company_id ON tickets(submitter_company_id);
CREATE INDEX idx_ticket_replies_ticket_id ON ticket_replies(ticket_id);
CREATE INDEX idx_ticket_transfers_ticket_id ON ticket_transfers(ticket_id);
CREATE INDEX idx_evaluations_ticket_id ON evaluations(ticket_id);
