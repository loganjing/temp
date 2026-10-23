# 技术契约

## 1. 实体 ID 对照表

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---|---|---|---|---|---|---|
| ticket | ticket-core | INTEGER (autoincrement) | — | string | string | API 序列化转 string |
| ticket_reply | ticket-core | INTEGER (autoincrement) | ticket_id: INTEGER | string | string | API 序列化转 string |
| business_group | assignment-collaboration | INTEGER (autoincrement) | company_id: INTEGER | string | string | API 序列化转 string |
| auto_assignment_rule | assignment-collaboration | INTEGER (autoincrement) | company_id, group_id: INTEGER | string | string | API 序列化转 string |
| ticket_transfer | assignment-collaboration | INTEGER (autoincrement) | ticket_id, from_user_id, to_group_id, to_user_id: INTEGER | string | string | API 序列化转 string |
| ticket_evaluation | processing-notification | INTEGER (autoincrement) | ticket_id: INTEGER | string | string | API 序列化转 string |
| user | 项目内（dbkit） | INTEGER (autoincrement) | company_id: INTEGER | string | string | 项目内序列化 |
| company | 项目内（dbkit） | INTEGER (autoincrement) | — | string | string | 项目内序列化 |

> 所有 INTEGER 主键在 API JSON 中序列化为 string 以避免前端精度问题。前端统一使用 string 类型。转换发生在 API 响应序列化层。

## 2. 公共约定

### 2.1 认证

- 所有 `/api/*` 端点需要 Bearer token 认证（项目内 Hono 中间件，JWT）
- 请求头：`Authorization: Bearer <token>`
- 未认证返回 `401 { error: "unauthorized" }`
- 登录端点：POST /api/auth/login（email + password → JWT token）
- 密码使用 bcrypt 哈希存储

### 2.2 权限

- 通过 permissionkit RBAC 中间件校验角色
- 权限不足返回 `403 { error: "forbidden" }`
- 角色：`submitter` | `handler` | `admin`

### 2.3 公司隔离

- 所有工单/业务组/分配规则查询自动注入 `WHERE company_id = ?`，值取自认证上下文
- 跨公司访问返回 `403 { error: "forbidden" }` 或空结果

### 2.4 响应格式

- 成功：`200 { ... }` 或 `201 { ... }`（创建）
- 分页：`200 { items: [...], total: N, page: P, pageSize: S }`
- 错误：`{ error: "message", details?: {...} }`

### 2.5 审计日志

以下操作自动写入 auditkit 审计事件：ticket:create, ticket:status-change, ticket:assign, ticket:transfer, ticket:complete, ticket:evaluate, group:create, group:member-add, group:member-remove, rule:create。

## 3. API 定义

### 3.1 工单核心

#### POST /api/tickets

创建工单。角色：submitter, admin

| 请求字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| title | string | 否 | 工单主题，1-200 字符 |
| description | string | 否 | 工单描述，1-5000 字符 |
| category | string | 否 | 问题分类 |
| slaPriority | enum | 否 | P0/P1/P2/P3/P4 |

响应 `201`:
```json
{
  "id": "1",
  "title": "登录失败",
  "description": "无法使用账号登录系统",
  "category": "auth",
  "slaPriority": "P1",
  "status": "created",
  "companyId": "1",
  "submitterId": "5",
  "submitterName": "张三",
  "submitterEmail": "zhangsan@example.com",
  "createdAt": "2026-10-23T08:00:00Z"
}
```

行为：创建工单后自动触发分类→业务组匹配，匹配成功则流转到 pending_processing，否则保持 pending_assignment 等待手动分配。

---

#### GET /api/tickets

工单列表（工作台）。角色：handler, admin

| 查询参数 | 类型 | 可空 | 说明 |
|---|---|---|---|
| status | string | 是 | 筛选状态 |
| category | string | 是 | 筛选分类 |
| slaPriority | string | 是 | 筛选 SLA 优先级 |
| companyId | string | 是 | 按公司筛选（admin） |
| groupId | string | 是 | 按业务组筛选 |
| search | string | 是 | 搜索主题/工单ID |
| sortBy | string | 是 | 排序字段：createdAt / slaPriority，默认 createdAt desc |
| page | number | 是 | 默认 1 |
| pageSize | number | 是 | 默认 20，最大 100 |

