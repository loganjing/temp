import type { DbClient } from '@commonapp/dbkit'
import type { EmailClient } from '@commonapp/emailkit'

/** notify 模块：工单完成通知邮件（emailkit）+ email_logs 发送记录。 */

export interface EmailLogSummary {
  toEmail: string
  status: 'sent' | 'failed' | 'skipped'
  error: string | null
}

export interface CompletionNotificationInput {
  ticketId: number
  ticketNo: string
  subject: string
  submitterEmail: string | null
  completedByName: string | null
  completedAt: string
}

const notificationSubject = (ticketNo: string, subject: string) => `工单完成通知：${ticketNo} ${subject}`

const notificationText = (input: CompletionNotificationInput) =>
  [
    '您的工单已处理完成。',
    '',
    `工单编号：${input.ticketNo}`,
    `主题：${input.subject}`,
    `处理人：${input.completedByName ?? '-'}`,
    `完成时间：${input.completedAt}`,
    '',
    '请登录工单系统查看详情并进行满意度评价。',
  ].join('\n')

/**
 * 工单完成事务提交后调用：发送结果写入 email_logs。
 * 发送失败绝不抛出（不阻塞、不回滚工单完成状态）。
 */
export async function sendCompletionNotification(
  db: DbClient,
  email: EmailClient,
  input: CompletionNotificationInput,
): Promise<EmailLogSummary> {
  const subject = notificationSubject(input.ticketNo, input.subject)
  let status: EmailLogSummary['status'] = 'skipped'
  let error: string | null = null
  if (!input.submitterEmail) {
    error = 'Submitter profile has no email address'
  } else {
    try {
      const result = await email.send({ to: input.submitterEmail, subject, text: notificationText(input) })
      if (result.status === 'sent') status = 'sent'
      else if (result.status === 'skipped') error = 'SMTP is not configured'
      else {
        status = 'failed'
        error = result.message
      }
    } catch (sendError) {
      status = 'failed'
      error = sendError instanceof Error ? sendError.message : 'Email delivery failed'
    }
  }
  try {
    await db.run({
      text: 'INSERT INTO email_logs (ticket_id, to_email, subject, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [input.ticketId, input.submitterEmail ?? '', subject, status, error, new Date().toISOString()],
    })
  } catch (logError) {
    console.error('[notify] failed to persist email log', logError)
  }
  return { toEmail: input.submitterEmail ?? '', status, error }
}

export async function latestEmailLog(
  db: DbClient,
  ticketId: number,
): Promise<{ toEmail: string; status: string; sentAt: string } | null> {
  const row = await db.queryOne<{ to_email: string; status: string; created_at: string }>({
    text: 'SELECT to_email, status, created_at FROM email_logs WHERE ticket_id = ? ORDER BY id DESC LIMIT 1',
    params: [ticketId],
  })
  if (!row) return null
  return { toEmail: row.to_email, status: row.status, sentAt: row.created_at }
}
