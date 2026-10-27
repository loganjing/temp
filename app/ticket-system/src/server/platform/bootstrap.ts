import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createApplicationAuth } from './auth'
import { createPermissionPolicy } from './permission'
import { createAuditService } from './audit'
import { createEmailService } from './email'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const auth = createApplicationAuth(db)
    const permission = createPermissionPolicy(db)
    const audit = createAuditService(db)
    const email = createEmailService()
    await permission.sync()
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
