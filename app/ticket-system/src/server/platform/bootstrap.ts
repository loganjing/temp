import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createApplicationAuth } from './auth'
import { createNotificationEmailClient } from './email'
import { seedInitialData } from '../seed'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const auth = createApplicationAuth(db)
    // 启动种子（仅空库时幂等执行）：公司A/公司B 与示例账号。
    await seedInitialData(db, auth)
    const audit = createAuditKit(db)
    const email = createNotificationEmailClient()
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
