import { createEmailClient, type EmailConfig, type EmailClient } from '@commonapp/emailkit'

// 完成通知邮件的 SMTP 配置（契约第 7 节）：SMTP_HOST、SMTP_PORT、SMTP_USER、SMTP_PASS、SENDER_ADDRESS。
// 未配置 SMTP_HOST 时 emailkit 返回 skipped（不发送）；TLS 策略显式关闭以兼容无 STARTTLS 的内部 relay。
export function createEmailConfigFromEnv(): EmailConfig {
  return {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    username: process.env.SMTP_USER || undefined,
    password: process.env.SMTP_PASS || undefined,
    from: process.env.SENDER_ADDRESS ?? 'noreply@ticket-system.local',
    secure: false,
    requireTLS: false,
  }
}

export function createNotificationEmailClient(): EmailClient {
  return createEmailClient(createEmailConfigFromEnv())
}
