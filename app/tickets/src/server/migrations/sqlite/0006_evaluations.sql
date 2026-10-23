CREATE TABLE ticket_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  UNIQUE (ticket_id)
);

CREATE INDEX ticket_evaluations_ticket_idx ON ticket_evaluations(ticket_id);
