CREATE TABLE ticket_events (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  action TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('success', 'failed')),
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX ticket_events_ticket_created_idx ON ticket_events(ticket_id, created_at);

CREATE TABLE ticket_notifications (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  kind TEXT NOT NULL DEFAULT 'completion',
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'skipped', 'failed')),
  provider_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  attempt INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX ticket_notifications_ticket_created_idx ON ticket_notifications(ticket_id, created_at);
