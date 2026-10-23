import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createPermissionKit } from '@commonapp/permissionkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createEmailClient } from '@commonapp/emailkit'
import { createApplicationAuth } from './auth'

const permissionRegistry = {
  permissions: {
    'ticket.create': { key: 'ticket.create', description: 'Create tickets' },
    'ticket.view': { key: 'ticket.view', description: 'View tickets within company scope' },
    'ticket.reply': { key: 'ticket.reply', description: 'Reply to tickets' },
    'ticket.assign': { key: 'ticket.assign', description: 'Assign tickets to groups or users' },
    'ticket.transfer': { key: 'ticket.transfer', description: 'Transfer tickets to other handlers' },
    'ticket.complete': { key: 'ticket.complete', description: 'Complete tickets' },
    'ticket.cancel': { key: 'ticket.cancel', description: 'Cancel tickets' },
    'ticket.view_submitter_info': { key: 'ticket.view_submitter_info', description: 'View submitter information' },
    'ticket.rate': { key: 'ticket.rate', description: 'Rate ticket satisfaction' },
    'ticket.view_rating': { key: 'ticket.view_rating', description: 'View ticket rating' },
    'workbench.view': { key: 'workbench.view', description: 'View workbench' },
    'stats.view': { key: 'stats.view', description: 'View statistics' },
    'audit.view': { key: 'audit.view', description: 'View audit logs' },
    'org.manage': { key: 'org.manage', description: 'Manage companies, departments, categories, groups, and assignment rules' },
    'user.manage': { key: 'user.manage', description: 'Manage users' },
  },
  roles: {
    submitter: ['ticket.create', 'ticket.view', 'ticket.reply', 'ticket.rate', 'ticket.view_rating', 'ticket.cancel'],
    handler: ['ticket.view', 'ticket.reply', 'ticket.assign', 'ticket.transfer', 'ticket.complete', 'ticket.view_submitter_info', 'ticket.view_rating', 'workbench.view', 'audit.view'],
    admin: ['ticket.view', 'ticket.cancel', 'ticket.view_submitter_info', 'ticket.view_rating', 'workbench.view', 'stats.view', 'audit.view', 'org.manage', 'user.manage', 'ticket.assign', 'ticket.transfer', 'ticket.complete'],
  },
} as const

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const permissionKit = createPermissionKit(db)
    await permissionKit.syncRegistry(permissionRegistry)
    const auditKit = createAuditKit(db)
    const emailClient = createEmailClient({
      host: process.env.SMTP_HOST ?? '',
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
      username: process.env.SMTP_USER,
      password: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM ?? 'noreply@ticket-system.local',
    })
    const auth = createApplicationAuth(db, permissionKit)
    return { db, auth, permissionKit, auditKit, emailClient, close: async () => { emailClient.close(); await db.close() } }
  } catch (error) {
    await db.close()
    throw error
  }
}
