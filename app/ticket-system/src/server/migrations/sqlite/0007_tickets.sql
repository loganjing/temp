CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  submitter_id TEXT NOT NULL REFERENCES user_profiles(id),
  submitter_name TEXT NOT NULL,
  submitter_email TEXT NOT NULL,
  assigned_group_id TEXT REFERENCES business_groups(id),
  handler_id TEXT REFERENCES user_profiles(id),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  cancelled_at TEXT
);

CREATE INDEX tickets_company_idx ON tickets(company_id);
CREATE INDEX tickets_status_idx ON tickets(company_id, status);
CREATE INDEX tickets_submitter_idx ON tickets(submitter_id);
CREATE INDEX tickets_assigned_group_idx ON tickets(assigned_group_id);
CREATE INDEX tickets_category_idx ON tickets(company_id, category);
