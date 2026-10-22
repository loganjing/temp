import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createPermissionKit } from '@commonapp/permissionkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createEmailClient } from '@commonapp/emailkit'
import { createApplicationAuth } from './auth'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })

    // permissionkit: sync registry with business roles and permissions
    const permission = createPermissionKit(db)
    await permission.syncRegistry({
      permissions: {
        'ticket:create': { key: 'ticket:create', description: '创建工单' },
        'ticket:read': { key: 'ticket:read', description: '查看工单' },
        'ticket:complete': { key: 'ticket:complete', description: '完成工单' },
        'ticket:cancel': { key: 'ticket:cancel', description: '取消工单' },
        'ticket:reply': { key: 'ticket:reply', description: '回复工单' },
        'ticket:transfer': { key: 'ticket:transfer', description: '转派工单' },
        'ticket:evaluate': { key: 'ticket:evaluate', description: '评价工单' },
        'group:manage': { key: 'group:manage', description: '管理业务组' },
        'category:manage': { key: 'category:manage', description: '管理分类与规则' },
        'dashboard:view': { key: 'dashboard:view', description: '查看仪表盘' },
      },
      roles: {
        submitter: ['ticket:create', 'ticket:read', 'ticket:reply', 'ticket:evaluate'],
        handler: ['ticket:read', 'ticket:complete', 'ticket:cancel', 'ticket:reply', 'ticket:transfer', 'dashboard:view'],
        admin: [
          'ticket:create', 'ticket:read', 'ticket:complete', 'ticket:cancel',
          'ticket:reply', 'ticket:transfer', 'ticket:evaluate',
          'group:manage', 'category:manage', 'dashboard:view',
        ],
      },
    })

    // auditkit
    const audit = createAuditKit(db)

    // emailkit: create client from SMTP_* env vars; skip when host is empty
    const email = createEmailClient({
      host: process.env.SMTP_HOST ?? '',
      port: Number(process.env.SMTP_PORT ?? 587),
      username: process.env.SMTP_USER || undefined,
      password: process.env.SMTP_PASS || undefined,
      from: {
        address: process.env.SMTP_FROM ?? 'noreply@example.com',
        name: process.env.SMTP_FROM_NAME ?? 'Ticket System',
      },
    })

    const auth = createApplicationAuth(db, permission)
    return {
      db,
      auth,
      permission,
      audit,
      email,
      close: () => {
        email.close()
        return db.close()
      },
    }
  } catch (error) {
    await db.close()
    throw error
  }
}
