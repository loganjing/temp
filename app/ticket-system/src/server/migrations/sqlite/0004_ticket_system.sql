-- 工单系统业务域 schema（依赖 0001 平台用户表、0003 审计事件表）
-- 公司：用户与工单的公司隔离维度
CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- 用户表扩展（userkit starter 表）：部门资料与工单域稳定数字工号
ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN user_no INTEGER;

-- 存量用户回填稳定数字工号；新用户由触发器在插入时分配
UPDATE users SET user_no = rowid WHERE user_no IS NULL;

CREATE UNIQUE INDEX users_user_no_unique ON users(user_no);

CREATE TRIGGER users_assign_user_no
AFTER INSERT ON users
WHEN NEW.user_no IS NULL
BEGIN
  UPDATE users
  SET user_no = (SELECT COALESCE(MAX(user_no), 0) + 1 FROM users WHERE user_no IS NOT NULL)
  WHERE id = NEW.id;
END;

-- 业务组：公司内唯一命名
CREATE TABLE business_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (company_id, name)
);

-- 业务组成员：组内唯一
CREATE TABLE group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES business_groups(id),
  user_no INTEGER NOT NULL REFERENCES users(user_no),
  created_at TEXT NOT NULL,
  UNIQUE (group_id, user_no)
);

-- 分类自动分配规则：公司内分类唯一
CREATE TABLE category_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL,
  group_id INTEGER NOT NULL REFERENCES business_groups(id),
  created_at TEXT NOT NULL,
  UNIQUE (company_id, category)
);

-- 工单主表：五态生命周期
CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL CHECK (status IN ('created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled')),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  submitter_no INTEGER NOT NULL REFERENCES users(user_no),
  assigned_group_id INTEGER REFERENCES business_groups(id),
  handler_no INTEGER REFERENCES users(user_no),
  handled_at TEXT,
  completed_at TEXT,
  resolution TEXT,
  cancel_reason TEXT,
  created_at TEXT NOT NULL
);

-- 多轮回复
CREATE TABLE ticket_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  replier_no INTEGER NOT NULL REFERENCES users(user_no),
  content TEXT NOT NULL,
  replied_at TEXT NOT NULL
);

-- 满意度评价：一单一评
CREATE TABLE ticket_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL UNIQUE REFERENCES tickets(id),
  submitter_no INTEGER NOT NULL REFERENCES users(user_no),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  rated_at TEXT NOT NULL
);

-- 完成通知邮件记录（本地发件箱 / SMTP 投递记录）
CREATE TABLE email_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER REFERENCES tickets(id),
  ticket_no TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('smtp', 'local')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX business_groups_company_idx ON business_groups(company_id);
CREATE INDEX group_members_group_idx ON group_members(group_id);
CREATE INDEX category_rules_company_idx ON category_rules(company_id, category);
CREATE INDEX tickets_company_idx ON tickets(company_id, created_at DESC);
CREATE INDEX tickets_submitter_idx ON tickets(submitter_no);
CREATE INDEX ticket_replies_ticket_idx ON ticket_replies(ticket_id, replied_at);
CREATE INDEX email_outbox_ticket_idx ON email_outbox(ticket_id);
