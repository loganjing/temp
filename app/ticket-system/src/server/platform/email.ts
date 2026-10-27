import { createEmailClient, type EmailClient, type EmailSendResult } from '@commonapp/emailkit'

/**
 * 邮件服务绑定 emailkit。
 * 当 SMTP_HOST 配置时使用真实 SMTP 客户端；否则使用控制台输出替代（验证与开发环境）。
 * 工单完成时由服务层调用 send 通知提交人。
 */
export type EmailService = {
  send(message: { to: string; subject: string; text?: string; html?: string }): Promise<EmailSendResult>
  close(): void
}

export function createEmailService(): EmailService {
  const host = process.env.SMTP_HOST
  if (host) {
    const client: EmailClient = createEmailClient({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      username: process.env.SMTP_USER,
      password: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM ?? 'no-reply@ticket-system.local',
      secure: process.env.SMTP_SECURE === 'true',
    })
    return {
      send: (message) => client.send(message),
      close: () => client.close(),
    }
  }
  // 控制台输出替代：验证环境不依赖真实 SMTP。
  return {
    send: async (message) => {
      console.log('[email] (console) to=%s subject=%s\n%s', message.to, message.subject, message.text ?? '')
      return { status: 'sent', messageId: `console-${Date.now()}` }
    },
    close: () => {},
  }
}
