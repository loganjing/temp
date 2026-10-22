import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAuditKit } from '@commonapp/auditkit'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createApplicationAuth } from './auth'
import { createApplicationEmailClient } from './email'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const auth = createApplicationAuth(db)
    const audit = createAuditKit(db)
    const email = createApplicationEmailClient()
    return {
      db,
      auth,
      audit,
      email,
      close: async () => {
        email?.close()
        await db.close()
      },
    }
  } catch (error) {
    await db.close()
    throw error
  }
}
