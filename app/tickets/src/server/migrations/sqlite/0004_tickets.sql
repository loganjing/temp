CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  sla_priority TEXT NOT NULL,
  company_id TEXT NOT NULL,
  submitter_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  handler_id INTEGER,
  group_id INTEGER,
  handled_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (submitter_id) REFERENCES users(id),
  FOREIGN KEY (handler_id) REFERENCES users(id)
);

CREATE INDEX tickets_company_idx ON tickets(company_id);
CREATE INDEX tickets_status_idx ON tickets(company_id, status);
CREATE INDEX tickets_category_idx ON tickets(company_id, category);
CREATE INDEX tickets_submitter_idx ON tickets(submitter_id);

CREATE TABLE ticket_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  replier_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (replier_id) REFERENCES users(id)
);

CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id);
