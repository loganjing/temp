# 技术契约

## 1. 实体 ID 对照表

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---|---|---|---|---|---|---|
| Ticket | 后端 API (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| Company | 后端 API (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| User | userkit (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| BusinessGroup | 后端 API (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| TicketCategory | 后端 API (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| AssignmentRule | 后端 API (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| TicketReply | 后端 API (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| TicketTransfer | 后端 API (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| TicketEvaluation | 后端 API (UUID v4) | TEXT | TEXT | string | string | 无需转换 |

所有实体 ID 统一使用 TEXT 存储 UUID v4 字符串。API JSON 与前端 TypeScript 均使用 `string` 类型，无需类型转换。API 层通过 UUID 格式校验中间件验证路径参数和请求体中的 ID 字段。

## 2. 通用约定

### 认证

除 `POST /api/auth/login` 外，所有接口要求 `Authorization: Bearer <token>` 请求头。token 由 authkit 签发和管理。未认证请求返回 `401 { error: "unauthorized" }`。

### 公司隔离

所有工单相关接口从 token 解析当前用户的 `companyId`，并强制将查询限定在该公司范围内。跨公司访问返回 `403 { error: "forbidden" }`。

### 错误响应格式

```json
{ "error": "<error_code>", "message": "<human_readable_message>" }
```

| HTTP 状态 | error 值 | 含义 |
|---|---|---|
| 400 | invalid_request | 请求参数缺失或格式错误 |
| 401 | unauthorized | 未认证或 token 无效 |
| 403 | forbidden | 无权限或跨公司访问 |
| 404 | not_found | 资源不存在 |
| 409 | conflict | 状态冲突（如已完成工单不可取消） |

### 时间格式

所有时间字段使用 ISO 8601 UTC 字符串（如 `2026-10-23T08:30:00.000Z`）。

## 3. 认证接口

### POST /api/auth/login

- 授权：公开
- 请求体：
  ```json
  { "email": "string", "password": "string" }
  ```
- 200 响应：
  ```json
  {
    "token": "string",
    "user": {
      "id": "string",
      "name": "string",
      "email": "string",
      "companyId": "string",
      "department": "string|null"
    }
  }
  ```
- 401：`{ "error": "invalid_credentials" }`
- 幂等：否

### POST /api/auth/logout

- 授权：Bearer token
- 请求体：无
- 200 响应：`{}`
- 幂等：是

### GET /api/auth/me

- 授权：Bearer token
- 200 响应：
  ```json
  {
    "id": "string",
    "name": "string",
    "email": "string",
    "companyId": "string",
    "department": "string|null"
  }
  ```

## 4. 工单管理接口

### POST /api/tickets

- 授权：Bearer token（submitter 角色）
- 请求体：
  ```json
  {
    "subject": "string",
    "description": "string",
    "categoryId": "string",
    "priority": "P0|P1|P2|P3|P4"
  }
  ```
- 201 响应：
  ```json
  {
    "id": "string",
    "subject": "string",
    "description": "string",
    "categoryId": "string",
    "priority": "string",
    "status": "created|pending_assignment|pending_processing",
    "submitterId": "string",
    "submitterName": "string",
    "submitterEmail": "string",
    "submitterCompany": "string",
    "submitterDepartment": "string|null",
    "assignedGroupId": "string|null",
    "createdAt": "string"
  }
  ```
- 行为：创建后查询该公司 `assignment_rules` 表，按 `categoryId` 匹配业务组。若匹配则 `status = pending_processing`、`assigned_group_id` 设为匹配组；否则 `status = pending_assignment`。
- 映射责任：submitterId/Name/Email/Company/Department 从当前用户 token 提取，不由请求体传入。
- 幂等：否

### GET /api/tickets

- 授权：Bearer token
- 查询参数：
  | 参数 | 类型 | 可空 | 用途 |
  |---|---|---|---|
  | status | string | 是 | 按状态筛选 |
  | priority | string | 是 | 按优先级筛选 |
  | categoryId | string | 是 | 按分类筛选 |
  | companyId | string | 是 | 按公司筛选（仅 admin 可跨公司；其他角色强制当前公司） |
  | search | string | 是 | 关键词搜索（匹配 subject/description） |
  | sort | string | 是 | 排序字段，格式 `field:asc|desc`，默认 `createdAt:desc` |
  | page | integer | 是 | 页码，默认 1 |
  | pageSize | integer | 是 | 每页条数，默认 20 |
- 200 响应：
  ```json
  {
    "items": [Ticket],
    "total": "integer",
    "page": "integer",
    "pageSize": "integer"
  }
  ```

### GET /api/tickets/:id

- 授权：Bearer token（工单同公司用户）
- 200 响应：
  ```json
  {
    "id": "string",
    "subject": "string",
    "description": "string",
    "categoryId": "string",
    "categoryName": "string|null",
    "priority": "string",
    "status": "string",
    "submitterId": "string",
    "submitterName": "string",
    "submitterEmail": "string",
    "submitterCompany": "string",
    "submitterDepartment": "string|null",
    "assignedGroupId": "string|null",
    "assignedGroupName": "string|null",
    "assignedHandlerId": "string|null",
    "assignedHandlerName": "string|null",
    "createdAt": "string",
    "processedAt": "string|null",
    "completedAt": "string|null",
    "completedBy": "string|null",
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
- 404：`{ "error": "not_found" }`

### PATCH /api/tickets/:id/status

- 授权：Bearer token（submitter 可取消自己的工单；admin 可取消任意工单）
- 请求体：
  ```json
  { "status": "cancelled" }
  ```
- 200 响应：更新后的 Ticket 对象（同 GET /api/tickets/:id 返回结构，不含 replies）
- 409：`{ "error": "conflict" }` — 已完成/已取消的工单不可再变更状态
- 幂等：否

### POST /api/tickets/:id/replies

- 授权：Bearer token（submitter 或 handler 角色，工单同公司）
- 请求体：
  ```json
  { "content": "string" }
  ```
- 201 响应：
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
- 映射责任：replierId/replierName 从当前用户 token 提取。
- 幂等：否

### POST /api/tickets/:id/complete

- 授权：Bearer token（handler 角色，工单当前处理人）
- 请求体：无
- 200 响应：更新后的 Ticket 对象
- 行为：设置 `status = completed`、`completed_by = 当前用户`、`completed_at = now`，通过 emailkit 向 submitterEmail 发送完成通知邮件。工单必须处于 `pending_processing` 状态才能完成。
- 409：`{ "error": "conflict" }` — 工单不在 pending_processing 状态
- 幂等：否

### POST /api/tickets/:id/transfer

- 授权：Bearer token（handler 角色，当前处理人）
- 请求体：
  ```json
  { "toUserId": "string" }
  ```
- 200 响应：更新后的 Ticket 对象
- 行为：校验 toUserId 是同公司某业务组成员；更新 `assigned_handler_id = toUserId`；写入 ticket_transfers 记录；工单状态保持 `pending_processing`。
- 400：`{ "error": "invalid_request" }` — toUserId 不是同公司业务组成员
- 409：`{ "error": "conflict" }` — 工单不在 pending_processing 状态
- 幂等：否

### GET /api/tickets/:id/submitter

- 授权：Bearer token（handler 或 admin 角色，工单同公司）
- 200 响应：
  ```json
  {
    "id": "string",
    "name": "string",
    "email": "string",
    "companyId": "string",
    "companyName": "string",
    "department": "string|null",
    "historyTickets": [
      {
        "id": "string",
        "subject": "string",
        "status": "string",
        "priority": "string",
        "createdAt": "string"
      }
    ]
  }
  ```
- 行为：查询该提交人同公司的历史工单列表，按 createdAt 降序排列。

## 5. 用户评价接口

### POST /api/tickets/:id/evaluation

- 授权：Bearer token（submitter 角色，工单提交人）
- 请求体：
  ```json
  { "rating": "integer (1-5)", "comment": "string|null" }
  ```
- 201 响应：
  ```json
  {
    "id": "string",
    "ticketId": "string",
    "evaluatorId": "string",
    "rating": "integer",
    "comment": "string|null",
    "createdAt": "string"
  }
  ```
- 400：`{ "error": "invalid_request" }` — rating 不在 1-5 范围
- 409：`{ "error": "conflict" }` — 工单未完成或已评价
- 幂等：否（每个工单仅允许一次评价）

### GET /api/tickets/:id/evaluation

- 授权：Bearer token（工单同公司用户）
- 200 响应：
  ```json
  {
    "id": "string",
    "ticketId": "string",
    "evaluatorId": "string",
    "rating": "integer",
    "comment": "string|null",
    "createdAt": "string"
  }
  ```
- 404：`{ "error": "not_found" }` — 工单未被评价

## 6. 工单分配接口

### POST /api/business-groups

- 授权：Bearer token（admin 角色）
- 请求体：
  ```json
  { "name": "string" }
  ```
- 201 响应：
  ```json
  { "id": "string", "companyId": "string", "name": "string" }
  ```
- 映射责任：companyId 从当前用户 token 提取。

### GET /api/business-groups

- 授权：Bearer token（admin 角色）
- 200 响应：
  ```json
  [
    {
      "id": "string",
      "companyId": "string",
      "name": "string",
      "members": [
        { "id": "string", "userId": "string", "userName": "string" }
      ]
    }
  ]
  ```
- 行为：仅返回当前公司的业务组。

### POST /api/business-groups/:id/members

- 授权：Bearer token（admin 角色，业务组同公司）
- 请求体：
  ```json
  { "userId": "string" }
  ```
- 201 响应：
  ```json
  { "id": "string", "groupId": "string", "userId": "string" }
  ```
- 400：`{ "error": "invalid_request" }` — userId 不是同公司用户

### DELETE /api/business-groups/:id/members/:userId

- 授权：Bearer token（admin 角色，业务组同公司）
- 200 响应：`{}`
- 幂等：是

### POST /api/ticket-categories

- 授权：Bearer token（admin 角色）
- 请求体：
  ```json
  { "name": "string" }
  ```
- 201 响应：
  ```json
  { "id": "string", "companyId": "string", "name": "string" }
  ```

### GET /api/ticket-categories

- 授权：Bearer token
- 200 响应：
  ```json
  [ { "id": "string", "companyId": "string", "name": "string" } ]
  ```

### POST /api/assignment-rules

- 授权：Bearer token（admin 角色）
- 请求体：
  ```json
  { "categoryId": "string", "groupId": "string" }
  ```
- 201 响应：
  ```json
  { "id": "string", "companyId": "string", "categoryId": "string", "groupId": "string" }
  ```
- 400：`{ "error": "invalid_request" }` — categoryId 或 groupId 不属于当前公司
- 幂等：否（同一 categoryId 可有多条规则，取最后一条）

### GET /api/assignment-rules

- 授权：Bearer token（admin 角色）
- 200 响应：
  ```json
  [
    {
      "id": "string",
      "companyId": "string",
      "categoryId": "string",
      "categoryName": "string",
      "groupId": "string",
      "groupName": "string"
    }
  ]
  ```

## 7. 统计分析接口

### GET /api/statistics/distribution

- 授权：Bearer token（admin 角色）
- 查询参数：
  | 参数 | 类型 | 可空 | 用途 |
  |---|---|---|---|
  | dimension | string | 否 | `company` 或 `department` |
  | companyId | string | 是 | 指定公司（仅 dimension=department 时适用） |
- 200 响应（dimension=company）：
  ```json
  [
    { "companyId": "string", "companyName": "string", "ticketCount": "integer" }
  ]
  ```
- 200 响应（dimension=department）：
  ```json
  [
    { "department": "string", "ticketCount": "integer" }
  ]
  ```

### GET /api/statistics/dashboard

- 授权：Bearer token（admin 角色）
- 200 响应：
  ```json
  {
    "totalTickets": "integer",
    "avgResponseTimeMs": "integer|null",
    "avgSatisfaction": "number|null",
    "hotCategories": [
      { "categoryId": "string", "categoryName": "string", "ticketCount": "integer" }
    ],
    "statusBreakdown": {
      "created": "integer",
      "pending_assignment": "integer",
      "pending_processing": "integer",
      "completed": "integer",
      "cancelled": "integer"
    }
  }
  ```
- 行为：
  - `totalTickets`：当前公司工单总数。
  - `avgResponseTimeMs`：已完成工单从 `created_at` 到 `completed_at` 的平均时长（毫秒），无已完成工单时为 null。
  - `avgSatisfaction`：已完成工单的平均评价分（1-5），无评价时为 null。
  - `hotCategories`：按工单数降序排列的前 5 个分类。

## 8. 工单工作台接口

### GET /api/workbench/tickets

- 授权：Bearer token（handler 角色）
- 查询参数：
  | 参数 | 类型 | 可空 | 用途 |
  |---|---|---|---|
  | companyId | string | 是 | 按公司筛选（admin 可跨公司；handler 仅限当前公司） |
  | priority | string | 是 | 按优先级筛选 |
  | categoryId | string | 是 | 按分类筛选 |
  | search | string | 是 | 关键词搜索（匹配 subject） |
  | sort | string | 是 | 排序，格式 `field:asc|desc`，默认 `createdAt:desc` |
  | page | integer | 是 | 页码，默认 1 |
  | pageSize | integer | 是 | 每页条数，默认 20 |
- 200 响应：
  ```json
  {
    "items": [Ticket],
    "total": "integer",
    "page": "integer",
    "pageSize": "integer"
  }
  ```
- 行为：默认返回 `status = pending_processing` 且 `assigned_handler_id = 当前用户` 的工单。admin 可查看所有待处理工单。

## 9. 审计日志接口

### GET /api/audit-logs

- 授权：Bearer token（admin 角色）
- 查询参数：
  | 参数 | 类型 | 可空 | 用途 |
  |---|---|---|---|
  | ticketId | string | 是 | 按工单ID筛选 |
  | action | string | 是 | 按操作类型筛选 |
  | page | integer | 是 | 页码，默认 1 |
  | pageSize | integer | 是 | 每页条数，默认 50 |
- 200 响应：
  ```json
  {
    "items": [
      {
        "id": "string",
        "actorId": "string",
        "actorName": "string",
        "action": "string",
        "targetTicketId": "string",
        "createdAt": "string",
        "details": "string|null"
      }
    ],
    "total": "integer",
    "page": "integer",
    "pageSize": "integer"
  }
  ```
- 行为：通过 auditkit 查询当前公司的审计事件。action 值包括：`ticket_create`、`ticket_assign`、`ticket_transfer`、`ticket_complete`、`ticket_cancel`、`ticket_evaluate`。
