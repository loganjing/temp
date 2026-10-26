import type { DbClient } from '@commonapp/dbkit'
import { createPermissionKit, type PermissionRegistry } from '@commonapp/permissionkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createEmailClient, type EmailClient } from '@commonapp/emailkit'
import type { UserStore, AuthUser } from '@commonapp/userkit'
import type { Context } from 'hono'
import type { Role } from '../../shared/types'

/** Business error carrying HTTP status + contract error code. */
export class BusinessError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS business_groups (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS business_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (group_id, user_id)
);
CREATE TABLE IF NOT EXISTS assignment_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  business_group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (company_id, category)
);
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('P0','P1','P2','P3','P4')),
  status TEXT NOT NULL CHECK (status IN ('created','pending_assignment','pending_processing','completed','cancelled')),
  submitter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_group_id TEXT REFERENCES business_groups(id) ON DELETE SET NULL,
  assigned_handler_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  completed_at TEXT,
  completed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  first_assigned_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ticket_transfers (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_handler_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  from_group_id TEXT REFERENCES business_groups(id) ON DELETE SET NULL,
  to_handler_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  to_group_id TEXT REFERENCES business_groups(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ticket_evaluations (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (ticket_id)
);
CREATE INDEX IF NOT EXISTS tickets_company_status_idx ON tickets(company_id, status);
CREATE INDEX IF NOT EXISTS tickets_submitter_idx ON tickets(submitter_id, created_at);
CREATE INDEX IF NOT EXISTS tickets_assigned_handler_idx ON tickets(assigned_handler_id);
CREATE INDEX IF NOT EXISTS ticket_replies_ticket_idx ON ticket_replies(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS business_groups_company_idx ON business_groups(company_id);
CREATE INDEX IF NOT EXISTS assignment_rules_company_idx ON assignment_rules(company_id, category);
`

const schemaPromises = new WeakMap<DbClient, Promise<void>>()

/** Idempotently create project tables, memoized per database client. */
export function ensureProjectSchema(db: DbClient): Promise<void> {
  let p = schemaPromises.get(db)
  if (!p) {
    p = db.exec(SCHEMA_SQL).catch((error) => {
      schemaPromises.delete(db)
      throw error
    })
    schemaPromises.set(db, p)
  }
  return p
}

export type PermissionKit = ReturnType<typeof createPermissionKit>
export type AuditKit = ReturnType<typeof createAuditKit>

export interface BusinessServices {
  db: DbClient
  permissionKit: PermissionKit
  auditKit: AuditKit
  emailClient: EmailClient
  userStore: UserStore
}

export function createBusinessServices(platform: { db: DbClient; auth: { userStore: UserStore } }): BusinessServices {
  return {
    db: platform.db,
    permissionKit: createPermissionKit(platform.db),
    auditKit: createAuditKit(platform.db),
    emailClient: createEmailClient({
      host: process.env.SMTP_HOST ?? '',
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
      username: process.env.SMTP_USER,
      password: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM ?? 'no-reply@ticket-system.local',
    }),
    userStore: platform.auth.userStore,
  }
}

const ALL_PERMISSIONS = [
  'ticket.create', 'ticket.view', 'ticket.view_submitter_info', 'ticket.edit',
  'ticket.assign', 'ticket.process', 'ticket.complete', 'ticket.cancel',
  'ticket.reply', 'ticket.transfer', 'group.manage', 'group.view',
  'rule.manage', 'stats.view', 'stats.distribution', 'workbench.view',
  'logs.view', 'evaluation.submit', 'evaluation.view',
]

const PERMISSION_REGISTRY: PermissionRegistry = {
  permissions: Object.fromEntries(
    ALL_PERMISSIONS.map((key) => [key, { key, description: key }])
  ),
  roles: {
    submitter: ['ticket.create', 'ticket.view', 'ticket.edit', 'ticket.cancel', 'ticket.reply', 'evaluation.submit', 'evaluation.view'],
    handler: ['ticket.create', 'ticket.view', 'ticket.view_submitter_info', 'ticket.assign', 'ticket.process', 'ticket.complete', 'ticket.reply', 'ticket.transfer', 'group.view', 'stats.view', 'workbench.view'],
    admin: ALL_PERMISSIONS,
  },
}

const registryPromises = new WeakMap<PermissionKit, Promise<void>>()

/** Idempotently sync the approved role/permission registry, memoized per kit. */
export function ensurePermissionRegistry(permissionKit: PermissionKit): Promise<void> {
  let p = registryPromises.get(permissionKit)
  if (!p) {
    p = permissionKit.syncRegistry(PERMISSION_REGISTRY).then(() => undefined).catch((error) => {
      registryPromises.delete(permissionKit)
      throw error
    })
    registryPromises.set(permissionKit, p)
  }
  return p
}

export interface Session {
  userId: string
  companyId: string
  roles: Role[]
}

/** Resolve a trusted server-side session scope from the auth context + permission tables. */
export async function resolveSession(services: BusinessServices, context: Context): Promise<Session> {
  const user = (context as unknown as { get(key: string): AuthUser }).get('currentUser')
  const companyId = user?.companyId ?? null
  if (!user || !companyId) throw new BusinessError(403, 'FORBIDDEN', 'Current user has no company scope')
  const roles = (await services.permissionKit.getRoles(user.id)) as Role[]
  return { userId: user.id, companyId, roles }
}

export function hasRole(session: Session, role: Role): boolean {
  return session.roles.includes(role)
}

export function requireRole(session: Session, roles: Role[]): void {
  if (!roles.some((role) => session.roles.includes(role))) {
    throw new BusinessError(403, 'FORBIDDEN', 'Insufficient role for this action')
  }
}
