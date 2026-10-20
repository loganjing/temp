import type { DbClient } from '@commonapp/dbkit'
import type { EmailClient, EmailSendResult } from '@commonapp/emailkit'

// notification：完成通知邮件发送（emailkit）、发送记录落库与查询。
// emailkit 只投递不持久化 outbox；三态结果（sent/skipped/failed）由本模块写入 notification_log。
export type NotificationEntry = {
  id: number
  recipientEmail: string
  subject: string
  status: 'sent' | 'skipped' | 'failed'
  sentAt: string
}

export type CompleteNotificationInput = {
  companyId: number
  ticketId: number
  ticketNo: string
  subject: string
  submitterName: string
  submitterEmail: string
  handlerName: string
  completedAt: string
}

type LogRow = { id: number; recipient_email: string; subject: string; status: string; sent_at: string }

const toEntry = (row: LogRow): NotificationEntry => ({
  id: row.id,
  recipientEmail: row.recipient_email,
  subject: row.subject,
  status: row.status as NotificationEntry['status'],
  sentAt: row.sent_at,
})

export function createNotificationService(db: DbClient, email: EmailClient) {
  // 契约 §5：complete 成功后同步调用一次 emailkit.send()；失败不重试、不阻塞完成。
  async function sendCompletionNotification(input: CompleteNotificationInput): Promise<NotificationEntry> {
    const subject = `[工单系统] 工单 ${input.ticketNo}「${input.subject}」已完成`
    const text = [
      `您好，${input.submitterName}：`,
      `您的工单已完成处理。`,
      '',
      `工单编号：${input.ticketNo}`,
      `工单主题：${input.subject}`,
      `处理人：${input.handlerName}`,
      `完成时间：${input.completedAt}`,
      '',
      '您可以登录工单系统，在工单详情中对本次处理进行满意度评价。',
    ].join('\n')
    const html = [
      `<p>您好，${escapeHtml(input.submitterName)}：</p>`,
      `<p>您的工单已完成处理。</p>`,
      '<ul>',
      `<li>工单编号：${escapeHtml(input.ticketNo)}</li>`,
      `<li>工单主题：${escapeHtml(input.subject)}</li>`,
      `<li>处理人：${escapeHtml(input.handlerName)}</li>`,
      `<li>完成时间：${escapeHtml(input.completedAt)}</li>`,
      '</ul>',
      '<p>您可以登录工单系统，在工单详情中对本次处理进行满意度评价。</p>',
    ].join('\n')
    let result: EmailSendResult
    try {
      result = await email.send({ to: input.submitterEmail, subject, text, html })
    } catch {
      result = { status: 'failed', message: 'SMTP delivery failed' }
    }
    const sentAt = new Date().toISOString()
    const row = await db.queryOne<LogRow>({
      text: `INSERT INTO notification_log (ticket_id, company_id, recipient_email, subject, status, sent_at)
             VALUES (?, ?, ?, ?, ?, ?)
             RETURNING id, recipient_email, subject, status, sent_at`,
      params: [input.ticketId, input.companyId, input.submitterEmail, subject, result.status, sentAt],
    })
    if (!row) throw new Error('Failed to record notification log')
    return toEntry(row)
  }

  // 工单详情内嵌通知记录（契约 §4.2 NotificationEntry[]）。
  function listByTicket(ticketId: number, companyId: number): Promise<NotificationEntry[]> {
    return db.queryAll<LogRow>({
      text: `SELECT id, recipient_email, subject, status, sent_at FROM notification_log
             WHERE ticket_id = ? AND company_id = ? ORDER BY id ASC`,
      params: [ticketId, companyId],
    }).then((rows) => rows.map(toEntry))
  }

  return { sendCompletionNotification, listByTicket }
}

export type NotificationService = ReturnType<typeof createNotificationService>

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
