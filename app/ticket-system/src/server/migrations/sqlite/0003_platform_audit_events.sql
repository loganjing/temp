CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  request_id TEXT,
  actor_user_id TEXT,
  channel TEXT,
  method TEXT,
  route TEXT,
  status_code INTEGER,
  reason TEXT,
  duration_ms INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX audit_events_occurred_at_idx
  ON audit_events(occurred_at DESC, id DESC);

CREATE INDEX audit_events_actor_idx
  ON audit_events(actor_user_id, occurred_at DESC);
