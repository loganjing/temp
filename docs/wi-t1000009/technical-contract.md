# 技术契约（k02-ticket）

本文件是字段级契约的唯一来源；架构基线只保留职责与调用方向。

## 1. 通用约定

- 基础路径 `/api`，请求与响应均为 UTF-8 JSON；写操作使用 `POST`/`PATCH`/`PUT`/`DELETE`。
- 认证：`Authorization: Bearer <token>`，缺失或过期返回 `401 UNAUTHENTICATED`；除 `POST /api/auth/login` 外所有接口都要求认证。
- 数据范围：用户所属公司来自 `user_profiles.company_id`，服务端在每条查询与写入上强制附加公司条件；跨公司访问返回 `403 FORBIDDEN` 且不返回任何业务字段。
- 时间：数据库与 API 均为 ISO 8601 UTC 字符串（如 `2026-11-05T08:00:00.000Z`），前端按浏览器本地时区展示。
- 布尔：数据库为 `0/1`，API 与前端为 `boolean`，转换只在仓储层发生。
- 分页：`page` 从 1 开始（默认 1），`pageSize` 默认 20、上限 100。
- 错误体：`{ "error": { "code": string, "message": string, "fields"?: { [field: string]: string } } }`，`message` 为可直接展示的中文提示。
- 写操作成功后前端必须以响应中的最新对象刷新当前详情，不以本地拼接结果为准。

## 2. 标识（ID）对照

| 实体 | 生成方 | 数据库主键 | 外键类型 | API JSON | 前端类型 | 转换/校验位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 公司 `companies.id` | 种子/运营脚本（`randomUUID`） | TEXT | TEXT | `string` | `string` | 服务端比对当前用户公司 |
| 用户 `users.id` | `userkit`（字符串 ID） | TEXT | TEXT | `string` | `string` | 身份服务解析 |
| 工单 `tickets.id` | `crypto.randomUUID()` | TEXT | TEXT | `string` | `string` | 工单服务 |
| 工单编号 `tickets.code` | `counters`（`ticket_code`） | TEXT UNIQUE | 不作为外键 | `string` | `string` | 事务内取号，格式 `TK-` + 6 位补零 |
| 业务组 `business_groups.id` | `crypto.randomUUID()` | TEXT | TEXT | `string` | `string` | 组织服务 |
| 分类 `ticket_categories.id` | `crypto.randomUUID()` | TEXT | TEXT | `string` | `string` | 组织服务 |
| 规则 `assignment_rules.id` | `crypto.randomUUID()` | TEXT | TEXT | `string` | `string` | 组织服务 |
| 回复/日志/评价/通知 `id` | `crypto.randomUUID()` | TEXT | TEXT | `string` | `string` | 对应服务 |
| 角色/权限键 | `permissionkit` 注册表 | TEXT | — | `string[]` | `string[]` | 身份服务 |

所有 ID 对外都是不透明字符串，不存在数字主键与字符串 ID 之间的转换。

## 3. 枚举与状态机

### 3.1 状态

| 值 | 中文标签 | 说明 |
| --- | --- | --- |
| `pending_assignment` | 待分配 | 已提交、未命中自动分配规则 |
| `pending` | 待处理 | 已归属业务组或处理人 |
| `completed` | 完成 | 终态 |
| `cancelled` | 取消 | 终态 |

“创建”为提交过程的瞬时初态，从不落库；提交事务内直接写入 `pending_assignment` 或 `pending`。

### 3.2 流转

| 动作 | 起点 | 终点 | 守卫 | 副作用 |
| --- | --- | --- | --- | --- |
| 提交 | —（创建） | `pending` / `pending_assignment` | 必填项合法、分类属本公司且启用 | 取号、写创建日志；命中规则写入 `group_id` |
| 指派 `assign` | `pending_assignment` | `pending` | 公司管理员；或处理人指派到其所属业务组 | 写 `group_id`/`assignee_id`、写日志 |
| 转派 `transfer` | `pending` | `pending` | 该公司管理员；或该工单当前业务组成员 | 写前后归属、写日志（含说明） |
| 回复 `reply` | `pending_assignment`、`pending` | 不变 | 提交人本人、该组处理人、公司管理员 | 首次回复写入 `first_reply_at`、写日志 |
| 完成 `complete` | `pending` | `completed` | 该公司管理员；或该工单当前组成员 | 写 `completed_by`/`completed_at`、日志，事务后发通知 |
| 取消 `cancel` | `pending_assignment`、`pending` | `cancelled` | 提交人本人；或公司管理员 | 写 `cancelled_by`/`cancelled_at`、写日志 |
| 评价 `rate` | `completed` | 不变 | 提交人本人且尚无评价 | 写评价、写日志 |

