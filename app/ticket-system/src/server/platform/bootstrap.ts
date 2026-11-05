import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createPermissionKit } from '@commonapp/permissionkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createEmailClient } from '@commonapp/emailkit'
import { createApplicationAuth } from './auth'
import { ticketPermissionRegistry } from './permissions'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const permission = createPermissionKit(db)
    // 同步角色与权限目录；幂等，重复启动安全。
    await permission.syncRegistry(ticketPermissionRegistry)
    const audit = createAuditKit(db)
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
    const close = () => { email.close(); db.close() }
    return { db, auth, permission, audit, email, close }
  } catch (error) {
    await db.close()
    throw error
  }
}
