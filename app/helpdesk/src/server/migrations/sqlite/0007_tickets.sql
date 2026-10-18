-- Ticket domain: tickets, SLA pauses, replies, activities, ratings.
CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT UNIQUE,
  subject_zh TEXT NOT NULL,
  subject_en TEXT,
  description TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  sub_category_id INTEGER REFERENCES subcategories(id),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL CHECK (status IN
    ('draft', 'pending_assign', 'assigned', 'in_progress', 'on_hold', 'pending_confirm', 'cancelled', 'closed')),
  requester_id INTEGER NOT NULL REFERENCES biz_users(id),
  assignee_id INTEGER REFERENCES biz_users(id),
  team_id INTEGER REFERENCES teams(id),
  department_id INTEGER REFERENCES departments(id),
  idempotency_key TEXT,
  submit_idempotency_key TEXT UNIQUE,
  submitted_at TEXT,
  first_response_at TEXT,
  resolution_start_at TEXT,
  resolved_at TEXT,
  closed_at TEXT,
  sla_first_response_deadline TEXT,
  sla_resolution_deadline TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX tickets_idempotency_idx ON tickets(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX tickets_status_idx ON tickets(status);
CREATE INDEX tickets_requester_idx ON tickets(requester_id, status);
CREATE INDEX tickets_assignee_idx ON tickets(assignee_id, status);
CREATE INDEX tickets_department_idx ON tickets(department_id, status);
CREATE INDEX tickets_team_idx ON tickets(team_id);
CREATE INDEX tickets_updated_idx ON tickets(updated_at DESC);
CREATE INDEX tickets_submitted_idx ON tickets(submitted_at DESC);

CREATE TABLE ticket_sla_pauses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  reason TEXT NOT NULL,
  expected_resume_at TEXT
);

CREATE INDEX ticket_sla_pauses_ticket_idx ON ticket_sla_pauses(ticket_id, started_at);

CREATE TABLE replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES biz_users(id),
  body TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('normal', 'resolution', 'rejection')),
  created_at TEXT NOT NULL
);

CREATE INDEX replies_ticket_idx ON replies(ticket_id, created_at);

CREATE TABLE ticket_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES biz_users(id),
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  field_changes TEXT,
  remark_zh TEXT NOT NULL,
  remark_en TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('user', 'system', 'mcp')),
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_activities_ticket_idx ON ticket_activities(ticket_id, created_at);

CREATE TABLE ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  is_system_default INTEGER NOT NULL DEFAULT 0 CHECK (is_system_default IN (0, 1)),
  created_at TEXT NOT NULL
);
