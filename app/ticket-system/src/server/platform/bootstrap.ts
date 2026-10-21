import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createApplicationAuth } from './auth'
import { createEmailPlatform } from './email'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const auth = createApplicationAuth(db)
    const audit = createAuditKit(db)
    const email = createEmailPlatform()
    return {
      db,
      auth,
      audit,
      email,
      close: async () => {
        email.close()
        await db.close()
      },
    }
  } catch (error) {
    await db.close()
    throw error
  }
}
