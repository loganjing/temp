import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createEmailClient } from '@commonapp/emailkit'
import { createApplicationAuth } from './auth'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const auth = createApplicationAuth(db)
    const auditKit = createAuditKit(db)

    let emailClient: ReturnType<typeof createEmailClient> | null = null
    const smtpHost = process.env.SMTP_HOST
    if (smtpHost) {
      emailClient = createEmailClient({
        host: smtpHost,
        port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
        username: process.env.SMTP_USER,
        password: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM ?? 'no-reply@ticket-system.local',
      })
    }

    return {
      db,
      auth,
      auditKit,
      emailClient,
      close: () => {
        emailClient?.close()
        db.close()
      },
    }
  } catch (error) {
    await db.close()
    throw error
  }
}