响应 `200`:
```json
{
  "items": [
    {
      "id": "1",
      "title": "登录失败",
      "category": "auth",
      "slaPriority": "P1",
      "status": "pending_processing",
      "submitterName": "张三",
      "handlerName": "李四",
      "createdAt": "2026-10-23T08:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

错误：`400 { error: "invalid_query_params" }`

---

#### GET /api/tickets/:id

工单详情含回复列表。角色：submitter(仅自己的), handler, admin

响应 `200`:
```json
{
  "id": "1",
  "title": "登录失败",
  "description": "无法使用账号登录系统",
  "category": "auth",
  "slaPriority": "P1",
  "status": "pending_processing",
  "companyId": "1",
  "submitterId": "5",
  "submitterName": "张三",
  "submitterEmail": "zhangsan@example.com",
  "submitterDepartment": "技术部",
  "handlerId": "8",
  "handlerName": "李四",
  "assignedGroupName": "安全支持组",
  "createdAt": "2026-10-23T08:00:00Z",
  "handledAt": null,
  "replies": [
    {
      "id": "1",
      "replierId": "5",
      "replierName": "张三",
      "content": "请尽快处理",
      "createdAt": "2026-10-23T08:30:00Z"
    }
  ]
}
```

错误：`404 { error: "ticket_not_found" }`；`403 { error: "forbidden" }`（跨公司或无权访问）

---

#### PATCH /api/tickets/:id/status

状态流转。角色：handler, admin

| 请求字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| status | enum | 否 | 目标状态：pending_assignment / pending_processing / cancelled |

响应 `200`: 同 GET /api/tickets/:id 的单条结构

行为：校验状态流转合法性（created→pending_assignment→pending_processing；任意 pending_*→cancelled）。非法流转返回 `400 { error: "invalid_status_transition" }`。

---

#### POST /api/tickets/:id/replies

添加回复。角色：submitter(仅自己的), handler, admin

| 请求字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| content | string | 否 | 回复内容，1-5000 字符 |

响应 `201`:
```json
{
  "id": "2",
  "ticketId": "1",
  "replierId": "8",
  "replierName": "李四",
  "content": "已收到，正在排查",
  "createdAt": "2026-10-23T09:00:00Z"
}
```

错误：`400 { error: "validation_error", details: { content: "required" } }`；`404`；`403`

---

### 3.2 分配与协作

#### POST /api/business-groups

创建业务组。角色：admin

| 请求字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| name | string | 否 | 业务组名称，1-100 字符 |

响应 `201`:
```json
{ "id": "1", "companyId": "1", "name": "安全支持组", "createdAt": "2026-10-23T08:00:00Z" }
```

---

#### GET /api/business-groups

业务组列表含成员。角色：admin, handler

响应 `200`:
```json
{
  "items": [
    {
      "id": "1",
      "name": "安全支持组",
      "members": [
        { "userId": "8", "userName": "李四", "email": "lisi@example.com" }
      ]
    }
  ]
}
```

---

#### POST /api/business-groups/:id/members

添加成员。角色：admin

| 请求字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| userId | string | 否 | 用户ID |

响应 `201`:
```json
{ "groupId": "1", "userId": "8", "userName": "李四" }
```

错误：`400 { error: "already_member" }`；`404 { error: "group_or_user_not_found" }`

---

#### DELETE /api/business-groups/:id/members/:userId

移除成员。角色：admin

响应 `204`（无内容）

---

#### POST /api/assignment-rules

创建自动分配规则。角色：admin

| 请求字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| category | string | 否 | 问题分类 |
| groupId | string | 否 | 目标业务组ID |

响应 `201`:
```json
{ "id": "1", "companyId": "1", "category": "auth", "groupId": "1", "groupName": "安全支持组" }
```

错误：`400 { error: "duplicate_rule" }`（同公司同分类已有规则）

---

#### GET /api/assignment-rules

分配规则列表。角色：admin

响应 `200`:
```json
{
  "items": [
    { "id": "1", "category": "auth", "groupId": "1", "groupName": "安全支持组" }
  ]
}
```

---

#### POST /api/tickets/:id/transfer

工单转派。角色：handler, admin

| 请求字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| toGroupId | string | 是 | 目标业务组ID（与 toUserId 二选一） |
| toUserId | string | 是 | 目标成员ID（与 toGroupId 二选一） |
| reason | string | 否 | 转派原因 |

响应 `200`:
```json
{
  "ticketId": "1",
  "fromUserId": "8",
  "toGroupId": "2",
  "toUserId": null,
  "reason": "需要数据库专家处理",
  "createdAt": "2026-10-23T10:00:00Z"
}
```

行为：工单状态保持 pending_processing，记录转派到 ticket_transfers 表，写入审计日志。支持多次转派。

错误：`400 { error: "invalid_target" }`（toGroupId 和 toUserId 同时提供或同时为空）

---

### 3.3 处理与通知

#### GET /api/tickets/:id/submitter-info

提交人完整信息含历史工单。角色：handler, admin

响应 `200`:
```json
{
  "userId": "5",
  "name": "张三",
  "email": "zhangsan@example.com",
  "companyName": "A公司",
  "department": "技术部",
  "historyTickets": [
    {
      "id": "0",
      "title": "密码重置",
      "status": "completed",
      "createdAt": "2026-10-20T08:00:00Z"
    }
  ]
}
```

行为：历史工单为同一提交人的历史工单，按 createdAt desc 排序，最多 20 条。

---

#### POST /api/tickets/:id/complete

完成工单。角色：handler, admin

无请求体。

响应 `200`:
```json
{
  "id": "1",
  "status": "completed",
  "handlerId": "8",
  "handlerName": "李四",
  "handledAt": "2026-10-23T12:00:00Z"
}
```

行为：
1. 校验当前状态为 pending_processing，否则返回 `400 { error: "invalid_status_transition" }`
2. 记录 handler_id 和 handled_at
3. 流转状态到 completed
4. 写入审计日志 ticket:complete
5. 异步通过 emailkit 向提交人邮箱发送完成通知邮件
6. 邮件发送失败仅记日志，不阻断完成操作

---

#### POST /api/tickets/:id/evaluation

提交满意度评价。角色：submitter(仅自己的工单)

| 请求字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| rating | number | 否 | 满意度评分 1-5 |
| comment | string | 是 | 评价备注 |

响应 `201`:
```json
{
  "id": "1",
  "ticketId": "1",
  "rating": 5,
  "comment": "处理速度很快",
  "createdAt": "2026-10-23T13:00:00Z"
}
```

行为：校验工单状态为 completed，否则返回 `400 { error: "ticket_not_completed" }`；同一工单只能评价一次，重复返回 `400 { error: "already_evaluated" }`。

---

#### GET /api/tickets/:id/evaluation

查看评价。角色：submitter(仅自己的), handler, admin

响应 `200`:
```json
{ "id": "1", "ticketId": "1", "rating": 5, "comment": "处理速度很快", "createdAt": "2026-10-23T13:00:00Z" }
```

错误：`404 { error: "evaluation_not_found" }`

---

### 3.4 统计分析

#### GET /api/stats/distribution

工单分布统计。角色：admin

| 查询参数 | 类型 | 可空 | 说明 |
|---|---|---|---|
| dimension | string | 是 | company / department，默认 company |

响应 `200`（dimension=company）:
```json
{
  "dimension": "company",
  "items": [
    { "label": "A公司", "total": 50, "pending": 10, "completed": 35, "cancelled": 5 }
  ]
}
```

响应 `200`（dimension=department）:
```json
{
  "dimension": "department",
  "items": [
    { "label": "技术部", "total": 30, "pending": 5, "completed": 20, "cancelled": 5 }
  ]
}
```

---

#### GET /api/stats/dashboard

运营仪表盘指标。角色：admin

| 查询参数 | 类型 | 可空 | 说明 |
|---|---|---|---|
| companyId | string | 是 | 按公司筛选（admin 可选） |

响应 `200`:
```json
{
  "totalTickets": 100,
  "pendingTickets": 25,
  "completedTickets": 70,
  "cancelledTickets": 5,
  "avgResponseTimeHours": 4.5,
  "satisfactionScore": 4.2,
  "hotCategories": [
    { "category": "auth", "count": 30 },
    { "category": "network", "count": 20 }
  ]
}
```

行为：
- avgResponseTimeHours：从 pending_processing 到 completed 的平均时长（小时）
- satisfactionScore：所有评价的平均评分（1-5）
- hotCategories：工单量 Top 5 的分类

---

### 3.5 审计日志

#### GET /api/audit-logs

操作日志查询。角色：admin

| 查询参数 | 类型 | 可空 | 说明 |
|---|---|---|---|
| ticketId | string | 是 | 按工单ID筛选 |
| action | string | 是 | 按操作类型筛选 |
| page | number | 是 | 默认 1 |
| pageSize | number | 是 | 默认 20，最大 100 |

响应 `200`:
```json
{
  "items": [
    {
      "id": "1",
      "actorId": "5",
      "actorName": "张三",
      "action": "ticket:create",
      "entityType": "ticket",
      "entityId": "1",
      "metadata": { "title": "登录失败", "category": "auth" },
      "createdAt": "2026-10-23T08:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```
