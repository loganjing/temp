import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createEmailClient, type EmailConfig } from '@commonapp/emailkit'
import { createApplicationAuth } from './auth'

// SMTP 参数经环境变量映射为显式配置对象（架构基线 §5）。
// SMTP_HOST 为空时投递自动降级为 skipped；SMTP_USER/SMTP_PASS 成对提供或均省略。
export function emailConfigFromEnv(): EmailConfig {
  const host = (process.env.SMTP_HOST ?? '').trim()
  const portRaw = Number(process.env.SMTP_PORT)
  const port = Number.isInteger(portRaw) && portRaw >= 1 && portRaw <= 65535 ? portRaw : 587
  const username = (process.env.SMTP_USER ?? '').trim()
  const password = (process.env.SMTP_PASS ?? '').trim()
  const fromAddress = (process.env.SMTP_FROM ?? '').trim() || 'noreply@ticket-system.local'
  const fromName = (process.env.SMTP_FROM_NAME ?? '').trim() || '工单系统'
  return {
    host,
    port,
    ...(username && password ? { username, password } : {}),
    from: { address: fromAddress, name: fromName },
  }
}

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const auth = createApplicationAuth(db)
    const email = createEmailClient(emailConfigFromEnv())
    return { db, auth, email, close: () => { email.close(); void db.close() } }
  } catch (error) {
    await db.close()
    throw error
  }
}
