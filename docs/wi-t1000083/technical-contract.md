# 技术契约

> WorkItem: wi-t1000083 · 配套 `architecture-baseline.md`
> 本文件是 API 字段级细节的唯一来源。

## ID 类型对照表

| 实体 ID | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---|---|---|---|---|---|---|
| ticketId | 服务端 randomUUID() | TEXT PK | TEXT FK | string | string | 无转换 |
| companyId | 服务端 randomUUID() | TEXT PK | TEXT FK | string | string | 无转换 |
| departmentId | 服务端 randomUUID() | TEXT PK | TEXT FK | string | string | 无转换 |
| businessGroupId | 服务端 randomUUID() | TEXT PK | TEXT FK | string | string | 无转换 |
| userId | 服务端 randomUUID() (UserKit) | TEXT PK | TEXT FK | string | string | 无转换 |
| ticketReplyId | 服务端 randomUUID() | TEXT PK | TEXT FK | string | string | 无转换 |
| ticketTransferId | 服务端 randomUUID() | TEXT PK | — | string | string | 无转换 |
| ticketEvaluationId | 服务端 randomUUID() | TEXT PK | — | string | string | 无转换 |
| categoryRuleId | 服务端 randomUUID() | TEXT PK | — | string | string | 无转换 |
| auditEventId | AuditKit randomUUID() | TEXT PK | — | string | string | 无转换 |

> 所有 ID 在数据库、API 和前端统一使用 UUID v4 字符串（TEXT），无类型转换。

## 统一约定

### 错误响应

所有 API 错误返回统一格式：

```json
{ "error": { "code": "ERROR_CODE", "message": "人类可读描述" } }
```

常见错误码：

| HTTP 状态 | code | 含义 |
|---|---|---|
| 400 | INVALID_INPUT | 请求参数校验失败 |
| 401 | AUTH_FAILED | 未认证或 Token 失效 |
| 403 | AUTHZ_FAILED | 无权限或公司隔离拒绝 |
| 404 | NOT_FOUND | 资源不存在 |
| 409 | CONFLICT | 状态冲突（如终态工单不可变更） |

### 认证

除 `/api/auth/*` 公开路由外，所有路由需要 `Authorization: Bearer <token>` 头。认证中间件解析后注入 `currentUser: { id, name, email, phone, companyId, roles, passwordChangeRequired }`。

### 公司隔离

所有工单相关查询自动附加 `WHERE company_id = currentUser.companyId`。跨公司访问返回 404（不暴露存在性）。

---

## API 接口定义

### 1. 认证（脚手架已有，保留）

#### POST /api/auth/login

- 用途：用户登录
- 请求体：`{ email: string, password: string }`
- 响应 200：`{ token: string, user: { id, name, email, phone, companyId, roles, passwordChangeRequired } }`
- 响应 401：`{ error: { code: "AUTH_FAILED", message: string } }`

#### GET /api/auth/me

- 用途：获取当前用户信息
- 授权：Bearer
- 响应 200：`{ id, name, email, phone, companyId, roles, passwordChangeRequired }`

---

### 2. 工单管理

#### GET /api/tickets

- 用途：查询工单列表
- 授权：Bearer（任意已登录用户，按公司隔离）
- 查询参数：

| 参数 | 类型 | 可空 | 说明 |
|---|---|---|---|
| status | string | 是 | 筛选状态：created, pending_assignment, pending_processing, completed, cancelled |
| category | string | 是 | 筛选分类 |
| slaPriority | string | 是 | 筛选 SLA 优先级 P0-P4 |
| search | string | 是 | 按主题模糊搜索 |
| sort | string | 是 | 排序字段：created_at（默认）, sla_priority |
| order | string | 是 | asc / desc（默认 desc） |
| limit | number | 是 | 每页数量，默认 20，最大 100 |
| offset | number | 是 | 偏移量，默认 0 |

- 响应 200：`{ tickets: Ticket[], total: number }`
- Ticket 结构：`{ id, companyId, subject, description, category, slaPriority, status, submitterId, submitterName, assignedGroupId, assigneeId, handlerId, createdAt, handledAt, completedAt, cancelledAt, cancelledBy }`

#### POST /api/tickets

- 用途：创建工单
- 授权：Bearer（需 ticket.create 权限）
- 请求体：

| 字段 | 类型 | 可空 | 校验 |
|---|---|---|---|
| subject | string | 否 | 1-200 字符 |
| description | string | 否 | 1-5000 字符 |
| category | string | 否 | 非空 |
| slaPriority | string | 是 | P0-P4，默认 P3 |

- 响应 201：`{ ticket: Ticket }`
- 行为：创建后立即查找当前公司的分类分配规则；匹配则自动分配到业务组，状态设为 `pending_processing`；无匹配则保持 `pending_assignment`。通过 AuditKit 记录 `ticket.created` 和 `ticket.assigned`（如自动分配）事件。
- 幂等性：非幂等，每次创建生成新工单。

#### GET /api/tickets/:id

