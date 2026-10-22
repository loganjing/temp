# 技术契约

## ID 类型对照

| 实体 | 数据库主键 | 外键引用 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|------|-----------|---------|--------------|---------|-------------|
| Ticket | INTEGER AUTOINCREMENT | — | number | number | 后端序列化直接输出 |
| TicketReply | INTEGER AUTOINCREMENT | ticket_id → tickets.id (INTEGER) | number | number | 后端序列化直接输出 |
| BusinessGroup | INTEGER AUTOINCREMENT | company_id → companies.id (INTEGER) | number | number | 后端序列化直接输出 |
| BusinessGroupMember | INTEGER AUTOINCREMENT | group_id, user_id (INTEGER) | number | number | 后端序列化直接输出 |
| CategoryAssignmentRule | INTEGER AUTOINCREMENT | company_id, category_id, target_group_id (INTEGER) | number | number | 后端序列化直接输出 |
| SatisfactionEvaluation | INTEGER AUTOINCREMENT | ticket_id → tickets.id (INTEGER) | number | number | 后端序列化直接输出 |
| User | INTEGER AUTOINCREMENT | company_id, department_id (INTEGER) | number | number | 后端序列化直接输出 |
| Company | INTEGER AUTOINCREMENT | — | number | number | 后端序列化直接输出 |
| Department | INTEGER AUTOINCREMENT | company_id (INTEGER) | number | number | 后端序列化直接输出 |
| Category | INTEGER AUTOINCREMENT | — | number | number | 后端序列化直接输出 |

所有 ID 为 SQLite INTEGER PRIMARY KEY AUTOINCREMENT，在 API JSON 中以 number 表示，前后端无需转换。

---

## 认证

### POST /api/auth/login

用户密码登录，返回 Bearer Token。

**请求体：**
```json
{
  "email": "string",
  "password": "string"
}
```

**响应 200：**
```json
{
  "token": "string",
  "user": {
    "id": 1,
    "name": "string",
    "email": "string",
    "companyId": 1,
    "departmentId": 1,
    "roles": ["submitter" | "handler" | "admin"]
  }
}
```

**响应 401：** `{ "error": "Invalid credentials" }`

**幂等性：** 是

---

### GET /api/auth/me

返回当前登录用户信息。

**请求头：** `Authorization: Bearer <token>`

**响应 200：**
```json
{
  "id": 1,
  "name": "string",
  "email": "string",
  "companyId": 1,
  "departmentId": 1,
  "roles": ["submitter" | "handler" | "admin"]
}
```

**响应 401：** `{ "error": "Unauthorized" }`

---

## 工单

### POST /api/tickets

创建工单。创建后状态为 `pending_assignment`，系统自动按分类匹配分配规则。

**请求头：** `Authorization: Bearer <token>`

**角色：** submitter, admin

**请求体：**
```json
{
  "title": "string (必填)",
  "description": "string (必填)",
  "categoryId": 1,
  "slaPriority": "P0" | "P1" | "P2" | "P3" | "P4"
}
```

**响应 201：**
```json
{
  "id": 1,
  "title": "string",
  "description": "string",
  "categoryId": 1,
  "categoryName": "string",
  "submitterId": 1,
  "submitterName": "string",
  "companyId": 1,
  "slaPriority": "P2",
  "status": "pending_assignment" | "pending_processing" | "completed" | "cancelled",
  "handlerId": null,
  "handlerName": null,
  "businessGroupId": null,
  "createdBy": "string",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "completedAt": null
}
```

**响应 400：** `{ "error": "Validation error: <details>" }`

**幂等性：** 否（每次创建生成新工单）

**授权：** 工单的 companyId 取自当前用户的 companyId，确保公司隔离。

**业务逻辑：**
1. 插入工单，status = `pending_assignment`，submitter_id = 当前用户 ID，company_id = 当前用户 companyId
2. 查询 category_assignment_rules 匹配 (company_id, category_id)
3. 若匹配到规则，更新工单 business_group_id = target_group_id，status = `pending_processing`，记录分配日志
4. 若无匹配，工单保持 `pending_assignment` 等待手动分配

---

### GET /api/tickets

查询工单列表，支持筛选、搜索、排序。

**请求头：** `Authorization: Bearer <token>`

