import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createPermissionKit } from '@commonapp/permissionkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createEmailClient } from '@commonapp/emailkit'
import { createApplicationAuth } from './auth'
import { permissionRegistry } from '../../shared/constants'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const permissionKit = createPermissionKit(db)
    await permissionKit.syncRegistry(permissionRegistry)
    const auditKit = createAuditKit(db)
    const email = createEmailClient({
      host: process.env.SMTP_HOST ?? '',
      port: Number(process.env.SMTP_PORT ?? 587),
      username: process.env.SMTP_USERNAME || undefined,
      password: process.env.SMTP_PASSWORD || undefined,
      from: {
        address: process.env.SMTP_FROM ?? 'noreply@example.com',
        name: process.env.SMTP_FROM_NAME ?? 'Ticket System',
      },
    })
    const auth = createApplicationAuth(db, permissionKit)
    const close = () => {
      db.close()
      email.close()
    }
    return { db, auth, permissionKit, auditKit, email, close }
  } catch (error) {
    await db.close()
    throw error
  }
}
