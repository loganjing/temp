import type { EmailClient } from '@commonapp/emailkit'

// 通知模块（契约第 7 节）：仅在工单完成事务提交后同步调用，发送结果并入 complete 响应并记入审计。
export type CompletionNotification = { emailSent: boolean; error: string | null }

export function sendCompletionEmail(
  emailClient: EmailClient,
  ticket: { id: number; subject: string; handledAt: string },
  recipient: string,
): Promise<CompletionNotification> {
  return emailClient
    .send({
      to: recipient,
      subject: `【工单完成】工单 #${ticket.id} ${ticket.subject}`,
      text: `您的工单已完成处理。\n\n工单ID：#${ticket.id}\n主题：${ticket.subject}\n完成时间：${ticket.handledAt}\n`,
    })
    .then((result) => {
      if (result.status === 'sent') return { emailSent: true, error: null }
      const error = result.status === 'skipped' ? 'SMTP is not configured' : result.message
      return { emailSent: false, error }
    })
}
