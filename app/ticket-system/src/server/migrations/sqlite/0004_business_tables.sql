-- Business tables for the ticket system.
-- Depends on 0001_platform_users.sql (users table).

-- Companies (tenants for company isolation)
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Extend users with business fields
ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'submitter';

-- Business groups (teams of handlers)
CREATE TABLE business_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX business_groups_company_idx ON business_groups(company_id);

-- Business group members
CREATE TABLE business_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (group_id) REFERENCES business_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX business_group_members_unique_idx ON business_group_members(group_id, user_id);
CREATE INDEX business_group_members_user_idx ON business_group_members(user_id);

-- Problem categories
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX categories_company_idx ON categories(company_id);

-- Assignment rules (category -> business group mapping)
CREATE TABLE assignment_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES business_groups(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX assignment_rules_unique_idx ON assignment_rules(company_id, category_id);
CREATE INDEX assignment_rules_company_idx ON assignment_rules(company_id);

-- Tickets
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL DEFAULT 'unassigned' CHECK (status IN ('created', 'unassigned', 'pending', 'completed', 'cancelled')),
  submitter_id TEXT NOT NULL,
  handler_id TEXT,
  group_id TEXT,
  company_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (submitter_id) REFERENCES users(id),
  FOREIGN KEY (handler_id) REFERENCES users(id),
  FOREIGN KEY (group_id) REFERENCES business_groups(id),
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE INDEX tickets_company_idx ON tickets(company_id);
CREATE INDEX tickets_submitter_idx ON tickets(submitter_id);
CREATE INDEX tickets_handler_idx ON tickets(handler_id);
CREATE INDEX tickets_group_idx ON tickets(group_id);
CREATE INDEX tickets_company_status_idx ON tickets(company_id, status);

-- Ticket replies
CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  replier_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (replier_id) REFERENCES users(id)
);

CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id, created_at);

-- Ticket transfers (history of reassignments)
CREATE TABLE ticket_transfers (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  from_user_id TEXT,
  to_user_id TEXT,
  to_group_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (from_user_id) REFERENCES users(id),
  FOREIGN KEY (to_user_id) REFERENCES users(id),
  FOREIGN KEY (to_group_id) REFERENCES business_groups(id)
);

CREATE INDEX ticket_transfers_ticket_idx ON ticket_transfers(ticket_id, created_at);

-- Ticket evaluations (satisfaction survey)
CREATE TABLE ticket_evaluations (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX ticket_evaluations_ticket_idx ON ticket_evaluations(ticket_id);
