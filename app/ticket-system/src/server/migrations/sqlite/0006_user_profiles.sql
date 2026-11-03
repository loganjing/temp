CREATE TABLE user_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  department_id TEXT REFERENCES departments(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX user_profiles_user_idx ON user_profiles(user_id);
CREATE INDEX user_profiles_company_idx ON user_profiles(company_id);
