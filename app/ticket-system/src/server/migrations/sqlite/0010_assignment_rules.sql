CREATE TABLE assignment_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL,
  target_group_id TEXT NOT NULL REFERENCES business_groups(id),
  created_at TEXT NOT NULL,
  UNIQUE (company_id, category)
);

CREATE INDEX assignment_rules_company_idx ON assignment_rules(company_id, category);

CREATE TABLE ticket_evaluations (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(id),
  evaluator_id TEXT NOT NULL REFERENCES user_profiles(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_evaluations_ticket_idx ON ticket_evaluations(ticket_id);

CREATE TABLE ticket_transfer_records (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  from_group_id TEXT REFERENCES business_groups(id),
  to_group_id TEXT NOT NULL REFERENCES business_groups(id),
  transferred_by TEXT NOT NULL REFERENCES user_profiles(id),
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_transfer_records_ticket_idx ON ticket_transfer_records(ticket_id, created_at);
