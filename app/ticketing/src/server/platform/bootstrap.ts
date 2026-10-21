import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createEmailClient, type EmailClient } from '@commonapp/emailkit'
import { createApplicationAuth } from './auth'

function buildEmailClient(): EmailClient | null {
  const host = process.env.SMTP_HOST
  if (!host) return null
  return createEmailClient({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    username: process.env.SMTP_USER || undefined,
    password: process.env.SMTP_PASS || undefined,
    from: {
      address: process.env.MAIL_FROM ?? 'noreply@example.com',
      name: process.env.SMTP_FROM_NAME ?? 'Ticketing',
    },
    secure: process.env.SMTP_SECURE === 'true' ? true : undefined,
  })
}

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const auth = createApplicationAuth(db)
    const audit = createAuditKit(db, { now: () => new Date().toISOString(), createId: () => randomUUID() })
    const email = buildEmailClient()
    return {
      db,
      auth,
      audit,
      email,
      close: () => {
        email?.close()
        return db.close()
      },
    }
  } catch (error) {
    await db.close()
    throw error
  }
}
