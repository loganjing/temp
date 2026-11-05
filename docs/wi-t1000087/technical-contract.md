# 工单系统技术契约

> Work Item: wi-t1000087 · 应用名称: ticket-system

## 1. ID 对照表

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|------|--------|--------------|---------|--------------|---------|-------------|
| Company | 服务端 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| User Profile | 服务端 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| userkit User | userkit | TEXT | TEXT | string | string | userkit 内部生成 |
| Business Group | 服务端 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| Category | 服务端 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| Assignment Rule | 服务端 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| Ticket | 服务端 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| Ticket Reply | 服务端 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| Ticket Transfer | 服务端 | TEXT (UUID) | TEXT | string | string | 无需转换 |
| Ticket Evaluation | 服务端 | TEXT (UUID) | TEXT | string | string | 无需转换 |

所有领域实体使用 TEXT 类型 UUID（v4）作为主键，生成于服务端，API JSON 与前端均使用 string 类型，无需类型转换。

## 2. 通用响应格式

### 成功响应

```json
{ "data": <结果> }
```

### 错误响应

```json
{ "error": { "code": "<错误码>", "message": "<描述>" } }
```

### HTTP 状态码

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 状态冲突（如非法状态转换） |
| 500 | 服务端错误 |

## 3. 认证接口

### POST /api/auth/login

登录并获取 Bearer Token。

**请求**：
```json
{ "username": "string", "password": "string" }
```

**响应 200**：
```json
{ "data": { "token": "string", "user": { "id": "string", "username": "string", "profile": { "name": "string", "email": "string", "companyId": "string", "department": "string|null" } } } }
```

### GET /api/auth/me

获取当前登录用户信息。

**响应 200**：同 login 中的 `user` 对象。

## 4. 用户接口

### GET /api/users

列出当前公司内用户。需 handler 或 admin 角色。

**查询参数**：`page` (number, default 1), `pageSize` (number, default 20)

**响应 200**：
```json
{ "data": { "items": [{ "id": "string", "name": "string", "email": "string", "department": "string|null" }], "total": "number" } }
```

### GET /api/users/:id

获取用户档案，含公司、部门。需 handler 或 admin 角色，且目标用户须在同一公司。

**响应 200**：
```json
{ "data": { "id": "string", "name": "string", "email": "string", "companyId": "string", "companyName": "string", "department": "string|null" } }
```

### GET /api/users/:id/tickets

获取用户历史工单列表。需 handler 或 admin 角色，且目标用户须在同一公司。

**查询参数**：`page`, `pageSize`

**响应 200**：
```json
{ "data": { "items": [{ "id": "string", "subject": "string", "status": "string", "slaPriority": "string", "createdAt": "string" }], "total": "number" } }
```

### POST /api/users

创建用户并绑定公司档案。需 admin 角色。

**请求**：
```json
{ "username": "string", "password": "string", "name": "string", "email": "string", "department": "string|null" }
```

**响应 201**：
```json
{ "data": { "id": "string", "username": "string", "name": "string", "email": "string", "companyId": "string", "department": "string|null" } }
```

## 5. 公司接口

### GET /api/companies

列出公司。需 admin 角色。

**响应 200**：
```json
{ "data": [{ "id": "string", "name": "string", "createdAt": "string" }] }
```

### POST /api/companies

创建公司。需 admin 角色。

**请求**：
```json
{ "name": "string" }
```

**响应 201**：
```json
{ "data": { "id": "string", "name": "string", "createdAt": "string" } }
```

## 6. 业务组接口

### GET /api/companies/:companyId/groups

列出指定公司的业务组。

**响应 200**：
```json
{ "data": [{ "id": "string", "name": "string", "memberCount": "number", "createdAt": "string" }] }
```

### POST /api/companies/:companyId/groups

创建业务组。需 admin 角色。

**请求**：
```json
{ "name": "string" }
```

**响应 201**：
```json
{ "data": { "id": "string", "companyId": "string", "name": "string", "createdAt": "string" } }
```

