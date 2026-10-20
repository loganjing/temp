import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createEmailClient } from '@commonapp/emailkit'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  // SMTP 凭证只经环境变量；SMTP_HOST 为空时 emailkit 返回 skipped（不投递）。
  const email = createEmailClient({
    host: process.env.SMTP_HOST ?? '',
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    username: process.env.SMTP_USER || undefined,
    password: process.env.SMTP_PASS || undefined,
    from: {
      address: process.env.SMTP_FROM ?? 'noreply@example.com',
      name: process.env.SMTP_FROM_NAME ?? '工单系统',
    },
  })
  try {
    await runMigrations(db, {
      directory: fileURLToPath(new URL('../migrations/', import.meta.url)),
    })
  } catch (error) {
    email.close()
    await db.close()
    throw error
  }
  const close = async () => {
    email.close()
    await db.close()
  }
  return { db, email, close }
}
