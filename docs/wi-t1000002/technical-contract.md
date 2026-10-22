# 技术契约

> 工作项：wi-t1000002 ｜ 业务任务：140-ticket ｜ 阶段：design ｜ 版本：v1.0
> 架构基线引用：`docs/wi-t1000002/architecture-baseline.md`

本文件定义前后端共同遵循的 API 契约。所有接口均为 JSON 格式，除登录/注册外均需 Bearer 认证。

## 1. 通用约定

- **认证**：除 `POST /api/auth/login` 外，所有接口需要 `Authorization: Bearer <token>` 头。
- **公司隔离**：所有业务查询自动按当前用户 `company_id` 过滤；跨公司访问返回 `403`。
- **错误格式**：`{ "error": { "code": "string", "message": "string" } }`
- **分页**：`?page=1&size=20`，响应 `{ "items": [...], "total": number, "page": number, "size": number }`
- **时间格式**：ISO 8601 字符串（UTC）
- **幂等性**：POST 创建接口非幂等；POST 状态变更接口对终态工单返回 `409`。

## 2. 认证与用户

### POST /api/auth/login
- **用途**：用户登录
- **请求**：`{ "email": "string", "password": "string" }`
- **响应** `200`：`{ "token": "string", "user": { "id": "number", "email": "string" }, "profile": { "displayName": "string", "companyId": "number|null", "departmentId": "number|null" } }`
- **错误** `401`：邮箱或密码错误

### POST /api/auth/logout
- **用途**：登出
- **响应** `200`：`{ "success": true }`

### GET /api/auth/me
- **用途**：获取当前用户信息
- **响应** `200`：`{ "user": { "id": "number", "email": "string" }, "profile": { "id": "number", "userId": "number", "displayName": "string", "email": "string", "companyId": "number|null", "departmentId": "number|null" } }`

### GET /api/users
- **用途**：用户列表（含 profile）
- **授权**：已登录用户
- **响应** `200`：`{ "items": [{ "id": "number", "email": "string", "profile": { "displayName": "string", "companyId": "number|null", "departmentId": "number|null" } }], "total": "number" }`

### POST /api/users
- **用途**：创建用户并初始化 profile
- **请求**：`{ "email": "string", "password": "string", "displayName": "string", "companyId": "number|null", "departmentId": "number|null" }`
- **响应** `201`：`{ "id": "number", "email": "string", "profile": { "displayName": "string", "companyId": "number|null", "departmentId": "number|null" } }`
- **错误** `409`：邮箱已存在

### PUT /api/users/:id
- **用途**：更新用户 profile
- **请求**：`{ "displayName"?: "string", "companyId"?: "number|null", "departmentId"?: "number|null" }`
- **响应** `200`：`{ "id": "number", "email": "string", "profile": { "displayName": "string", "companyId": "number|null", "departmentId": "number|null" } }`

## 3. 基础数据

### GET /api/companies
- **响应** `200`：`{ "items": [{ "id": "number", "name": "string" }] }`

### POST /api/companies
- **请求**：`{ "name": "string" }`
- **响应** `201`：`{ "id": "number", "name": "string" }`

### GET /api/companies/:id/departments
- **响应** `200`：`{ "items": [{ "id": "number", "name": "string" }] }`

### POST /api/companies/:id/departments
- **请求**：`{ "name": "string" }`
- **响应** `201`：`{ "id": "number", "name": "string" }`

### GET /api/categories
- **响应** `200`：`{ "items": [{ "id": "number", "name": "string" }] }`

### POST /api/categories
- **请求**：`{ "name": "string" }`
- **响应** `201`：`{ "id": "number", "name": "string" }`

## 4. 业务组与分配规则

### GET /api/business-groups?companyId=X
- **用途**：按公司获取业务组列表（含成员）
- **响应** `200`：`{ "items": [{ "id": "number", "name": "string", "companyId": "number", "members": [{ "userId": "number", "displayName": "string" }] }] }`

