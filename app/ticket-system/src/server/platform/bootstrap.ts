import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createPermissionKit, type PermissionRegistry } from '@commonapp/permissionkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createEmailClient, type EmailClient, type EmailSendResult } from '@commonapp/emailkit'
import { createApplicationAuth } from './auth'

/** 工单系统角色与权限注册表 */
const permissionRegistry: PermissionRegistry = {
  permissions: {
    'ticket.create': { key: 'ticket.create', description: '创建工单' },
    'ticket.view': { key: 'ticket.view', description: '查看工单' },
    'ticket.reply': { key: 'ticket.reply', description: '回复工单' },
    'ticket.evaluate': { key: 'ticket.evaluate', description: '评价工单' },
    'ticket.assign': { key: 'ticket.assign', description: '分配工单' },
    'ticket.handle': { key: 'ticket.handle', description: '处理工单' },
    'ticket.transfer': { key: 'ticket.transfer', description: '转派工单' },
    'ticket.complete': { key: 'ticket.complete', description: '完成工单' },
    'ticket.cancel': { key: 'ticket.cancel', description: '取消工单' },
    'ticket.view_submitter_info': { key: 'ticket.view_submitter_info', description: '查看提交人信息' },
    'company.manage': { key: 'company.manage', description: '管理公司' },
    'department.manage': { key: 'department.manage', description: '管理部门' },
    'group.manage': { key: 'group.manage', description: '管理业务组' },
    'category.manage': { key: 'category.manage', description: '管理分类' },
    'assignment_rule.manage': { key: 'assignment_rule.manage', description: '管理分配规则' },
    'stats.view': { key: 'stats.view', description: '查看统计' },
    'user.manage': { key: 'user.manage', description: '管理用户' },
  },
  roles: {
    submitter: ['ticket.create', 'ticket.view', 'ticket.reply', 'ticket.evaluate', 'ticket.cancel'],
    handler: ['ticket.view', 'ticket.reply', 'ticket.handle', 'ticket.transfer', 'ticket.complete', 'ticket.view_submitter_info'],
    admin: [
      'ticket.view', 'ticket.assign', 'ticket.reply', 'ticket.view_submitter_info',
      'company.manage', 'department.manage', 'group.manage', 'category.manage',
      'assignment_rule.manage', 'stats.view', 'user.manage',
    ],
  },
}

/** SMTP 未配置时的降级邮件客户端，仅记录日志不发送 */
function createLogOnlyEmailClient(): EmailClient {
  return {
    async send(message): Promise<EmailSendResult> {
      console.log('[emailkit] SMTP not configured, logging email instead:', message.subject, '→', message.to)
      return { status: 'skipped', reason: 'not_configured' }
    },
    async sendTest(to): Promise<EmailSendResult> {
      console.log('[emailkit] test email skipped (SMTP not configured):', to)
      return { status: 'skipped', reason: 'not_configured' }
    },
    close() {},
  }
}

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })

    const permissionKit = createPermissionKit(db)
    await permissionKit.syncRegistry(permissionRegistry)

    const auditKit = createAuditKit(db)

    let emailClient: EmailClient
    const smtpHost = process.env.SMTP_HOST
    const smtpFrom = process.env.SMTP_FROM
    if (smtpHost && smtpFrom) {
      emailClient = createEmailClient({
        host: smtpHost,
        port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
        username: process.env.SMTP_USER,
        password: process.env.SMTP_PASS,
        from: smtpFrom,
      })
    } else {
      emailClient = createLogOnlyEmailClient()
    }

    const auth = createApplicationAuth(db, { permissionKit })
    return { db, auth, permissionKit, auditKit, emailClient, close: () => { emailClient.close(); db.close() } }
  } catch (error) {
    await db.close()
    throw error
  }
}
