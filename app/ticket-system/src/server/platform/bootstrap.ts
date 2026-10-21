import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createApplicationAuth } from './auth'
import { seedDemoData } from '../seed'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const auth = createApplicationAuth(db)
    // 启动顺序：迁移 → 空库种子 → 会话与业务路由（见 architecture-baseline 第 5 节）。
    await seedDemoData(db, auth.hashPassword)
    return { db, auth, close: () => db.close() }
  } catch (error) {
    await db.close()
    throw error
  }
}
