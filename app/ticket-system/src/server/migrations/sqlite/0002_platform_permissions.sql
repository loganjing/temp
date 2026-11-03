CREATE TABLE roles (
  role_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE permissions (
  permission_key TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_key TEXT NOT NULL REFERENCES roles(role_key) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);

CREATE TABLE user_role_assignments (
  user_id TEXT NOT NULL,
  role_key TEXT NOT NULL REFERENCES roles(role_key) ON DELETE CASCADE,
  scope_type TEXT NOT NULL DEFAULT '',
  scope_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, role_key, scope_type, scope_id)
);

CREATE INDEX user_role_assignments_user_idx
  ON user_role_assignments(user_id, role_key);
