# 技术契约

## 1. ID 对照表

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---|---|---|---|---|---|---|
| User | UserKit（注册时生成） | TEXT | — | string | string | 后端 API 直接透传，前端 string |
| Ticket | 工单模块（创建时生成 UUID） | TEXT PK | TEXT FK | string | string | 后端生成 UUID，API 原样返回 |
| TicketReply | 工单模块（回复时生成 UUID） | TEXT PK | TEXT FK | string | string | 后端生成 UUID，API 原样返回 |
| TicketTransfer | 协作模块（转派时生成 UUID） | TEXT PK | TEXT FK | string | string | 后端生成 UUID，API 原样返回 |
| TicketEvaluation | 工单模块（评价时生成 UUID） | TEXT PK | TEXT FK | string | string | 后端生成 UUID，API 原样返回 |
| Company | 分配模块（创建时生成 UUID） | TEXT PK | TEXT FK | string | string | 后端生成 UUID，API 原样返回 |
| BusinessGroup | 分配模块（创建时生成 UUID） | TEXT PK | TEXT FK | string | string | 后端生成 UUID，API 原样返回 |
| BusinessGroupMember | 分配模块（添加时生成 UUID） | TEXT PK | TEXT FK | string | string | 后端生成 UUID，API 原样返回 |
| CategoryAssignmentRule | 分配模块（创建时生成 UUID） | TEXT PK | TEXT FK | string | string | 后端生成 UUID，API 原样返回 |

> User ID 类型由 UserKit 管理，项目表通过 TEXT 外键引用。所有 UUID 为小写连字符格式，应用层使用 `crypto.randomUUID()` 生成。

## 2. 认证接口

### POST /api/auth/login

用户密码登录，签发 Bearer token。

- 授权：无（公开）
- 请求体：

```json
{
  "email": "string (必填)",
  "password": "string (必填)"
}
```

- 响应 200：

```json
{
  "token": "string",
  "user": {
    "id": "string",
    "name": "string",
    "email": "string",
    "role": "submitter | handler | admin",
    "company": "string | null",
    "department": "string | null"
  }
}
```

- 错误：401（邮箱或密码错误）

### POST /api/auth/logout

登出当前会话，使 token 失效。

- 授权：Bearer token
- 请求体：无
- 响应：200（无 body）
- 幂等性：是

### GET /api/auth/me

获取当前登录用户信息。

- 授权：Bearer token
- 响应 200：

```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "role": "submitter | handler | admin",
  "company": "string | null",
  "department": "string | null"
}
```

- 错误：401（未登录）

### POST /api/users

管理员创建用户。

- 授权：Bearer token，角色 admin
- 请求体：

```json
{
  "name": "string (必填)",
  "email": "string (必填)",
  "password": "string (必填)",
  "role": "submitter | handler | admin (必填)",
  "company": "string (可选)",
  "department": "string (可选)"
}
```

- 响应 201：

```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "role": "string",
  "company": "string | null",
  "department": "string | null"
}
```

- 错误：400（参数缺失或邮箱重复）、403（非管理员）

## 3. 工单接口

### POST /api/tickets

提交人创建工单。

- 授权：Bearer token，角色 submitter 或 admin
- 请求体：

```json
{
  "subject": "string (必填)",
  "description": "string (必填)",
  "category": "string (必填)",
  "sla_priority": "P0 | P1 | P2 | P3 | P4 (必填)"
}
```

- 响应 201：

```json
{
  "id": "string",
  "subject": "string",
  "description": "string",
  "category": "string",
  "sla_priority": "string",
  "status": "created | pending_assign | pending_process",
  "submitter_id": "string",
  "submitter_name": "string",
  "submitter_email": "string",
  "submitter_company": "string | null",
  "submitter_department": "string | null",
  "assigned_group_id": "string | null",
  "assigned_handler_id": "string | null",
  "created_at": "string (ISO 8601)",
  "updated_at": "string (ISO 8601)"
}
```

