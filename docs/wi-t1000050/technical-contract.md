# 技术契约

## 实体 ID 对照表

| 实体 ID | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---------|--------------|---------|--------------|---------|-------------|
| ticket_id | TEXT (UUID) | TEXT | string | string | 服务端生成 UUID，前端接收为 string |
| user_id | TEXT (userkit 管理) | TEXT | string | string | userkit 生成，业务表引用为 TEXT |
| company_id | TEXT (UUID) | TEXT | string | string | 服务端生成，注入请求上下文 |
| business_group_id | TEXT (UUID) | TEXT | string | string | 服务端生成 |
| category_id | TEXT (UUID) | TEXT | string | string | 服务端生成或预置 |
| assignment_rule_id | TEXT (UUID) | TEXT | string | string | 服务端生成 |
| reply_id | TEXT (UUID) | TEXT | string | string | 服务端生成 |
| rating_id | TEXT (UUID) | TEXT | string | string | 服务端生成 |

所有实体 ID 均为 TEXT 类型 UUID，数据库主键、外键、API JSON、前端类型一致，无需类型转换。服务端在写入时使用 UUID v4 生成 ID。

## 枚举与常量

### 工单状态 (TicketStatus)

| 值 | 说明 |
|----|------|
| `created` | 创建 |
| `pending_assignment` | 待分配 |
| `pending_processing` | 待处理 |
| `completed` | 完成 |
| `cancelled` | 取消 |

### SLA 优先级 (Priority)

| 值 | 说明 |
|----|------|
| `P0` | 最高优先级 |
| `P1` | 高 |
| `P2` | 中 |
| `P3` | 低 |
| `P4` | 最低 |

### 角色 (Role)

| 值 | 说明 |
|----|------|
| `submitter` | 提交人 |
| `admin` | 管理员 |
| `processor` | 处理人 |

### 满意度评分 (Rating)

整数 1-5，5 为最高满意度。

## API 契约

### 认证

#### POST /api/auth/login

- 授权：无（公开端点）
- 请求体：
  ```json
  { "email": "string", "password": "string" }
  ```
- 响应 200：
  ```json
  { "token": "string", "user": { "id": "string", "name": "string", "email": "string", "companyId": "string", "department": "string|null", "role": "string" } }
  ```
- 错误：401 凭据无效

#### POST /api/auth/logout

- 授权：Bearer Token
- 响应 200：`{ "ok": true }`
- 幂等：是（重复调用安全）

### 用户

#### GET /api/users/me

- 授权：Bearer Token
- 响应 200：
  ```json
  { "id": "string", "name": "string", "email": "string", "companyId": "string", "department": "string|null", "role": "string" }
  ```

### 工单

#### GET /api/tickets

- 授权：Bearer Token（任意角色）
- 查询参数：
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | page | number | 否 | 页码，默认 1 |
  | pageSize | number | 否 | 每页条数，默认 20 |
  | search | string | 否 | 按主题/工单 ID 搜索 |
  | status | string | 否 | 按状态筛选 |
  | categoryId | string | 否 | 按分类筛选 |
  | priority | string | 否 | 按 SLA 优先级筛选 |
  | companyId | string | 否 | 按公司筛选（管理员可用） |
  | sort | string | 否 | 排序方式：`created_desc`(默认) / `priority_desc` |
- 响应 200：
  ```json
  { "items": [{ "id": "string", "title": "string", "categoryId": "string", "categoryName": "string", "priority": "string", "status": "string", "submitterId": "string", "submitterName": "string", "assignedGroupId": "string|null", "assigneeId": "string|null", "createdAt": "string(ISO8601)", "processedAt": "string|null" }], "total": "number", "page": "number", "pageSize": "number" }
  ```
- 权限：提交人/处理人仅看到本公司工单；管理员可按 companyId 筛选全公司

#### POST /api/tickets

- 授权：Bearer Token（submitter 或 admin 角色）
- 请求体：
  ```json
  { "title": "string", "description": "string", "categoryId": "string", "priority": "string(P0-P4)" }
  ```
- 响应 201：
  ```json
  { "id": "string", "title": "string", "description": "string", "categoryId": "string", "priority": "string", "status": "string", "submitterId": "string", "companyId": "string", "assignedGroupId": "string|null", "createdAt": "string(ISO8601)" }
  ```
