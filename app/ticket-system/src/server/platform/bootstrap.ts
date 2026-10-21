import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations, type DbClient } from '@commonapp/dbkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createEmailClient, type EmailClient } from '@commonapp/emailkit'
import { createApplicationAuth } from './auth'

export interface PlatformResources {
  db: DbClient
  auth: ReturnType<typeof createApplicationAuth>
  audit: ReturnType<typeof createAuditKit>
  email: EmailClient
  close: () => Promise<void>
}

/**
 * 初始化平台资源：SQLite（经 dbkit 迁移）、authkit/userkit 认证、
 * auditkit 审计事件、emailkit SMTP 客户端（SMTP_HOST 为空时禁用外发）。
 */
export async function initializePlatform(): Promise<PlatformResources> {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const auth = createApplicationAuth(db)
    const audit = createAuditKit(db)
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
    return {
      db,
      auth,
      audit,
      email,
      close: async () => {
        email.close()
        await db.close()
      },
    }
  } catch (error) {
    await db.close()
    throw error
  }
}
