/**
 * 工单完成邮件通知（notification 模块，架构基线第 4 节）：
 * SMTP_HOST 为空时禁用外发（sent=false）；发送失败不回滚工单状态，
 * 写服务错误日志并记录 notification_failed 审计事件。
 */
import type { EmailClient } from '@commonapp/emailkit'
import { recordTicketAudit, type AuditRecorder } from './audit-log'
import type { TicketRow, UserBrief } from './views'

export interface NotificationResult {
  sent: boolean
  error: string | null
}

export async function sendTicketCompletionEmail(
  email: EmailClient,
  audit: AuditRecorder,
  ticket: TicketRow,
  submitter: UserBrief,
): Promise<NotificationResult> {
  const result = await email.send({
    to: submitter.email,
    subject: `工单 #${ticket.id} 已完成：${ticket.subject}`,
    text: `您好，${submitter.displayName}：\n您提交的工单 #${ticket.id}「${ticket.subject}」已完成处理。\n如需进一步帮助，请继续在该工单中回复。`,
    html: `<p>您好，${submitter.displayName}：</p><p>您提交的工单 #${ticket.id}「${ticket.subject}」已完成处理。</p><p>如需进一步帮助，请继续在该工单中回复。</p>`,
  })
  if (result.status === 'sent') return { sent: true, error: null }
  if (result.status === 'skipped') {
    // SMTP 未配置属预期禁用（sent=false 在完成响应中可见），不计入失败审计。
    return { sent: false, error: 'SMTP 未配置，通知未发送' }
  }
  const message = result.message
  console.error(`[notification] 工单 #${ticket.id} 完成通知未送达：${message}`)
  await recordTicketAudit(audit, {
    action: 'notification_failed',
    actorPlatformUserId: null,
    ticketId: ticket.id,
    companyId: ticket.company_id,
    detail: `工单完成通知发送失败：${message}`,
  })
  return { sent: false, error: message }
}
