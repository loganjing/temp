# 技术契约

> Work Item: wi-t1000022 | 阶段: design

本文件定义前后端共同遵循的 API 契约，是字段级细节的唯一来源。

---

## 1. 实体 ID 对照表

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---|---|---|---|---|---|---|
| Company | 系统初始化 | TEXT (UUID) | — | string | string | 无转换 |
| User | userkit (服务端) | TEXT (UUID) | — | string | string | 无转换 |
| BusinessGroup | 服务端 (UUID v4) | TEXT (UUID) | TEXT | string | string | 无转换 |
| AssignmentRule | 服务端 (UUID v4) | TEXT (UUID) | TEXT | string | string | 无转换 |
| Ticket | 服务端 (UUID v4) | TEXT (UUID) | TEXT | string | string | 无转换 |
| TicketReply | 服务端 (UUID v4) | TEXT (UUID) | TEXT | string | string | 无转换 |
| TicketTransfer | 服务端 (UUID v4) | TEXT (UUID) | TEXT | string | string | 无转换 |
| TicketEvaluation | 服务端 (UUID v4) | TEXT (UUID) | TEXT | string | string | 无转换 |

所有 ID 为 UUID v4 字符串，服务端生成，全链路统一使用 string 类型，无需类型转换。

---

## 2. API 端点契约

所有端点均需 `Authorization: Bearer <token>` 头部认证（登录端点除外）。所有查询端点自动按当前用户 company_id 隔离。

### 2.1 认证

#### POST /api/auth/login

- **用途**：用户登录
- **认证**：不需要
- **请求体**：

```json
{
  "email": "string",
  "password": "string"
}
```

- **响应 200**：

```json
{
  "token": "string",
  "user": {
    "id": "string",
    "name": "string",
    "email": "string",
    "companyId": "string",
    "department": "string | null",
    "role": "string"
  }
}
```

- **错误**：401 邮箱或密码错误；400 字段缺失

#### GET /api/auth/me

- **用途**：获取当前登录用户信息
- **认证**：需要
- **响应 200**：同 login 响应中的 user 对象

---

### 2.2 工单管理

#### POST /api/tickets

- **用途**：创建工单
- **认证**：需要（提交人角色）
- **请求体**：

```json
{
  "subject": "string",
  "description": "string",
  "category": "string",
  "priority": "P0" | "P1" | "P2" | "P3" | "P4"
}
```

- **响应 201**：

```json
{
  "id": "string",
  "companyId": "string",
  "subject": "string",
  "description": "string",
  "category": "string",
  "priority": "string",
  "status": "pending_assign",
  "submitterId": "string",
  "businessGroupId": "string | null",
  "handlerId": "string | null",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)",
  "handledAt": "string | null",
  "completedAt": "string | null"
}
```

- **行为**：创建后 status 为 pending_assign，系统自动匹配分配规则；匹配成功则分配业务组并流转至 pending_handle
- **错误**：400 字段校验失败；401 未认证

#### GET /api/tickets

- **用途**：查询工单列表
- **认证**：需要
- **查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | string | 否 | 按状态筛选 |
| priority | string | 否 | 按优先级筛选 |
| category | string | 否 | 按分类筛选 |
| companyId | string | 否 | 按公司筛选（管理员可跨公司） |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页条数，默认 20 |

- **响应 200**：

```json
{
  "items": [Ticket],
  "total": "number",
  "page": "number",
  "pageSize": "number"
}
```

#### GET /api/tickets/:id

- **用途**：查询工单详情（含回复列表）
- **认证**：需要
- **响应 200**：

```json
{
  "id": "string",
  "companyId": "string",
  "subject": "string",
  "description": "string",
  "category": "string",
  "priority": "string",
  "status": "string",
  "submitterId": "string",
  "businessGroupId": "string | null",
  "handlerId": "string | null",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)",
  "handledAt": "string | null",
  "completedAt": "string | null",
  "replies": [
    {
      "id": "string",
      "replierId": "string",
      "replierName": "string",
      "content": "string",
      "createdAt": "string (ISO 8601)"
    }
  ]
}
```

- **错误**：404 工单不存在；403 非同公司工单（公司隔离）

#### PATCH /api/tickets/:id