- 业务逻辑：创建后触发自动分配查询；匹配到规则时状态为 `pending_process`，否则为 `pending_assign`。
- 错误：400（参数缺失或 sla_priority 不合法）、403（非授权角色）

### GET /api/tickets

查询工单列表，按角色过滤。

- 授权：Bearer token
- 查询参数：
  - `status`（可选）：按状态过滤
  - `category`（可选）：按分类过滤
  - `page`（可选，默认 1）、`page_size`（可选，默认 20）
- 响应 200：

```json
{
  "items": [Ticket],
  "total": "number",
  "page": "number",
  "page_size": "number"
}
```

- 过滤规则：
  - submitter：仅返回自己提交的工单
  - handler：返回分配给自己业务组的待处理工单
  - admin：返回所有工单
- 错误：401（未登录）

### GET /api/tickets/:id

查看工单详情。

- 授权：Bearer token
- 路径参数：`id`（工单 ID）
- 响应 200：

```json
{
  "id": "string",
  "subject": "string",
  "description": "string",
  "category": "string",
  "sla_priority": "string",
  "status": "string",
  "submitter_id": "string",
  "submitter_name": "string",
  "submitter_email": "string",
  "submitter_company": "string | null",
  "submitter_department": "string | null",
  "assigned_group_id": "string | null",
  "assigned_handler_id": "string | null",
  "handler_id": "string | null",
  "handler_name": "string | null",
  "processed_at": "string | null",
  "created_at": "string",
  "updated_at": "string",
  "replies": [
    {
      "id": "string",
      "user_id": "string",
      "user_name": "string",
      "content": "string",
      "created_at": "string"
    }
  ],
  "transfers": [
    {
      "id": "string",
      "from_user_name": "string",
      "to_user_name": "string | null",
      "to_group_id": "string | null",
      "reason": "string | null",
      "created_at": "string"
    }
  ],
  "evaluation": {
    "rating": "number",
    "comment": "string | null",
    "created_at": "string"
  }
}
```

- 错误：404（工单不存在）、403（无权查看）

### POST /api/tickets/:id/replies

添加回复。

- 授权：Bearer token，角色 submitter（自己的工单）或 handler（分配的工单）
- 路径参数：`id`
- 请求体：

```json
{
  "content": "string (必填)"
}
```

- 响应 201：

```json
{
  "id": "string",
  "ticket_id": "string",
  "user_id": "string",
  "user_name": "string",
  "content": "string",
  "created_at": "string"
}
```

- 错误：400（内容为空）、403（无权回复）、404（工单不存在）

### PATCH /api/tickets/:id/status

变更工单状态（取消）。

- 授权：Bearer token，角色 submitter（自己的工单，仅取消）或 admin
- 路径参数：`id`
- 请求体：

```json
{
  "status": "cancelled"
}
```

- 响应 200：返回更新后的 Ticket
- 业务逻辑：仅允许从 `created` / `pending_assign` / `pending_process` 转为 `cancelled`。
- 错误：400（非法状态转换）、403（无权操作）、404

### POST /api/tickets/:id/complete

处理人完成处理。

- 授权：Bearer token，角色 handler（分配的工单）
- 路径参数：`id`
- 请求体：无
- 响应 200：返回更新后的 Ticket（status 为 completed，含 handler_id / handler_name / processed_at）
- 业务逻辑：记录处理人、处理时间，状态从 `pending_process` 转为 `completed`。
- 错误：400（状态非 pending_process）、403（非分配处理人）、404

### POST /api/tickets/:id/transfer

处理人转派工单。

- 授权：Bearer token，角色 handler（当前分配的工单）
- 路径参数：`id`
- 请求体：

```json
{
  "to_group_id": "string (与 to_user_id 二选一)",
  "to_user_id": "string (与 to_group_id 二选一，可选)",
  "reason": "string (可选)"
}
```

- 响应 200：返回更新后的 Ticket（assigned_group_id / assigned_handler_id 变更）
- 业务逻辑：记录转派信息到 `ticket_transfers`，更新工单分配。状态保持 `pending_process`。
- 错误：400（未指定目标或目标无效）、403（非当前处理人）、404

