# 技术契约 — 157-ticket 工单系统

本文件是 API 字段级契约的唯一来源。架构基线仅保留接口摘要，详细定义在此。

## 1. ID 类型对照表

| 实体 ID | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---|---|---|---|---|---|---|
| ticket.id | 服务端 `randomUUID()` | TEXT PRIMARY KEY | TEXT (tickets 外键) | string | string | 服务端路由层生成，客户端原样传递 |
| user.id | 服务端 `randomUUID()` | TEXT PRIMARY KEY | TEXT (tickets 外键) | string | string | UserKit store 生成 |
| company.id | 服务端 `randomUUID()` | TEXT PRIMARY KEY | TEXT (外键) | string | string | 服务端路由层生成 |
| department.id | 服务端 `randomUUID()` | TEXT PRIMARY KEY | TEXT (外键) | string | string | 服务端路由层生成 |
| ticket_category.id | 服务端 `randomUUID()` | TEXT PRIMARY KEY | TEXT (外键) | string | string | 服务端路由层生成 |
| business_group.id | 服务端 `randomUUID()` | TEXT PRIMARY KEY | TEXT (外键) | string | string | 服务端路由层生成 |
| assignment_rule.id | 服务端 `randomUUID()` | TEXT PRIMARY KEY | TEXT (外键) | string | string | 服务端路由层生成 |
| ticket_reply.id | 服务端 `randomUUID()` | TEXT PRIMARY KEY | TEXT (外键) | string | string | 服务端路由层生成 |
| satisfaction_rating.id | 服务端 `randomUUID()` | TEXT PRIMARY KEY | TEXT (外键) | string | string | 服务端路由层生成 |

所有 ID 均为 UUID v4 字符串（TEXT），在服务端通过 `node:crypto.randomUUID()` 生成。数据库主键、外键引用和 API JSON 表示使用统一 TEXT 类型，无需转换。客户端接收后原样存储和传递。

## 2. 枚举值

### 2.1 工单状态 (ticket.status)

| 值 | 说明 |
|---|---|
| `created` | 工单提交后初始状态 |
| `pending_assignment` | 待分配 |
| `pending_processing` | 待处理 |
| `completed` | 已完成 |
| `cancelled` | 已取消（终态） |

### 2.2 SLA 优先级 (ticket.priority)

| 值 | 说明 |
|---|---|
| `P0` | 紧急 |
| `P1` | 高 |
| `P2` | 中（默认） |
| `P3` | 普通 |
| `P4` | 低 |

### 2.3 满意度评分 (satisfaction_rating.rating)

| 值 | 说明 |
|---|---|
| `1` | 非常不满意 |
| `2` | 不满意 |
| `3` | 一般 |
| `4` | 满意 |
| `5` | 非常满意 |

## 3. API 错误响应

所有 API 错误统一格式：

```json
{ "error": { "code": "ERROR_CODE", "message": "Human readable message" } }
```

| HTTP | code | 说明 |
|---|---|---|
| 400 | INVALID_INPUT | 请求参数缺失或格式错误 |
| 401 | UNAUTHORIZED | 未认证或 token 失效 |
| 403 | FORBIDDEN | 无权限执行该操作 |
| 403 | PASSWORD_CHANGE_REQUIRED | 需先修改临时密码 |
| 404 | NOT_FOUND | 资源不存在 |
| 409 | CONFLICT | 状态冲突（如已完成工单不可转派） |
| 409 | BOOTSTRAP_CLOSED | 初始账户已创建 |
| 409 | DUPLICATE | 唯一约束冲突 |
| 500 | INTERNAL | 服务端内部错误 |

## 4. 认证接口

### POST /api/auth/login

- 授权：公开
- 请求体：`{ email: string, password: string }`
- 成功响应 (200)：`{ token: string, user: { id: string, name: string, email: string, phone: string|null, roles: string[], passwordChangeRequired: boolean } }`
- 错误：401 INVALID_INPUT
- 幂等性：否

### GET /api/auth/me

