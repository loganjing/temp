# 技术契约

本文档定义前后端共享的 API 契约细节。字段级定义以此文件为唯一来源；架构基线仅保留接口摘要。

## 1. ID 类型对照表

| 实体 ID | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---|---|---|---|---|---|---|
| company_id | 后端 (UUID v4) | TEXT | TEXT | string | string | 无需转换，全链路一致 |
| department_id | 后端 (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| user_id | userkit (UUID) | TEXT | TEXT | string | string | 后端从 authkit 会话解析 |
| user_profile_id | 后端 (UUID v4) | TEXT | TEXT | string | string | 后端通过 user_id 查询 user_profiles |
| ticket_id | 后端 (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| reply_id | 后端 (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| group_id | 后端 (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| rule_id | 后端 (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| evaluation_id | 后端 (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| transfer_record_id | 后端 (UUID v4) | TEXT | TEXT | string | string | 无需转换 |

所有 ID 均为 TEXT (UUID v4) 类型，全链路一致，无需类型转换。

## 2. 认证与授权

### 认证

所有 `/api/*` 端点（除 `/api/auth/login` 外）需要 Bearer Token 认证。authkit 中间件验证 token 并解析当前用户 ID，通过 `user_profiles` 表映射到 `company_id` 和角色。

### 授权规则

| 角色标识 | 可执行操作 |
|---|---|
| submitter | 创建工单、查看自己的工单、回复自己的工单、提交满意度评价 |
| handler | 查看分配到本组的工单、回复工单、转派工单、完成工单、查看提交人信息 |
| admin | 全部 handler 操作 + 管理业务组、配置分配规则、查看统计分析、管理公司部门 |

### 公司隔离

所有查询自动附加 `company_id = <当前用户公司>` 过滤。跨公司访问返回 403。

## 3. API 端点定义

### 3.1 认证

#### POST /api/auth/login

- 授权: 公开
- 请求: `{ "username": string, "password": string }`
- 响应 200: `{ "token": string, "user": { "id": string, "name": string, "role": string, "companyId": string } }`
- 响应 401: `{ "error": "invalid_credentials" }`

#### POST /api/auth/logout

- 授权: 已登录
- 请求: 无
- 响应 200: `{ "ok": true }`

#### GET /api/auth/me

- 授权: 已登录
- 响应 200: `{ "id": string, "name": string, "email": string, "role": string, "companyId": string, "departmentId": string|null }`

### 3.2 工单管理

#### GET /api/tickets

- 授权: 已登录（按角色过滤可见工单）
- 查询参数:
  - `status` (可选): created|pending_assignment|pending_processing|completed|cancelled
  - `category` (可选): string — 按分类筛选
  - `companyId` (可选): string — 按公司筛选（admin 可跨公司）
  - `keyword` (可选): string — 搜索主题和描述
  - `sort` (可选): created_at|priority|status — 排序字段，默认 created_at
  - `order` (可选): asc|desc — 默认 desc
  - `page` (可选): number — 默认 1
  - `pageSize` (可选): number — 默认 20
- 响应 200: `{ "items": Ticket[], "total": number, "page": number, "pageSize": number }`

#### POST /api/tickets

- 授权: submitter, admin
- 请求: `{ "subject": string, "description": string, "category": string, "priority": "P0"|"P1"|"P2"|"P3"|"P4" }`
- 响应 201: `Ticket`（含自动分配结果，assigned_group_id 可空）
- 响应 400: `{ "error": "validation_error", "details": [...] }`
- 幂等性: 非幂等，重复创建生成不同工单

#### GET /api/tickets/:id

- 授权: 已登录（submitter 仅自己的工单，handler 本组工单，admin 本公司全部）
- 响应 200: `TicketDetail`（含提交人信息、回复列表、评价、操作日志摘要）
- 响应 403: `{ "error": "company_isolation" }`
- 响应 404: `{ "error": "not_found" }`

#### PATCH /api/tickets/:id/status

- 授权: handler, admin
- 请求: `{ "status": "pending_processing"|"completed"|"cancelled" }`
- 响应 200: `Ticket`
- 当 status=completed 时: 记录 handler_id 和 completed_at，触发邮件通知
- 响应 400: `{ "error": "invalid_transition" }`

### 3.3 工单回复

#### POST /api/tickets/:id/replies

- 授权: 已登录（submitter 回复自己的工单，handler 回复本组工单）
- 请求: `{ "content": string }`
- 响应 201: `{ "id": string, "ticketId": string, "replierId": string, "replierName": string, "content": string, "createdAt": string }`
- 响应 400: `{ "error": "validation_error" }`

### 3.4 工单转派

#### POST /api/tickets/:id/transfer

- 授权: handler, admin
- 请求: `{ "targetGroupId": string }`
- 响应 200: `Ticket`（assigned_group_id 已更新，状态保持 pending_processing）
- 响应 400: `{ "error": "invalid_target_group" }` — 目标组不存在或不属于同一公司
- 记录转派历史到 ticket_transfer_records

### 3.5 工单完成

#### POST /api/tickets/:id/complete

- 授权: handler, admin
- 请求: `{ "summary": string }`（可选，处理摘要）
- 响应 200: `Ticket`（status=completed, handler_id, completed_at 已记录）
- 副作用: 通过 emailkit 发送邮件到 submitter_email
- 响应 400: `{ "error": "invalid_transition" }` — 当前状态不允许完成

### 3.6 用户评价

#### POST /api/tickets/:id/evaluation

- 授权: submitter（仅自己的工单，且 status=completed）
- 请求: `{ "rating": 1|2|3|4|5, "comment": string|null }`
- 响应 201: `{ "id": string, "ticketId": string, "rating": number, "comment": string|null, "createdAt": string }`
- 响应 400: `{ "error": "already_evaluated" }` — 一个工单只能评价一次

#### GET /api/tickets/:id/evaluation

- 授权: 已登录
- 响应 200: `{ "id": string, "ticketId": string, "rating": number, "comment": string|null, "createdAt": string }`
- 响应 404: `{ "error": "not_evaluated" }`

### 3.7 提交人信息

#### GET /api/users/:id/profile

- 授权: handler, admin（处理工单时查看提交人信息）
- 响应 200: `{ "id": string, "name": string, "email": string, "companyName": string, "departmentName": string|null, "ticketHistory": [{ "id": string, "subject": string, "status": string, "createdAt": string }] }`
- 响应 403: `{ "error": "company_isolation" }`

### 3.8 业务组管理

#### GET /api/business-groups

- 授权: 已登录
- 查询参数: `companyId` (可选，admin 可指定)
- 响应 200: `{ "items": [{ "id": string, "name": string, "companyId": string, "memberCount": number, "createdAt": string }] }`

#### POST /api/business-groups

- 授权: admin
- 请求: `{ "name": string }`
- 响应 201: `{ "id": string, "name": string, "companyId": string, "createdAt": string }`

#### POST /api/business-groups/:id/members

- 授权: admin
- 请求: `{ "userId": string }`
- 响应 201: `{ "id": string, "groupId": string, "userId": string, "createdAt": string }`
- 响应 400: `{ "error": "already_member" }`

#### DELETE /api/business-groups/:id/members/:userId

- 授权: admin
- 响应 200: `{ "ok": true }`

### 3.9 分配规则

#### GET /api/assignment-rules

- 授权: admin
- 响应 200: `{ "items": [{ "id": string, "companyId": string, "category": string, "targetGroupId": string, "targetGroupName": string, "createdAt": string }] }`

#### POST /api/assignment-rules

- 授权: admin
- 请求: `{ "category": string, "targetGroupId": string }`
- 响应 201: `{ "id": string, "companyId": string, "category": string, "targetGroupId": string, "createdAt": string }`
- 响应 400: `{ "error": "duplicate_rule" }` — 同一公司同一分类已有规则

#### DELETE /api/assignment-rules/:id

- 授权: admin
- 响应 200: `{ "ok": true }`

### 3.10 统计分析

#### GET /api/statistics/overview

- 授权: handler, admin
- 查询参数: `companyId` (可选，admin 可指定)
- 响应 200: `{ "totalTickets": number, "pendingTickets": number, "completedTickets": number, "cancelledTickets": number, "avgResponseTimeHours": number|null, "avgSatisfaction": number|null, "hotCategories": [{ "category": string, "count": number }] }`
- avgResponseTimeHours: 从工单创建到首次回复的平均小时数
- avgSatisfaction: 已评价工单的平均评分（1-5）
- hotCategories: 工单量最多的前 5 个分类

#### GET /api/statistics/distribution

- 授权: handler, admin
- 查询参数: `dimension=company|department`、`companyId` (可选)
- 响应 200: `{ "dimension": string, "items": [{ "key": string, "label": string, "count": number }] }`

### 3.11 操作日志

#### GET /api/tickets/:id/logs

- 授权: 已登录（对工单有访问权限）
- 响应 200: `{ "items": [{ "id": string, "action": string, "operatorId": string, "operatorName": string, "createdAt": string, "details": string }] }`
- action 枚举: ticket_created, ticket_assigned, ticket_transferred, ticket_processed, ticket_completed, ticket_cancelled

## 4. 共享类型

### Ticket

```json
{
  "id": "string",
  "subject": "string",
  "description": "string",
  "category": "string",
  "priority": "P0|P1|P2|P3|P4",
  "status": "created|pending_assignment|pending_processing|completed|cancelled",
  "submitterId": "string",
  "submitterName": "string",
  "submitterEmail": "string",
  "assignedGroupId": "string|null",
  "handlerId": "string|null",
  "companyId": "string",
  "createdAt": "string (ISO 8601)",
  "completedAt": "string|null",
  "cancelledAt": "string|null"
}
```

### TicketDetail

```json
{
  ...Ticket,
  "replies": [{
    "id": "string",
    "replierId": "string",
    "replierName": "string",
    "content": "string",
    "createdAt": "string"
  }],
  "evaluation": {
    "id": "string",
    "rating": "number",
    "comment": "string|null",
    "createdAt": "string"
  } | null,
  "recentLogs": [{
    "id": "string",
    "action": "string",
    "operatorName": "string",
    "createdAt": "string"
  }]
}
```

## 5. 错误响应格式

所有错误响应使用平台基线统一格式 `{error:{code,message}}`（见 `platform-baseline.json` 的 `apiError.shape`）:

```json
{
  "error": {
    "code": "<error_code>",
    "message": "人类可读错误描述",
    "details": ["可选字段，验证错误详情"]
  }
}
```

| HTTP 状态 | error code | 说明 |
|---|---|---|
| 400 | validation_error | 请求参数校验失败 |
| 400 | invalid_transition | 工单状态流转不合法 |
| 400 | already_evaluated | 工单已评价 |
| 400 | already_member | 用户已是业务组成员 |
| 400 | duplicate_rule | 分配规则已存在 |
| 400 | invalid_target_group | 目标业务组无效 |
| 401 | invalid_credentials | 登录凭据无效 |
| 401 | unauthorized | 未登录或 token 过期 |
| 403 | company_isolation | 跨公司访问被拒绝 |
| 403 | forbidden | 角色权限不足 |
| 404 | not_found | 资源不存在 |
| 404 | not_evaluated | 工单尚未被评价 |
| 500 | internal_error | 服务端内部错误 |
