# 技术契约

本文档定义工单系统的字段级 API 契约，是前后端接口的唯一来源。

## 1. 实体 ID 对照表

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|------|--------|---------------|----------|--------------|----------|-------------|
| Company | 应用层 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| Department | 应用层 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| User (userkit) | userkit | TEXT (UUID) | TEXT | string | string | 无需转换 |
| UserProfile | 应用层 | TEXT (UUID) | TEXT (FK → users.id) | string | string | 无需转换 |
| BusinessGroup | 应用层 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| BusinessGroupMember | 应用层 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| Category | 应用层 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| Ticket | 应用层 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| TicketReply | 应用层 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| ProcessingRecord | 应用层 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| SatisfactionRating | 应用层 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| CategoryAssignmentRule | 应用层 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| TicketTransfer | 应用层 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| AuditEvent (auditkit) | auditkit | TEXT (UUID) | TEXT | string | string | 无需转换 |

所有实体 ID 统一使用 UUID v4 字符串，从数据库到 API 到前端类型一致，无需转换。

## 2. 认证接口

### 2.1 POST /api/auth/login

用户登录，获取会话 token。

**请求体：**
```json
{
  "email": "string, 必填",
  "password": "string, 必填"
}
```

**响应 200：**
```json
{
  "token": "string, Bearer token",
  "user": {
    "id": "string",
    "email": "string",
    "displayName": "string"
  }
}
```

**错误：**
- 401 `INVALID_CREDENTIALS` — 邮箱或密码错误

**授权：** 无需认证

### 2.2 POST /api/auth/logout

登出当前会话。

**响应 204：** 无内容

**授权：** Bearer token

### 2.3 GET /api/auth/me

获取当前登录用户信息。

**响应 200：**
```json
{
  "id": "string",
  "email": "string",
  "displayName": "string",
  "companyId": "string | null",
  "departmentId": "string | null",
  "role": "string"
}
```

**授权：** Bearer token

## 3. 工单管理接口

### 3.1 POST /api/tickets

创建工单。创建后自动检查分类分配规则，若匹配则分配到对应业务组并流转状态。

**请求体：**
```json
{
  "subject": "string, 必填, 工单主题",
  "description": "string, 必填, 工单描述",
  "categoryId": "string, 必填, 问题分类 ID",
  "slaPriority": "string, 必填, 枚举: P0 | P1 | P2 | P3 | P4"
}
```

**响应 201：**
```json
{
  "id": "string",
  "companyId": "string",
  "subject": "string",
  "description": "string",
  "categoryId": "string",
  "slaPriority": "string",
  "submitterId": "string",
  "status": "string, pending_assignment 或 pending_processing",
  "assignedGroupId": "string | null",
  "createdAt": "string, ISO 8601",
  "updatedAt": "string, ISO 8601"
}
```

**授权：** Bearer token，提交人角色
**幂等性：** 非幂等，每次创建生成新工单
**审计：** 记录 `ticket.created` 事件

### 3.2 GET /api/tickets

查询工单列表，支持筛选、搜索、排序。

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 否 | 按状态筛选：created/pending_assignment/pending_processing/completed/cancelled |
| categoryId | string | 否 | 按分类筛选 |
| slaPriority | string | 否 | 按优先级筛选：P0-P4 |
| companyId | string | 否 | 按公司筛选（仅管理员可用，普通用户自动限定为所属公司） |
| search | string | 否 | 搜索关键词（匹配主题和描述） |
| sort | string | 否 | 排序字段：created_at/sla_priority/updated_at，默认 created_at |
| order | string | 否 | 排序方向：asc/desc，默认 desc |
| page | integer | 否 | 页码，默认 1 |
| pageSize | integer | 否 | 每页条数，默认 20 |

**响应 200：**
```json
{
  "items": [
    {
      "id": "string",
      "subject": "string",
      "categoryName": "string",
      "slaPriority": "string",
      "status": "string",
      "submitterName": "string",
      "assignedGroupName": "string | null",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ],
  "total": "integer",
  "page": "integer",
  "pageSize": "integer"
}
```

**授权：** Bearer token，自动按所属公司过滤

### 3.3 GET /api/tickets/:id

获取工单详情（含回复列表）。

**响应 200：**
```json
{
  "id": "string",
  "companyId": "string",
  "subject": "string",
  "description": "string",
  "categoryId": "string",
  "categoryName": "string",
  "slaPriority": "string",
  "submitterId": "string",
  "submitterName": "string",
  "submitterEmail": "string",
  "status": "string",
  "assignedGroupId": "string | null",
  "assignedGroupName": "string | null",
  "handlerId": "string | null",
  "createdAt": "string",
  "updatedAt": "string",
  "replies": [
    {
      "id": "string",
      "replierId": "string",
      "replierName": "string",
      "content": "string",
      "createdAt": "string"
    }
  ]
}
```

**授权：** Bearer token，仅可查看所属公司工单
**错误：** 404 `TICKET_NOT_FOUND`；403 `COMPANY_ISOLATION`

