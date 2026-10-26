# 技术契约

## 1. 实体 ID 类型对照表

| 实体 ID | 生成方 | DB 主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---|---|---|---|---|---|---|
| User ID | userkit | TEXT | TEXT | string | string | 服务端从认证上下文获取，前端不生成 |
| Company ID | 项目（工单核心） | TEXT (UUID v4) | TEXT | string | string | 应用层生成，服务端校验 |
| Department ID | 项目 | TEXT (UUID v4) | TEXT | string | string | 同上 |
| Business Group ID | 项目（分配模块） | TEXT (UUID v4) | TEXT | string | string | 同上 |
| Assignment Rule ID | 项目（分配模块） | TEXT (UUID v4) | TEXT | string | string | 同上 |
| Ticket ID | 项目（工单核心） | TEXT (UUID v4) | TEXT | string | string | 同上 |
| Reply ID | 项目（工单核心） | TEXT (UUID v4) | TEXT | string | string | 同上 |
| Transfer Record ID | 项目（协作模块） | TEXT (UUID v4) | TEXT | string | string | 同上 |
| Evaluation ID | 项目（评价模块） | TEXT (UUID v4) | TEXT | string | string | 同上 |

所有项目表主键为 TEXT (UUID v4)，应用层生成。User ID 来自 userkit，类型为 TEXT。API JSON 中所有 ID 统一为 string。前端接收和发送 ID 均为 string，无需类型转换。

## 2. 通用约定

### 2.1 认证与授权

- 所有 API 需 Bearer 认证（authkit 提供），请求头 `Authorization: Bearer <token>`
- 请求经 authkit 中间件后注入当前用户 ID（`ctx.user.id`）和角色
- 权限检查通过 permissionkit RBAC 角色判断：`submitter` / `handler` / `admin`
- **公司隔离**：所有业务查询自动按当前用户 `company_id` 过滤（从 user_profiles 获取），非同公司数据不可见

