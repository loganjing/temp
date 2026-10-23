import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createPermissionKit, type PermissionRegistry } from '@commonapp/permissionkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createEmailClient, type EmailConfig } from '@commonapp/emailkit'
import { createApplicationAuth } from './auth'

const permissionRegistry: PermissionRegistry = {
  permissions: {
    ticket_create: { key: 'ticket_create', description: 'Create a ticket' },
    ticket_reply: { key: 'ticket_reply', description: 'Reply to a ticket' },
    ticket_view: { key: 'ticket_view', description: 'View tickets in own company' },
    ticket_view_all: { key: 'ticket_view_all', description: 'View tickets across companies' },
    ticket_cancel: { key: 'ticket_cancel', description: 'Cancel a ticket' },
    ticket_process: { key: 'ticket_process', description: 'Complete ticket processing' },
    ticket_transfer: { key: 'ticket_transfer', description: 'Transfer a ticket' },
    ticket_view_submitter: { key: 'ticket_view_submitter', description: 'View submitter full info' },
    ticket_evaluate: { key: 'ticket_evaluate', description: 'Evaluate a completed ticket' },
    workbench_view: { key: 'workbench_view', description: 'View the ticket workbench' },
    business_group_manage: { key: 'business_group_manage', description: 'Manage business groups and members' },
    category_manage: { key: 'category_manage', description: 'Manage ticket categories' },
    assignment_rule_manage: { key: 'assignment_rule_manage', description: 'Manage assignment rules' },
    statistics_view: { key: 'statistics_view', description: 'View statistics and dashboard' },
    audit_log_view: { key: 'audit_log_view', description: 'View audit logs' },
  },
  roles: {
    submitter: ['ticket_create', 'ticket_reply', 'ticket_view', 'ticket_cancel', 'ticket_evaluate'],
    handler: ['ticket_reply', 'ticket_view', 'ticket_process', 'ticket_transfer', 'ticket_view_submitter', 'workbench_view'],
    admin: [
      'ticket_create', 'ticket_reply', 'ticket_view', 'ticket_view_all', 'ticket_cancel',
      'ticket_process', 'ticket_transfer', 'ticket_view_submitter', 'ticket_evaluate',
      'workbench_view', 'business_group_manage', 'category_manage', 'assignment_rule_manage',
      'statistics_view', 'audit_log_view',
    ],
  },
}

function buildEmailConfig(): EmailConfig {
  return {
    host: process.env.SMTP_HOST ?? '',
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
    username: process.env.SMTP_USER,
    password: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM ?? 'no-reply@ticket-system.local',
  }
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
    const emailClient = createEmailClient(buildEmailConfig())
    const auth = createApplicationAuth(db, { permissionKit })
    return { db, auth, permissionKit, auditKit, emailClient, close: () => { emailClient.close(); db.close() } }
  } catch (error) {
    await db.close()
    throw error
  }
}