### POST /api/groups/:groupId/members

添加业务组成员。需 admin 角色。

**请求**：
```json
{ "userId": "string" }
```

**响应 201**：
```json
{ "data": { "id": "string", "groupId": "string", "userId": "string", "createdAt": "string" } }
```

### DELETE /api/groups/:groupId/members/:userId

移除业务组成员。需 admin 角色。

**响应 200**：
```json
{ "data": { "removed": true } }
```

## 7. 分类接口

### GET /api/companies/:companyId/categories

列出指定公司的分类。

**响应 200**：
```json
{ "data": [{ "id": "string", "name": "string", "createdAt": "string" }] }
```

### POST /api/companies/:companyId/categories

创建分类。需 admin 角色。

**请求**：
```json
{ "name": "string" }
```

**响应 201**：
```json
{ "data": { "id": "string", "companyId": "string", "name": "string", "createdAt": "string" } }
```

## 8. 分配规则接口

### GET /api/companies/:companyId/assignment-rules

列出指定公司的分配规则。

**响应 200**：
```json
{ "data": [{ "id": "string", "categoryId": "string", "categoryName": "string", "groupId": "string", "groupName": "string", "createdAt": "string" }] }
```

### POST /api/companies/:companyId/assignment-rules

创建分配规则。需 admin 角色。每个公司+分类组合仅允许一条规则。

**请求**：
```json
{ "categoryId": "string", "groupId": "string" }
```

**响应 201**：
```json
{ "data": { "id": "string", "companyId": "string", "categoryId": "string", "groupId": "string", "createdAt": "string" } }
```

**错误 409**：该公司+分类已有分配规则。

## 9. 工单接口

### POST /api/tickets

创建工单。需 submitter 角色。创建后自动应用分配规则。

**请求**：
```json
{ "subject": "string", "description": "string", "categoryId": "string", "slaPriority": "P0|P1|P2|P3|P4" }
```

**响应 201**：
```json
{ "data": { "id": "string", "companyId": "string", "subject": "string", "description": "string", "categoryId": "string", "slaPriority": "string", "status": "pending_assignment", "submitterId": "string", "assignedGroupId": "string|null", "createdAt": "string" } }
```

`assignedGroupId`：若匹配到分配规则则为业务组 ID，否则为 null（等待手动分配）。

### GET /api/tickets

工单列表（工作台）。需 handler 或 admin 角色。

**查询参数**：

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `page` | number | 1 | 页码 |
| `pageSize` | number | 20 | 每页条数 |
| `companyId` | string | — | 按公司筛选（admin 可跨公司，handler 限本公司） |
| `status` | string | — | 按状态筛选 |
| `categoryId` | string | — | 按分类筛选 |
| `slaPriority` | string | — | 按优先级筛选 |
| `search` | string | — | 按主题或工单 ID 搜索 |
| `sort` | string | createdAt | 排序字段（createdAt / slaPriority） |
| `order` | string | desc | 排序方向（asc / desc） |

**响应 200**：
```json
{ "data": { "items": [{ "id": "string", "subject": "string", "status": "string", "slaPriority": "string", "categoryName": "string", "submitterName": "string", "assignedGroupName": "string|null", "createdAt": "string" }], "total": "number" } }
```

### GET /api/tickets/:id

获取工单详情。工单须属于当前用户所在公司。

**响应 200**：
```json
{ "data": { "id": "string", "companyId": "string", "subject": "string", "description": "string", "categoryId": "string", "categoryName": "string", "slaPriority": "string", "status": "string", "submitterId": "string", "submitter": { "name": "string", "email": "string", "companyName": "string", "department": "string|null" }, "assignedGroupId": "string|null", "assignedGroupName": "string|null", "assignedHandlerId": "string|null", "assignedHandlerName": "string|null", "replies": [{ "id": "string", "replierId": "string", "replierName": "string", "content": "string", "createdAt": "string" }], "evaluation": { "satisfactionScore": "number", "comment": "string|null", "createdAt": "string" } | null, "createdAt": "string", "completedAt": "string|null", "handlerId": "string|null", "handlerName": "string|null", "handlerCompletedAt": "string|null" } }
```

