CREATE TABLE user_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  department_id TEXT,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('submitter','handler','admin')),
  created_at TEXT NOT NULL
);

CREATE INDEX user_profiles_user_idx ON user_profiles(user_id);
CREATE INDEX user_profiles_company_idx ON user_profiles(company_id);
