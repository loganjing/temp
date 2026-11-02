import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createEmailClient } from '@commonapp/emailkit'
import { createApplicationAuth } from './auth'
import { seedDemoData } from './seed'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  const email = createEmailClient({
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    username: process.env.SMTP_USER || undefined,
    password: process.env.SMTP_PASS || undefined,
    from: {
      address: process.env.SMTP_FROM ?? 'noreply@example.com',
      name: process.env.SMTP_FROM_NAME ?? '工单系统',
    },
  })
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    await seedDemoData(db)
    const auth = createApplicationAuth(db)
    return {
      db,
      auth,
      email,
      close: async () => {
        email.close()
        await db.close()
      },
    }
  } catch (error) {
    email.close()
    await db.close()
    throw error
  }
}
