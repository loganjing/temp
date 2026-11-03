# 技术契约

> Work Item: wi-t1000080 | 应用: ticket-system

本文件定义前后端共同遵循的 API 契约。字段级细节以此文件为唯一来源。

## 1. ID 类型对照表

| 实体 ID | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---------|--------|---------------|----------|--------------|----------|-------------|
| company.id | 后端 (UUID v4) | TEXT | TEXT | string | string | 后端生成，前端透传 |
| department.id | 后端 (UUID v4) | TEXT | TEXT | string | string | 后端生成，前端透传 |
| user_profile.id | 后端 (UUID v4) | TEXT | TEXT | string | string | 后端生成，前端透传 |
| user.id (userkit) | userkit | TEXT | TEXT | string | string | userkit 生成 |
| ticket.id | 后端 (UUID v4) | TEXT | TEXT | string | string | 后端生成，前端透传 |
| ticket_reply.id | 后端 (UUID v4) | TEXT | TEXT | string | string | 后端生成 |
| business_group.id | 后端 (UUID v4) | TEXT | TEXT | string | string | 后端生成 |
| category_routing_rule.id | 后端 (UUID v4) | TEXT | TEXT | string | string | 后端生成 |
| ticket_transfer.id | 后端 (UUID v4) | TEXT | — | string | string | 后端生成 |
| ticket_evaluation.id | 后端 (UUID v4) | TEXT | — | string | string | 后端生成 |
| audit_event.id | auditkit | TEXT | — | string | string | auditkit 生成 |

所有 ID 在 API 中以 string 传输，前端不做数值转换。

## 2. 通用约定

### 认证

除 `POST /api/auth/login` 和 `POST /api/auth/register`（首个用户）外，所有端点需要 `Authorization: Bearer <token>` 头。Auth 中间件解析 Token 并注入 `currentUser: { profileId, userId, companyId, role, displayName, email }`。

### 公司隔离

所有涉及公司范围数据的查询自动附加 `company_id = currentUser.companyId`。前端不需要传递 company_id 参数（统计端点除外，管理员可按公司维度查询）。

### 响应格式

成功：直接返回数据对象或数组。
错误：`{ "error": { "code": string, "message": string } }`，HTTP 状态码 4xx/5xx。

### 错误码

| code | HTTP | 说明 |
|------|------|------|
| UNAUTHORIZED | 401 | 未登录或 Token 失效 |
| FORBIDDEN | 403 | 无权限执行该操作 |
| NOT_FOUND | 404 | 资源不存在或不属于当前公司 |
| VALIDATION_ERROR | 400 | 请求参数校验失败 |
| CONFLICT | 409 | 状态冲突（如从已完成工单再次流转） |
| INTERNAL_ERROR | 500 | 服务端内部错误 |

## 3. Auth 端点

### POST /api/auth/login

登录并获取 Bearer Token。

**请求**：
```json
{ "username": "string", "password": "string" }
```

**响应** 200：
```json
{
  "token": "string",
  "user": {
    "profileId": "string",
    "userId": "string",
    "username": "string",
    "displayName": "string",
    "email": "string",
    "companyId": "string",
    "companyName": "string",
    "departmentId": "string | null",
    "departmentName": "string | null",
    "role": "submitter | handler | admin"
  }
}
```

**错误**：401（用户名或密码错误）

### POST /api/auth/register

注册新用户。首个用户免认证；后续需登录且仅 admin 可调用。

**请求**：
```json
{
  "username": "string",
  "password": "string",
  "displayName": "string",
  "email": "string",
  "companyId": "string",
  "departmentId": "string | null",
  "role": "submitter | handler | admin"
}
```

**响应** 201：同 login 的 user 对象（无 token，需另行登录）

**错误**：400（参数缺失/角色无效），403（非 admin），409（用户名已存在）

### GET /api/auth/me

获取当前用户信息。

**响应** 200：同 login 的 user 对象

### POST /api/auth/logout

登出，使当前 Token 失效。

**响应** 204：无内容

## 4. Ticket 端点

### POST /api/tickets

创建工单。仅 submitter 和 admin 可调用。

**请求**：
```json
{
  "subject": "string",
  "description": "string",
  "category": "string",
  "slaPriority": "P0 | P1 | P2 | P3 | P4"
}
```

**响应** 201：
```json
{
  "id": "string",
  "companyId": "string",
  "submitterProfileId": "string",
  "subject": "string",
  "description": "string",
  "category": "string",
  "slaPriority": "P0",
  "status": "pending_assignment | pending_processing",
  "assignedGroupId": "string | null",
  "assignedHandlerId": "string | null",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "completedAt": "string | null",
  "completedBy": "string | null"
}
```

如果匹配到分类路由规则，status 为 `pending_processing` 且 assignedGroupId 有值；否则 status 为 `pending_assignment`。