终态（`completed`、`cancelled`）拒绝回复、指派、转派、取消，返回 `409 INVALID_STATE`。

### 3.3 其他枚举

- 优先级：`P0`（紧急）、`P1`（高）、`P2`（中）、`P3`（低）、`P4`（最低）；排序时 `P0` 最高。
- 通知状态：`sent`（已发送）、`failed`（发送失败）、`skipped`（未配置 SMTP）。
- 日志动作：`created`、`assigned`、`transferred`、`replied`、`completed`、`cancelled`、`rated`、`notified`、`notification_retried`。
- 统计维度：`company`、`department`。

## 4. 角色与权限矩阵

角色通过 `permissionkit` 授予：`agent` 与公司范围绑定，随业务组成员关系同步授予/回收；`company_admin` 按公司范围授予；`platform_stats` 为全局只读聚合范围。任何已认证且具备 `user_profiles` 的用户都可以提交工单。

| 动作 | 提交人（本人） | 处理人（本组） | 公司管理员（本公司） | 平台统计（只读） |
| --- | --- | --- | --- | --- |
| 提交工单 | ✓ | ✓ | ✓ | ✗ |
| 查看本人工单 | ✓ | ✓ | ✓ | ✗ |
| 查看工作台队列 | ✗ | ✓（所属业务组） | ✓（本公司） | ✗ |
| 查看工单详情 | 本人 | 本组 | 本公司 | ✗ |
| 回复 | 本人未完结 | 本组未完结 | 本公司未完结 | ✗ |
| 指派 | ✗ | 指派到本组 | 本公司任意组/成员 | ✗ |
| 转派 / 完成 | ✗ | 本组 | 本公司 | ✗ |
| 取消 | 本人未完结 | ✗ | 本公司未完结 | ✗ |
| 评价 | 本人已完成 | ✗ | ✗ | ✗ |
| 查看日志 | 本人工单 | 本组工单 | 本公司工单 | ✗ |
| 业务组 / 分类 / 规则 / 用户 | ✗ | ✗ | ✓ | ✗ |
| 统计概览与分布 | ✗ | ✗ | 本公司 | 全部公司聚合值 |

## 5. 端点契约

### 5.1 认证与身份

`POST /api/auth/login`

- 请求：`{ "email": string, "password": string }`
- 响应 200：`{ "token": string, "user": UserProfile }`
- 用户对象 `UserProfile`：`{ id: string, name: string, email: string, companyId: string, companyName: string, department: string, roles: string[], groups: Array<{ id: string, name: string }> }`
- 错误：`401 UNAUTHENTICATED`（凭证错误，统一提示“邮箱或密码不正确”）、`403 ACCOUNT_DISABLED`（账号停用）、`429 RATE_LIMITED`（登录限流）。

`GET /api/me` → 200 `UserProfile`。

### 5.2 参考数据

`GET /api/reference` → 200 `{ categories: Category[], groups: GroupRef[] }`，仅本公司、仅启用项；`Category = { id, name, sortOrder }`，`GroupRef = { id, name }`。

### 5.3 工单

`TicketSummary`：

```ts
{
  id: string; code: string; subject: string
  categoryId: string; categoryName: string
  priority: 'P0'|'P1'|'P2'|'P3'|'P4'
  status: 'pending_assignment'|'pending'|'completed'|'cancelled'
  submitter: { id: string; name: string }
  companyId: string; companyName: string; department: string
  group: { id: string; name: string } | null
  assignee: { id: string; name: string } | null
  createdAt: string; updatedAt: string
}
```

