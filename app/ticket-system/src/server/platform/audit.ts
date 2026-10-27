import { createAuditKit, type AuditEvent } from '@commonapp/auditkit'
import type { DbClient } from '@commonapp/dbkit'

/**
 * 审计服务绑定 auditkit。在工单关键操作时调用 record 写入业务审计事件。
 * metadata 字段承载事件详情（实体类型、实体 ID、操作人姓名等），由调用方提供。
 */
export type AuditService = {
  record(event: AuditEvent): Promise<void>
}

export function createAuditService(db: DbClient): AuditService {
  const kit = createAuditKit(db)
  return {
    record: (event) => kit.record(event),
  }
}
