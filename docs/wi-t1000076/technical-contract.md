# 技术契约

> Work Item: wi-t1000076 | 架构基线: docs/wi-t1000076/architecture-baseline.md

## 1. 实体 ID 对照表

| 实体 | 生成方 | 数据库主键类型 | 外键引用类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|------|--------|---------------|-------------|--------------|---------|-------------|
| Ticket | 应用层 (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| Company | 应用层 (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| Department | 应用层 (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| BusinessGroup | 应用层 (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| CategoryAssignmentRule | 应用层 (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| TicketReply | 应用层 (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| TicketEvaluation | 应用层 (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| User | userkit (UUID v4) | TEXT | TEXT | string | string | 无需转换 |
| AuditEvent | auditkit | TEXT | — | string | string | 无需转换 |

所有实体 ID 统一为 TEXT 类型 UUID 字符串，从数据库到 API 到前端类型一致，无需转换。

## 2. 认证接口

### POST /api/auth/login
- **用途**：用户登录，获取 Bearer token
- **请求体**：
  ```json
  { "username": "string", "password": "string" }
  ```
- **响应 200**：
  ```json
  { "token": "string", "user": { "id": "string", "username": "string", "email": "string" } }
  ```
- **错误**：401 — 用户名或密码错误

### POST /api/auth/logout
- **授权**：Bearer token
- **响应**：204 No Content

### GET /api/auth/me
- **授权**：Bearer token
- **响应 200**：
  ```json
  {
    "id": "string",
    "username": "string",
    "email": "string",
    "fullName": "string",
    "companyId": "string",
    "departmentId": "string | null"
  }
  ```

## 3. 用户接口

### GET /api/users
- **授权**：Bearer token
- **查询参数**：`companyId`（可选，按公司筛选）
- **响应 200**：
  ```json
  [{ "id": "string", "username": "string", "email": "string", "fullName": "string", "companyId": "string", "departmentId": "string | null" }]
  ```

### POST /api/users
- **授权**：Bearer token
- **请求体**：
  ```json
  { "username": "string", "email": "string", "password": "string", "fullName": "string", "companyId": "string", "departmentId": "string | null" }
  ```
- **响应 201**：同 GET /api/users 单项
- **错误**：409 — 用户名已存在

## 4. 公司与部门接口

### GET /api/companies
- **授权**：Bearer token
- **响应 200**：
  ```json
  [{ "id": "string", "name": "string", "createdAt": 1700000000000 }]
  ```

### POST /api/companies
- **授权**：Bearer token
- **请求体**：`{ "name": "string" }`
- **响应 201**：同 GET /api/companies 单项

### GET /api/companies/:companyId/departments
- **授权**：Bearer token
- **响应 200**：
  ```json
  [{ "id": "string", "companyId": "string", "name": "string", "createdAt": 1700000000000 }]
  ```

### POST /api/companies/:companyId/departments
- **授权**：Bearer token
- **请求体**：`{ "name": "string" }`
- **响应 201**：同上单项

## 5. 业务组接口

### GET /api/companies/:companyId/groups
- **授权**：Bearer token
- **响应 200**：
  ```json
  [{ "id": "string", "companyId": "string", "name": "string", "memberCount": 5, "createdAt": 1700000000000 }]
  ```

### POST /api/companies/:companyId/groups
- **授权**：Bearer token
- **请求体**：`{ "name": "string" }`
- **响应 201**：同上单项（memberCount: 0）

### GET /api/companies/:companyId/groups/:groupId/members
- **授权**：Bearer token
- **响应 200**：
  ```json
  [{ "id": "string", "groupId": "string", "userId": "string", "fullName": "string", "email": "string", "createdAt": 1700000000000 }]
  ```

### POST /api/companies/:companyId/groups/:groupId/members
- **授权**：Bearer token
- **请求体**：`{ "userId": "string" }`
- **响应 201**：同上单项
- **错误**：409 — 该用户已是成员

### DELETE /api/companies/:companyId/groups/:groupId/members/:userId
- **授权**：Bearer token
- **响应**：204 No Content

## 6. 分类分配规则接口

### GET /api/companies/:companyId/assignment-rules
- **授权**：Bearer token
- **响应 200**：
  ```json
  [{ "id": "string", "companyId": "string", "category": "string", "groupId": "string", "groupName": "string", "createdAt": 1700000000000 }]
  ```

### POST /api/companies/:companyId/assignment-rules
- **授权**：Bearer token
- **请求体**：`{ "category": "string", "groupId": "string" }`
- **响应 201**：同上单项
- **错误**：409 — 该分类已有分配规则

## 7. 工单接口

### POST /api/tickets
- **授权**：Bearer token
- **请求体**：
  ```json
  {
    "subject": "string",
    "description": "string",
    "category": "string",
    "slaPriority": "P0 | P1 | P2 | P3 | P4"
  }
  ```
- **行为**：创建工单，submitter_user_id 取自当前用户。检查当前公司是否有匹配该 category 的分配规则：匹配则状态为 `pending_process` 并关联业务组；未匹配则状态为 `pending_assign`。
- **响应 201**：
  ```json
  {
    "id": "string",
    "companyId": "string",
    "subject": "string",
    "description": "string",
    "category": "string",
    "slaPriority": "P1",
    "status": "pending_assign | pending_process",
    "submitterUserId": "string",
    "submitterName": "string",
    "assignedGroupId": "string | null",
    "assignedGroupName": "string | null",
    "assignedUserId": "string | null",
    "handlerUserId": "string | null",
    "createdAt": 1700000000000,
    "processedAt": null
  }
  ```
- **审计**：记录 `ticket.created` 事件

### GET /api/tickets
- **授权**：Bearer token
- **公司隔离**：自动按当前用户公司过滤
- **查询参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | 按状态筛选：created/pending_assign/pending_process/completed/cancelled |
| category | string | 按分类筛选 |
| slaPriority | string | 按优先级筛选 |
| companyId | string | 按公司筛选（管理员跨公司查看时使用） |
| search | string | 按主题关键词搜索（模糊匹配） |
| sort | string | 排序字段：created_at/sla_priority |
| order | string | 排序方向：asc/desc，默认 desc |
| page | number | 页码，默认 1 |
| pageSize | number | 每页条数，默认 20 |

- **响应 200**：
  ```json
  {
    "items": [/* 同 POST 响应单项 */],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
  ```

### GET /api/tickets/:id
- **授权**：Bearer token
- **公司隔离**：工单 companyId 必须与当前用户 companyId 一致，否则 404
- **响应 200**：同 POST 响应单项
- **错误**：404 — 工单不存在或不属于当前公司

### PATCH /api/tickets/:id
- **授权**：Bearer token
- **用途**：更新工单字段（分配、转派、处理、完成、取消等操作的通用入口）
- **请求体**（按操作类型传不同字段）：
  ```json
  {
    "status": "pending_process | completed | cancelled",
    "assignedGroupId": "string | null",
    "assignedUserId": "string | null"
  }
  ```
- **行为约束**：
  - 分配：将 `status` 从 `pending_assign` 改为 `pending_process`，设置 `assignedGroupId` 或 `assignedUserId`
  - 完成：将 `status` 改为 `completed`，设置 `handlerUserId`（当前用户）和 `processedAt`（当前时间），触发邮件通知
  - 取消：将 `status` 改为 `cancelled`
- **响应 200**：更新后的工单
- **审计**：根据操作记录 `ticket.assigned`/`ticket.completed`/`ticket.cancelled` 事件

### POST /api/tickets/:id/transfer
- **授权**：Bearer token
- **前置条件**：工单状态为 `pending_process`
- **请求体**：
  ```json
  { "toGroupId": "string | null", "toUserId": "string | null" }
  ```
- **行为**：更新 `assignedGroupId` 和/或 `assignedUserId`，状态保持 `pending_process`
- **响应 200**：更新后的工单
- **审计**：记录 `ticket.transferred` 事件
- **错误**：409 — 工单不在待处理状态

### POST /api/tickets/:id/replies
- **授权**：Bearer token
- **请求体**：`{ "content": "string" }`
- **响应 201**：
  ```json
  { "id": "string", "ticketId": "string", "userId": "string", "userFullName": "string", "content": "string", "createdAt": 1700000000000 }
  ```

### GET /api/tickets/:id/replies
- **授权**：Bearer token
- **响应 200**：回复数组，按 createdAt 升序排列

### GET /api/tickets/:id/submitter
- **授权**：Bearer token
- **用途**：获取提交人完整信息和历史工单
- **响应 200**：
  ```json
  {
    "user": { "id": "string", "fullName": "string", "email": "string", "companyId": "string", "companyName": "string", "departmentId": "string | null", "departmentName": "string | null" },
    "historyTickets": [{ "id": "string", "subject": "string", "status": "string", "category": "string", "createdAt": 1700000000000 }]
  }
  ```

### POST /api/tickets/:id/evaluation
- **授权**：Bearer token
- **前置条件**：工单状态为 `completed`
- **请求体**：`{ "rating": 5 }`
- **说明**：rating 为整数，具体量表范围未在需求中规定，前端实现时可采用 1-5 星级作为最小实现。
- **响应 201**：
  ```json
  { "id": "string", "ticketId": "string", "userId": "string", "rating": 5, "createdAt": 1700000000000 }
  ```
- **错误**：409 — 工单未完成或已评价

## 8. 统计分析接口

### GET /api/statistics/distribution
- **授权**：Bearer token
- **公司隔离**：默认按当前用户公司统计；支持 companyId 参数跨公司查看
- **查询参数**：`companyId`（可选）、`dimension`（company/department，默认 company）
- **响应 200**（dimension=company）：
  ```json
  [{ "dimensionKey": "string", "dimensionName": "公司A", "total": 50, "pendingProcess": 10, "completed": 35, "cancelled": 5 }]
  ```
- **响应 200**（dimension=department）：
  ```json
  [{ "dimensionKey": "string", "dimensionName": "技术部", "total": 30, "pendingProcess": 5, "completed": 20, "cancelled": 5 }]
  ```

### GET /api/statistics/dashboard
- **授权**：Bearer token
- **公司隔离**：默认按当前用户公司统计
- **查询参数**：`companyId`（可选）
- **响应 200**：
  ```json
  {
    "ticketCount": { "total": 100, "created": 5, "pendingAssign": 10, "pendingProcess": 20, "completed": 60, "cancelled": 5 },
    "avgResponseTimeMs": 3600000,
    "satisfaction": { "average": 4.2, "count": 45 },
    "hotCategories": [{ "category": "网络故障", "count": 30 }, { "category": "账号问题", "count": 15 }]
  }
  ```
- **指标计算口径**：
  - avgResponseTimeMs：所有已完成工单的 (processed_at - created_at) 平均值（毫秒）
  - satisfaction.average：所有评价的 rating 平均值
  - hotCategories：按分类分组统计工单数，降序排列，取前 10

## 9. 审计日志接口

### GET /api/audit-logs
- **授权**：Bearer token
- **查询参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| ticketId | string | 按关联工单筛选 |
| eventType | string | 按事件类型筛选 |
| page | number | 默认 1 |
| pageSize | number | 默认 20 |

- **响应 200**：
  ```json
  {
    "items": [{
      "id": "string",
      "eventType": "ticket.created",
      "actorId": "string",
      "actorName": "string",
      "targetType": "ticket",
      "targetId": "string",
      "metadata": {},
      "createdAt": 1700000000000
    }],
    "total": 50,
    "page": 1,
    "pageSize": 20
  }
  ```

## 10. 审计事件类型

| 事件类型 | 触发时机 | metadata 内容 |
|---------|---------|-------------|
| ticket.created | 工单创建 | { subject, category, slaPriority } |
| ticket.assigned | 工单分配（手动或自动） | { groupId, userId, auto: boolean } |
| ticket.transferred | 工单转派 | { fromGroupId, fromUserId, toGroupId, toUserId } |
| ticket.processed | 工单处理（中间操作） | { action: "reply" } |
| ticket.completed | 工单完成 | { handlerUserId, processedAt } |
| ticket.cancelled | 工单取消 | { reason: "string" } |

## 11. 错误响应格式

所有 API 错误返回统一格式：

```json
{ "error": { "code": "string", "message": "string" } }
```

| HTTP 状态 | code | 说明 |
|-----------|------|------|
| 400 | bad_request | 请求参数错误 |
| 401 | unauthorized | 未认证或 token 无效 |
| 404 | not_found | 资源不存在或不属于当前公司 |
| 409 | conflict | 状态冲突（如重复操作、非法状态流转） |
| 500 | internal_error | 服务端内部错误 |