- 授权：已认证
- 请求参数：无
- 成功响应 (200)：`{ id: string, name: string, email: string, phone: string|null, roles: string[], passwordChangeRequired: boolean }`

### POST /api/auth/password

- 授权：已认证
- 请求体：`{ password: string }`（最少 12 字符）
- 成功响应 (200)：`{ ok: true, passwordChangeRequired: false }`
- 错误：400 INVALID_INPUT、404 NOT_FOUND

### GET /api/auth/bootstrap-status

- 授权：公开
- 成功响应 (200)：`{ required: boolean }`

### POST /api/auth/bootstrap

- 授权：公开（仅当无用户时可用）
- 请求体：`{ name: string, email: string, password: string }`（password ≥ 12 字符）
- 成功响应 (201)：`{ ok: true }`
- 错误：400 INVALID_INPUT、409 BOOTSTRAP_CLOSED

## 5. 用户管理接口

### GET /api/admin/users

- 授权：已认证（管理权限）
- 查询参数：`search?: string, limit?: number(默认50, 最大100), offset?: number(默认0)`
- 成功响应 (200)：`{ users: Array<{ id: string, name: string, email: string, phone: string|null, enabled: boolean, company_id: string|null, created_at: string }>, total: number }`

### POST /api/admin/users

- 授权：已认证（管理权限）
- 请求体：`{ name: string, email: string, password: string, phone?: string|null }`
- 成功响应 (201)：`{ user: { id: string, name: string, email: string, phone: string|null } }`
- 错误：400 INVALID_USER、409 DUPLICATE

### PATCH /api/admin/users/:id

- 授权：已认证（管理权限）
- 路径参数：`id: string`
- 请求体：`{ name: string, email: string, phone?: string|null }`
- 成功响应 (200)：`{ user: { id: string, name: string, email: string, phone: string|null } }`
- 错误：400 INVALID_USER、404 NOT_FOUND、409 DUPLICATE

### PATCH /api/admin/users/:id/status

- 授权：已认证（管理权限）
- 请求体：`{ enabled: boolean }`
- 成功响应 (200)：`{ ok: true }`
- 错误：400 INVALID_INPUT、404 NOT_FOUND

### POST /api/admin/users/:id/password

- 授权：已认证（管理权限）
- 请求体：`{ password: string }`（≥ 12 字符）
- 成功响应 (200)：`{ ok: true }`
- 错误：400 INVALID_INPUT、404 NOT_FOUND

### PATCH /api/admin/users/:id/company

- 授权：已认证（管理权限）
- 请求体：`{ company_id: string|null, department_id?: string|null }`
- 成功响应 (200)：`{ ok: true }`
- 错误：400 INVALID_INPUT、404 NOT_FOUND
- 说明：设置用户所属公司和部门，用于工单按公司隔离和按部门统计

## 6. 公司与部门接口

### GET /api/companies

- 授权：已认证
- 成功响应 (200)：`{ companies: Array<{ id: string, name: string, created_at: string }> }`

### POST /api/companies

- 授权：已认证（管理权限）
- 请求体：`{ name: string }`
- 成功响应 (201)：`{ company: { id: string, name: string, created_at: string } }`
- 错误：400 INVALID_INPUT、409 DUPLICATE

### GET /api/companies/:id/departments

- 授权：已认证
- 成功响应 (200)：`{ departments: Array<{ id: string, company_id: string, name: string, created_at: string }> }`

### POST /api/companies/:id/departments

- 授权：已认证（管理权限）
- 请求体：`{ name: string }`
- 成功响应 (201)：`{ department: { id: string, company_id: string, name: string, created_at: string } }`
- 错误：400 INVALID_INPUT、409 DUPLICATE

## 7. 工单分类接口

### GET /api/companies/:companyId/categories

- 授权：已认证
- 成功响应 (200)：`{ categories: Array<{ id: string, company_id: string, name: string, created_at: string }> }`

### POST /api/companies/:companyId/categories

