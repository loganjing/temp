# 技术契约

本文档定义前后端共享的 API 契约。字段级细节以本文件为唯一来源。

## 1. 通用约定

### 1.1 认证

除 `POST /api/auth/login` 外，所有接口需 Bearer token 认证（`Authorization: Bearer <token>`）。未认证返回 `401 {error: "not_authenticated"}`。

### 1.2 通用响应格式

- 成功：返回资源对象或 `{...}`，HTTP 200/201
- 错误：`{error: "<reason>", detail?: "<message>"}`，HTTP 4xx/5xx
- 列表：`{items: [...], total: number}`

### 1.3 时间格式

所有时间字段为 ISO 8601 字符串（UTC），如 `2026-11-03T08:30:00.000Z`。

## 2. 认证接口

### POST /api/auth/login

密码登录，登录字段为 `email`。

请求：
```json
{ "email": "user@example.com", "password": "secret" }
```

响应 200：
```json
{ "token": "<jwt>", "user": { "id": "uuid", "name": "张三", "email": "user@example.com", "companyId": "uuid|null" } }
```

错误：401 `{error: "invalid_credentials"}`

### GET /api/auth/me

获取当前登录用户完整信息。

响应 200：
```json
{
  "id": "uuid",
  "name": "张三",
  "email": "user@example.com",
  "phone": "13800000000|null",
  "companyId": "uuid|null",
  "roles": ["ticket_submitter"],
  "department": { "id": "uuid", "name": "技术部" } | null
}
```

## 3. 工单接口

### GET /api/tickets

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| companyId | string | 否 | 按公司筛选（默认当前用户公司） |
| status | string | 否 | 状态筛选：created/pending_assignment/pending_processing/completed/cancelled |
| priority | string | 否 | 优先级筛选：P0/P1/P2/P3/P4 |
| category | string | 否 | 分类筛选 |
| search | string | 否 | 主题/描述关键词搜索 |
| sort | string | 否 | 排序字段：created_at/priority/status（默认 created_at desc） |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页条数，默认 20 |

响应 200：
```json
{
  "items": [
    {
      "id": "uuid",
      "subject": "登录异常",
      "category": "账号问题",
      "priority": "P1",
      "status": "pending_processing",
      "companyId": "uuid",
      "submitterName": "张三",
      "assigneeName": "李四|null",
      "businessGroupName": "技术支持组|null",
      "createdAt": "2026-11-03T08:00:00.000Z"
    }
  ],
  "total": 42
}
```

### GET /api/tickets/:id

响应 200：
```json
{
  "id": "uuid",
  "subject": "登录异常",
  "description": "无法登录系统",
  "category": "账号问题",
  "priority": "P1",
  "status": "pending_processing",
  "companyId": "uuid",
  "submitter": {
    "id": "uuid",
    "name": "张三",
    "email": "zhangsan@example.com",
    "companyName": "A公司",
    "departmentName": "技术部",
    "historicalTickets": [
      { "id": "uuid", "subject": "密码重置", "status": "completed", "createdAt": "2026-10-01T..." }
    ]
  },
  "businessGroupId": "uuid|null",
  "businessGroupName": "技术支持组|null",
  "assigneeId": "uuid|null",
  "assigneeName": "李四|null",
  "handlerId": "uuid|null",
  "handlerName": "李四|null",
  "createdAt": "2026-11-03T08:00:00.000Z",
  "handledAt": "2026-11-03T10:00:00.000Z|null",
  "replies": [
    { "id": "uuid", "replierId": "uuid", "replierName": "李四", "content": "已排查", "repliedAt": "2026-11-03T09:00:00.000Z" }
  ],
  "evaluation": { "rating": 5, "comment": "处理很快", "evaluatedAt": "2026-11-03T11:00:00.000Z" } | null,
  "recentLogs": [
    { "id": "uuid", "eventType": "ticket.created", "actorUserId": "uuid", "occurredAt": "2026-11-03T08:00:00.000Z", "metadata": {} }
  ]
}
```

### POST /api/tickets

请求：
```json
{
  "subject": "登录异常",
  "description": "无法登录系统",
  "category": "账号问题",
  "priority": "P1"
}
```

行为：创建工单后自动匹配 `category_routing_rules`（按 `currentUser.companyId` + `category`）。匹配到规则时分配到对应业务组，状态设为 `pending_processing`；未匹配到时状态为 `pending_assignment`。`submitterId` 和 `companyId` 取自当前用户。

