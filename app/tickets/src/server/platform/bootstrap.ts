import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createPermissionKit, type PermissionRegistry } from '@commonapp/permissionkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createEmailClient, type EmailClient } from '@commonapp/emailkit'
import { createAuthResources, type AuthResources } from './auth'

// Permission registry: roles and their permission keys for the ticket system.
const PERMISSION_REGISTRY: PermissionRegistry = {
  permissions: {
    'ticket:create': { key: 'ticket:create', description: 'Create a ticket' },
    'ticket:list': { key: 'ticket:list', description: 'View ticket list' },
    'ticket:read': { key: 'ticket:read', description: 'View ticket detail' },
    'ticket:reply': { key: 'ticket:reply', description: 'Reply to a ticket' },
    'ticket:status': { key: 'ticket:status', description: 'Change ticket status' },
    'ticket:transfer': { key: 'ticket:transfer', description: 'Transfer a ticket' },
    'ticket:complete': { key: 'ticket:complete', description: 'Complete a ticket' },
    'ticket:evaluate': { key: 'ticket:evaluate', description: 'Evaluate a completed ticket' },
    'group:manage': { key: 'group:manage', description: 'Manage business groups and members' },
    'rule:manage': { key: 'rule:manage', description: 'Manage auto-assignment rules' },
    'stats:view': { key: 'stats:view', description: 'View statistics and dashboard' },
    'audit:view': { key: 'audit:view', description: 'View audit logs' },
  },
  roles: {
    submitter: ['ticket:create', 'ticket:read', 'ticket:reply', 'ticket:evaluate'],
    handler: ['ticket:list', 'ticket:read', 'ticket:reply', 'ticket:status', 'ticket:transfer', 'ticket:complete'],
    admin: [
      'ticket:list', 'ticket:read', 'ticket:reply', 'ticket:status', 'ticket:transfer', 'ticket:complete',
      'group:manage', 'rule:manage', 'stats:view', 'audit:view',
    ],
  },
}

function createEmailClientFromEnv(): EmailClient | null {
  const host = process.env.SMTP_HOST
  if (!host) return null
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587
  return createEmailClient({
    host,
    port,
    username: process.env.SMTP_USERNAME,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM ?? 'tickets@example.com',
    secure: process.env.SMTP_SECURE === 'true',
  })
}

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  await runMigrations(db, {
    directory: fileURLToPath(new URL('../migrations/', import.meta.url)),
  }).catch(async (error: unknown) => {
    await db.close()
    throw error
  })

  const permissionKit = createPermissionKit(db)
  await permissionKit.syncRegistry(PERMISSION_REGISTRY)

  const auditKit = createAuditKit(db)

  const emailClient = createEmailClientFromEnv()

  const auth = createAuthResources(db)

  return {
    db,
    auth,
    permissionKit,
    auditKit,
    emailClient,
    close: () => db.close(),
  }
}

export type Platform = Awaited<ReturnType<typeof initializePlatform>>
