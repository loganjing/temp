-- notification：工单完成通知的发送结果记录
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  channel TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX notifications_ticket_idx ON notifications(ticket_id, created_at);
