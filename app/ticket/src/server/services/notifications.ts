import { randomUUID } from 'node:crypto'
import { createEmailClient, type EmailConfig } from '@commonapp/emailkit'
import type { DbClient } from '@commonapp/dbkit'
import type { NotificationRecord, NotificationStatus } from '../../shared/ticket-contracts'
import { NOTIFICATION_STATUS_LABELS } from '../../shared/ticket-contracts'
import { forbidden, invalidState, notFound } from '../errors'
import type { Identity, IdentityService } from './identity'
import type { TicketService } from './tickets'

type NotificationRow = {
  id: string
  recipient_email: string
  subject: string
  status: NotificationStatus
  error_message: string | null
  attempt: number
  created_at: string
  sent_at: string | null
}

type NotificationContext = {
  id: string
  code: string
  subject: string
  company_id: string
  submitter_email: string
  submitter_name: string
  completed_by_name: string | null
  completed_at: string | null
  group_id: string | null
  status: string
}

type DeliveryResult = { status: NotificationStatus; errorMessage: string | null; sentAt: string | null }

function emailConfig(): EmailConfig {
  return {
    host: process.env.SMTP_HOST?.trim() ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    username: process.env.SMTP_USER || undefined,
    password: process.env.SMTP_PASSWORD || process.env.SMTP_PASS || undefined,
    secure: process.env.SMTP_SECURE === 'true',
    from: {
      address: process.env.MAIL_FROM || process.env.SMTP_FROM || 'noreply@example.com',
      name: process.env.SMTP_FROM_NAME || '工单系统',
    },
    connectionTimeoutMs: 5000,
    greetingTimeoutMs: 5000,
    socketTimeoutMs: 5000,
  }
}

async function deliver(to: string, subject: string, text: string, html: string): Promise<DeliveryResult> {
  try {
    const client = createEmailClient(emailConfig())
    try {
      const result = await client.send({ to, subject, text, html })
      if (result.status === 'sent') return { status: 'sent', errorMessage: null, sentAt: new Date().toISOString() }
      if (result.status === 'skipped') return { status: 'skipped', errorMessage: null, sentAt: null }
      return { status: 'failed', errorMessage: result.message, sentAt: null }
    } finally {
      client.close()
    }
  } catch {
    return { status: 'failed', errorMessage: '邮件发送配置无效，请联系管理员', sentAt: null }
  }
}

function mapRecord(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    recipientEmail: row.recipient_email,
    status: row.status,
    errorMessage: row.error_message,
    attempt: Number(row.attempt),
    createdAt: row.created_at,
    sentAt: row.sent_at,
  }
}

function buildMessage(context: NotificationContext) {
  const subject = `[${context.code}] 工单已完成：${context.subject}`
  const lines = [
    `您好 ${context.submitter_name}：`,
    '',
    `您提交的工单 ${context.code}（${context.subject}）已完成。`,
    `完成人：${context.completed_by_name ?? '处理人'}`,
    `完成时间：${context.completed_at ?? ''}`,
    '',
    '请登录系统查看工单详情并提交满意度评价。',
  ]
  const html = `<p>您好 ${context.submitter_name}：</p><p>您提交的工单 <strong>${context.code}</strong>（${context.subject}）已完成。</p><p>完成人：${context.completed_by_name ?? '处理人'}<br/>完成时间：${context.completed_at ?? ''}</p><p>请登录系统查看工单详情并提交满意度评价。</p>`
  return { subject, text: lines.join('\n'), html }
}

export function createNotificationService(db: DbClient, identity: IdentityService, tickets: TicketService) {
  async function getNotificationRow(ticketId: string, notificationId: string): Promise<NotificationRow | null> {
    return db.queryOne<NotificationRow>({
      text: `SELECT id, recipient_email, subject, status, error_message, attempt, created_at, sent_at
             FROM ticket_notifications WHERE ticket_id = ? AND id = ?`,
      params: [ticketId, notificationId],
    })
  }

  async function persist(context: NotificationContext, recipientEmail: string, attempt: number, actor: Identity, action: 'notified' | 'notification_retried', previousId?: string): Promise<NotificationRecord> {
    const { subject, text, html } = buildMessage(context)
    const delivery = await deliver(recipientEmail, subject, text, html)
    const now = new Date().toISOString()
    const id = randomUUID()
    await db.transaction(async (tx) => {
      await tx.run({
        text: `INSERT INTO ticket_notifications (id, ticket_id, company_id, recipient_email, subject, status, error_message, attempt, created_at, sent_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [id, context.id, context.company_id, recipientEmail, subject, delivery.status, delivery.errorMessage, attempt, now, delivery.sentAt],
      })
      await tickets.appendLog(
        {
          ticketId: context.id,
          companyId: context.company_id,
          actorId: actor.id,
          action,
          summary: `${action === 'notified' ? '完成通知' : `重试完成通知（第 ${attempt} 次）`}：${NOTIFICATION_STATUS_LABELS[delivery.status]}${delivery.errorMessage ? `（${delivery.errorMessage}）` : ''}`,
          detail: {
            notificationId: id,
            ...(previousId ? { previousNotificationId: previousId } : {}),
            status: delivery.status,
            attempt,
            recipientEmail,
            errorMessage: delivery.errorMessage,
          },
          createdAt: now,
        },
        tx,
      )
    })
    return {
      id,
      recipientEmail,
      status: delivery.status,
      errorMessage: delivery.errorMessage,
      attempt,
      createdAt: now,
      sentAt: delivery.sentAt,
    }
  }

  async function notifyCompleted(ticketId: string, actor: Identity): Promise<NotificationRecord | null> {
    const context = await tickets.getNotificationContext(ticketId)
    if (!context) throw notFound('工单不存在')
    if (context.company_id !== actor.companyId) throw forbidden('无权访问其他公司的工单')
    if (context.status !== 'completed') return null
    const existing = await db.queryOne<NotificationRow>({
      text: `SELECT id, recipient_email, subject, status, error_message, attempt, created_at, sent_at
             FROM ticket_notifications WHERE ticket_id = ? AND status = 'sent' ORDER BY created_at DESC LIMIT 1`,
      params: [ticketId],
    })
    if (existing) return mapRecord(existing)
    return persist(context, context.submitter_email, 1, actor, 'notified')
  }

  async function retryNotification(ticketId: string, notificationId: string, actor: Identity): Promise<NotificationRecord> {
    const previous = await getNotificationRow(ticketId, notificationId)
    if (!previous) throw notFound('通知记录不存在')
    const context = await tickets.getNotificationContext(ticketId)
    if (!context) throw notFound('工单不存在')
    if (context.company_id !== actor.companyId) throw forbidden('无权访问其他公司的工单')
    identity.requireGroupHandler(actor, context.group_id)
    if (context.status !== 'completed') throw invalidState('仅已完成工单可以重试完成通知')
    if (previous.status === 'sent') throw invalidState('该通知已发送，无需重试')
    // 重试按提交人当前邮箱投递：失败常见原因是地址不可达或被更正，沿用历史收件地址会让重试必然失败。
    const latest = await db.queryOne<{ maxAttempt: number | null }>({
      text: 'SELECT MAX(attempt) AS maxAttempt FROM ticket_notifications WHERE ticket_id = ?',
      params: [ticketId],
    })
    const nextAttempt = Number(latest?.maxAttempt ?? previous.attempt) + 1
    return persist(context, context.submitter_email, nextAttempt, actor, 'notification_retried', previous.id)
  }

  return { notifyCompleted, retryNotification }
}

export type NotificationService = ReturnType<typeof createNotificationService>