### 3.4 PATCH /api/tickets/:id

更新工单信息（如修改优先级、分配业务组）。

**请求体：**
```json
{
  "slaPriority": "string, 可选, P0-P4",
  "assignedGroupId": "string, 可选, 分配业务组",
  "status": "string, 可选, 手动变更状态"
}
```

**响应 200：** 同 GET /api/tickets/:id 响应结构
**授权：** Bearer token，处理人或管理员角色
**审计：** 记录 `ticket.updated` 事件

### 3.5 POST /api/tickets/:id/replies

添加工单回复。

**请求体：**
```json
{
  "content": "string, 必填, 回复内容"
}
```

**响应 201：**
```json
{
  "id": "string",
  "ticketId": "string",
  "replierId": "string",
  "replierName": "string",
  "content": "string",
  "createdAt": "string"
}
```

**授权：** Bearer token，提交人或处理人角色
**审计：** 记录 `ticket.reply_added` 事件

### 3.6 POST /api/tickets/:id/transfer

转派工单到其他业务组。工单状态保持"待处理"。

**请求体：**
```json
{
  "toGroupId": "string, 必填, 目标业务组 ID",
  "reason": "string, 可选, 转派原因"
}
```

**响应 200：**
```json
{
  "id": "string",
  "ticketId": "string",
  "fromGroupId": "string | null",
  "toGroupId": "string",
  "transferredBy": "string",
  "transferredAt": "string",
  "reason": "string | null"
}
```

**授权：** Bearer token，当前处理人角色
**错误：** 400 `TICKET_NOT_PENDING_PROCESSING` — 工单不在待处理状态
**审计：** 记录 `ticket.transferred` 事件

### 3.7 POST /api/tickets/:id/complete

完成工单。记录处理信息，触发邮件通知。

**请求体：**
```json
{
  "summary": "string, 可选, 处理总结"
}
```

**响应 200：**
```json
{
  "id": "string",
  "ticketId": "string",
  "handlerId": "string",
  "handlerName": "string",
  "processedAt": "string",
  "emailSent": "boolean",
  "ticketStatus": "completed"
}
```

**授权：** Bearer token，处理人角色
**错误：** 400 `TICKET_NOT_PENDING_PROCESSING`
**副作用：** 工单状态 → completed；创建 processing_record；调用 emailkit 发送邮件
**审计：** 记录 `ticket.completed` 和 `email.sent`（或 `email.send_failed`）事件

## 4. 工单处理辅助接口

### 4.1 GET /api/tickets/:id/submitter

查看提交人完整信息，包括姓名、公司、部门和历史工单列表。

**响应 200：**
```json
{
  "userId": "string",
  "displayName": "string",
  "email": "string",
  "companyName": "string",
  "departmentName": "string | null",
  "historyTickets": [
    {
      "id": "string",
      "subject": "string",
      "status": "string",
      "slaPriority": "string",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ]
}
```

**授权：** Bearer token，处理人角色

## 5. 用户评价接口

### 5.1 POST /api/tickets/:id/rating

提交满意度评价。仅工单状态为"完成"时可评价。

**请求体：**
```json
{
  "rating": "integer, 必填, 1-5",
  "comment": "string, 可选, 评价备注"
}
```

**响应 201：**
```json
{
  "id": "string",
  "ticketId": "string",
  "rating": "integer",
  "comment": "string | null",
  "createdAt": "string"
}
```

**授权：** Bearer token，工单提交人
**错误：** 400 `TICKET_NOT_COMPLETED` — 工单未完成；409 `RATING_ALREADY_EXISTS` — 已评价
**审计：** 记录 `ticket.rated` 事件

## 6. 分配管理接口

### 6.1 GET /api/business-groups

获取当前公司的业务组列表。

**响应 200：**
```json
{
  "items": [
    {
      "id": "string",
      "name": "string",
      "companyId": "string",
      "memberCount": "integer",
      "members": [
        {
          "id": "string",
          "userId": "string",
          "displayName": "string"
        }
      ],
      "createdAt": "string"
    }
  ]
}
```

**授权：** Bearer token，自动按所属公司过滤

### 6.2 POST /api/business-groups

创建业务组。

**请求体：**
```json
{
  "name": "string, 必填, 业务组名称"
}
```

**响应 201：**
```json
{
  "id": "string",
  "name": "string",
  "companyId": "string",
  "createdAt": "string"
}
```

**授权：** Bearer token，业务组管理员角色
**审计：** 记录 `business_group.created` 事件

### 6.3 PATCH /api/business-groups/:id/members

更新业务组成员（全量替换）。

**请求体：**
```json
{
  "memberUserIds": ["string, 必填, 成员用户 ID 数组"]
}
```

**响应 200：**
```json
{
  "id": "string",
  "name": "string",
  "members": [
    {
      "id": "string",
      "userId": "string",
      "displayName": "string"
    }
  ]
}
```

**授权：** Bearer token，业务组管理员角色
**审计：** 记录 `business_group.members_updated` 事件

