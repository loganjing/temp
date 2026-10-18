// snippet: routes 接入点
// 用 createAttachmentRoutes 替换内联附件路由
// 删除原有的 5 个附件路由（上传/下载/删除/分享/公开下载）

import { createAttachmentRoutes, LocalStorage, createTokenService } from '@commonapp/attachment'

// 在受保护的业务路由定义函数内（如 registerProtectedRoutes）：

const attachmentRoutes = createAttachmentRoutes({
  repo: repo.attachmentRepo,    // ← AI: 从 Repository 实例中获取
  storage: new LocalStorage({ dir: '{{uploadDir}}' }),
  tokenService: createTokenService(env.JWT_SECRET),  // 共享 env，跨模块复用（authkit 也用）
  config: {
    maxFileSize: {{maxFileSize}},
    tokenTtlMs: {{tokenTtlMs}},
    uploadDir: '{{uploadDir}}',
  },
  hooks: {
    // ↓↓↓ AI: 根据宿主的权限模型生成以下代码 ↓↓↓
    canAccess: async (user, entityId, action) => {
      // 查询实体及其公司/租户归属，并从服务端可信用户身份校验访问权。
      // upload/delete 要求编辑权；download 要求查看权。
      // 未接通真实权限模型前保持拒绝，不得直接返回 true。
      return false
    },
    resolveUser: (user) => {
      // 按宿主的真实用户类型返回 id/name；未接通前明确失败。
      throw new Error('Attachment user resolver is not configured')
    },
    onLog: (entityId, action, user, detail) => {
      // 提示：调用宿主的日志记录方法
      // 如：repo.insertLog(entityId, action, user, ...)
    },
  },
  appUrl: env.APP_URL,  // 共享 env，跨模块复用；宿主 .env 已配置则直接用
})
app.route('/api/tickets', attachmentRoutes) // 模块自己追加 /:entityId/attachments

// 同时删除 src/lib/token.ts（通用模块自带 token 服务）
