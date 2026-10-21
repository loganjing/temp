import type { DbClient } from '@commonapp/dbkit'
import type { EmailPlatform } from '../platform/email'

// 通知域：完成通知邮件组装、事务内发件箱写入与事务外投递（架构基线第 5 节）。

export function buildCompletionEmail(input: {
  ticketNo: string
  subject: string
  submitterName: string
  submitterEmail: string
  handlerName: string
  completedAt: string
}): { toEmail: string; subject: string; body: string } {
  const subject = `[工单完成] ${input.ticketNo} ${input.subject}`
  const body = [
    `${input.submitterName}，您好：`,
    `您的工单 ${input.ticketNo}（${input.subject}）已完成处理。`,
    `处理人：${input.handlerName}`,
    `完成时间：${input.completedAt}`,
    '请登录系统对该工单进行满意度评价。',
  ].join('\n')
  return { toEmail: input.submitterEmail, subject, body }
}

// 事务内写入发件箱（channel 由 SMTP 配置决定；未配置走 local，作为可观察送达证据）。
export async function queueCompletionEmail(
  tx: DbClient,
  input: { ticketId: number; ticketNo: string; toEmail: string; subject: string; body: string },
  channel: 'smtp' | 'local',
  now: string,
): Promise<number> {
  const row = await tx.queryOne<{ id: number }>({
    text: `INSERT INTO email_outbox (ticket_id, ticket_no, to_email, subject, body, channel, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'queued', ?) RETURNING id AS id`,
    params: [input.ticketId, input.ticketNo, input.toEmail, input.subject, input.body, channel, now],
  })
  if (!row) throw new Error('发件箱写入失败')
  return row.id
}

// 事务外投递：SMTP 已配置时真实发送并回写状态；发送失败仅记录 failed，不阻塞工单完成主流程。
export async function deliverOutboxEmail(
  db: DbClient,
  email: EmailPlatform,
  outboxId: number,
): Promise<'queued' | 'sent' | 'failed'> {
  const row = await db.queryOne<{ id: number; channel: string; to_email: string; subject: string; body: string }>({
    text: 'SELECT id, channel, to_email, subject, body FROM email_outbox WHERE id = ?',
    params: [outboxId],
  })
  if (!row || row.channel !== 'smtp') return 'queued'
  try {
    const result = await email.client.send({ to: row.to_email, subject: row.subject, text: row.body })
    if (result.status === 'sent') {
      await db.run({
        text: "UPDATE email_outbox SET status = 'sent', sent_at = ? WHERE id = ?",
        params: [new Date().toISOString(), outboxId],
      })
      return 'sent'
    }
    if (result.status === 'skipped') return 'queued'
    await db.run({
      text: "UPDATE email_outbox SET status = 'failed', error = ? WHERE id = ?",
      params: [result.message, outboxId],
    })
    return 'failed'
  } catch (error) {
    const message = error instanceof Error ? error.message : '邮件发送异常'
    await db.run({
      text: "UPDATE email_outbox SET status = 'failed', error = ? WHERE id = ?",
      params: [message, outboxId],
    })
    return 'failed'
  }
}
