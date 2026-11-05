import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createApplicationAuth } from './auth'
import { createPermissions, permissionRegistry } from './permissions'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const permissions = createPermissions(db)
    await permissions.syncRegistry(permissionRegistry)
    const auth = createApplicationAuth(db)
    return { db, auth, permissions, close: () => db.close() }
  } catch (error) {
    await db.close()
    throw error
  }
}
