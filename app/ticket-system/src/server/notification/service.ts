import { randomUUID } from 'node:crypto'
import { createEmailClient, type EmailClient, type EmailConfig } from '@commonapp/emailkit'
import type { NotificationStatus, TicketNotification } from '../../shared/contracts'
import type { TicketRepository } from '../tickets/repository'

/** 从环境变量构造 SMTP 客户端；未配置 SMTP_HOST 时返回 null（发送记为失败并保留原因）。 */
export function emailClientFromEnv(env: NodeJS.ProcessEnv = process.env): EmailClient | null {
  const host = (env.SMTP_HOST ?? '').trim()
  if (!host) return null
  const fromAddress = (env.SMTP_FROM ?? '').trim() || 'noreply@example.com'
  const fromName = (env.SMTP_FROM_NAME ?? '').trim()
  const config: EmailConfig = { host, from: fromName ? { address: fromAddress, name: fromName } : fromAddress }
  const port = Number((env.SMTP_PORT ?? '').trim())
  if (Number.isInteger(port) && port > 0) config.port = port
  if (env.SMTP_SECURE === 'true') config.secure = true
  const username = (env.SMTP_USER ?? '').trim()
  const password = env.SMTP_PASS ?? ''
  if (username && password) {
    config.username = username
    config.password = password
  }
  return createEmailClient(config)
}

export type CompletionNotice = {
  ticketId: string
  companyId: string
  ticketNo: string
  subject: string
  recipientEmail: string
  completedAt: string
  completedByName: string | null
}

/**
 * notification：完成通知在完成事务之外发送，发送结果写入 notifications 供读回；
 * 发送失败不回滚工单完成状态。
 */
export function createNotificationService(tickets: TicketRepository, emailClient: EmailClient | null) {
  return {
    async sendCompletionNotice(notice: CompletionNotice): Promise<TicketNotification> {
      const createdAt = new Date().toISOString()
      let status: NotificationStatus = 'failed'
      let error: string | null = null
      let sentAt: string | null = null

      if (!emailClient) {
        error = 'smtp_not_configured'
      } else {
        try {
          const result = await emailClient.send({
            to: notice.recipientEmail,
            subject: `[${notice.ticketNo}] 工单已完成：${notice.subject}`,
            text: `工单 ${notice.ticketNo}（${notice.subject}）已完成。\n完成时间：${notice.completedAt}\n处理人：${notice.completedByName ?? '—'}`,
          })
          if (result.status === 'sent') {
            status = 'success'
            sentAt = createdAt
          } else if (result.status === 'skipped') {
            error = 'smtp_not_configured'
          } else {
            error = result.message
          }
        } catch (cause) {
          error = cause instanceof Error ? cause.message : 'notification_failed'
        }
      }

      const notification: TicketNotification = {
        id: randomUUID(),
        channel: 'email',
        recipientEmail: notice.recipientEmail,
        status,
        error,
        createdAt,
        sentAt,
      }
      await tickets.insertNotification({
        id: notification.id,
        ticketId: notice.ticketId,
        companyId: notice.companyId,
        recipientEmail: notice.recipientEmail,
        status,
        error,
        createdAt,
        sentAt,
      })
      return notification
    },
  }
}

export type NotificationService = ReturnType<typeof createNotificationService>