### POST /api/business-groups
- **请求**：`{ "companyId": "number", "name": "string" }`
- **响应** `201`：`{ "id": "number", "name": "string", "companyId": "number" }`

### POST /api/business-groups/:id/members
- **请求**：`{ "userId": "number" }`
- **响应** `201`：`{ "groupId": "number", "userId": "number" }`
- **错误** `409`：成员已存在

### DELETE /api/business-groups/:id/members/:userId
- **响应** `200`：`{ "success": true }`

### GET /api/assignment-rules?companyId=X
- **响应** `200`：`{ "items": [{ "id": "number", "companyId": "number", "categoryId": "number", "categoryName": "string", "targetGroupId": "number", "targetGroupName": "string" }] }`

### POST /api/assignment-rules
- **用途**：创建或更新分配规则（company_id + category_id 唯一，重复以最新为准）
- **请求**：`{ "companyId": "number", "categoryId": "number", "targetGroupId": "number" }`
- **响应** `200`：`{ "id": "number", "companyId": "number", "categoryId": "number", "targetGroupId": "number" }`

## 5. 工单

### POST /api/tickets
- **用途**：创建工单，触发自动分配
- **请求**：`{ "title": "string", "description": "string", "categoryId": "number", "slaPriority": "P0|P1|P2|P3|P4" }`
- **行为**：
  1. 创建工单，status 设为 `created`
  2. 流转为 `pending_assignment`
  3. 查找 `(company_id, category_id)` 匹配的分配规则
  4. 命中：设 `business_group_id`，流转至 `pending_processing`，记录分配日志
  5. 未命中：停留 `pending_assignment`
- **响应** `201`：`{ "id": "number", "title": "string", "description": "string", "categoryId": "number", "slaPriority": "string", "status": "string", "businessGroupId": "number|null", "createdAt": "string" }`

### GET /api/tickets
- **用途**：工单列表（工作台）
- **查询参数**：
  - `status` — 按状态筛选
  - `companyId` — 按公司筛选
  - `categoryId` — 按分类筛选
  - `priority` — 按 SLA 优先级筛选
  - `q` — 关键字搜索（标题/描述）
  - `sort` — 排序字段（`createdAt` | `slaPriority` | `status`）
  - `order` — `asc` | `desc`
  - `page`, `size` — 分页
- **授权**：仅返回当前用户公司范围内的工单
- **响应** `200`：`{ "items": [{ "id": "number", "title": "string", "status": "string", "slaPriority": "string", "categoryId": "number", "categoryName": "string", "companyName": "string", "businessGroupId": "number|null", "createdAt": "string" }], "total": "number", "page": "number", "size": "number" }`

### GET /api/tickets/:id
- **响应** `200`：
```json
{
  "id": "number",
  "title": "string",
  "description": "string",
  "categoryId": "number",
  "categoryName": "string",
  "slaPriority": "string",
  "companyId": "number",
  "companyName": "string",
  "submitterName": "string",
  "submitterEmail": "string",
  "submitterDepartment": "string|null",
  "businessGroupId": "number|null",
  "businessGroupName": "string|null",
  "handlerUserId": "number|null",
  "handlerName": "string|null",
  "status": "string",
  "createdAt": "string",
  "completedAt": "string|null",
  "cancelledAt": "string|null",
  "replies": [{ "id": "number", "content": "string", "replierName": "string", "createdAt": "string" }],
  "transfers": [{ "id": "number", "fromGroupName": "string|null", "toGroupName": "string|null", "transferredBy": "number", "transferredAt": "string" }],
  "rating": { "score": "number", "comment": "string|null", "ratedAt": "string" } | null
}
```
- **错误** `403`：不属于当前用户公司