- 行为：创建后服务端查询 assignment_rules 自动分配；匹配则状态流转为 `pending_processing`，无匹配则保持 `pending_assignment`
- 审计：记录 `ticket_created` 事件

#### GET /api/tickets/:id

- 授权：Bearer Token（工单需属于同公司）
- 响应 200：
  ```json
  { "id": "string", "title": "string", "description": "string", "categoryId": "string", "categoryName": "string", "priority": "string", "status": "string", "submitterId": "string", "submitterName": "string", "companyId": "string", "assignedGroupId": "string|null", "assigneeId": "string|null", "processorId": "string|null", "processorName": "string|null", "createdAt": "string(ISO8601)", "processedAt": "string|null", "replies": [{ "id": "string", "replierId": "string", "replierName": "string", "content": "string", "createdAt": "string(ISO8601)" }], "rating": "number|null" }
  ```
- 错误：404 工单不存在；403 无权访问（跨公司）

#### POST /api/tickets/:id/replies

- 授权：Bearer Token（工单同公司的提交人/处理人/管理员）
- 请求体：
  ```json
  { "content": "string" }
  ```
- 响应 201：
  ```json
  { "id": "string", "ticketId": "string", "replierId": "string", "replierName": "string", "content": "string", "createdAt": "string(ISO8601)" }
  ```
- 错误：403 无权访问；409 工单已取消/完成

#### POST /api/tickets/:id/transfer

- 授权：Bearer Token（processor 或 admin 角色，工单同公司）
- 请求体：
  ```json
  { "targetGroupId": "string?", "targetUserId": "string?" }
  ```
  二选一：转派到业务组或转派到具体处理人
- 响应 200：
  ```json
  { "id": "string", "assignedGroupId": "string|null", "assigneeId": "string|null", "status": "pending_processing" }
  ```
- 行为：工单仍保持 `pending_processing` 状态，更新分配目标
- 审计：记录 `ticket_transferred` 事件（含转派人、目标）
- 错误：403 无权或跨公司转派；404 目标不存在

#### POST /api/tickets/:id/complete

- 授权：Bearer Token（processor 或 admin 角色，工单同公司）
- 请求体：无
- 响应 200：
  ```json
  { "id": "string", "status": "completed", "processorId": "string", "processorName": "string", "processedAt": "string(ISO8601)" }
  ```
- 行为：状态流转为 `completed`，记录处理人和处理时间；异步发送邮件通知提交人
- 审计：记录 `ticket_completed` 事件
- 错误：403 无权；409 工单状态不允许完成

#### POST /api/tickets/:id/cancel

- 授权：Bearer Token（submitter 或 admin 角色，工单同公司）
- 请求体：无
- 响应 200：
  ```json
  { "id": "string", "status": "cancelled" }
  ```
- 行为：状态流转为 `cancelled`；仅 `pending_assignment` / `pending_processing` 状态可取消
- 审计：记录 `ticket_cancelled` 事件
- 错误：403 无权；409 工单状态不允许取消

#### POST /api/tickets/:id/rating

- 授权：Bearer Token（submitter 角色，为工单提交人本人）
- 请求体：
  ```json
  { "rating": "number(1-5)" }
  ```
- 响应 201：
  ```json
  { "id": "string", "ticketId": "string", "rating": "number", "submittedAt": "string(ISO8601)" }
  ```
- 行为：满意度评价为一次性提交，提交后不可修改
- 错误：403 非提交人；409 已评价或工单未完成；400 评分超出 1-5 范围

#### GET /api/tickets/:id/submitter-info

- 授权：Bearer Token（processor 或 admin 角色，工单同公司）
- 响应 200：
  ```json
  { "name": "string", "companyName": "string", "department": "string|null", "historyTickets": [{ "id": "string", "title": "string", "status": "string", "createdAt": "string(ISO8601)" }] }
  ```
- 行为：按 submitterId 查询该提交人的历史工单，按创建时间降序，默认最近 20 条

### 业务组管理

#### GET /api/business-groups

- 授权：Bearer Token（admin 角色）
- 响应 200：
  ```json
  { "items": [{ "id": "string", "name": "string", "companyId": "string", "members": [{ "id": "string", "name": "string" }] }] }
  ```
- 权限：仅返回当前管理员公司的业务组

#### POST /api/business-groups

- 授权：Bearer Token（admin 角色）
- 请求体：
  ```json
  { "name": "string" }
  ```
