import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createPermissionKit } from '@commonapp/permissionkit'
import { createApplicationAuth } from './auth'
import { registerRoles } from './roles'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const permissionKit = createPermissionKit(db)
    await registerRoles(permissionKit)
    const auth = createApplicationAuth(db, permissionKit)
    return { db, auth, permissionKit, close: () => db.close() }
  } catch (error) {
    await db.close()
    throw error
  }
}
