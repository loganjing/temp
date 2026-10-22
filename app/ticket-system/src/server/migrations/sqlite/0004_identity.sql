-- identity-access：公司、部门、成员与成员角色
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE company_members (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  department_id TEXT REFERENCES departments(id),
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX company_members_company_idx ON company_members(company_id, is_active);

CREATE TABLE company_member_roles (
  member_id TEXT NOT NULL REFERENCES company_members(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL,
  PRIMARY KEY (member_id, role_code)
);
