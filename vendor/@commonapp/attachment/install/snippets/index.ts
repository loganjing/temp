// snippet: 应用入口接入点
// 在 registerPublicRoutes（或等效入口）中、认证边界之前挂载公开下载路由

import { createPublicDownloadRoute, LocalStorage, createTokenService } from '@commonapp/attachment'

// 挂载后实际路径为 GET /api/public/attachments/download?token=...
app.route('/api/public', createPublicDownloadRoute({
  repo: repo.attachmentRepo,    // ← AI: 从 Repository 实例中获取
  storage: new LocalStorage({ dir: '{{uploadDir}}' }),
  tokenService: createTokenService(env.JWT_SECRET),  // 共享 env，跨模块复用
}))

// 若宿主使用不分路由顺序的全局认证中间件，再将此路径纳入公开白名单。
