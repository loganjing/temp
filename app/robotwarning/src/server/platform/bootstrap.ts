import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createAuditKit } from '@commonapp/auditkit'
import { WsHub } from '../ws/hub'

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
  const auditKit = createAuditKit(db)
  const wsHub = new WsHub()
  return { db, auditKit, wsHub, close: () => db.close() }
}
