import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createPermissionKit, type PermissionRegistry } from '@commonapp/permissionkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createEmailClient } from '@commonapp/emailkit'
import { createApplicationAuth } from './auth'

/** 工单系统角色与权限注册表 */
const permissionRegistry: PermissionRegistry = {
  permissions: {
    manage_tickets: { key: 'manage_tickets', description: 'Create, view, reply, and manage tickets' },
    manage_org: { key: 'manage_org', description: 'Manage business groups, categories, and assignment rules' },
    view_workbench: { key: 'view_workbench', description: 'View the ticket workbench' },
    view_stats: { key: 'view_stats', description: 'View statistics and dashboards' },
    view_logs: { key: 'view_logs', description: 'View operation logs' },
  },
  roles: {
    submitter: ['manage_tickets'],
    handler: ['manage_tickets', 'view_workbench'],
    admin: ['manage_tickets', 'manage_org', 'view_workbench', 'view_stats', 'view_logs'],
  },
}

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
      port: Number(process.env.SMTP_PORT ?? 587),
      username: process.env.SMTP_USER,
      password: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM ?? 'no-reply@ticket-system.local',
    })
    const auth = createApplicationAuth(db, permissionKit)
    return { db, auth, permissionKit, auditKit, emailClient, close: () => { emailClient.close(); db.close() } }
  } catch (error) {
    await db.close()
    throw error
  }
}
