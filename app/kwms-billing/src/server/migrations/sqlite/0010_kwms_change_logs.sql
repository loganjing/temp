-- 0010: KWMS 变更日志（前后值、原因、操作人、时间；各业务域经 audit 模块公开服务写入）
CREATE TABLE change_logs (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('编辑', '重算', '调整', '审核', '开票', '核销')),
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  operator_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX change_logs_entity_idx ON change_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX change_logs_type_idx ON change_logs(change_type, created_at DESC);