**错误**：400（参数缺失），403（非提交人/管理员角色）

### GET /api/tickets

工单列表（工作台）。支持筛选、搜索、排序。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | 可选。pending_assignment / pending_processing / completed / cancelled。默认 pending_processing |
| search | string | 可选。关键词搜索（匹配 subject/description） |
| sortBy | string | 可选。created_at / sla_priority / status。默认 created_at |
| sortOrder | string | 可选。asc / desc。默认 desc |
| page | number | 可选。默认 1 |
| pageSize | number | 可选。默认 20 |

**响应** 200：
```json
{
  "items": [{
    "id": "string",
    "subject": "string",
    "category": "string",
    "slaPriority": "P0",
    "status": "pending_processing",
    "submitterProfileId": "string",
    "submitterName": "string",
    "assignedGroupId": "string | null",
    "assignedGroupName": "string | null",
    "assignedHandlerId": "string | null",
    "assignedHandlerName": "string | null",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "completedAt": "string | null"
  }],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

结果自动按当前用户公司隔离。管理员可通过 `companyId` 查询参数指定公司（仍限于本公司）。

### GET /api/tickets/:id

工单详情，含提交人完整信息和历史工单。

**响应** 200：
```json
{
  "ticket": {
    "id": "string",
    "subject": "string",
    "description": "string",
    "category": "string",
    "slaPriority": "P0",
    "status": "pending_processing",
    "companyId": "string",
    "companyName": "string",
    "submitterProfileId": "string",
    "assignedGroupId": "string | null",
    "assignedGroupName": "string | null",
    "assignedHandlerId": "string | null",
    "assignedHandlerName": "string | null",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "completedAt": "string | null",
    "completedBy": "string | null",
    "completedByName": "string | null"
  },
  "submitter": {
    "profileId": "string",
    "displayName": "string",
    "email": "string",
    "companyName": "string",
    "departmentName": "string | null"
  },
  "submitterHistory": [{
    "id": "string",
    "subject": "string",
    "category": "string",
    "status": "completed",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }],
  "replies": [{
    "id": "string",
    "replierProfileId": "string",
    "replierName": "string",
    "content": "string",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }],
  "recentLogs": [{
    "id": "string",
    "actorId": "string",
    "actorName": "string",
    "action": "ticket.created",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }],
  "evaluation": {
    "satisfactionScore": 5,
    "comment": "string",
    "createdAt": "2026-01-01T00:00:00.000Z"
  } | null
}
```

**错误**：404（工单不存在或不属于当前公司）

### POST /api/tickets/:id/replies

添加回复。提交人、当前处理人和 admin 可调用。

**请求**：
```json
{ "content": "string" }
```

**响应** 201：
```json
{
  "id": "string",
  "ticketId": "string",
  "replierProfileId": "string",
  "replierName": "string",
  "content": "string",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

**错误**：400（内容为空），403（无权回复），404（工单不存在），409（工单已取消/完成）

### POST /api/tickets/:id/assign

手动分配工单到业务组。仅 admin 可调用。工单需处于 pending_assignment 状态。

**请求**：
```json
{ "groupId": "string" }
```

**响应** 200：返回更新后的工单对象（同 ticket 创建响应格式），status 为 pending_processing。

**错误**：403（非 admin），404（工单/业务组不存在），409（工单状态非 pending_assignment）

### POST /api/tickets/:id/transfer

转派工单。当前处理人或 admin 可调用。工单需处于 pending_processing 状态。

**请求**：
```json
{
  "toGroupId": "string | null",
  "toProfileId": "string | null"
}
```

toGroupId 和 toProfileId 至少传一个。同时传则分配到目标组并指定处理人。

**响应** 200：返回更新后的工单对象，status 保持 pending_processing。

**错误**：400（两个目标均为空），403（无转派权限），404（工单/目标不存在），409（工单状态非 pending_processing）

### POST /api/tickets/:id/complete

完成工单。当前处理人或 admin 可调用。工单需处于 pending_processing 状态。触发邮件通知。

**请求**：无

**响应** 200：返回更新后的工单对象，status 为 completed，completedAt 和 completedBy 有值。

**错误**：403（无完成权限），404（工单不存在），409（工单状态非 pending_processing）

### POST /api/tickets/:id/cancel

取消工单。提交人或 admin 可调用。工单需处于 pending_assignment 或 pending_processing 状态。

**请求**：
```json
{ "reason": "string | null" }
```

**响应** 200：返回更新后的工单对象，status 为 cancelled。

**错误**：403（无取消权限），404（工单不存在），409（工单状态为 completed 或 cancelled）

### POST /api/tickets/:id/evaluation

提交满意度评价。仅工单提交人可调用。工单需处于 completed 状态且未评价过。

**请求**：
```json
{
  "satisfactionScore": 1 | 2 | 3 | 4 | 5,
  "comment": "string | null"
}
```

**响应** 201：
```json
{
  "id": "string",
  "ticketId": "string",
  "evaluatorProfileId": "string",
  "satisfactionScore": 5,
  "comment": "string | null",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

**错误**：400（评分范围 1-5），403（非工单提交人），404（工单不存在），409（工单未完成或已评价）

## 5. Assignment 端点

### GET /api/business-groups

查询当前公司下业务组列表。

**响应** 200：
```json
[{
  "id": "string",
  "name": "string",
  "companyId": "string",
  "memberCount": 0,
  "members": [{
    "id": "string",
    "profileId": "string",
    "displayName": "string",
    "email": "string"
  }]
}]
```

### POST /api/business-groups

创建业务组。仅 admin 可调用。

**请求**：
```json
{ "name": "string" }
```

**响应** 201：
```json
{ "id": "string", "name": "string", "companyId": "string", "memberCount": 0, "members": [] }
```

### POST /api/business-groups/:id/members

添加成员。仅 admin 可调用。

**请求**：
```json
{ "profileId": "string" }
```

**响应** 201：
```json
{ "id": "string", "groupId": "string", "profileId": "string", "displayName": "string" }
```

**错误**：400（profileId 为空），404（业务组/用户不存在），409（已是成员）

### DELETE /api/business-groups/:id/members/:profileId

移除成员。仅 admin 可调用。

**响应** 204：无内容

### GET /api/routing-rules

查询当前公司下分类分配规则。

**响应** 200：
```json
[{
  "id": "string",
  "companyId": "string",
  "category": "string",
  "targetGroupId": "string",
  "targetGroupName": "string"
}]
```

### POST /api/routing-rules

创建分类分配规则。仅 admin 可调用。

**请求**：
```json
{ "category": "string", "targetGroupId": "string" }
```

**响应** 201：
```json
{ "id": "string", "companyId": "string", "category": "string", "targetGroupId": "string", "targetGroupName": "string" }
```

**错误**：400（参数缺失），404（目标业务组不存在），409（同分类规则已存在）

## 6. Statistics 端点

### GET /api/statistics/distribution

工单分布统计。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| dimension | string | 可选。company / department。默认 company |

**响应** 200（dimension=company）：
```json
[{
  "dimensionKey": "string",
  "dimensionName": "string",
  "total": 0,
  "pendingAssignment": 0,
  "pendingProcessing": 0,
  "completed": 0,
  "cancelled": 0
}]
```

dimension=department 时 dimensionName 为部门名称，仅统计当前公司下各部门。

### GET /api/statistics/dashboard

运营仪表盘指标。

**响应** 200：
```json
{
  "totalTickets": 0,
  "pendingTickets": 0,
  "completedTickets": 0,
  "cancelledTickets": 0,
  "avgResponseTimeMinutes": 0.0,
  "avgSatisfactionScore": 0.0,
  "hotCategories": [{
    "category": "string",
    "count": 0
  }]
}
```

- `avgResponseTimeMinutes`：已完成工单从 created_at 到 completed_at 的平均时长（分钟）
- `avgSatisfactionScore`：已评价工单的平均满意度评分（1-5）
- `hotCategories`：按工单数量降序排列的前 5 个分类

## 7. Audit 端点

### GET /api/tickets/:id/logs

查询工单操作日志。

**响应** 200：
```json
[{
  "id": "string",
  "actorId": "string",
  "actorName": "string",
  "action": "ticket.created | ticket.assigned | ticket.transferred | ticket.completed | ticket.cancelled",
  "targetId": "string",
  "metadata": {},
  "createdAt": "2026-01-01T00:00:00.000Z"
}]
```

action 枚举值：
| action | 说明 |
|--------|------|
| ticket.created | 工单创建 |
| ticket.assigned | 工单分配（自动/手动） |
| ticket.transferred | 工单转派 |
| ticket.completed | 工单完成 |
| ticket.cancelled | 工单取消 |

**错误**：404（工单不存在或不属于当前公司）

## 8. 枚举值定义

### TicketStatus

| 值 | 说明 |
|----|------|
| pending_assignment | 待分配 |
| pending_processing | 待处理 |
| completed | 完成 |
| cancelled | 取消 |

注：工单创建后立即进入 pending_assignment，created 状态为瞬时态不持久化。

### SLAPriority

| 值 | 说明 |
|----|------|
| P0 | 最高优先级 |
| P1 | 高优先级 |
| P2 | 中优先级 |
| P3 | 低优先级 |
| P4 | 最低优先级 |

### UserRole

| 值 | 说明 |
|----|------|
| submitter | 提交人 |
| handler | 处理人 |
| admin | 管理员 |