- 用途：获取工单详情（含回复列表）
- 授权：Bearer（按公司隔离）
- 响应 200：`{ ticket: Ticket, replies: TicketReply[] }`
- TicketReply 结构：`{ id, ticketId, replierId, replierName, content, repliedAt }`
- 响应 404：工单不存在或不属于当前公司

#### PATCH /api/tickets/:id

- 用途：更新工单（仅 SLA 优先级可更新，且仅非终态工单）
- 授权：Bearer（需 ticket.assign 权限或处理人）
- 请求体：`{ slaPriority?: string }`
- 响应 200：`{ ticket: Ticket }`
- 响应 409：终态工单不可更新

---

### 3. 工单回复

#### POST /api/tickets/:id/replies

- 用途：添加回复
- 授权：Bearer（需 ticket.reply 权限，且工单非终态）
- 请求体：

| 字段 | 类型 | 可空 | 校验 |
|---|---|---|---|
| content | string | 否 | 1-5000 字符 |

- 响应 201：`{ reply: TicketReply }`
- 响应 409：终态工单不可回复
- 行为：通过 AuditKit 记录 `ticket.replied` 事件。

---

### 4. 工单操作

#### POST /api/tickets/:id/assign

- 用途：手动分配工单到业务组
- 授权：Bearer（需 ticket.assign 权限）
- 请求体：

| 字段 | 类型 | 可空 | 校验 |
|---|---|---|---|
| businessGroupId | string | 否 | 必须属于当前公司 |
| assigneeId | string | 是 | 可选指定处理人 |

- 响应 200：`{ ticket: Ticket }`
- 响应 409：工单状态不是 `pending_assignment`
- 行为：更新 `assigned_group_id`、`assignee_id`，状态设为 `pending_processing`。记录 `ticket.assigned` 事件。

#### POST /api/tickets/:id/transfer

- 用途：转派工单
- 授权：Bearer（需 ticket.transfer 权限）
- 请求体：

| 字段 | 类型 | 可空 | 校验 |
|---|---|---|---|
| toGroupId | string | 否 | 目标业务组，必须属于当前公司 |
| toAssigneeId | string | 是 | 可选指定处理人 |
| reason | string | 是 | 转派原因 |

- 响应 200：`{ ticket: Ticket, transfer: TicketTransfer }`
- TicketTransfer 结构：`{ id, ticketId, fromGroupId, fromAssigneeId, toGroupId, toAssigneeId, transferredBy, transferredAt, reason }`
- 响应 409：工单非 `pending_processing` 状态
- 行为：记录转派历史到 `ticket_transfers`，更新工单 `assigned_group_id` 和 `assignee_id`。状态保持 `pending_processing`。记录 `ticket.transferred` 事件。

#### POST /api/tickets/:id/complete

- 用途：完成工单
- 授权：Bearer（需 ticket.complete 权限）
- 请求体：`{ resolution?: string }`（可选处理说明）
- 响应 200：`{ ticket: Ticket }`
- 响应 409：工单非 `pending_processing` 状态
- 行为：设置 `handler_id` = currentUser.id，`handled_at` = now，`completed_at` = now，状态设为 `completed`。通过 EmailKit 发送完成通知邮件到提交人邮箱。记录 `ticket.completed` 和 `email.sent` 事件。邮件发送失败记录日志但不回滚工单完成。

#### POST /api/tickets/:id/cancel

- 用途：取消工单
- 授权：Bearer（需 ticket.cancel 权限，提交人或处理人）
- 请求体：`{ reason?: string }`
- 响应 200：`{ ticket: Ticket }`
- 响应 409：工单已为终态（completed 或 cancelled）
- 行为：设置 `cancelled_at` = now，`cancelled_by` = currentUser.id，状态设为 `cancelled`。记录 `ticket.cancelled` 事件。

---

### 5. 工单评价

#### POST /api/tickets/:id/evaluation

- 用途：提交满意度评价
- 授权：Bearer（需 ticket.evaluate 权限，且 currentUser 为工单提交人）
- 请求体：

| 字段 | 类型 | 可空 | 校验 |
|---|---|---|---|
| rating | number | 否 | 1-5 整数 |
| comment | string | 是 | 最多 1000 字符 |

- 响应 201：`{ evaluation: { id, ticketId, submitterId, rating, comment, evaluatedAt } }`
- 响应 409：工单非 `completed` 状态，或已评价
- 行为：记录到 `ticket_evaluations`，每张工单仅允许一次评价（UNIQUE 约束）。

---

### 6. 提交人信息

#### GET /api/tickets/:id/submitter-info

- 用途：查看提交人完整信息（含历史工单）
- 授权：Bearer（需 ticket.reply 或 ticket.complete 权限，即处理人）
- 响应 200：

```json
{
  "submitter": {
    "id": "string",
    "name": "string",
    "email": "string",
    "phone": "string",
    "companyId": "string",
    "companyName": "string",
    "departmentId": "string",
    "departmentName": "string"
  },
  "historyTickets": [
    { "id": "string", "subject": "string", "status": "string", "category": "string", "createdAt": "string" }
  ]
}
```

- 响应 404：工单不存在或不属于当前公司

---

### 7. 业务组管理

#### GET /api/business-groups

