import { createEmailClient, type EmailClient, type EmailConfig } from '@commonapp/emailkit'

export function createEmailService(): EmailClient | null {
  const host = process.env.SMTP_HOST
  if (!host) return null
  const config: EmailConfig = {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    username: process.env.SMTP_USER,
    password: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM ?? 'no-reply@localhost',
    secure: process.env.SMTP_SECURE === 'true',
  }
  return createEmailClient(config)
}

export async function sendTicketCompletionEmail(
  emailClient: EmailClient | null,
  to: string,
  ticketSubject: string,
  ticketId: string,
): Promise<void> {
  if (!emailClient) {
    console.warn('[email] SMTP not configured, skipping ticket completion notification')
    return
  }
  try {
    const result = await emailClient.send({
      to,
      subject: `工单已完成: ${ticketSubject}`,
      text: `您的工单 "${ticketSubject}"（ID: ${ticketId}）已处理完成。`,
    })
    if (result.status === 'failed') {
      console.error('[email] send failed', result.message)
    }
  } catch (error) {
    console.error('[email] send error', error)
  }
}
