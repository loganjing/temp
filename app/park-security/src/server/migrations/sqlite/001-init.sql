-- 园区安防系统初始 schema：7 张业务表 + video_sources 种子数据。

CREATE TABLE patrol_routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE patrol_points (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES patrol_routes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sequence_order INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE video_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  video_source_id TEXT NOT NULL REFERENCES video_sources(id),
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  status TEXT NOT NULL DEFAULT 'pending',
  alert_time TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE handling_records (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES alerts(id),
  handler TEXT NOT NULL,
  action TEXT NOT NULL,
  handling_result TEXT,
  handled_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE event_trails (
  id TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL,
  business_object_type TEXT NOT NULL,
  business_object_id TEXT NOT NULL,
  operation_time TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_patrol_points_route_id ON patrol_points(route_id);
CREATE INDEX idx_events_video_source_id ON events(video_source_id);
CREATE INDEX idx_alerts_event_id ON alerts(event_id);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_handling_records_alert_id ON handling_records(alert_id);
CREATE INDEX idx_event_trails_operation_type ON event_trails(operation_type);

-- 预置视频源种子数据：园区大门、停车场、仓库通道
INSERT INTO video_sources (id, name, source_url, created_at) VALUES
  ('11111111-1111-4111-8111-111111111111', '园区大门', 'rtsp://camera.gate.example/stream', '2026-01-01T00:00:00.000Z'),
  ('22222222-2222-4222-8222-222222222222', '停车场', 'rtsp://camera.parking.example/stream', '2026-01-01T00:00:00.000Z'),
  ('33333333-3333-4333-8333-333333333333', '仓库通道', 'rtsp://camera.warehouse.example/stream', '2026-01-01T00:00:00.000Z');
