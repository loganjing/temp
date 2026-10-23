CREATE TABLE video_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  route_id TEXT NOT NULL,
  location TEXT NOT NULL,
  video_segment_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (route_id) REFERENCES patrol_routes(id)
);

CREATE INDEX video_events_route_id_idx ON video_events(route_id);
CREATE INDEX video_events_event_type_idx ON video_events(event_type);
CREATE INDEX video_events_occurred_at_idx ON video_events(occurred_at DESC);

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  alert_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  handler_name TEXT,
  handling_result TEXT,
  handling_note TEXT,
  handled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES video_events(id)
);

CREATE INDEX alerts_status_idx ON alerts(status);
CREATE INDEX alerts_event_id_idx ON alerts(event_id);
CREATE INDEX alerts_alert_time_idx ON alerts(alert_time DESC);
CREATE INDEX alerts_created_at_idx ON alerts(created_at DESC);
