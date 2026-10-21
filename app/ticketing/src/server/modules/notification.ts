import type { DbClient } from '@commonapp/dbkit'
import type { EmailClient } from '@commonapp/emailkit'
import type { NotificationRecord } from '../../shared/contracts'

interface NotificationRow {
  id: number
  recipient_email: string
  subject: string
  status: string
  sent_at: string
  detail: string | null
}

function mapNotification(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    recipientEmail: row.recipient_email,
    subject: row.subject,
    status: row.status as NotificationRecord['status'],
    sentAt: row.sent_at,
    detail: row.detail,
  }
}

export interface CompletionNotice {
  ticketId: number
  ticketNo: string
  subject: string
  submitterEmail: string
  handlerName: string
  handledAt: string
}

// 完成事务提交后调用：发送一次邮件并写 notification_log；发送失败记录 failed，不回滚工单状态。
export async function sendCompletionNotification(
  db: DbClient,
  email: EmailClient | null,
  notice: CompletionNotice,
): Promise<NotificationRecord> {
  const subject = `工单 ${notice.ticketNo} 已完成`
  const text = `您的工单 ${notice.ticketNo}（${notice.subject}）已由 ${notice.handlerName} 处理完成，完成时间 ${notice.handledAt}。`
  let status: 'sent' | 'failed' = 'failed'
  let detail: string | null = null
  if (email) {
    const result = await email.send({ to: notice.submitterEmail, subject, text })
    if (result.status === 'sent') {
      status = 'sent'
    } else if (result.status === 'skipped') {
      detail = result.reason
    } else {
      detail = result.message
    }
  } else {
    detail = 'SMTP not configured'
  }
  const sentAt = new Date().toISOString()
  await db.run({
    text: 'INSERT INTO notification_log (ticket_id, recipient_email, subject, status, sent_at, detail) VALUES (?, ?, ?, ?, ?, ?)',
    params: [notice.ticketId, notice.submitterEmail, subject, status, sentAt, detail],
  })
  const row = await db.queryOne<NotificationRow>({
    text: 'SELECT id, recipient_email, subject, status, sent_at, detail FROM notification_log WHERE ticket_id = ? ORDER BY id DESC LIMIT 1',
    params: [notice.ticketId],
  })
  return mapNotification(row!)
}

export async function listTicketNotifications(db: DbClient, ticketId: number): Promise<NotificationRecord[]> {
  const rows = await db.queryAll<NotificationRow>({
    text: 'SELECT id, recipient_email, subject, status, sent_at, detail FROM notification_log WHERE ticket_id = ? ORDER BY sent_at ASC, id ASC',
    params: [ticketId],
  })
  return rows.map(mapNotification)
}
