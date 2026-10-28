-- 访客申请表
-- 列定义遵循 docs/wi-t1000396/architecture-baseline.md 数据库模型。
-- API 使用 camelCase，数据库使用 snake_case，转换在后端仓库层完成。
CREATE TABLE visitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  id_card TEXT NOT NULL,
  company TEXT NOT NULL,
  visit_reason TEXT NOT NULL,
  host_name TEXT NOT NULL,
  expected_visit_time TEXT NOT NULL,
  photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  review_comment TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