### POST /api/tickets/:id/evaluation

提交人满意度评价。

- 授权：Bearer token，角色 submitter（自己的工单且状态为 completed）
- 路径参数：`id`
- 请求体：

```json
{
  "rating": "number (1-5，必填)",
  "comment": "string (可选)"
}
```

- 响应 201：

```json
{
  "id": "string",
  "ticket_id": "string",
  "rating": "number",
  "comment": "string | null",
  "created_at": "string"
}
```

- 错误：400（评分超出范围或工单未完成或已评价）、403（非提交人工单）、404

### GET /api/tickets/:id/submitter-info

处理人查看提交人完整信息（含历史工单）。

- 授权：Bearer token，角色 handler 或 admin
- 路径参数：`id`
- 响应 200：

```json
{
  "name": "string",
  "email": "string",
  "company": "string | null",
  "department": "string | null",
  "history_tickets": [
    {
      "id": "string",
      "subject": "string",
      "category": "string",
      "sla_priority": "string",
      "status": "string",
      "created_at": "string"
    }
  ]
}
```

- 业务逻辑：从工单获取 submitter_id，查询该用户的历史工单（按 created_at 降序，上限 20 条）。
- 错误：403（非 handler 或 admin）、404

## 4. 分配模块接口

### GET /api/companies

查询公司列表。

- 授权：Bearer token，角色 admin
- 响应 200：

```json
{
  "items": [
    { "id": "string", "name": "string", "created_at": "string" }
  ]
}
```

### POST /api/companies

创建公司。

- 授权：Bearer token，角色 admin
- 请求体：

```json
{
  "name": "string (必填)"
}
```

- 响应 201：返回 Company 对象
- 错误：400（名称为空）

### GET /api/companies/:id/business-groups

查询公司下业务组。

- 授权：Bearer token，角色 admin
- 响应 200：

```json
{
  "items": [
    {
      "id": "string",
      "company_id": "string",
      "name": "string",
      "members": [
        { "id": "string", "user_id": "string", "user_name": "string" }
      ],
      "created_at": "string"
    }
  ]
}
```

### POST /api/companies/:id/business-groups

创建业务组。

- 授权：Bearer token，角色 admin
- 请求体：

```json
{
  "name": "string (必填)"
}
```

- 响应 201：返回 BusinessGroup 对象
- 错误：400（名称为空）

### POST /api/business-groups/:id/members

添加业务组成员。

- 授权：Bearer token，角色 admin
- 路径参数：`id`（业务组 ID）
- 请求体：

```json
{
  "user_id": "string (必填)"
}
```

- 响应 201：返回成员对象
- 错误：400（用户不存在或已在组中）

### GET /api/companies/:id/assignment-rules

查询公司下分类分配规则。

- 授权：Bearer token，角色 admin
- 响应 200：

```json
{
  "items": [
    {
      "id": "string",
      "company_id": "string",
      "category": "string",
      "group_id": "string",
      "group_name": "string",
      "created_at": "string"
    }
  ]
}
```

### POST /api/assignment-rules

创建分类分配规则。

- 授权：Bearer token，角色 admin
- 请求体：

```json
{
  "company_id": "string (必填)",
  "category": "string (必填)",
  "group_id": "string (必填)"
}
```

- 响应 201：返回规则对象
- 业务逻辑：同一公司+分类不可重复创建。
- 错误：400（参数缺失或规则已存在）

## 5. 错误响应格式

所有错误统一格式：

```json
{
  "error": "string (错误类型)",
  "message": "string (可读错误信息)"
}
```

| HTTP 状态码 | error | 含义 |
|---|---|---|
| 400 | bad_request | 参数缺失或不合法 |
| 401 | unauthorized | 未登录或 token 失效 |
| 403 | forbidden | 无权限 |
| 404 | not_found | 资源不存在 |
| 500 | internal_error | 服务端内部错误 |
