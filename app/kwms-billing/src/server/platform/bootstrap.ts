import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createPermissionKit } from '@commonapp/permissionkit'
import { createApplicationAudit } from './audit'
import { authorizationRegistry } from './authorization'
import { createApplicationAuth } from './auth'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const permissionKit = createPermissionKit(db)
    const auditKit = createApplicationAudit(db)
    await permissionKit.syncRegistry(authorizationRegistry)
    const auth = createApplicationAuth(db, permissionKit, auditKit)
    return { db, permissionKit, auditKit, auth, close: () => db.close() }
  } catch (error) {
    await db.close()
    throw error
  }
}