### 2.2 错误响应格式

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "描述信息"
  }
}
```

| HTTP 状态 | code | 说明 |
|---|---|---|
| 400 | INVALID_REQUEST | 请求参数校验失败 |
| 401 | UNAUTHORIZED | 未认证或认证失效 |
| 403 | FORBIDDEN | 无权限或跨公司访问 |
| 404 | NOT_FOUND | 资源不存在 |
| 409 | CONFLICT | 状态冲突（如已完成工单不可转派） |
| 500 | INTERNAL_ERROR | 服务端错误 |

### 2.3 分页约定

列表接口支持 `page`（从 1 开始）和 `limit`（默认 20，最大 100）查询参数。

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

## 3. API 接口定义

### 3.1 工单核心

#### POST /api/tickets — 创建工单

- **授权**：submitter, handler, admin
- **请求体**：
  ```json
  {
    "subject": "string (required, 1-200字符)",
    "description": "string (required)",
    "category": "string (required)",
    "priority": "string (required, P0|P1|P2|P3|P4)"
  }
  ```
- **响应** 201：
  ```json
  {
    "id": "string",
    "subject": "string",
    "description": "string",
    "category": "string",
    "priority": "string",
    "status": "created | pending_processing",
    "company_id": "string",
    "submitter_id": "string",
    "assigned_group_id": "string | null",
    "created_at": "string (ISO 8601)"
  }
  ```
- **副作用**：若 company_id + category 匹配 assignment_rule，自动分配到对应 business_group，status=pending_processing，记录 first_assigned_at，写入 auditkit 事件 ticket.assigned；否则 status=pending_assignment。始终写入 ticket.created 事件。
- **幂等性**：非幂等，每次调用创建新工单。

#### GET /api/tickets — 工单列表

- **授权**：all（公司隔离，仅返回当前用户同公司工单）
- **查询参数**：

  | 参数 | 类型 | 说明 |
  |---|---|---|
  | status | string | 按状态筛选 |
  | category | string | 按分类筛选 |
  | priority | string | 按优先级筛选 |
  | search | string | 主题/描述模糊搜索 |
  | sort | string | created_at \| priority（默认 created_at） |
  | order | string | asc \| desc（默认 desc） |
  | page | number | 页码（默认 1） |
  | limit | number | 每页数（默认 20） |
  | company_id | string | admin 可跨公司筛选 |

- **响应** 200：分页工单列表

#### GET /api/tickets/:id — 工单详情

- **授权**：all（需同公司，否则 403）
- **响应** 200：
  ```json
  {
    "id": "string",
    "subject": "string",
    "description": "string",
    "category": "string",
    "priority": "string",
    "status": "string",
    "company_id": "string",
    "submitter_id": "string",
    "assigned_group_id": "string | null",
    "assigned_handler_id": "string | null",
    "completed_at": "string | null",
    "completed_by": "string | null",
    "created_at": "string",
    "first_assigned_at": "string | null"
  }
  ```

#### PUT /api/tickets/:id — 编辑工单

- **授权**：submitter（仅自己的工单，status=created 或 pending_assignment）、admin
- **请求体**（所有字段可选）：
  ```json
  {
    "subject": "string",
    "description": "string",
    "category": "string",
    "priority": "string (P0|P1|P2|P3|P4)"
  }
  ```
- **响应** 200：更新后的工单
- **幂等性**：幂等，相同请求产生相同最终状态。

#### PATCH /api/tickets/:id/status — 状态流转

- **授权**：handler, admin（assign 操作）；handler（process/complete 操作）；admin, submitter（cancel 操作）
- **请求体**：
  ```json
  {
    "action": "assign | process | complete | cancel",
    "assigned_group_id": "string (assign 时可选)",
    "assigned_handler_id": "string (assign/process 时可选)"
  }
  ```
- **响应** 200：更新后的工单
- **错误**：409 CONFLICT — 当前状态不允许该操作
- **副作用**：对应 action 写入 auditkit 事件；complete 时设置 completed_at/completed_by 并通过 emailkit 发送邮件。

#### POST /api/tickets/:id/replies — 添加回复

- **授权**：submitter（自己的工单）、handler（同公司已分配工单）
- **请求体**：
  ```json
  {
    "content": "string (required)"
  }
  ```
- **响应** 201：
  ```json
  {
    "id": "string",
    "ticket_id": "string",
    "author_id": "string",
    "content": "string",
    "created_at": "string"
  }
  ```

#### GET /api/tickets/:id/replies — 回复列表

- **授权**：all（需同公司）
- **响应** 200：回复数组（按 created_at 升序）

#### GET /api/tickets/:id/submitter-info — 提交人完整信息

- **授权**：handler, admin
- **响应** 200：
  ```json
  {
    "display_name": "string",
    "email": "string",
    "company": { "id": "string", "name": "string" },
    "department": { "id": "string | null", "name": "string | null" },
    "history_tickets": [
      {
        "id": "string",
        "subject": "string",
        "status": "string",
        "priority": "string",
        "created_at": "string"
      }
    ]
  }
  ```
- **说明**：history_tickets 为该提交人同公司的所有工单，按 created_at 降序排列。

### 3.2 工单分配

#### POST /api/business-groups — 创建业务组

- **授权**：admin
- **请求体**：
  ```json
  {
    "company_id": "string (required)",
    "name": "string (required)"
  }
  ```
- **响应** 201：业务组对象

#### GET /api/business-groups — 业务组列表

- **授权**：handler, admin（同公司）
- **查询参数**：company_id（admin 可选）
- **响应** 200：业务组数组

#### POST /api/business-groups/:id/members — 添加成员

- **授权**：admin
- **请求体**：`{ "user_id": "string (required)" }`
- **响应** 201：成员对象
- **错误**：409 — 用户已在该业务组中

#### GET /api/business-groups/:id/members — 成员列表

- **授权**：handler, admin
- **响应** 200：成员数组

#### DELETE /api/business-groups/:id/members/:userId — 移除成员

- **授权**：admin
- **响应** 204

#### POST /api/assignment-rules — 创建分配规则

- **授权**：admin
- **请求体**：
  ```json
  {
    "company_id": "string (required)",
    "category": "string (required)",
    "business_group_id": "string (required)"
  }
  ```
- **响应** 201：规则对象
- **错误**：409 — 同公司同分类已有分配规则

#### GET /api/assignment-rules — 分配规则列表

- **授权**：admin
- **查询参数**：company_id
- **响应** 200：规则数组

#### DELETE /api/assignment-rules/:id — 删除规则

- **授权**：admin
- **响应** 204

### 3.3 工单协作

#### POST /api/tickets/:id/transfer — 转派工单

- **授权**：handler, admin
- **请求体**：
  ```json
  {
    "to_handler_id": "string (与 to_group_id 二选一)",
    "to_group_id": "string (与 to_handler_id 二选一)",
    "reason": "string (optional)"
  }
  ```
- **响应** 200：更新后的工单
- **副作用**：写入 ticket_transfers 记录，更新 tickets.assigned_handler_id/assigned_group_id，写入 auditkit 事件 ticket.transferred
- **错误**：409 — 工单非 pending_processing 状态；400 — 未提供 to_handler_id 和 to_group_id

### 3.4 工单处理

#### POST /api/tickets/:id/complete — 完成工单

- **授权**：handler
- **响应** 200：更新后的工单（含 completed_at, completed_by）
- **副作用**：设置 status=completed, completed_at=now, completed_by=当前用户；通过 emailkit 发送完成通知邮件到提交人邮箱；写入 auditkit 事件 ticket.completed
- **错误**：409 — 工单非 pending_processing 状态
- **幂等性**：非幂等，已完成工单返回 409。

#### POST /api/tickets/:id/cancel — 取消工单

- **授权**：admin, submitter（仅自己的工单）
- **请求体**：`{ "reason": "string (optional)" }`
- **响应** 200：更新后的工单
- **副作用**：设置 status=cancelled，写入 auditkit 事件 ticket.cancelled
- **错误**：409 — 工单已 completed 或 cancelled

### 3.5 用户评价

#### POST /api/tickets/:id/evaluation — 提交评价

- **授权**：submitter（仅自己的工单）
- **请求体**：
  ```json
  {
    "rating": "number (required, 1-5)",
    "comment": "string (optional)"
  }
  ```
- **响应** 201：评价对象
- **错误**：409 — 工单非 completed 状态或已评价；400 — rating 不在 1-5 范围

#### GET /api/tickets/:id/evaluation — 查看评价

- **授权**：all（需同公司）
- **响应** 200：评价对象或 null（未评价时）

### 3.6 统计分析

#### GET /api/stats/dashboard — 仪表盘指标

- **授权**：admin, handler
- **查询参数**：

  | 参数 | 类型 | 说明 |
  |---|---|---|
  | company_id | string | admin 可跨公司筛选 |
  | department_id | string | 按部门筛选 |
  | start_date | string | 起始日期 (ISO 8601) |
  | end_date | string | 截止日期 (ISO 8601) |

- **响应** 200：
  ```json
  {
    "ticket_count": "number",
    "avg_response_time_hours": "number",
    "avg_satisfaction": "number",
    "hot_topics": [
      { "category": "string", "count": "number" }
    ]
  }
  ```
- **说明**：avg_response_time_hours 为 first_assigned_at - created_at 的平均小时数（仅计已分配工单）；avg_satisfaction 为 ticket_evaluations.rating 的平均值；hot_topics 为按分类聚合的工单数量 Top 10。

#### GET /api/stats/distribution — 工单分布

- **授权**：admin
- **查询参数**：group_by（company | department，默认 company）
- **响应** 200：
  ```json
  {
    "distribution": [
      { "dimension": "string", "count": "number" }
    ]
  }
  ```

### 3.7 工单工作台

#### GET /api/workbench/tickets — 待处理工单队列

- **授权**：handler, admin
- **查询参数**：

  | 参数 | 类型 | 说明 |
  |---|---|---|
  | status | string | pending_processing \| pending_assignment（默认 pending_processing） |
  | category | string | 按分类筛选 |
  | priority | string | 按优先级筛选 |
  | search | string | 主题模糊搜索 |
  | sort | string | created_at \| priority（默认 priority） |
  | order | string | asc \| desc（默认 desc） |
  | page | number | 页码 |
  | limit | number | 每页数 |
  | company_id | string | admin 可跨公司筛选 |

- **响应** 200：分页工单列表
- **说明**：handler 仅看到分配给自己或自己所在业务组的工单；admin 可看到本公司所有待处理工单。

### 3.8 操作日志

#### GET /api/tickets/:id/logs — 工单操作日志

- **授权**：all（需同公司）
- **响应** 200：
  ```json
  {
    "data": [
      {
        "id": "string",
        "action": "string",
        "actor_id": "string",
        "created_at": "string"
      }
    ]
  }
  ```
- **说明**：按 created_at 升序排列。

#### GET /api/logs — 全局操作日志

- **授权**：admin
- **查询参数**：company_id, action, page, limit
- **响应** 200：分页审计事件列表
