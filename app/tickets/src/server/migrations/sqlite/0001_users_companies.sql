CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  company_id TEXT NOT NULL,
  department TEXT,
  role TEXT NOT NULL DEFAULT 'submitter',
  status TEXT NOT NULL DEFAULT 'active',
  password_change_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE INDEX users_company_idx ON users(company_id);
CREATE INDEX users_email_idx ON users(email);
