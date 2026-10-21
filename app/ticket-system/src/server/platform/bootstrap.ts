import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createEmailClient } from '@commonapp/emailkit'
import { createApplicationAuth } from './auth'

const smtpPort = (): number => {
  const parsed = Number(process.env.SMTP_PORT)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : 587
}

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const auth = createApplicationAuth(db)
    // SMTP_HOST 留空即禁用外发邮件（emailkit 降级为 skipped，仅记录发送日志）。
    const email = createEmailClient({
      host: process.env.SMTP_HOST ?? '',
      port: smtpPort(),
      username: process.env.SMTP_USER || undefined,
      password: process.env.SMTP_PASS || undefined,
      from: {
        address: process.env.SMTP_FROM ?? 'noreply@example.com',
        name: process.env.SMTP_FROM_NAME ?? 'Ticket System',
      },
    })
    const close = async () => {
      email.close()
      await db.close()
    }
    return { db, auth, email, close }
  } catch (error) {
    await db.close()
    throw error
  }
}