`TicketDetail` = `TicketSummary` 加上：

```ts
{
  description: string
  submitter: { id: string; name: string; email: string; companyId: string; companyName: string; department: string }
  history: Array<{ id: string; code: string; subject: string; categoryName: string; status: string; createdAt: string }>
  replies: Array<{ id: string; author: { id: string; name: string }; content: string; createdAt: string }>
  rating: { score: number; comment: string | null; createdAt: string } | null
  notifications: Array<{ id: string; recipientEmail: string; status: 'sent'|'failed'|'skipped'; errorMessage: string | null; attempt: number; createdAt: string; sentAt: string | null }>
  completedBy: { id: string; name: string } | null; completedAt: string | null
  cancelledBy: { id: string; name: string } | null; cancelledAt: string | null
  firstReplyAt: string | null
  allowedActions: Array<'reply'|'assign'|'transfer'|'complete'|'cancel'|'rate'|'retryNotification'>
}
```

- `history` 为提交人在本公司的最近 10 条历史工单（含当前单），按创建时间倒序，仅含 ID、主题、分类、状态、创建时间，不暴露描述与回复。

`POST /api/tickets`

- 请求：`{ subject: string(1–120), description: string(1–5000), categoryId: string, priority: 'P0'|'P1'|'P2'|'P3'|'P4' }`
- 响应 201：`{ ticket: TicketSummary }`；状态取决于是否命中启用中的分配规则。
- 错误：`422 VALIDATION_FAILED`（逐字段提示）、`403 FORBIDDEN`（分类不属本公司）。

`GET /api/tickets`

- 查询参数：`scope=mine|workbench`（默认 `workbench`）、`status`（可重复，省略时工作台默认 `pending`；`all` 表示不限）、`priority`、`categoryId`、`groupId`、`companyId`、`submitterId`、`from`、`to`（按创建时间，含边界）、`q`（匹配工单编号或主题，大小写不敏感）、`sort=createdAt|priority|updatedAt`（默认 `createdAt`）、`order=asc|desc`（默认 `desc`）、`page`、`pageSize`。
- 响应 200：`{ items: TicketSummary[], total: number, page: number, pageSize: number }`
- 数据范围：`mine` 固定为当前用户提交；`workbench` 对处理人为所属业务组工单、对公司管理员为本公司工单；`platform_stats` 访问工作台返回 `403 FORBIDDEN`。
- `companyId` 只接受当前用户所属公司，其他值返回 `403 FORBIDDEN`；结果中不出现其他公司数据。

`GET /api/tickets/:id` → 200 `TicketDetail`；不可见或跨公司返回 `403 FORBIDDEN`，不存在返回 `404 NOT_FOUND`。

`GET /api/tickets/:id/logs` → 200 `{ items: Array<{ id, action, actionLabel, summary, actor: { id, name }, detail: Record<string, unknown> | null, createdAt }> }`，按时间正序；无编辑/删除端点。

### 5.4 协作

`POST /api/tickets/:id/replies`：`{ content: string(1–2000) }` → 201 `{ reply: { id, author: { id, name }, content, createdAt } }`。

`POST /api/tickets/:id/assign`：`{ groupId: string, assigneeId?: string }` → 200 `{ ticket: TicketSummary }`；`assigneeId` 必须属于目标业务组且为同一公司。

`POST /api/tickets/:id/transfer`：`{ groupId: string, assigneeId?: string, note?: string(≤500) }` → 200 `{ ticket: TicketSummary }`；转派后状态保持 `pending`。

`POST /api/tickets/:id/complete`：`{ note?: string(≤500) }` → 200 `{ ticket: TicketSummary, notification: NotificationRecord | null }`；通知失败不影响状态。

`POST /api/tickets/:id/cancel`：`{ reason?: string(≤500) }` → 200 `{ ticket: TicketSummary }`。

`POST /api/tickets/:id/rating`：`{ score: 1|2|3|4|5, comment?: string(≤500) }` → 201 `{ rating: { score, comment, createdAt } }`；重复评价 `409 DUPLICATE_RATING`，非提交人 `403 FORBIDDEN`。