**Query 参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | 按状态筛选 |
| companyId | number | 按公司筛选（admin 可跨公司） |
| categoryId | number | 按分类筛选 |
| slaPriority | string | 按 SLA 优先级筛选 |
| businessGroupId | number | 按业务组筛选 |
| handlerId | number | 按处理人筛选 |
| submitterId | number | 按提交人筛选 |
| keyword | string | 搜索主题和描述 |
| sortBy | string | 排序字段：`createdAt` / `slaPriority` / `status` |
| sortOrder | string | `asc` / `desc` |
| page | number | 页码，默认 1 |
| pageSize | number | 每页条数，默认 20 |

**响应 200：**
```json
{
  "items": [Ticket],
  "total": 100,
  "page": 1,
  "pageSize": 20
}
```

**授权：** 提交人和处理人只能查看本公司工单（company_id = 当前用户 companyId）；admin 可查看所有公司工单。

---

### GET /api/tickets/:id

获取工单详情，含回复列表和提交人摘要信息。

**请求头：** `Authorization: Bearer <token>`

**响应 200：**
```json
{
  "id": 1,
  "title": "string",
  "description": "string",
  "categoryId": 1,
  "categoryName": "string",
  "submitterId": 1,
  "submitterName": "string",
  "companyId": 1,
  "companyName": "string",
  "slaPriority": "P2",
  "status": "pending_processing",
  "handlerId": 1,
  "handlerName": "string",
  "businessGroupId": 1,
  "businessGroupName": "string",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "completedAt": null,
  "replies": [
    {
      "id": 1,
      "replierId": 1,
      "replierName": "string",
      "content": "string",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "evaluation": null
}
```

**响应 403：** `{ "error": "Company isolation: cannot access other company's ticket" }`

**授权：** 工单 company_id 必须等于当前用户 companyId（admin 除外）。

---

### PATCH /api/tickets/:id/status

更新工单状态（手动分配处理人）。

**请求头：** `Authorization: Bearer <token>`

**角色：** admin, handler

**请求体：**
```json
{
  "status": "pending_processing",
  "handlerId": 1,
  "businessGroupId": 1
}
```

**响应 200：** `[Ticket]`

**授权：** 仅本公司 admin 或目标业务组成员可操作。

**日志：** 记录分配操作。

---

### POST /api/tickets/:id/transfer

转派工单给同公司其他业务组成员。

**请求头：** `Authorization: Bearer <token>`

**角色：** handler

**请求体：**
```json
{
  "targetUserId": 2
}
```

**响应 200：**
```json
{
  "id": 1,
  "status": "pending_processing",
  "handlerId": 2,
  "handlerName": "string"
}
```

**响应 403：** `{ "error": "Cannot transfer to user outside your company" }`

**授权：** 当前用户必须是工单处理人；目标用户必须属于同公司。

**日志：** 记录转派操作。

**幂等性：** 否

---

### POST /api/tickets/:id/complete

完成工单处理。记录处理人和处理时间，发送邮件通知提交人。

**请求头：** `Authorization: Bearer <token>`

**角色：** handler

**请求体：** 无

**响应 200：**
```json
{
  "id": 1,
  "status": "completed",
  "handlerId": 1,
  "handlerName": "string",
  "completedAt": "2026-01-01T12:00:00.000Z"
}
```

**授权：** 当前用户必须是工单处理人。

**业务逻辑：**
1. 更新工单 status = `completed`，handler_id = 当前用户，completed_at = now
2. 通过 emailkit 向提交人邮箱发送完成通知邮件
3. 邮件发送失败时记录错误日志，不影响工单完成状态
4. 记录完成操作日志

**幂等性：** 否（已完成工单返回 409）

---

### POST /api/tickets/:id/cancel

取消工单。

**请求头：** `Authorization: Bearer <token>`

**角色：** submitter, admin

**请求体：** 无

**响应 200：**
```json
{
  "id": 1,
  "status": "cancelled"
}
```

**授权：** 提交人可取消自己的工单；admin 可取消本公司任何工单。已完成工单不可取消（409）。

**日志：** 记录取消操作。

---

## 工单回复

### POST /api/tickets/:id/replies

对工单添加回复。

**请求头：** `Authorization: Bearer <token>`

**角色：** submitter, handler, admin

**请求体：**
```json
{
  "content": "string (必填)"
}
```

