import { createEmailClient, type EmailClient, type EmailSendResult } from '@commonapp/emailkit'

export type CompletionEmailInput = {
  ticketNo: string
  subject: string
  category: string
  priority: string
  submitterEmail: string
  handlerName: string
  completedAt: string
  resolution: string | null
}

export type NotificationResult = { ok: true; messageId?: string } | { ok: false; reason: string }

// 邮件经 emailkit 发送（契约第 10 节）。SMTP_HOST 为空时 emailkit 禁用外发，
// 结果如实按失败处理；发送失败不改变工单完成状态。
export function createNotificationService(): { sendCompletionNotification: (input: CompletionEmailInput) => Promise<NotificationResult> } {
  const host = (process.env.SMTP_HOST ?? '').trim()
  const port = Number(process.env.SMTP_PORT ?? 587)
  const username = process.env.SMTP_USER ?? ''
  const password = process.env.SMTP_PASS ?? ''
  const from = process.env.SMTP_FROM ?? 'noreply@ticket-system.local'
  const fromName = process.env.SMTP_FROM_NAME
  const client: EmailClient = createEmailClient({
    host,
    port: Number.isFinite(port) && port >= 1 && port <= 65535 ? port : 587,
    ...(username !== '' && password !== '' ? { username, password } : {}),
    from: fromName ? { address: from, name: fromName } : from,
  })

  const buildText = (input: CompletionEmailInput): string =>
    [
      '您好，您的工单已处理完成。',
      '',
      `工单号：${input.ticketNo}`,
      `主题：${input.subject}`,
      `分类：${input.category}`,
      `优先级：${input.priority}`,
      `处理人：${input.handlerName}`,
      `完成时间：${input.completedAt}`,
      `处理说明：${input.resolution ?? '（无）'}`,
      '',
      '请登录工单系统对本次服务进行满意度评价。',
    ].join('\n')

  const describeFailure = (result: Extract<EmailSendResult, { status: 'skipped' | 'failed' }>): string => {
    if (result.status === 'skipped') return 'SMTP 未配置'
    return result.message
  }

  return {
    async sendCompletionNotification(input) {
      try {
        const result = await client.send({
          to: input.submitterEmail,
          subject: `[工单完成] ${input.ticketNo} ${input.subject}`,
          text: buildText(input),
        })
        if (result.status === 'sent') return { ok: true, messageId: result.messageId }
        const failure = describeFailure(result)
        console.error('[email] completion notification failed', failure)
        return { ok: false, reason: failure }
      } catch (error) {
        const reason = error instanceof Error ? error.message : '邮件发送异常'
        console.error('[email] completion notification failed', reason)
        return { ok: false, reason }
      }
    },
  }
}

export type NotificationService = ReturnType<typeof createNotificationService>
