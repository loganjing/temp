import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  await runMigrations(db, {
    directory: fileURLToPath(new URL('../migrations/', import.meta.url)),
  }).catch(async (error: unknown) => {
    await db.close()
    throw error
  })
  return { db, close: () => db.close() }
}
