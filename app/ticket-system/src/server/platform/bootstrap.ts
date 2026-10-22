import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAuditKit } from '@commonapp/auditkit'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createPermissionKit } from '@commonapp/permissionkit'
import { createApplicationAuth } from './auth'
import { permissionRegistry } from './permissions'
import { createAnalyticsService } from '../analytics/service'
import { createAuditTrail } from '../audit/repository'
import { createIdentityRepository } from '../identity/repository'
import { createNotificationService, emailClientFromEnv } from '../notification/service'
import { createOrgRepository } from '../org/repository'
import { createTicketRepository } from '../tickets/repository'
import { createTicketService } from '../tickets/service'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const auth = createApplicationAuth(db)
    // 授权：把项目声明的权限键与角色映射注册到 permissionkit 注册表。
    const permissionKit = createPermissionKit(db)
    await permissionKit.syncRegistry(permissionRegistry())
    // 业务域：身份、组织配置、工单、审计、通知与统计聚合。
    const identity = createIdentityRepository(db)
    const org = createOrgRepository(db)
    const tickets = createTicketRepository(db)
    const audit = createAuditTrail(db, createAuditKit(db))
    const notifications = createNotificationService(tickets, emailClientFromEnv())
    const ticketService = createTicketService({ db, tickets, org, identity, audit, notifications })
    const analytics = createAnalyticsService({ tickets })
    return { db, auth, permissionKit, identity, org, tickets, audit, ticketService, analytics, close: () => db.close() }
  } catch (error) {
    await db.close()
    throw error
  }
}