响应 201：
```json
{
  "id": "uuid",
  "subject": "登录异常",
  "category": "账号问题",
  "priority": "P1",
  "status": "pending_processing",
  "companyId": "uuid",
  "submitterId": "uuid",
  "businessGroupId": "uuid|null",
  "createdAt": "2026-11-03T08:00:00.000Z"
}
```

### POST /api/tickets/:id/replies

请求：
```json
{ "content": "已排查，是密码错误" }
```

响应 201：
```json
{ "id": "uuid", "ticketId": "uuid", "replierId": "uuid", "replierName": "李四", "content": "已排查", "repliedAt": "2026-11-03T09:00:00.000Z" }
```

### POST /api/tickets/:id/transfer

请求：
```json
{ "targetUserId": "uuid", "targetGroupId": "uuid" }
```

二者至少传一个。`targetUserId` 优先；传 `targetGroupId` 时转派给业务组。

行为：更新 `assignee_id` 或 `business_group_id`，状态保持 `pending_processing`。记录审计事件 `ticket.transferred`。

响应 200：
```json
{ "id": "uuid", "status": "pending_processing", "assigneeId": "uuid|null", "businessGroupId": "uuid|null" }
```

错误：400 `{error: "missing_target"}`；409 `{error: "invalid_status"}`（工单非 pending_processing 状态）

### POST /api/tickets/:id/complete

请求：无 body（或空 `{}`）

行为：设 `status=completed`、`handler_id=currentUser.id`、`handled_at=now`。通过 emailkit 向 `submitter.email` 发送完成通知邮件。记录审计事件 `ticket.completed`。

响应 200：
```json
{
  "id": "uuid",
  "status": "completed",
  "handlerId": "uuid",
  "handlerName": "李四",
  "handledAt": "2026-11-03T10:00:00.000Z",
  "emailNotification": { "status": "sent" | "skipped" | "failed", "reason": "not_configured" }
}
```

错误：409 `{error: "invalid_status"}`（工单非 pending_processing 状态）

### POST /api/tickets/:id/cancel

请求：无 body

行为：设 `status=cancelled`。记录审计事件 `ticket.cancelled`。

响应 200：
```json
{ "id": "uuid", "status": "cancelled" }
```

错误：409 `{error: "invalid_status"}`（工单已为 completed 或 cancelled）

### POST /api/tickets/:id/evaluation

请求：
```json
{ "rating": 5, "comment": "处理很快" }
```

`rating` 为 1–5 整数。`comment` 可选。

行为：仅 `completed` 状态工单可评价。每工单仅一条评价。

响应 201：
```json
{ "id": "uuid", "ticketId": "uuid", "rating": 5, "comment": "处理很快", "evaluatedAt": "2026-11-03T11:00:00.000Z" }
```

错误：409 `{error: "invalid_status"}` 或 `{error: "already_evaluated"}`

### GET /api/tickets/:id/logs

响应 200：
```json
{
  "items": [
    {
      "id": "uuid",
      "eventType": "ticket.created",
      "actorUserId": "uuid",
      "occurredAt": "2026-11-03T08:00:00.000Z",
      "metadata": {}
    }
  ]
}
```

事件类型：`ticket.created`、`ticket.assigned`、`ticket.transferred`、`ticket.replied`、`ticket.completed`、`ticket.cancelled`

## 4. 工作台接口

### GET /api/workbench/tickets

查询参数：`status`（默认 `pending_processing`）、`priority`、`category`、`search`、`sort`、`companyId`、`page`、`pageSize`

行为：返回当前用户可见的工单（提交人看自己创建的，处理人看分配给自己的或所属业务组的），默认筛选待处理。

响应 200：同 `/api/tickets` 列表格式。

## 5. 公司与部门接口

### GET /api/companies

响应 200：
```json
{ "items": [ { "id": "uuid", "name": "A公司" } ] }
```

### POST /api/companies

请求：`{ "name": "B公司" }`

响应 201：`{ "id": "uuid", "name": "B公司" }`

### GET /api/companies/:companyId/departments

响应 200：
```json
{ "items": [ { "id": "uuid", "name": "技术部", "companyId": "uuid" } ] }
```

### POST /api/companies/:companyId/departments

请求：`{ "name": "市场部" }`

响应 201：`{ "id": "uuid", "name": "市场部", "companyId": "uuid" }`

## 6. 业务组接口

### GET /api/companies/:companyId/business-groups

