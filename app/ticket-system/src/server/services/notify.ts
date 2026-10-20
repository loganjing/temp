import type { DbClient } from '@commonapp/dbkit'
import type { EmailClient } from '@commonapp/emailkit'
import { nowIso } from '../util'

export interface NotifyService {
  /** 工单完成事务提交后调用：发送完成邮件并落 notifications outbox 记录。 */
  sendCompletionNotification(ticketId: string): Promise<void>
}

/**
 * 通知域：emailkit 发送 + 项目 outbox 表持久化。
 * sent/skipped/failed 三种结果均落库（失败可见性）；发送异常捕获后记 failed，
 * 不向调用方抛出（邮件失败不回滚工单完成，契约 §6）。
 */
export function createNotifyService(db: DbClient, email: EmailClient): NotifyService {
  async function sendCompletionNotification(ticketId: string): Promise<void> {
    const row = await db.queryOne<{
      id: string
      title: string
      completedAt: string | null
      submitterEmail: string
      completedByName: string | null
    }>({
      text: `SELECT t.id, t.title, t.completed_at AS completedAt, su.email AS submitterEmail, cu.name AS completedByName
             FROM tickets t
             JOIN users su ON su.id = t.submitter_id
             LEFT JOIN users cu ON cu.id = t.completed_by
             WHERE t.id = ?`,
      params: [ticketId],
    })
    if (!row) return
    const subject = `[工单完成] ${row.id} ${row.title}`
    const body = [
      `您的工单 ${row.id}「${row.title}」已完成处理。`,
      `完成时间：${row.completedAt ?? ''}`,
      `处理人：${row.completedByName ?? ''}`,
      '如有其他问题，请提交新工单。',
    ].join('\n')
    let status: 'sent' | 'skipped' | 'failed'
    let error: string | null = null
    try {
      const result = await email.send({ to: row.submitterEmail, subject, text: body })
      if (result.status === 'sent') {
        status = 'sent'
      } else if (result.status === 'skipped') {
        status = 'skipped'
      } else {
        status = 'failed'
        error = result.message
      }
    } catch (err) {
      status = 'failed'
      error = err instanceof Error ? err.message : String(err)
    }
    await db.run({
      text: 'INSERT INTO notifications (ticket_id, to_email, subject, body, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [ticketId, row.submitterEmail, subject, body, status, error, nowIso()],
    })
  }

  return { sendCompletionNotification }
}
