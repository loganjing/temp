-- Business tables for the ticket system (architecture-baseline §2.5)

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, name)
);

-- Extend platform users table with department reference for stats and submitter info
ALTER TABLE users ADD COLUMN department_id TEXT;

CREATE TABLE ticket_categories (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(company_id, name)
);

CREATE TABLE business_groups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, name)
);

CREATE TABLE business_group_members (
  group_id TEXT NOT NULL REFERENCES business_groups(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE assignment_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  category_id TEXT NOT NULL REFERENCES ticket_categories(id),
  target_group_id TEXT NOT NULL REFERENCES business_groups(id),
  created_at TEXT NOT NULL,
  UNIQUE(company_id, category_id)
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT REFERENCES ticket_categories(id),
  status TEXT NOT NULL DEFAULT 'pending_assignment'
    CHECK (status IN ('created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'P2'
    CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  submitter_id TEXT NOT NULL REFERENCES users(id),
  submitter_email TEXT NOT NULL,
  assigned_group_id TEXT REFERENCES business_groups(id),
  assigned_user_id TEXT REFERENCES users(id),
  processed_by TEXT REFERENCES users(id),
  processed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE satisfaction_ratings (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  submitter_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(ticket_id)
);

CREATE INDEX tickets_company_status_idx ON tickets(company_id, status);
CREATE INDEX tickets_submitter_idx ON tickets(submitter_id);
CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id, created_at);