响应 200：
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "技术支持组",
      "companyId": "uuid",
      "members": [ { "userId": "uuid", "userName": "李四" } ]
    }
  ]
}
```

### POST /api/companies/:companyId/business-groups

请求：`{ "name": "技术支持组" }`

响应 201：`{ "id": "uuid", "name": "技术支持组", "companyId": "uuid" }`

### POST /api/business-groups/:groupId/members

请求：`{ "userId": "uuid" }`

响应 201：`{ "groupId": "uuid", "userId": "uuid" }`

错误：404 `{error: "group_not_found"}`；409 `{error: "already_member"}`

### DELETE /api/business-groups/:groupId/members/:userId

响应 200：`{ "groupId": "uuid", "userId": "uuid" }`

## 7. 路由规则接口

### GET /api/companies/:companyId/routing-rules

响应 200：
```json
{
  "items": [
    { "id": "uuid", "companyId": "uuid", "category": "账号问题", "businessGroupId": "uuid", "businessGroupName": "技术支持组" }
  ]
}
```

### POST /api/companies/:companyId/routing-rules

请求：`{ "category": "账号问题", "businessGroupId": "uuid" }`

响应 201：
```json
{ "id": "uuid", "companyId": "uuid", "category": "账号问题", "businessGroupId": "uuid" }
```

错误：409 `{error: "duplicate_rule"}`（同公司同分类已存在规则）

## 8. 用户接口

### GET /api/users

查询参数：`companyId`、`search`、`page`、`pageSize`

响应 200：
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "张三",
      "email": "zhangsan@example.com",
      "phone": "13800000000|null",
      "companyId": "uuid|null",
      "departmentName": "技术部|null"
    }
  ],
  "total": 10
}
```

### POST /api/users

请求：
```json
{
  "name": "张三",
  "email": "zhangsan@example.com",
  "phone": "13800000000",
  "password": "initial_password",
  "companyId": "uuid",
  "departmentId": "uuid"
}
```

行为：通过 userkit `createUserStore.create()` 创建用户（含密码哈希），同时写入 `user_departments` 关联。

响应 201：
```json
{ "id": "uuid", "name": "张三", "email": "zhangsan@example.com", "companyId": "uuid" }
```

## 9. 统计接口

### GET /api/stats/distribution

查询参数：`dimension=company|department`

响应 200（dimension=company）：
```json
{
  "dimension": "company",
  "items": [
    { "label": "A公司", "count": 25 },
    { "label": "B公司", "count": 17 }
  ]
}
```

响应 200（dimension=department）：
```json
{
  "dimension": "department",
  "items": [
    { "label": "技术部", "count": 15, "companyId": "uuid" }
  ]
}
```

### GET /api/stats/dashboard

响应 200：
```json
{
  "totalTickets": 42,
  "pendingCount": 12,
  "completedCount": 25,
  "cancelledCount": 5,
  "avgResponseTimeMs": 3600000,
  "avgSatisfaction": 4.5,
  "hotCategories": [
    { "category": "账号问题", "count": 15 },
    { "category": "系统故障", "count": 10 }
  ]
}
```

- `avgResponseTimeMs`：工单从 `created_at` 到 `handled_at` 的平均时长（毫秒），仅统计已完工单
- `avgSatisfaction`：所有评价的平均评分（1–5），无评价时为 `null`
- `hotCategories`：工单量 Top 5 分类

## 10. 权限矩阵

| 接口 | ticket_submitter | ticket_handler | business_group_admin | admin |
|------|:-:|:-:|:-:|:-:|
| POST /api/tickets | ✓ | ✓ | ✓ | ✓ |
| GET /api/tickets | ✓（本公司） | ✓（本公司+分配） | ✓（本公司） | ✓ |
| POST /api/tickets/:id/replies | ✓（自己的） | ✓（分配的） | ✓ | ✓ |
| POST /api/tickets/:id/transfer | — | ✓ | ✓ | ✓ |
| POST /api/tickets/:id/complete | — | ✓ | ✓ | ✓ |
| POST /api/tickets/:id/cancel | ✓（自己的） | ✓ | ✓ | ✓ |
| POST /api/tickets/:id/evaluation | ✓（自己的） | — | — | ✓ |
| 业务组管理 | — | — | ✓（本公司） | ✓ |
| 路由规则管理 | — | — | ✓（本公司） | ✓ |
| 用户管理 | — | — | ✓（本公司） | ✓ |
| 统计分析 | ✓（本公司） | ✓（本公司） | ✓（本公司） | ✓ |

权限通过 permissionkit 的 `requirePermission(userId, permissionKey)` 校验，scope 为 `{type:'company', id:companyId}`。