### POST /api/tickets/:id/replies
- **请求**：`{ "content": "string" }`
- **行为**：记录回复人与回复时间；若为处理方首条回复，设 `first_response_at`
- **响应** `201`：`{ "id": "number", "content": "string", "replierName": "string", "createdAt": "string" }`
- **错误** `409`：工单已终态

### POST /api/tickets/:id/transfer
- **请求**：`{ "targetGroupId"?: "number", "targetUserId"?: "number" }`（至少一个）
- **行为**：变更工单归属，记录转派信息（转派人/目标/时间），不改变状态
- **响应** `200`：`{ "id": "number", "businessGroupId": "number|null", "handlerUserId": "number|null", "status": "string" }`
- **错误** `409`：工单已终态

### POST /api/tickets/:id/assign
- **用途**：手动分配业务组（无自动匹配规则时）
- **请求**：`{ "businessGroupId": "number" }`
- **行为**：设 `business_group_id`，流转 `pending_assignment` → `pending_processing`
- **响应** `200`：`{ "id": "number", "businessGroupId": "number", "status": "pending_processing" }`
- **错误** `409`：工单已终态或已分配

### POST /api/tickets/:id/complete
- **用途**：完成工单，触发邮件通知
- **行为**：
  1. 设 `handler_user_id`、`handler_name`、`completed_at`，流转至 `completed`
  2. 向 `submitter_email` 发送完成通知邮件（emailkit）
  3. 记录完成日志与邮件发送结果（auditkit）
- **响应** `200`：`{ "id": "number", "status": "completed", "handlerName": "string", "completedAt": "string" }`
- **错误** `409`：工单已终态

### POST /api/tickets/:id/cancel
- **行为**：设 `cancelled_at`，流转至 `cancelled`，记录取消日志
- **响应** `200`：`{ "id": "number", "status": "cancelled", "cancelledAt": "string" }`
- **错误** `409`：工单已终态

### GET /api/tickets/:id/submitter-info
- **用途**：处理人查看提交人完整信息
- **响应** `200`：
```json
{
  "name": "string",
  "company": "string",
  "department": "string|null",
  "historyTickets": [{ "id": "number", "title": "string", "status": "string", "createdAt": "string" }]
}
```
- **错误** `403`：不属于当前用户公司

### GET /api/tickets/:id/logs
- **用途**：查看工单操作日志
- **响应** `200`：`{ "items": [{ "id": "string", "action": "string", "operatorName": "string", "createdAt": "string", "details": "object" }] }`

## 6. 评价

### POST /api/tickets/:id/rating
- **用途**：提交满意度评价
- **请求**：`{ "score": "1|2|3|4|5", "comment"?: "string" }`
- **行为**：工单需为 `completed` 状态；每工单至多一条评价，提交后不可修改
- **响应** `201`：`{ "id": "number", "ticketId": "number", "score": "number", "comment": "string|null", "ratedAt": "string" }`
- **错误** `409`：工单非完成状态或已评价

## 7. 统计分析

### GET /api/statistics/distribution?dimension=company|department
- **用途**：按公司或部门维度统计工单分布
- **授权**：仅统计当前用户公司范围内的工单
- **响应** `200`：`{ "dimension": "string", "items": [{ "label": "string", "count": "number" }] }`

### GET /api/statistics/dashboard
- **用途**：运营仪表盘指标
- **授权**：仅统计当前用户公司范围内的数据
- **响应** `200`：
```json
{
  "totalTickets": "number",
  "avgResponseTimeMinutes": "number|null",
  "satisfactionScore": "number|null",
  "hotCategories": [{ "categoryId": "number", "categoryName": "string", "count": "number" }]
}
```
- **指标口径**：
  - `totalTickets`：当前公司工单总数
  - `avgResponseTimeMinutes`：工单创建时间到首条处理方回复时间的平均时长（分钟）
  - `satisfactionScore`：已完成工单满意度评价的平均分（1–5）
  - `hotCategories`：按分类工单量降序排列
