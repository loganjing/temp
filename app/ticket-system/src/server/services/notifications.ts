import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type { EmailClient, EmailSendResult } from '@commonapp/emailkit'
import type { NotificationStatus } from '../../shared/ticket-domain'

export type NotificationRecord = {
  id: string
  ticketId: string
  kind: string
  recipientEmail: string
  subject: string
  body: string
  status: NotificationStatus
  providerMessageId: string | null
  errorCode: string | null
  errorMessage: string | null
  attempt: number
  createdAt: string
  sentAt: string | null
}

type NotificationRow = {
  id: string
  ticket_id: string
  kind: string
  recipient_email: string
  subject: string
  body: string
  status: NotificationStatus
  provider_message_id: string | null
  error_code: string | null
  error_message: string | null
  attempt: number
  created_at: string
  sent_at: string | null
}

export function mapNotification(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    kind: row.kind,
    recipientEmail: row.recipient_email,
    subject: row.subject,
    body: row.body,
    status: row.status,
    providerMessageId: row.provider_message_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    attempt: row.attempt,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  }
}

export async function findNotification(db: DbClient, ticketId: string, notificationId: string) {
  return db.queryOne<NotificationRow>({
    text: 'SELECT * FROM ticket_notifications WHERE id = ? AND ticket_id = ?',
    params: [notificationId, ticketId],
  })
}

export async function listNotifications(db: DbClient, ticketId: string) {
  const rows = await db.queryAll<NotificationRow>({
    text: 'SELECT * FROM ticket_notifications WHERE ticket_id = ? ORDER BY created_at DESC, rowid DESC',
    params: [ticketId],
  })
  return rows.map(mapNotification)
}

type SendNotificationInput = {
  ticketId: string
  recipientEmail: string
  submitterName: string
  ticketTitle: string
  assigneeName: string | null
  completedAt: string
  attempt: number
}

/**
 * Persist one completion notification attempt and return the stored record with
 * the matching log action. Delivery failures are recorded, never thrown.
 */
export async function sendCompletionNotification(
  tx: DbClient,
  email: Pick<EmailClient, 'send'>,
  input: SendNotificationInput,
) {
  const subject = `工单 ${input.ticketId} 已完成：${input.ticketTitle}`
  const body = [
    `您好 ${input.submitterName}：`,
    '',
    `您提交的工单 ${input.ticketId}「${input.ticketTitle}」已处理完成。`,
    `处理人：${input.assigneeName ?? '未记录'}`,
    `完成时间：${input.completedAt}`,
    '',
    '如对处理结果有疑问，可在工单详情中继续回复。',
  ].join('\n')

  let result: EmailSendResult
  try {
    result = await email.send({ to: input.recipientEmail, subject, text: body })
  } catch (error) {
    result = { status: 'failed', message: error instanceof Error ? error.message : '邮件发送失败' }
  }

  const status: NotificationStatus = result.status
  const createdAt = new Date().toISOString()
  const id = randomUUID()
  await tx.run({
    text: `INSERT INTO ticket_notifications
             (id, ticket_id, kind, recipient_email, subject, body, status, provider_message_id,
              error_code, error_message, attempt, created_at, sent_at)
           VALUES (?, ?, 'completion', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      id,
      input.ticketId,
      input.recipientEmail,
      subject,
      body,
      status,
      result.status === 'sent' ? result.messageId ?? null : null,
      result.status === 'failed' ? result.code ?? null : null,
      result.status === 'failed' ? result.message : null,
      input.attempt,
      createdAt,
      result.status === 'sent' ? createdAt : null,
    ],
  })

  const row = await tx.queryOne<NotificationRow>({
    text: 'SELECT * FROM ticket_notifications WHERE id = ?',
    params: [id],
  })
  if (!row) throw new Error('notification record was not persisted')

  return {
    record: mapNotification(row),
    action: result.status === 'sent' ? 'email_sent' : result.status === 'skipped' ? 'email_skipped' : 'email_failed',
    result: result.status === 'failed' ? 'failed' : 'success',
    errorMessage: result.status === 'failed' ? result.message : null,
  } as const
}