### POST /api/tickets/:id/replies

添加工单回复。需 submitter（自己的工单）或 handler（分配的工单）角色。

**请求**：
```json
{ "content": "string" }
```

**响应 201**：
```json
{ "data": { "id": "string", "ticketId": "string", "replierId": "string", "content": "string", "createdAt": "string" } }
```

**错误 409**：工单状态为 cancelled 或 completed。

### POST /api/tickets/:id/assign

分配处理人。handler 可为自己接单，admin 可指派任意处理人。

**请求**：
```json
{ "handlerId": "string" }
```

**响应 200**：
```json
{ "data": { "id": "string", "status": "pending_processing", "assignedHandlerId": "string" } }
```

**错误 409**：工单不在 pending_assignment 状态。

### POST /api/tickets/:id/transfer

转派工单。需 handler 角色。转派目标须在同一公司内。

**请求**：
```json
{ "toHandlerId": "string", "reason": "string|null" }
```

**响应 200**：
```json
{ "data": { "id": "string", "status": "pending_processing", "assignedHandlerId": "string" } }
```

**错误 409**：工单不在 pending_processing 状态，或目标处理人不在同一公司。

### POST /api/tickets/:id/complete

完成工单。需 handler 角色（当前分配处理人）。记录处理人、处理时间，触发邮件通知。

**响应 200**：
```json
{ "data": { "id": "string", "status": "completed", "handlerId": "string", "completedAt": "string", "handlerCompletedAt": "string", "emailSent": "boolean" } }
```

**错误 409**：工单不在 pending_processing 状态。

### POST /api/tickets/:id/cancel

取消工单。submitter 可取消自己的工单，admin 可取消任何工单。

**响应 200**：
```json
{ "data": { "id": "string", "status": "cancelled" } }
```

**错误 409**：工单已是 cancelled 或 completed。

### POST /api/tickets/:id/evaluation

提交满意度评价。需 submitter 角色（工单提交人），工单须为 completed 状态。每个工单仅允许一次评价。

**请求**：
```json
{ "satisfactionScore": 5, "comment": "string|null" }
```

`satisfactionScore`：1-5 整数。

**响应 201**：
```json
{ "data": { "id": "string", "ticketId": "string", "satisfactionScore": "number", "comment": "string|null", "createdAt": "string" } }
```

**错误 409**：工单非 completed 状态，或已有评价。

### GET /api/tickets/:id/logs

查看工单操作日志。需 handler 或 admin 角色。

**响应 200**：
```json
{ "data": [{ "id": "string", "action": "string", "actorId": "string", "actorName": "string", "detail": "object", "createdAt": "string" }] }
```

`action` 值：created, assigned, transferred, replied, completed, cancelled, evaluated。

## 10. 统计接口

### GET /api/statistics/distribution

工单分布统计。需 admin 角色。

**查询参数**：`dimension` (string, `company` | `department`)

**响应 200**：
```json
{ "data": [{ "dimension": "string", "dimensionName": "string", "ticketCount": "number", "completedCount": "number", "pendingCount": "number" }] }
```

### GET /api/statistics/dashboard

运营仪表盘指标。需 admin 角色。

**查询参数**：`companyId` (string, 可选，不传则统计当前公司)

**响应 200**：
```json
{ "data": { "totalTickets": "number", "completedTickets": "number", "pendingTickets": "number", "avgResponseHours": "number", "avgSatisfaction": "number", "hotCategories": [{ "categoryId": "string", "categoryName": "string", "ticketCount": "number" }] } }
```

- `avgResponseHours`：已完工单从 created_at 到 completed_at 的平均小时数
- `avgSatisfaction`：所有评价的平均分（1-5）
- `hotCategories`：按工单量降序排列的前 5 个分类
