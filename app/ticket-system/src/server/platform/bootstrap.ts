import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createPermissionKit } from '@commonapp/permissionkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createEmailClient } from '@commonapp/emailkit'
import { PERMISSION_REGISTRY } from '../../shared/enums'
import { createApplicationAuth } from './auth'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const permission = createPermissionKit(db)
    await permission.syncRegistry(PERMISSION_REGISTRY)
    const audit = createAuditKit(db)
    const auth = createApplicationAuth(db, { getRoles: (userId) => permission.getRoles(userId) })
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
    return {
      db,
      auth,
      permission,
      audit,
      email,
      close: () => { email.close(); db.close() },
    }
  } catch (error) {
    await db.close()
    throw error
  }
}
