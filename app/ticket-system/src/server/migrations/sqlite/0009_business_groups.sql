CREATE TABLE business_groups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX business_groups_company_idx ON business_groups(company_id);

CREATE TABLE business_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user_profiles(id),
  created_at TEXT NOT NULL,
  UNIQUE (group_id, user_id)
);

CREATE INDEX business_group_members_group_idx ON business_group_members(group_id);
CREATE INDEX business_group_members_user_idx ON business_group_members(user_id);