- 响应 201：
  ```json
  { "id": "string", "name": "string", "companyId": "string" }
  ```

#### POST /api/business-groups/:id/members

- 授权：Bearer Token（admin 角色，业务组同公司）
- 请求体：
  ```json
  { "userId": "string" }
  ```
- 响应 201：
  ```json
  { "id": "string", "groupId": "string", "userId": "string", "userName": "string" }
  ```
- 错误：404 用户不存在；409 已为成员

#### DELETE /api/business-groups/:id/members/:userId

- 授权：Bearer Token（admin 角色，业务组同公司）
- 响应 200：`{ "ok": true }`
- 幂等：是

### 分类自动分配规则

#### GET /api/assignment-rules

- 授权：Bearer Token（admin 角色）
- 响应 200：
  ```json
  { "items": [{ "id": "string", "companyId": "string", "categoryId": "string", "categoryName": "string", "targetGroupId": "string", "targetGroupName": "string" }] }
  ```

#### POST /api/assignment-rules

- 授权：Bearer Token（admin 角色）
- 请求体：
  ```json
  { "categoryId": "string", "targetGroupId": "string" }
  ```
- 响应 201：
  ```json
  { "id": "string", "companyId": "string", "categoryId": "string", "targetGroupId": "string" }
  ```
- 错误：409 该分类已存在分配规则

#### DELETE /api/assignment-rules/:id

- 授权：Bearer Token（admin 角色，规则同公司）
- 响应 200：`{ "ok": true }`

### 统计分析

#### GET /api/statistics/dashboard

- 授权：Bearer Token（admin 角色）
- 查询参数：
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | companyId | string | 否 | 按公司筛选 |
- 响应 200：
  ```json
  { "totalTickets": "number", "avgResponseTimeHours": "number", "avgSatisfaction": "number|null", "hotCategories": [{ "categoryId": "string", "categoryName": "string", "ticketCount": "number" }] }
  ```
- 计算逻辑：
  - totalTickets：筛选范围内工单总数
  - avgResponseTimeHours：从创建到完成（processedAt - createdAt）的平均小时数，仅统计已完成工单
  - avgSatisfaction：已完成且有评价的工单的平均评分
  - hotCategories：按分类统计工单量降序，默认前 10

#### GET /api/statistics/distribution

- 授权：Bearer Token（admin 角色）
- 查询参数：
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | dimension | string | 是 | `company` 或 `department` |
  | companyId | string | 否 | 按公司筛选 |
- 响应 200：
  ```json
  { "dimension": "string", "items": [{ "key": "string", "label": "string", "ticketCount": "number" }] }
  ```
- 计算逻辑：
  - dimension=company：按 companyId 分组统计工单数
  - dimension=department：按提交人 department 分组统计工单数

### 操作日志

#### GET /api/audit-logs

- 授权：Bearer Token（admin 角色）
- 查询参数：
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | ticketId | string | 否 | 按工单 ID 筛选 |
  | eventType | string | 否 | 按操作类型筛选 |
  | page | number | 否 | 页码，默认 1 |
  | pageSize | number | 否 | 每页条数，默认 50 |
- 响应 200：
  ```json
  { "items": [{ "id": "string", "eventType": "string", "actorId": "string", "actorName": "string", "ticketId": "string", "detail": "object", "createdAt": "string(ISO8601)" }], "total": "number", "page": "number", "pageSize": "number" }
  ```
- 权限：仅返回当前管理员公司的审计事件

## 审计事件类型

| eventType | 触发接口 | 记录字段 |
|-----------|---------|---------|
| `ticket_created` | POST /api/tickets | actorId, ticketId, categoryId, priority |
| `ticket_assigned` | POST /api/tickets (自动/手动) | actorId, ticketId, targetGroupId, auto(bool) |
| `ticket_transferred` | POST /api/tickets/:id/transfer | actorId, ticketId, fromGroupId, toGroupId, targetUserId |
| `ticket_completed` | POST /api/tickets/:id/complete | actorId, ticketId, processorId |
| `ticket_cancelled` | POST /api/tickets/:id/cancel | actorId, ticketId |

## 错误响应格式

所有错误使用统一格式：

```json
{ "error": "string", "message": "string(可读)" }
```

| HTTP 状态码 | 含义 |
|-------------|------|
| 400 | 请求参数无效 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 状态冲突（如重复评价、工单状态不允许操作） |
| 500 | 服务端内部错误 |