### 6.4 GET /api/category-rules

获取当前公司的分类分配规则列表。

**响应 200：**
```json
{
  "items": [
    {
      "id": "string",
      "companyId": "string",
      "categoryId": "string",
      "categoryName": "string",
      "targetGroupId": "string",
      "targetGroupName": "string",
      "createdAt": "string"
    }
  ]
}
```

**授权：** Bearer token，自动按所属公司过滤

### 6.5 POST /api/category-rules

创建分类分配规则。

**请求体：**
```json
{
  "categoryId": "string, 必填, 匹配的分类 ID",
  "targetGroupId": "string, 必填, 目标业务组 ID"
}
```

**响应 201：**
```json
{
  "id": "string",
  "companyId": "string",
  "categoryId": "string",
  "targetGroupId": "string",
  "createdAt": "string"
}
```

**授权：** Bearer token，业务组管理员角色
**错误：** 409 `RULE_ALREADY_EXISTS` — 同公司同分类已有规则
**审计：** 记录 `category_rule.created` 事件

## 7. 统计与工作台接口

### 7.1 GET /api/statistics/distribution

按公司或部门维度统计工单分布。

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| dimension | string | 是 | 统计维度：company/department |
| status | string | 否 | 按状态筛选 |

**响应 200：**
```json
{
  "dimension": "string",
  "items": [
    {
      "dimensionId": "string",
      "dimensionName": "string",
      "ticketCount": "integer",
      "byStatus": {
        "created": "integer",
        "pending_assignment": "integer",
        "pending_processing": "integer",
        "completed": "integer",
        "cancelled": "integer"
      }
    }
  ]
}
```

**授权：** Bearer token，普通用户仅查看所属公司数据，管理员可查看全部

### 7.2 GET /api/statistics/dashboard

运营指标仪表盘数据。

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| companyId | string | 否 | 按公司筛选 |
| startDate | string | 否 | 起始日期 ISO 8601 |
| endDate | string | 否 | 截止日期 ISO 8601 |

**响应 200：**
```json
{
  "totalTickets": "integer",
  "pendingTickets": "integer",
  "completedTickets": "integer",
  "averageResponseTimeMinutes": "number, 平均响应时间（分钟），从创建到首次回复",
  "averageSatisfactionScore": "number, 平均满意度评分 1-5",
  "hotCategories": [
    {
      "categoryId": "string",
      "categoryName": "string",
      "ticketCount": "integer"
    }
  ],
  "byPriority": {
    "P0": "integer",
    "P1": "integer",
    "P2": "integer",
    "P3": "integer",
    "P4": "integer"
  }
}
```

**授权：** Bearer token，普通用户仅查看所属公司数据

### 7.3 GET /api/workbench/tickets

工作台待处理工单列表。

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| companyId | string | 否 | 按公司筛选（管理员可用） |
| assignedGroupId | string | 否 | 按业务组筛选 |
| slaPriority | string | 否 | 按优先级筛选 |
| search | string | 否 | 搜索关键词（匹配主题） |
| sort | string | 否 | 排序：created_at/sla_priority，默认 sla_priority |
| order | string | 否 | 排序方向：asc/desc，默认 asc（高优先级在前） |
| page | integer | 否 | 页码，默认 1 |
| pageSize | integer | 否 | 每页条数，默认 20 |

**响应 200：** 同 GET /api/tickets 响应结构，固定筛选 status=pending_processing

**授权：** Bearer token，处理人角色，自动按所属公司过滤

## 8. 操作日志接口

### 8.1 GET /api/audit-logs

查询操作日志（auditkit 提供）。

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ticketId | string | 否 | 按工单筛选 |
| eventType | string | 否 | 按事件类型筛选 |
| actorId | string | 否 | 按操作人筛选 |
| page | integer | 否 | 页码，默认 1 |
| pageSize | integer | 否 | 每页条数，默认 50 |

**响应 200：**
```json
{
  "items": [
    {
      "id": "string",
      "eventType": "string",
      "entityType": "string",
      "entityId": "string",
      "actorId": "string",
      "actorName": "string",
      "payload": "object, 事件详情",
      "createdAt": "string"
    }
  ],
  "total": "integer",
  "page": "integer",
  "pageSize": "integer"
}
```

**授权：** Bearer token，管理员角色

## 9. 通用错误格式

所有 API 错误返回统一 JSON 格式：

```json
{
  "error": "ERROR_CODE",
  "message": "string, 人类可读的错误描述"
}
```

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | `VALIDATION_ERROR` | 请求参数校验失败 |
| 401 | `UNAUTHORIZED` | 未认证或 token 失效 |
| 403 | `COMPANY_ISOLATION` | 跨公司访问被拒绝 |
| 403 | `FORBIDDEN` | 权限不足 |
| 404 | `*_NOT_FOUND` | 资源不存在 |
| 409 | `*_ALREADY_EXISTS` | 资源冲突 |
| 500 | `INTERNAL_ERROR` | 服务端内部错误 |