`POST /api/tickets/:id/notifications/:notificationId/retry` → 200 `{ notification: NotificationRecord }`；记录不存在或不属于该工单返回 `404 NOT_FOUND`。

### 5.5 配置（公司管理员）

- `GET /api/business-groups` → `{ items: Array<{ id, name, description: string | null, enabled: boolean, members: Array<{ id, name, email, department }> }> }`
- `POST /api/business-groups` `{ name: string(1–60), description?: string(≤200) }` → 201 `{ group }`；同名 `409 DUPLICATE_NAME`。
- `PATCH /api/business-groups/:id` `{ name?, description?, enabled? }` → 200 `{ group }`。
- `POST /api/business-groups/:id/members` `{ userId: string }` → 201 `{ member }`；非本公司用户 `422 VALIDATION_FAILED`，重复添加 `409 DUPLICATE_MEMBER`。
- `DELETE /api/business-groups/:id/members/:userId` → 204。
- `GET /api/ticket-categories` → `{ items: Array<{ id, name, enabled, sortOrder }> }`
- `POST /api/ticket-categories` `{ name: string(1–40), sortOrder?: number }` → 201；同名 `409 DUPLICATE_NAME`。
- `PATCH /api/ticket-categories/:id` `{ name?, enabled?, sortOrder? }` → 200。
- `GET /api/assignment-rules` → `{ items: Array<{ id, categoryId, categoryName, groupId, groupName, enabled }> }`
- `PUT /api/assignment-rules` `{ categoryId: string, groupId: string, enabled: boolean }` → 200 `{ rule }`；按“公司 + 分类”幂等覆盖，不产生并发生效规则。
- `GET /api/company-users?q=` → `{ items: Array<{ id, name, email, department, enabled, roles: string[], groups: Array<{ id, name }> }> }`，仅本公司。
- `PATCH /api/company-users/:id` `{ department?: string(1–60), enabled?: boolean }` → 200 `{ user }`，仅本公司。

### 5.6 统计

`GET /api/stats/overview?from&to&companyId?`

```ts
{
  range: { from: string; to: string }
  volume: number                 // 统计期内创建的工单数
  cancelledCount: number         // 其中已取消数量，单独展示
  avgFirstResponseMinutes: number | null   // 已产生首次回复工单的创建→首次回复平均时长（分钟，保留 1 位小数）
  satisfaction: { average: number | null; count: number }  // 已完成且已评价
  hotCategories: Array<{ categoryId: string; name: string; count: number }>  // 按分类计数取前 5
}
```

`GET /api/stats/distribution?dimension=company|department&from&to`

```ts
{ dimension: 'company' | 'department'; total: number; groups: Array<{ key: string; label: string; count: number }> }
```

- 公司管理员只得到本公司数据（`dimension=company` 时通常只有一组）；`platform_stats` 得到全部公司的聚合值，但不含任何工单明细。`companyId` 参数仅 `platform_stats` 可用。

## 6. 错误码

| code | HTTP | 含义 |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | 未登录或令牌失效 |
| `ACCOUNT_DISABLED` | 403 | 账号停用 |
| `FORBIDDEN` | 403 | 无权限或跨公司访问 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION_FAILED` | 422 | 字段校验失败，`fields` 给出逐字段提示 |
| `INVALID_STATE` | 409 | 当前状态不允许该动作（终态操作等） |
| `DUPLICATE_RATING` | 409 | 工单已有评价 |
| `DUPLICATE_NAME` | 409 | 同名业务组或分类 |
| `DUPLICATE_MEMBER` | 409 | 成员已在业务组中 |
| `RATE_LIMITED` | 429 | 登录尝试过于频繁 |

## 7. 校验与转换责任

- 服务端集中校验：必填、长度、枚举、同公司归属、状态守卫、唯一约束；前端表单校验只做即时反馈，不作为安全边界。
- 工单编号只在服务端事务内生成，前端不可提交或修改。
- 详情接口的 `allowedActions` 由服务端按当前用户与状态计算，前端据此渲染操作按钮；前端不得自行推断权限。
- 日志与通知记录只读：不提供更新、删除端点，前端也不渲染对应入口。