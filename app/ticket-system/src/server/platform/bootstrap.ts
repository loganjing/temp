import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createDbConfig, runMigrations } from '@commonapp/dbkit'
import { createEmailClient, type EmailClient, type EmailMessage, type EmailSendResult } from '@commonapp/emailkit'
import { createAuditKit } from '@commonapp/auditkit'
import { createApplicationAuth } from './auth'

export async function initializePlatform() {
  const sqlitePath = process.env.DB_PATH ?? './data/application.db'
  if (sqlitePath !== ':memory:') await mkdir(path.dirname(path.resolve(sqlitePath)), { recursive: true })
  const db = createDb(createDbConfig({ driver: 'sqlite', sqlitePath }))
  try {
    await runMigrations(db, { directory: fileURLToPath(new URL('../migrations/', import.meta.url)) })
    const auth = createApplicationAuth(db)
    const auditKit = createAuditKit(db)
    const emailClient = createWrappedEmailClient()
    return { db, auth, auditKit, emailClient, close: () => { emailClient.close(); db.close() } }
  } catch (error) {
    await db.close()
    throw error
  }
}

function createWrappedEmailClient(): EmailClient {
  const smtpHost = process.env.SMTP_HOST ?? ''
  const inner = createEmailClient({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT) || undefined,
    username: process.env.SMTP_USERNAME,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM ?? 'no-reply@ticket-system.local',
  })
  const send = async (message: EmailMessage): Promise<EmailSendResult> => {
    const result = await inner.send(message)
    if (result.status === 'skipped') {
      console.log(`[email] SMTP not configured — would send to ${Array.isArray(message.to) ? message.to.join(', ') : message.to}: ${message.subject}`)
      if (message.text) console.log(message.text)
    }
    return result
  }
  return { send, sendTest: inner.sendTest, close: inner.close }
}