- 授权：已认证（管理权限）
- 请求体：`{ name: string }`
- 成功响应 (201)：`{ category: { id: string, company_id: string, name: string, created_at: string } }`
- 错误：400 INVALID_INPUT、409 DUPLICATE

## 8. 业务组接口

### GET /api/companies/:companyId/groups

- 授权：已认证
- 成功响应 (200)：`{ groups: Array<{ id: string, company_id: string, name: string, created_at: string }> }`

### POST /api/companies/:companyId/groups

- 授权：已认证（管理权限）
- 请求体：`{ name: string }`
- 成功响应 (201)：`{ group: { id: string, company_id: string, name: string, created_at: string } }`
- 错误：400 INVALID_INPUT、409 DUPLICATE

### GET /api/groups/:id/members

- 授权：已认证
- 成功响应 (200)：`{ members: Array<{ user_id: string, name: string, email: string, created_at: string }> }`

### POST /api/groups/:id/members

- 授权：已认证（管理权限）
- 请求体：`{ user_id: string }`
- 成功响应 (201)：`{ ok: true }`
- 错误：400 INVALID_INPUT、404 NOT_FOUND、409 DUPLICATE

### DELETE /api/groups/:id/members/:userId

- 授权：已认证（管理权限）
- 成功响应 (200)：`{ ok: true }`
- 错误：404 NOT_FOUND

## 9. 自动分配规则接口

### GET /api/companies/:companyId/assignment-rules

- 授权：已认证
- 成功响应 (200)：`{ rules: Array<{ id: string, company_id: string, category_id: string, category_name: string, target_group_id: string, target_group_name: string, created_at: string }> }`

### POST /api/companies/:companyId/assignment-rules

- 授权：已认证（管理权限）
- 请求体：`{ category_id: string, target_group_id: string }`
- 成功响应 (201)：`{ rule: { id: string, company_id: string, category_id: string, target_group_id: string, created_at: string } }`
- 错误：400 INVALID_INPUT、409 DUPLICATE
- 说明：同一公司+分类只能有一条规则

## 10. 工单接口

### POST /api/tickets

- 授权：已认证（submitter 角色）
- 请求体：
  ```json
  {
    "title": "string",
    "description": "string",
    "category_id": "string|null",
    "priority": "P0|P1|P2|P3|P4"
  }
  ```
- 成功响应 (201)：
  ```json
  {
    "ticket": {
      "id": "string",
      "company_id": "string",
      "title": "string",
      "description": "string",
      "category_id": "string|null",
      "category_name": "string|null",
      "status": "created|pending_assignment|pending_processing",
      "priority": "P0|P1|P2|P3|P4",
      "submitter_id": "string",
      "submitter_name": "string",
      "submitter_email": "string",
      "assigned_group_id": "string|null",
      "assigned_group_name": "string|null",
      "assigned_user_id": "string|null",
      "processed_by": "string|null",
      "processed_at": "string|null",
      "created_at": "string",
      "updated_at": "string"
    }
  }
  ```
- 错误：400 INVALID_INPUT
- 说明：创建时 `company_id` 从当前用户的 `company_id` 取得；若存在匹配的分配规则（company_id + category_id），自动将状态置为 `pending_processing` 并写入 `assigned_group_id`；否则状态为 `pending_assignment`。同时记录审计日志 `ticket.created`（如有自动分配，追加 `ticket.assigned`）。

### GET /api/tickets

- 授权：已认证
- 查询参数：
  - `status?: string` — 按状态筛选
  - `priority?: string` — 按优先级筛选
  - `category_id?: string` — 按分类筛选
  - `company_id?: string` — 按公司筛选（仅 admin 可跨公司，其他角色仅限自身公司）
  - `search?: string` — 按标题/描述关键词搜索
  - `sort?: string` — 排序字段（`created_at`|`priority`|`updated_at`，默认 `created_at`）
  - `order?: string` — `asc`|`desc`（默认 `desc`）
  - `limit?: number` — 默认 20，最大 100
  - `offset?: number` — 默认 0
- 成功响应 (200)：`{ tickets: Ticket[], total: number }`
- 说明：Ticket 结构同 POST 响应中的 ticket 对象。

