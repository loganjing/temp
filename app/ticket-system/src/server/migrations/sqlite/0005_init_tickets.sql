-- 0005_init_tickets.sql: 工单及关联表（工单、回复、转派记录、满意度评价）
-- 所有主键和外键使用 TEXT，与平台一致。

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES ticket_categories(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  submitter_id TEXT NOT NULL REFERENCES users(id),
  sla_priority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_assignment',
  business_group_id TEXT REFERENCES business_groups(id),
  handler_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  assigned_at TEXT,
  processed_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT
);

CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  replier_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE ticket_transfers (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_business_group_id TEXT REFERENCES business_groups(id),
  to_business_group_id TEXT NOT NULL REFERENCES business_groups(id),
  transferred_by TEXT NOT NULL REFERENCES users(id),
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE ticket_satisfactions (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(ticket_id)
);
