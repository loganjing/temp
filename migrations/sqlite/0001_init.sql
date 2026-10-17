-- 工单系统（121-full）初始结构迁移
-- 依据 docs/wi-t1000293/architecture-baseline.md 第 3.1 节

CREATE TABLE companies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL REFERENCES companies (id),
  department TEXT NOT NULL DEFAULT '',
  is_company_admin INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_users_company ON users (company_id);

CREATE TABLE business_groups (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies (id),
  name TEXT NOT NULL,
  UNIQUE (company_id, name)
);
CREATE INDEX idx_business_groups_company ON business_groups (company_id);

CREATE TABLE group_members (
  group_id INTEGER NOT NULL REFERENCES business_groups (id),
  user_id INTEGER NOT NULL REFERENCES users (id),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX idx_group_members_user ON group_members (user_id);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE assignment_rules (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies (id),
  category_id INTEGER NOT NULL REFERENCES categories (id),
  group_id INTEGER NOT NULL REFERENCES business_groups (id),
  UNIQUE (company_id, category_id)
);
CREATE INDEX idx_assignment_rules_category ON assignment_rules (category_id);
CREATE INDEX idx_assignment_rules_group ON assignment_rules (group_id);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY,
  ticket_no TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id INTEGER NOT NULL REFERENCES categories (id),
  priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL CHECK (status IN ('created', 'pending_assignment', 'processing', 'completed', 'cancelled')),
  submitter_id INTEGER NOT NULL REFERENCES users (id),
  assigned_group_id INTEGER REFERENCES business_groups (id),
  assignee_id INTEGER REFERENCES users (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  completed_by INTEGER REFERENCES users (id)
);
CREATE INDEX idx_tickets_status ON tickets (status);
CREATE INDEX idx_tickets_category ON tickets (category_id);
CREATE INDEX idx_tickets_submitter ON tickets (submitter_id);
CREATE INDEX idx_tickets_assigned_group ON tickets (assigned_group_id);
CREATE INDEX idx_tickets_created_at ON tickets (created_at);

CREATE TABLE ticket_replies (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets (id),
  author_id INTEGER NOT NULL REFERENCES users (id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ticket_replies_ticket ON ticket_replies (ticket_id);

CREATE TABLE ticket_events (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets (id),
  type TEXT NOT NULL CHECK (type IN ('created', 'dispatched', 'assigned', 'reassigned', 'completed', 'cancelled', 'rated')),
  actor_id INTEGER NOT NULL REFERENCES users (id),
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ticket_events_ticket ON ticket_events (ticket_id);

CREATE TABLE satisfaction_ratings (
  ticket_id INTEGER PRIMARY KEY REFERENCES tickets (id),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL
);