### GET /api/tickets/:id

- 授权：已认证（工单所属公司与用户公司一致，或 admin）
- 成功响应 (200)：`{ ticket: Ticket }`
- 错误：404 NOT_FOUND

### GET /api/tickets/:id/replies

- 授权：已认证
- 成功响应 (200)：
  ```json
  {
    "replies": [
      {
        "id": "string",
        "ticket_id": "string",
        "author_id": "string",
        "author_name": "string",
        "content": "string",
        "created_at": "string"
      }
    ]
  }
  ```
- 说明：按 `created_at` 升序排列。

### POST /api/tickets/:id/replies

- 授权：已认证（工单所属公司的用户）
- 请求体：`{ content: string }`
- 成功响应 (201)：`{ reply: { id: string, ticket_id: string, author_id: string, author_name: string, content: string, created_at: string } }`
- 错误：400 INVALID_INPUT、404 NOT_FOUND、409 CONFLICT（已取消/已完成的工单不可回复）
- 说明：记录审计日志 `ticket.replied`。

### POST /api/tickets/:id/assign

- 授权：已认证（admin 或 handler）
- 请求体：`{ group_id?: string, user_id?: string }`（至少提供一个）
- 成功响应 (200)：`{ ticket: Ticket }`
- 错误：400 INVALID_INPUT、404 NOT_FOUND、409 CONFLICT（工单状态非 pending_assignment）
- 说明：分配后状态变为 `pending_processing`。记录审计日志 `ticket.assigned`。

### POST /api/tickets/:id/transfer

- 授权：已认证（handler 角色，且为当前处理人）
- 请求体：`{ target_user_id?: string, target_group_id?: string }`（至少提供一个）
- 成功响应 (200)：`{ ticket: Ticket }`
- 错误：400 INVALID_INPUT、403 FORBIDDEN、404 NOT_FOUND、409 CONFLICT（状态非 pending_processing）
- 说明：转派后工单仍为 `pending_processing`，更新 `assigned_user_id` 或 `assigned_group_id`。记录审计日志 `ticket.transferred`，metadata 包含转派目标和操作人。

### POST /api/tickets/:id/complete

- 授权：已认证（handler 角色，且为当前处理人）
- 请求体：无（空对象 `{}`）
- 成功响应 (200)：`{ ticket: Ticket }`
- 错误：403 FORBIDDEN、404 NOT_FOUND、409 CONFLICT（状态非 pending_processing）
- 说明：完成时设置 `processed_by` = 当前用户 ID，`processed_at` = 当前时间，状态变为 `completed`。通过 EmailKit 向 `submitter_email` 发送完成通知邮件。记录审计日志 `ticket.completed`。邮件发送失败不阻塞完成流程，但在审计 metadata 中记录 `email_error`。

### POST /api/tickets/:id/cancel

- 授权：已认证（submitter 或 admin）
- 请求体：`{ reason?: string }`
- 成功响应 (200)：`{ ticket: Ticket }`
- 错误：403 FORBIDDEN、404 NOT_FOUND、409 CONFLICT（状态为 completed 或 cancelled）
- 说明：取消后状态变为 `cancelled`。记录审计日志 `ticket.cancelled`。

### GET /api/tickets/:id/submitter-info

- 授权：已认证（handler 或 admin）
- 成功响应 (200)：
  ```json
  {
    "submitter": {
      "id": "string",
      "name": "string",
      "email": "string",
      "phone": "string|null",
      "company_id": "string|null",
      "company_name": "string|null",
      "department_id": "string|null",
      "department_name": "string|null"
    },
    "history_tickets": [
      {
        "id": "string",
        "title": "string",
        "status": "string",
        "priority": "string",
        "created_at": "string",
        "completed_at": "string|null"
      }
    ]
  }
  ```
- 错误：404 NOT_FOUND
- 说明：历史工单为该提交人此前提交的所有工单列表（排除当前工单），按 `created_at` 降序排列。

## 11. 满意度评价接口