**响应 201：**
```json
{
  "id": 1,
  "ticketId": 1,
  "replierId": 1,
  "replierName": "string",
  "content": "string",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

**授权：** 用户必须属于工单所属公司。

---

### GET /api/tickets/:id/replies

获取工单回复列表，按时间正序排列。

**请求头：** `Authorization: Bearer <token>`

**响应 200：**
```json
{
  "items": [
    {
      "id": 1,
      "replierId": 1,
      "replierName": "string",
      "content": "string",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

---

## 用户评价

### POST /api/tickets/:id/evaluation

提交人对已完成工单进行满意度评价。

**请求头：** `Authorization: Bearer <token>`

**角色：** submitter

**请求体：**
```json
{
  "rating": 5
}
```

**响应 201：**
```json
{
  "id": 1,
  "ticketId": 1,
  "rating": 5,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

**响应 409：** `{ "error": "Evaluation already exists" }`

**授权：** 当前用户必须是工单提交人，工单状态必须为 `completed`。

**日志：** 记录评价操作。

---

### GET /api/tickets/:id/evaluation

获取工单评价。

**请求头：** `Authorization: Bearer <token>`

**响应 200：**
```json
{
  "id": 1,
  "ticketId": 1,
  "rating": 5,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

**响应 404：** 工单未评价。

---

## 提交人信息

### GET /api/tickets/:id/submitter-info

处理工单时查看提交人完整信息，包括姓名、公司、部门和历史工单。

**请求头：** `Authorization: Bearer <token>`

**角色：** handler, admin

**响应 200：**
```json
{
  "userId": 1,
  "name": "string",
  "email": "string",
  "companyName": "string",
  "departmentName": "string",
  "historyTickets": [
    {
      "id": 1,
      "title": "string",
      "status": "completed",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

**授权：** 当前用户必须是工单处理人或 admin，且需属于同公司。

---

## 业务组管理

### GET /api/business-groups

查询当前用户公司的业务组列表。

**请求头：** `Authorization: Bearer <token>`

**角色：** admin

**Query 参数：** `companyId` (可选，admin 可指定)

**响应 200：**
```json
{
  "items": [
    {
      "id": 1,
      "companyId": 1,
      "name": "string",
      "members": [
        {
          "id": 1,
          "userId": 1,
          "userName": "string",
          "userEmail": "string"
        }
      ]
    }
  ]
}
```

---

### POST /api/business-groups

创建业务组。

**请求头：** `Authorization: Bearer <token>`

**角色：** admin

**请求体：**
```json
{
  "name": "string",
  "memberUserIds": [1, 2]
}
```

**响应 201：**
```json
{
  "id": 1,
  "companyId": 1,
  "name": "string",
  "members": [
    { "id": 1, "userId": 1, "userName": "string" }
  ]
}
```

**授权：** companyId 取自当前用户；memberUserIds 中的用户必须属于同公司。

---

### POST /api/business-groups/:id/members

向业务组添加成员。

**请求头：** `Authorization: Bearer <token>`

**角色：** admin

**请求体：**
```json
{
  "userId": 1
}
```

**响应 201：**
```json
{
  "id": 1,
  "groupId": 1,
  "userId": 1,
  "userName": "string"
}
```

**授权：** 业务组必须属于当前用户公司；被添加用户必须属于同公司。

---

### DELETE /api/business-groups/:id/members/:userId

从业务组移除成员。

**请求头：** `Authorization: Bearer <token>`

**角色：** admin

**响应 204：** 无内容

**授权：** 业务组必须属于当前用户公司。

---

## 分配规则管理

### GET /api/assignment-rules

查询当前用户公司的分配规则列表。

**请求头：** `Authorization: Bearer <token>`

**角色：** admin

**Query 参数：** `companyId` (可选)

**响应 200：**
```json
{
  "items": [
    {
      "id": 1,
      "companyId": 1,
      "categoryId": 1,
      "categoryName": "string",
      "targetGroupId": 1,
      "targetGroupName": "string"
    }
  ]
}
```

---

### POST /api/assignment-rules

创建分类→业务组分配规则。

**请求头：** `Authorization: Bearer <token>`

**角色：** admin

**请求体：**
```json
{
  "categoryId": 1,
  "targetGroupId": 1
}
```

**响应 201：**
```json
{
  "id": 1,
  "companyId": 1,
  "categoryId": 1,
  "categoryName": "string",
  "targetGroupId": 1,
  "targetGroupName": "string"
}
```

**授权：** companyId 取自当前用户；目标业务组必须属于同公司。

---

### DELETE /api/assignment-rules/:id

删除分配规则。

**请求头：** `Authorization: Bearer <token>`

**角色：** admin

**响应 204：** 无内容

---

## 工单工作台

### GET /api/workbench/tickets

查询待处理工单列表，支持筛选、搜索、排序，可按公司维度筛选。

**请求头：** `Authorization: Bearer <token>`

**角色：** handler, admin

**Query 参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| companyId | number | 当前用户公司 | 按公司筛选（admin 可选其他公司） |
| slaPriority | string | — | 按 SLA 优先级筛选 |
| categoryId | number | — | 按分类筛选 |
| keyword | string | — | 搜索主题和描述 |
| sortBy | string | `createdAt` | 排序字段：`createdAt` / `slaPriority` |
| sortOrder | string | `desc` | `asc` / `desc` |
| page | number | 1 | 页码 |
| pageSize | number | 20 | 每页条数 |

**响应 200：**
```json
{
  "items": [Ticket],
  "total": 50,
  "page": 1,
  "pageSize": 20
}
```

**授权：**
- handler：只能查看分配给自己所属业务组的、状态为 `pending_processing` 的工单
- admin：可查看本公司所有待处理工单，可通过 companyId 参数跨公司查看

---

## 统计分析

### GET /api/statistics/overview

获取运营指标概览。

**请求头：** `Authorization: Bearer <token>`

**角色：** admin

**Query 参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| companyId | number | 按公司筛选 |
| startDate | string | 起始日期 (ISO) |
| endDate | string | 截止日期 (ISO) |

**响应 200：**
```json
{
  "totalTickets": 100,
  "completedTickets": 80,
  "pendingTickets": 15,
  "cancelledTickets": 5,
  "averageResponseTimeMinutes": 120,
  "averageSatisfaction": 4.5,
  "satisfactionCount": 75
}
```

**说明：** 平均响应时间 = 工单从 created_at 到 completed_at 的平均分钟数（仅含已完成工单）。

---

### GET /api/statistics/distribution

获取按公司/部门维度的工单分布。

**请求头：** `Authorization: Bearer <token>`

**角色：** admin

**Query 参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| dimension | string | `company` / `department` |
| companyId | number | 按公司筛选（dimension=department 时可指定） |

**响应 200：**
```json
{
  "dimension": "company",
  "items": [
    {
      "label": "公司A",
      "total": 50,
      "completed": 40,
      "pending": 8,
      "cancelled": 2
    }
  ]
}
```

---

### GET /api/statistics/hot-topics

获取热点问题（按分类统计高频工单）。

**请求头：** `Authorization: Bearer <token>`

**角色：** admin

**Query 参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| companyId | number | 按公司筛选 |
| limit | number | 返回条数，默认 10 |

**响应 200：**
```json
{
  "items": [
    {
      "categoryId": 1,
      "categoryName": "网络故障",
      "ticketCount": 25
    }
  ]
}
```

---

## 操作日志

### GET /api/tickets/:id/logs

查询工单的操作日志。

**请求头：** `Authorization: Bearer <token>`

**响应 200：**
```json
{
  "items": [
    {
      "id": "string (auditkit event id)",
      "action": "created" | "assigned" | "transferred" | "processed" | "completed" | "cancelled" | "evaluated",
      "operatorId": 1,
      "operatorName": "string",
      "operatorTime": "2026-01-01T00:00:00.000Z",
      "details": "string (JSON context)"
    }
  ]
}
```

**授权：** 工单必须属于当前用户公司。

**说明：** 日志由 auditkit 写入，通过 auditkit 查询接口读取，按时间正序排列。

---

## 枚举定义

### TicketStatus

| 值 | 说明 |
|----|------|
| `pending_assignment` | 待分配 |
| `pending_processing` | 待处理 |
| `completed` | 完成 |
| `cancelled` | 取消 |

### SlaPriority

| 值 | 说明 |
|----|------|
| `P0` | 最高优先级 |
| `P1` | 高 |
| `P2` | 中 |
| `P3` | 低 |
| `P4` | 最低 |

### AuditAction

| 值 | 说明 |
|----|------|
| `created` | 创建工单 |
| `assigned` | 分配工单（自动/手动） |
| `transferred` | 转派工单 |
| `completed` | 完成工单 |
| `cancelled` | 取消工单 |
| `evaluated` | 评价工单 |
