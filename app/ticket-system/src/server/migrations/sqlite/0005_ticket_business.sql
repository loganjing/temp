CREATE TABLE business_groups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX business_groups_company_idx
  ON business_groups(company_id);

CREATE TABLE business_group_members (
  business_group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (business_group_id, user_id)
);

CREATE TABLE assignment_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL,
  business_group_id TEXT NOT NULL REFERENCES business_groups(id),
  created_at TEXT NOT NULL
);

CREATE INDEX assignment_rules_company_category_idx
  ON assignment_rules(company_id, category);
