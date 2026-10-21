import { createEmailClient, type EmailClient, type EmailConfig } from '@commonapp/emailkit'

// emailkit 不读取环境变量：通知域从应用配置构造 EmailConfig（架构基线第 5 节）。
// 未配置 SMTP_HOST 时 client.send 返回 skipped/not_configured，完成通知走本地发件箱。
export type EmailPlatform = {
  client: EmailClient
  configured: boolean
  close: () => void
}

export function createEmailPlatform(env: NodeJS.ProcessEnv = process.env): EmailPlatform {
  const host = (env.SMTP_HOST ?? '').trim()
  const port = Number(env.SMTP_PORT ?? 587)
  const username = env.SMTP_USER || undefined
  const password = env.SMTP_PASS || undefined
  const from = env.SMTP_FROM ?? 'noreply@ticket-system.local'
  const fromName = env.SMTP_FROM_NAME ?? '工单系统'
  const config: EmailConfig = { host, port, username, password, from: { address: from, name: fromName } }
  const client = createEmailClient(config)
  return { client, configured: host.length > 0, close: () => client.close() }
}