- **用途**：更新工单（状态流转：取消）
- **认证**：需要（提交人或处理人）
- **请求体**：

```json
{
  "status": "cancelled"
}
```

- **响应 200**：返回更新后的 Ticket 对象
- **错误**：400 非法状态转换；404 工单不存在；403 无权限

#### POST /api/tickets/:id/replies

- **用途**：添加工单回复
- **认证**：需要（提交人或处理人）
- **请求体**：

```json
{
  "content": "string"
}
```

- **响应 201**：

```json
{
  "id": "string",
  "ticketId": "string",
  "replierId": "string",
  "replierName": "string",
  "content": "string",
  "createdAt": "string (ISO 8601)"
}
```

- **错误**：400 内容为空；404 工单不存在；403 非同公司工单

---

### 2.3 工单分配

#### POST /api/business-groups

- **用途**：创建业务组
- **认证**：需要（管理员角色）
- **请求体**：

```json
{
  "name": "string"
}
```

- **响应 201**：

```json
{
  "id": "string",
  "companyId": "string",
  "name": "string",
  "members": [],
  "createdAt": "string (ISO 8601)"
}
```

#### GET /api/business-groups

- **用途**：查询当前公司下的业务组列表
- **认证**：需要
- **响应 200**：

```json
{
  "items": [
    {
      "id": "string",
      "companyId": "string",
      "name": "string",
      "members": [
        { "id": "string", "name": "string", "email": "string" }
      ],
      "createdAt": "string (ISO 8601)"
    }
  ]
}
```

#### PUT /api/business-groups/:id/members

- **用途**：设置业务组成员
- **认证**：需要（管理员角色）
- **请求体**：

```json
{
  "memberIds": ["string"]
}
```

- **响应 200**：返回更新后的业务组对象（含成员列表）
- **错误**：404 业务组不存在；403 非同公司业务组

#### POST /api/assignment-rules

- **用途**：创建分类分配规则
- **认证**：需要（管理员角色）
- **请求体**：

```json
{
  "category": "string",
  "businessGroupId": "string"
}
```

- **响应 201**：

```json
{
  "id": "string",
  "companyId": "string",
  "category": "string",
  "businessGroupId": "string",
  "createdAt": "string (ISO 8601)"
}
```

#### GET /api/assignment-rules

- **用途**：查询当前公司分配规则列表
- **认证**：需要
- **响应 200**：

```json
{
  "items": [AssignmentRule]
}
```

---

### 2.4 工单协作

#### POST /api/tickets/:id/transfer

- **用途**：转派工单
- **认证**：需要（处理人角色）
- **请求体**：

```json
{
  "toHandlerId": "string",
  "reason": "string"
}
```

- **响应 200**：返回更新后的 Ticket 对象（handlerId 变更为 toHandlerId）
- **行为**：记录转派历史到 ticket_transfers 表，更新 tickets.handler_id
- **错误**：400 目标处理人为空；404 工单不存在；403 无转派权限

---

### 2.5 工单处理

#### GET /api/tickets/:id/submitter

- **用途**：获取提交人完整信息（处理工单时查看）
- **认证**：需要（处理人角色）
- **响应 200**：

```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "companyId": "string",
  "companyName": "string",
  "department": "string | null",
  "historyTickets": [
    {
      "id": "string",
      "subject": "string",
      "status": "string",
      "priority": "string",
      "createdAt": "string (ISO 8601)"
    }
  ]
}
```

- **错误**：404 工单不存在；403 无权限

#### POST /api/tickets/:id/complete

- **用途**：标记工单完成
- **认证**：需要（处理人角色）
- **请求体**：

```json
{
  "resolution": "string"
}
```

- **响应 200**：返回更新后的 Ticket 对象（status 为 completed，记录 handlerId、handledAt、completedAt）
- **行为**：
  1. 更新工单状态为 completed，记录处理人和处理时间
  2. 调用 emailkit 发送完成通知邮件到提交人邮箱
  3. 邮件发送失败时记录错误日志，不阻塞完成流程
  4. 写入审计日志
- **错误**：400 工单非 pending_handle 状态；404 工单不存在；403 无权限

---

### 2.6 用户评价

#### POST /api/tickets/:id/evaluation

