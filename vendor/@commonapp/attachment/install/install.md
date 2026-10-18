# @commonapp/attachment 安装指南

## 概述

通用附件模块，提供文件上传、下载、删除、临时分享链接、公开下载功能。通过 hooks 注入宿主的权限校验和日志记录，模块本身不依赖任何业务逻辑。

## 前置条件

- 宿主应用使用 Hono 作为后端框架
- 宿主应用有认证中间件（能从 context 中获取 currentUser）
- 宿主应用有数据库（兼容 better-sqlite3 的 Database API）
- 前端使用 React 18+（可选，前端组件）

## 配置参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| tableName | string | 'attachments' | 附件表名 |
| entityColumn | string | **必填** | 关联实体字段名，如 ticket_id |
| maxFileSize | number | 10485760 | 文件大小限制（字节） |
| tokenTtlMs | number | 3600000 | 分享 Token 有效期（毫秒） |
| uploadDir | string | './data/uploads' | 文件存储目录 |
| APP_URL | string | **必填** | 应用公网基础 URL（共享 env，跨模块复用；已配置则直接复用） |
| JWT_SECRET | string | **必填** | Token 签名密钥（共享 env，跨模块复用；已配置则直接复用） |

## 接入点（Touchpoints）

### 1. Schema 建表

按批准的数据模型选择 `tableName` 和 `entityColumn`，用 `getAttachmentDdl({ tableName, entityColumn })` 取得建表 SQL，并将该 SQL 写入宿主应用的版本化 SQLite migration。不要在每次启动时另调用不存在的 `initAttachmentSchema`；不要重复定义附件表。

### 2. Repository 注入

在 Repository 类中用 dbkit 的 `DbClient` 创建 `AttachmentRepository` 实例。在业务详情方法中 `await attachmentRepo.listByEntity(id)` 加载附件。原有的 `addAttachment` / `getAttachment` / `deleteAttachment` 可删除或改为异步委托。

### 3. 路由替换

用 `createAttachmentRoutes` 工厂函数替换原有的内联附件路由。把它挂到业务集合前缀，例如 `app.route('/api/tickets', attachmentRoutes)`；模块本身定义 `/:entityId/attachments` 及其子路径。通过 hooks 注入：
- `canAccess`：权限校验（upload/delete → 编辑权限，download → 查看权限）
- `resolveUser`：从用户对象提取 id 和 name
- `onLog`：记录操作日志（可选）

### 4. 公开下载路由

在认证中间件之前挂载 `createPublicDownloadRoute`，例如 `app.route('/api/public', ...)`。若宿主使用全局认证中间件而非按路由顺序挂载，才将 `PUBLIC_DOWNLOAD_PATHS` 与公开前缀组合后纳入白名单。

### 5. 前端组件

用 `AttachmentList` 和 `AttachmentUploader` 替换内联附件 UI。创建 `AttachmentApiClient` 实例，通过 props 传入业务数据和行为回调。

## Hooks 实现指引

### canAccess

```typescript
canAccess: async (user, entityId, action) => {
  // 1. 从 user 中提取用户信息
  // 2. 查询实体（如 repo.getTicketById(entityId)）
  // 3. 根据 action 调用宿主的权限函数
  //    - upload/delete → canEditTicket(user, ticket)
  //    - download → canViewTicket(user, ticket)
}
```

### resolveUser

```typescript
resolveUser: (user) => {
  const u = user as User  // 宿主的用户类型
  return { id: u.id, name: u.name }
}
```

### onLog

```typescript
onLog: (entityId, action, user, detail) => {
  const u = user as User
  repo.insertLog(entityId, action, u, ...)
}
```

## 验证

1. 应用正常启动，attachments 表自动建表
2. 上传附件 → 文件写入磁盘 + 记录入库
3. 下载附件 → 返回文件内容
4. 分享 → 生成 URL + 无登录可下载
5. 删除 → 文件和记录都删除
6. 无权限用户 → 403
7. Token 过期 → 403