### POST /api/tickets/:id/rating

- 授权：已认证（submitter 角色，且为该工单的提交人）
- 请求体：`{ rating: number(1-5), comment?: string }`
- 成功响应 (201)：`{ rating: { id: string, ticket_id: string, rating: number, comment: string|null, created_at: string } }`
- 错误：400 INVALID_INPUT、403 FORBIDDEN、404 NOT_FOUND、409 CONFLICT/DUPLICATE（工单状态非 completed 或已评价）
- 说明：记录审计日志 `ticket.rated`。

### GET /api/tickets/:id/rating

- 授权：已认证
- 成功响应 (200)：`{ rating: { id: string, ticket_id: string, rating: number, comment: string|null, created_at: string } | null }`
- 错误：404 NOT_FOUND（工单不存在）

## 12. 工单工作台接口

### GET /api/workbench/tickets

- 授权：已认证（handler 角色）
- 查询参数：
  - `status?: string` — 默认 `pending_processing`
  - `priority?: string`
  - `category_id?: string`
  - `company_id?: string` — 按公司筛选（handler 仅限自身公司）
  - `search?: string` — 按标题/描述关键词搜索
  - `sort?: string` — `created_at`|`priority`|`updated_at`（默认 `priority`）
  - `order?: string` — `asc`|`desc`（默认 `desc`，priority 默认 `asc` 即 P0 优先）
  - `limit?: number` — 默认 20，最大 100
  - `offset?: number` — 默认 0
- 成功响应 (200)：`{ tickets: Ticket[], total: number }`
- 说明：仅返回当前用户所属公司中分配给该用户的待处理工单。

## 13. 统计分析接口

### GET /api/stats/distribution

- 授权：已认证（admin 角色）
- 查询参数：
  - `dimension: string` — `company` 或 `department`（必填）
  - `company_id?: string` — 按公司筛选
  - `start_date?: string` — ISO 日期（含）
  - `end_date?: string` — ISO 日期（含）
- 成功响应 (200)：
  ```json
  {
    "dimension": "company|department",
    "items": [
      { "key": "string", "label": "string", "total": "number", "by_status": { "created": "number", "pending_assignment": "number", "pending_processing": "number", "completed": "number", "cancelled": "number" } }
    ]
  }
  ```
- 说明：按指定维度聚合工单数量及各状态分布。

### GET /api/stats/dashboard

- 授权：已认证（admin 角色）
- 查询参数：
  - `company_id?: string` — 按公司筛选
  - `start_date?: string` — ISO 日期（含）
  - `end_date?: string` — ISO 日期（含）
- 成功响应 (200)：
  ```json
  {
    "total_tickets": "number",
    "by_status": { "created": "number", "pending_assignment": "number", "pending_processing": "number", "completed": "number", "cancelled": "number" },
    "by_priority": { "P0": "number", "P1": "number", "P2": "number", "P3": "number", "P4": "number" },
    "avg_response_time_ms": "number|null",
    "avg_satisfaction": "number|null",
    "satisfaction_count": "number",
    "hot_categories": [
      { "category_id": "string", "category_name": "string", "count": "number" }
    ]
  }
  ```
- 说明：
  - `avg_response_time_ms`：从工单创建到首次被处理人回复的平均时间（毫秒）。无数据时为 null。
  - `avg_satisfaction`：已完成工单的满意度平均值（1-5）。无评价时为 null。
  - `hot_categories`：工单量最多的前 5 个分类，按 count 降序排列。

## 14. 审计日志接口

### GET /api/audit/tickets/:id

- 授权：已认证（handler 或 admin）
- 成功响应 (200)：
  ```json
  {
    "events": [
      {
        "id": "string",
        "occurred_at": "string",
        "event_type": "string",
        "actor_user_id": "string|null",
        "metadata_json": "string"
      }
    ]
  }
  ```
- 说明：返回该工单的所有审计事件，按 `occurred_at` 升序排列。`metadata_json` 为 JSON 字符串，包含操作上下文（如转派目标、分配组等）。
