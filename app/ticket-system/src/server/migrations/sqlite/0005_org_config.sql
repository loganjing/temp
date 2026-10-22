-- org-config：业务组、业务组成员与“分类→业务组”自动分配规则
CREATE TABLE business_groups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE business_group_members (
  group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES company_members(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, member_id)
);

CREATE TABLE assignment_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL,
  group_id TEXT NOT NULL REFERENCES business_groups(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (company_id, category)
);

CREATE INDEX assignment_rules_company_idx ON assignment_rules(company_id);
