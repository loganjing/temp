import type { DbClient } from '@commonapp/dbkit'
import type { createAuditKit } from '@commonapp/auditkit'
import type { EmailClient } from '@commonapp/emailkit'

export type AuditKit = ReturnType<typeof createAuditKit>

export type ServiceContext = {
  db: DbClient
  audit: AuditKit
  email: EmailClient
}

export class BusinessError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

export const now = () => new Date().toISOString()
