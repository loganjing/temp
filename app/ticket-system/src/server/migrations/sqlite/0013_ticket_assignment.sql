CREATE TABLE business_groups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE business_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(group_id, profile_id)
);

CREATE TABLE category_routing_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  category TEXT NOT NULL,
  target_group_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(company_id, category)
);

CREATE TABLE ticket_transfers (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  from_profile_id TEXT NOT NULL,
  to_group_id TEXT,
  to_profile_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX business_groups_company_idx ON business_groups(company_id);
CREATE INDEX business_group_members_group_idx ON business_group_members(group_id);
CREATE INDEX business_group_members_profile_idx ON business_group_members(profile_id);
CREATE INDEX category_routing_rules_company_idx ON category_routing_rules(company_id);
CREATE INDEX ticket_transfers_ticket_idx ON ticket_transfers(ticket_id);