- 用途：查询当前公司的业务组列表
- 授权：Bearer（任意已登录用户）
- 查询参数：无（自动按公司隔离）
- 响应 200：`{ groups: BusinessGroup[] }`
- BusinessGroup 结构：`{ id, companyId, name, createdAt, members: { userId, userName, userEmail }[] }`

#### POST /api/business-groups

- 用途：创建业务组
- 授权：Bearer（需 ticket.manage_groups 权限）
- 请求体：`{ name: string }`（1-100 字符）
- 响应 201：`{ group: BusinessGroup }`

#### POST /api/business-groups/:id/members

- 用途：添加业务组成员
- 授权：Bearer（需 ticket.manage_groups 权限）
- 请求体：`{ userId: string }`
- 响应 201：`{ ok: true }`
- 响应 409：成员已存在

#### DELETE /api/business-groups/:id/members/:userId

- 用途：移除业务组成员
- 授权：Bearer（需 ticket.manage_groups 权限）
- 响应 200：`{ ok: true }`

---

### 8. 分类分配规则

#### GET /api/category-rules

- 用途：查询当前公司的分类分配规则
- 授权：Bearer（任意已登录用户）
- 响应 200：`{ rules: CategoryRule[] }`
- CategoryRule 结构：`{ id, companyId, category, businessGroupId, businessGroupName, createdAt }`

#### POST /api/category-rules

- 用途：创建分类分配规则
- 授权：Bearer（需 ticket.manage_rules 权限）
- 请求体：

| 字段 | 类型 | 可空 | 校验 |
|---|---|---|---|
| category | string | 否 | 非空 |
| businessGroupId | string | 否 | 必须属于当前公司 |

- 响应 201：`{ rule: CategoryRule }`
- 响应 409：同分类规则已存在（UNIQUE(company_id, category)）

#### DELETE /api/category-rules/:id

- 用途：删除分类分配规则
- 授权：Bearer（需 ticket.manage_rules 权限）
- 响应 200：`{ ok: true }`

---

### 9. 工单工作台

#### GET /api/workbench

- 用途：获取当前用户待处理工单列表
- 授权：Bearer（需 ticket.view_workbench 权限）
- 查询参数：

| 参数 | 类型 | 可空 | 说明 |
|---|---|---|---|
| companyId | string | 是 | 按公司筛选（默认当前用户公司） |
| status | string | 是 | 默认 pending_processing |
| category | string | 是 | 按分类筛选 |
| search | string | 是 | 按主题搜索 |
| sort | string | 是 | created_at（默认）, sla_priority |
| order | string | 是 | asc / desc |
| limit | number | 是 | 默认 20，最大 100 |
| offset | number | 是 | 默认 0 |

- 响应 200：`{ tickets: Ticket[], total: number }`

---

### 10. 统计分析

#### GET /api/statistics

- 用途：获取统计分析数据
- 授权：Bearer（需 ticket.view_statistics 权限）
- 查询参数：`{ dimension?: string }`（company / department，默认 company）
- 响应 200：

```json
{
  "distribution": [
    { "label": "string", "total": 0, "pending": 0, "completed": 0, "cancelled": 0 }
  ],
  "metrics": {
    "totalTickets": 0,
    "avgResponseTimeMinutes": 0,
    "satisfactionScore": 0,
    "hotspotCategories": [
      { "category": "string", "count": 0 }
    ]
  }
}
```

- `avgResponseTimeMinutes`：平均处理时间（completed_at - created_at 的分钟均值）
- `satisfactionScore`：平均满意度评分（1-5）
- `hotspotCategories`：按分类聚合的工单量 TOP 5

---

### 11. 操作日志

#### GET /api/tickets/:id/logs

- 用途：查询工单操作日志
- 授权：Bearer（按公司隔离）
- 响应 200：`{ logs: AuditEvent[] }`
- AuditEvent 结构：`{ id, occurredAt, eventType, actorUserId, actorName, method, route, statusCode, metadataJson }`
- 行为：查询 `audit_events` 表中 `metadata_json` 包含该 ticketId 的事件，按 `occurred_at` 降序排列。

---

## 前端页面与路由

| 路由 | 页面 | 展示模板 | 说明 |
|---|---|---|---|
| /login | 登录页 | 独立页 | 邮箱+密码登录 |
| / | 工作台 | split-master-detail | 待处理工单列表+筛选+搜索+排序 |
| /tickets/:id | 工单详情 | 独立详情页 | 工单信息+回复时间线+提交人信息+操作日志+评价 |
| /tickets/new | 创建工单 | 表单页 | 主题+描述+分类+SLA优先级 |
| /groups | 业务组管理 | 列表+抽屉 | 业务组列表+成员管理 |
| /category-rules | 分类规则 | 列表+表单 | 分配规则配置 |
| /statistics | 统计仪表盘 | command-center-dashboard | 分布统计+运营指标 |
| /admin/users | 用户管理 | 列表+表单 | 脚手架已有 |

> 工作台为默认首页，采用 `split-master-detail`：左侧工单列表，右侧选中工单的快速详情；点击工单可进入完整详情页。统计仪表盘采用 KPI 卡片 + 趋势图 + 明细表格布局。
