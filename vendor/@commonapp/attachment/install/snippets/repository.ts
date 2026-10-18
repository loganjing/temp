// snippet: repository 接入点
// 在宿主 Repository 类中注入 AttachmentRepository

import { AttachmentRepository } from '@commonapp/attachment'
import type { DbClient } from '@commonapp/dbkit'

class Repository {
  readonly attachmentRepo: AttachmentRepository

  constructor(db: DbClient) {
    // ... 宿主其他初始化
    this.attachmentRepo = new AttachmentRepository(db, {
      tableName: '{{tableName}}',
      entityColumn: '{{entityColumn}}',
    })
  }

  // 在工单详情方法（如 getTicketById）中加载附件：
  //   ticket.attachments = await this.attachmentRepo.listByEntity(id)
  //
  // 原有的 addAttachment / getAttachment / deleteAttachment 方法：
  // - 可以删除（通用路由层直接调用 attachmentRepo）
  // - 或改为委托（如果宿主其他方法依赖它们）：
  //     getAttachment(id: string) { return this.attachmentRepo.get(id) }
  //     deleteAttachment(id: string) { return this.attachmentRepo.delete(id) }
  //
  // 注意：listByEntity 是通用 Repository 的方法，不在 AttachmentRepositoryLike 接口中
  //       路由层不需要它，只有宿主在详情加载时需要
}
