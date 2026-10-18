import { createAuditKit } from '@commonapp/auditkit'
import type { DbClient } from '@commonapp/dbkit'

export function createApplicationAudit(db: DbClient) {
  return createAuditKit(db)
}
