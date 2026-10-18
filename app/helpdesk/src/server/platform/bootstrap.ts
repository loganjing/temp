// Platform bootstrap: dbkit migrations + auth + attachments + auditkit +
// background job wiring. Everything reads env at call time so tests can boot
// isolated platforms with their own DB file or :memory:.
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations, type DbClient } from '@commonapp/dbkit'
import { createHelpdeskAuth, type HelpdeskAuth } from './auth'
import { createAttachmentService, type AttachmentService } from './attachments'
import { createConfigAudit, type ConfigAudit } from '../services/audit'
import { autoCloseOptionsFromEnv, startAutoCloseJob } from '../jobs/autoClose'

export interface Platform {
  db: DbClient
  auth: HelpdeskAuth
  attachments: AttachmentService
  configAudit: ConfigAudit
  close(): Promise<void>
}

export async function initializePlatform(env: NodeJS.ProcessEnv = process.env): Promise<Platform> {
  const sqlitePath = env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') {
    await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  }
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  await runMigrations(db, {
    directory: fileURLToPath(new URL('../migrations/', import.meta.url)),
  }).catch(async (error: unknown) => {
    await db.close()
    throw error
  })
  const auth = createHelpdeskAuth(db)
  const attachments = createAttachmentService(db, env)
  const configAudit = createConfigAudit(db)
  const autoClose = startAutoCloseJob(db, autoCloseOptionsFromEnv(env))
  return {
    db,
    auth,
    attachments,
    configAudit,
    close: async () => {
      autoClose.stop()
      await db.close()
    },
  }
}
