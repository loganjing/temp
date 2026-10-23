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

-- Seed roles
INSERT OR IGNORE INTO roles (role_key, name, updated_at) VALUES ('submitter', 'Submitter', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT OR IGNORE INTO roles (role_key, name, updated_at) VALUES ('handler', 'Handler', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT OR IGNORE INTO roles (role_key, name, updated_at) VALUES ('admin', 'Administrator', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

-- Seed permissions
INSERT OR IGNORE INTO permissions (permission_key, description, updated_at) VALUES ('ticket.create', 'Create tickets', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT OR IGNORE INTO permissions (permission_key, description, updated_at) VALUES ('ticket.view', 'View tickets', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT OR IGNORE INTO permissions (permission_key, description, updated_at) VALUES ('ticket.reply', 'Reply to tickets', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT OR IGNORE INTO permissions (permission_key, description, updated_at) VALUES ('ticket.cancel', 'Cancel tickets', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT OR IGNORE INTO permissions (permission_key, description, updated_at) VALUES ('ticket.transfer', 'Transfer tickets', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT OR IGNORE INTO permissions (permission_key, description, updated_at) VALUES ('ticket.complete', 'Complete tickets', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT OR IGNORE INTO permissions (permission_key, description, updated_at) VALUES ('ticket.view_submitter', 'View submitter info', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT OR IGNORE INTO permissions (permission_key, description, updated_at) VALUES ('ticket.evaluate', 'Evaluate tickets', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT OR IGNORE INTO permissions (permission_key, description, updated_at) VALUES ('business_group.manage', 'Manage business groups', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT OR IGNORE INTO permissions (permission_key, description, updated_at) VALUES ('assignment_rule.manage', 'Manage assignment rules', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT OR IGNORE INTO permissions (permission_key, description, updated_at) VALUES ('statistics.view', 'View statistics', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

-- Seed role_permissions: submitter
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('submitter', 'ticket.create');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('submitter', 'ticket.view');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('submitter', 'ticket.reply');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('submitter', 'ticket.cancel');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('submitter', 'ticket.evaluate');

-- Seed role_permissions: handler
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('handler', 'ticket.view');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('handler', 'ticket.reply');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('handler', 'ticket.transfer');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('handler', 'ticket.complete');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('handler', 'ticket.view_submitter');

-- Seed role_permissions: admin
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('admin', 'ticket.create');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('admin', 'ticket.view');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('admin', 'ticket.reply');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('admin', 'ticket.cancel');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('admin', 'ticket.transfer');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('admin', 'ticket.complete');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('admin', 'ticket.view_submitter');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('admin', 'ticket.evaluate');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('admin', 'business_group.manage');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('admin', 'assignment_rule.manage');
INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES ('admin', 'statistics.view');