- **用途**：提交满意度评价
- **认证**：需要（提交人角色，且为工单提交人）
- **请求体**：

```json
{
  "rating": "number (1-5)",
  "comment": "string | null"
}
```

- **响应 201**：

```json
{
  "id": "string",
  "ticketId": "string",
  "rating": "number",
  "comment": "string | null",
  "createdAt": "string (ISO 8601)"
}
```

- **错误**：400 工单非 completed 状态或已评价；403 非工单提交人

#### GET /api/tickets/:id/evaluation

- **用途**：查看工单评价
- **认证**：需要
- **响应 200**：同上评价对象，无评价时返回 404

---

### 2.7 统计分析

#### GET /api/statistics/distribution

- **用途**：按公司/部门维度统计工单分布
- **认证**：需要（管理员角色可跨公司）
- **查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| dimension | "company" \| "department" | 是 | 统计维度 |
| companyId | string | 否 | 指定公司（管理员） |

- **响应 200**：

```json
{
  "dimension": "string",
  "items": [
    { "key": "string", "label": "string", "count": "number" }
  ]
}
```

#### GET /api/statistics/dashboard

- **用途**：运营指标仪表盘
- **认证**：需要（管理员角色）
- **查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| companyId | string | 否 | 指定公司筛选 |

- **响应 200**：

```json
{
  "ticketCount": "number",
  "avgResponseTime": "number (hours)",
  "satisfactionRate": "number (0-100, percentage)",
  "hotCategories": [
    { "category": "string", "count": "number" }
  ]
}
```

---

### 2.8 工单工作台

#### GET /api/workbench/tickets

- **用途**：待处理工单列表（筛选/搜索/排序/公司筛选）
- **认证**：需要
- **查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| search | string | 否 | 关键词搜索（主题/描述） |
| priority | string | 否 | 按优先级筛选 |
| category | string | 否 | 按分类筛选 |
| companyId | string | 否 | 按公司筛选（管理员） |
| sort | "created_asc" \| "created_desc" \| "priority" | 否 | 排序方式，默认 created_desc |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页条数，默认 20 |

- **响应 200**：

```json
{
  "items": [
    {
      "id": "string",
      "subject": "string",
      "category": "string",
      "priority": "string",
      "status": "string",
      "submitterName": "string",
      "handlerName": "string | null",
      "createdAt": "string (ISO 8601)"
    }
  ],
  "total": "number",
  "page": "number",
  "pageSize": "number"
}
```

---

### 2.9 操作日志

#### GET /api/tickets/:id/logs

- **用途**：查看工单操作日志
- **认证**：需要
- **响应 200**：

```json
{
  "items": [
    {
      "id": "string",
      "action": "string",
      "actorId": "string",
      "actorName": "string",
      "details": "string | null",
      "createdAt": "string (ISO 8601)"
    }
  ]
}
```

- **行为**：通过 auditkit 读取工单关联的审计事件
- **错误**：404 工单不存在；403 非同公司工单

---

## 3. 通用约定

### 3.1 状态枚举

| 工单状态 | 值 | 说明 |
|---|---|---|
| 创建 | created | 工单新建初始状态 |
| 待分配 | pending_assign | 等待分配到业务组 |
| 待处理 | pending_handle | 已分配，等待处理 |
| 完成 | completed | 处理完毕 |
| 取消 | cancelled | 已取消 |

### 3.2 优先级枚举

| 优先级 | 值 |
|---|---|
| P0 | P0 |
| P1 | P1 |
| P2 | P2 |
| P3 | P3 |
| P4 | P4 |

### 3.3 错误响应格式

```json
{
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

| HTTP 状态码 | 含义 |
|---|---|
| 400 | 请求参数校验失败 |
| 401 | 未认证或 token 失效 |
| 403 | 无权限或公司隔离拦截 |
| 404 | 资源不存在 |
| 500 | 服务端内部错误 |

### 3.4 时间格式

所有时间字段使用 ISO 8601 字符串（UTC），如 `2026-10-23T09:30:00.000Z`。

### 3.5 分页约定

列表查询统一使用 `page` 和 `pageSize` 参数，响应包含 `items`、`total`、`page`、`pageSize` 字段。
