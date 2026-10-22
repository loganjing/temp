import { createEmailClient, type EmailClient } from '@commonapp/emailkit'

/**
 * 由环境变量构造 SMTP 邮件客户端。
 * 未配置 SMTP_HOST 时返回 null，业务侧将邮件标记为未配置且不阻塞主流程。
 */
export function createApplicationEmailClient(): EmailClient | null {
  const host = process.env.SMTP_HOST?.trim()
  if (!host) return null
  const port = Number(process.env.SMTP_PORT ?? 587)
  try {
    return createEmailClient({
      host,
      port,
      username: process.env.SMTP_USER?.trim() || undefined,
      password: process.env.SMTP_PASS || undefined,
      from: process.env.SMTP_FROM?.trim() || 'ticket-system@localhost',
    })
  } catch (error) {
    console.error('[email] SMTP configuration is invalid; completion notifications will be skipped', error)
    return null
  }
}
