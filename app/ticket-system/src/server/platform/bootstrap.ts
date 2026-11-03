import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createPermissionKit, type PermissionRegistry } from '@commonapp/permissionkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createEmailClient } from '@commonapp/emailkit'
import { createApplicationAuth, createEnrichContext } from './auth'

const ROLE_REGISTRY: PermissionRegistry = {
  permissions: {
    'ticket:create': { key: 'ticket:create', description: 'Create tickets' },
    'ticket:view': { key: 'ticket:view', description: 'View tickets' },
    'ticket:reply': { key: 'ticket:reply', description: 'Reply to tickets' },
    'ticket:transfer': { key: 'ticket:transfer', description: 'Transfer tickets' },
    'ticket:complete': { key: 'ticket:complete', description: 'Complete tickets' },
    'ticket:cancel': { key: 'ticket:cancel', description: 'Cancel tickets' },
    'ticket:evaluate': { key: 'ticket:evaluate', description: 'Evaluate tickets' },
    'ticket:logs': { key: 'ticket:logs', description: 'View ticket logs' },
    'group:manage': { key: 'group:manage', description: 'Manage business groups' },
    'rule:manage': { key: 'rule:manage', description: 'Manage assignment rules' },
    'stats:view': { key: 'stats:view', description: 'View statistics' },
    'profile:view': { key: 'profile:view', description: 'View user profiles' },
    'company:manage': { key: 'company:manage', description: 'Manage companies and departments' },
  },
  roles: {
    submitter: ['ticket:create', 'ticket:view', 'ticket:reply', 'ticket:evaluate', 'ticket:logs'],
    handler: ['ticket:view', 'ticket:reply', 'ticket:transfer', 'ticket:complete', 'ticket:logs', 'profile:view', 'stats:view'],
    admin: ['ticket:create', 'ticket:view', 'ticket:reply', 'ticket:transfer', 'ticket:complete', 'ticket:cancel', 'ticket:logs', 'group:manage', 'rule:manage', 'stats:view', 'profile:view', 'company:manage'],
  },
}

function createEmailClientIfConfigured() {
  const host = process.env.SMTP_HOST
  if (!host) return null
  return createEmailClient({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    username: process.env.SMTP_USER,
    password: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'ticket-system@localhost',
    secure: process.env.SMTP_SECURE === 'true',
  })
}

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const permissionKit = createPermissionKit(db)
    await permissionKit.syncRegistry(ROLE_REGISTRY)
    const auditKit = createAuditKit(db)
    const emailClient = createEmailClientIfConfigured()
    const auth = createApplicationAuth(db, permissionKit)
    const enrichContext = createEnrichContext(db, permissionKit)
    return { db, auth, permissionKit, auditKit, emailClient, enrichContext, close: () => db.close() }
  } catch (error) {
    await db.close()
    throw error
  }
}
