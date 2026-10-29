# 技术契约

## 1. ID 类型对照表

| 实体 ID | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---|---|---|---|---|---|---|
| company.id | DB AUTOINCREMENT | INTEGER PK | INTEGER FK | number | number | 无需转换 |
| user.id | DB AUTOINCREMENT | INTEGER PK | INTEGER FK | number | number | 无需转换 |
| business_group.id | DB AUTOINCREMENT | INTEGER PK | INTEGER FK | number | number | 无需转换 |
| category.id | DB AUTOINCREMENT | INTEGER PK | INTEGER FK | number | number | 无需转换 |
| ticket.id | DB AUTOINCREMENT | INTEGER PK | INTEGER FK | number | number | 无需转换 |
| ticket.ticket_no | 服务端生成 | TEXT UNIQUE | — | string | string | 创建时由服务端生成 |
| ticket_reply.id | DB AUTOINCREMENT | INTEGER PK | INTEGER FK | number | number | 无需转换 |
| ticket_transfer.id | DB AUTOINCREMENT | INTEGER PK | INTEGER FK | number | number | 无需转换 |
| ticket_evaluation.id | DB AUTOINCREMENT | INTEGER PK | INTEGER FK | number | number | 无需转换 |
| category_group_rule.id | DB AUTOINCREMENT | INTEGER PK | INTEGER FK | number | number | 无需转换 |
| business_group_member.id | DB AUTOINCREMENT | INTEGER PK | INTEGER FK | number | number | 无需转换 |

## 2. API 契约

### 通用约定

- 时间格式：ISO 8601 字符串（如 `2026-10-29T08:30:00Z`）
- 错误响应格式：`{ "error": { "code": string, "message": string } }`
- 成功响应格式：`{ "<resource>": <entity> }` 或 `{ "<resource>s": [<entity>] }`
- 删除成功：HTTP 204，无响应体

### 2.1 工单接口

#### POST /api/tickets — 创建工单

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| subject | string | 是 | 主题 |
| description | string | 否 | 描述 |
| categoryId | number | 是 | 问题分类 ID |
| priority | string | 是 | 优先级，枚举 `P0\|P1\|P2\|P3\|P4` |
| submitterId | number | 是 | 提交人用户 ID |

**响应** 201

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| ticket.id | number | 否 | 工单 ID |
| ticket.ticketNo | string | 否 | 工单编号 `TKT-YYYYMMDD-NNNN` |
| ticket.subject | string | 否 | 主题 |
| ticket.description | string | 是 | 描述 |
| ticket.categoryId | number | 否 | 分类 ID |
| ticket.priority | string | 否 | 优先级 |
| ticket.status | string | 否 | 状态，`pending_assignment` 或 `pending_processing`（自动分配时） |
| ticket.submitterId | number | 否 | 提交人 ID |
| ticket.assignedGroupId | number | 是 | 分配的业务组 ID（自动分配时有值） |
| ticket.assigneeId | number | 是 | 处理人 ID |
| ticket.createdAt | string | 否 | 创建时间 |

**逻辑**：创建后状态为 `pending_assignment`；若 `category_group_rules` 中存在 `submitter.company_id` + `categoryId` 匹配规则，自动分配到规则指向的业务组，状态变为 `pending_processing`。

**错误**

| HTTP | code | 说明 |
|---|---|---|
| 400 | INVALID_PRIORITY | 优先级不在 P0-P4 范围 |
| 400 | MISSING_FIELD | 必填字段缺失 |
| 404 | CATEGORY_NOT_FOUND | 分类不存在 |
| 404 | USER_NOT_FOUND | 提交人不存在 |

#### GET /api/tickets — 工单列表

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | string | 否 | 状态筛选 |
| categoryId | number | 否 | 分类筛选 |
| priority | string | 否 | 优先级筛选 |
| assigneeId | number | 否 | 处理人筛选 |
| submitterId | number | 否 | 提交人筛选 |

**响应** 200

```json
{
  "tickets": [
    { "id": 1, "ticketNo": "TKT-20261029-0001", "subject": "...", "priority": "P3", "status": "pending_processing", "categoryId": 1, "categoryName": "网络", "submitterId": 1, "submitterName": "张三", "assignedGroupId": 1, "assigneeId": null, "createdAt": "..." }
  ]
}
```

#### GET /api/tickets/:id — 工单详情

**响应** 200

```json
{
  "ticket": {
    "id": 1,
    "ticketNo": "TKT-20261029-0001",
    "subject": "...",
    "description": "...",
    "categoryId": 1,
    "categoryName": "网络",
    "priority": "P3",
    "status": "pending_processing",
    "submitterId": 1,
    "submitter": { "id": 1, "name": "张三", "email": "zhangsan@example.com", "companyId": 1, "companyName": "A公司", "department": "技术部", "createdAt": "..." },
    "assignedGroupId": 1,
    "assignedGroup": { "id": 1, "name": "网络运维组", "companyId": 1 },
    "assigneeId": null,
    "assignee": null,
    "handledById": null,
    "handledAt": null,
    "createdAt": "...",
    "updatedAt": "...",
    "completedAt": null,
    "replies": [ { "id": 1, "replierId": 2, "replierName": "李四", "content": "...", "createdAt": "..." } ],
    "transfers": [ { "id": 1, "fromUserId": 2, "fromUserName": "李四", "toUserId": 3, "toUserName": "王五", "toGroupId": null, "toGroupName": null, "reason": "...", "createdAt": "..." } ],
    "evaluation": { "id": 1, "rating": 5, "comment": "...", "createdAt": "..." }
  }
}
```

**错误**

| HTTP | code | 说明 |
|---|---|---|
| 404 | TICKET_NOT_FOUND | 工单不存在 |

#### PATCH /api/tickets/:id/status — 更新工单状态

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | string | 是 | 目标状态，枚举 `pending_assignment\|pending_processing\|completed\|cancelled` |
| assigneeId | number | 否 | 分配时指定处理人 |
| groupId | number | 否 | 分配时指定业务组 |

**响应** 200：返回更新后的工单（同详情结构，不含 replies/transfers/evaluation）。

**状态流转校验**

| 当前状态 | 允许目标状态 | 附加操作 |
|---|---|---|
| created | pending_assignment | — |
| pending_assignment | pending_processing | 设置 assignedGroupId / assigneeId |
| pending_assignment | cancelled | — |
| pending_processing | completed | 设置 handledBy、handledAt、completedAt |
| pending_processing | cancelled | — |

**错误**

| HTTP | code | 说明 |
|---|---|---|
| 400 | INVALID_TRANSITION | 不允许的状态流转 |
| 400 | MISSING_FIELD | 必填字段缺失 |
| 404 | TICKET_NOT_FOUND | 工单不存在 |

#### POST /api/tickets/:id/replies — 添加回复

**请求体**

| 字段 | 类型 | 必填 |
|---|---|---|
| replierId | number | 是 |
| content | string | 是 |

**响应** 201

```json
{ "reply": { "id": 1, "ticketId": 1, "replierId": 2, "replierName": "李四", "content": "...", "createdAt": "..." } }
```

#### GET /api/tickets/:id/replies — 回复列表

**响应** 200：`{ "replies": [...] }`，按 `createdAt` 升序。

#### POST /api/tickets/:id/transfer — 转派工单

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| fromUserId | number | 是 | 当前处理人 ID |
| toUserId | number | 否 | 转派给的处理人 ID（与 toGroupId 二选一） |
| toGroupId | number | 否 | 转派给的业务组 ID（与 toUserId 二选一） |
| reason | string | 否 | 转派原因 |

**响应** 200：返回更新后的工单。转派后工单保持 `pending_processing` 状态，更新 `assigneeId` 或 `assignedGroupId`。

**错误**

| HTTP | code | 说明 |
|---|---|---|
| 400 | TRANSFER_TARGET_REQUIRED | 未指定转派目标 |
| 400 | INVALID_TICKET_STATUS | 工单非待处理状态 |
| 404 | TICKET_NOT_FOUND | 工单不存在 |

#### GET /api/tickets/:id/transfers — 转派历史

**响应** 200：`{ "transfers": [...] }`，按 `createdAt` 升序。

#### POST /api/tickets/:id/evaluation — 提交评价

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| rating | number | 是 | 满意度评分 1-5 |
| comment | string | 否 | 评价备注 |

**响应** 201

```json
{ "evaluation": { "id": 1, "ticketId": 1, "rating": 5, "comment": "...", "createdAt": "..." } }
```

**错误**

| HTTP | code | 说明 |
|---|---|---|
| 400 | INVALID_RATING | 评分不在 1-5 范围 |
| 400 | TICKET_NOT_COMPLETED | 工单未完成，不可评价 |
| 409 | EVALUATION_EXISTS | 工单已有评价 |

#### GET /api/tickets/:id/evaluation — 查看评价

**响应** 200 或 404（无评价时）。

### 2.2 公司接口

#### GET /api/companies — 公司列表

**响应** 200：`{ "companies": [{ "id": 1, "name": "A公司", "createdAt": "..." }] }`

#### POST /api/companies — 创建公司

**请求体**：`{ "name": string }`
**响应** 201：`{ "company": { "id": number, "name": string, "createdAt": string } }`

### 2.3 业务组接口

#### GET /api/companies/:companyId/business-groups — 公司下业务组列表

**响应** 200：`{ "groups": [{ "id": 1, "companyId": 1, "name": "网络运维组", "createdAt": "..." }] }`

#### POST /api/companies/:companyId/business-groups — 创建业务组

**请求体**：`{ "name": string }`
**响应** 201：`{ "group": { "id": number, "companyId": number, "name": string, "createdAt": string } }`

#### GET /api/business-groups/:id/members — 成员列表

**响应** 200

```json
{ "members": [{ "id": 1, "groupId": 1, "userId": 2, "userName": "李四", "userEmail": "lisi@example.com", "createdAt": "..." }] }
```

#### POST /api/business-groups/:id/members — 添加成员

**请求体**：`{ "userId": number }`
**响应** 201：`{ "member": { "id": number, "groupId": number, "userId": number, "userName": string, "createdAt": string } }`

**错误**

| HTTP | code | 说明 |
|---|---|---|
| 404 | GROUP_NOT_FOUND | 业务组不存在 |
| 404 | USER_NOT_FOUND | 用户不存在 |
| 409 | MEMBER_EXISTS | 成员已存在 |

#### DELETE /api/business-groups/:id/members/:userId — 移除成员

**响应** 204

### 2.4 分类接口

#### GET /api/categories — 分类列表

**响应** 200：`{ "categories": [{ "id": 1, "name": "网络", "createdAt": "..." }] }`

#### POST /api/categories — 创建分类

**请求体**：`{ "name": string }`
**响应** 201：`{ "category": { "id": number, "name": string, "createdAt": string } }`

### 2.5 分类→业务组映射规则接口

#### GET /api/category-group-rules — 规则列表

**查询参数**：`companyId`（可选，按公司筛选）

**响应** 200

```json
{ "rules": [{ "id": 1, "companyId": 1, "companyName": "A公司", "categoryId": 1, "categoryName": "网络", "groupId": 1, "groupName": "网络运维组", "createdAt": "..." }] }
```

#### POST /api/category-group-rules — 创建规则

**请求体**

| 字段 | 类型 | 必填 |
|---|---|---|
| companyId | number | 是 |
| categoryId | number | 是 |
| groupId | number | 是 |

**响应** 201：`{ "rule": { "id": number, "companyId": number, "categoryId": number, "groupId": number, "createdAt": string } }`

**错误**

| HTTP | code | 说明 |
|---|---|---|
| 409 | RULE_EXISTS | 该公司+分类已有规则 |

#### DELETE /api/category-group-rules/:id — 删除规则

**响应** 204

### 2.6 用户接口

#### GET /api/users/:id — 用户详情

**响应** 200

```json
{
  "user": {
    "id": 1,
    "name": "张三",
    "email": "zhangsan@example.com",
    "companyId": 1,
    "companyName": "A公司",
    "department": "技术部",
    "createdAt": "...",
    "historicalTickets": [
      { "id": 5, "ticketNo": "TKT-20261029-0002", "subject": "...", "status": "completed", "priority": "P2", "createdAt": "..." }
    ]
  }
}
```

**错误**

| HTTP | code | 说明 |
|---|---|---|
| 404 | USER_NOT_FOUND | 用户不存在 |

## 3. 枚举值定义

### 工单状态 (status)

| 值 | 含义 |
|---|---|
| created | 创建 |
| pending_assignment | 待分配 |
| pending_processing | 待处理 |
| completed | 完成 |
| cancelled | 取消 |

### SLA 优先级 (priority)

| 值 | 含义 |
|---|---|
| P0 | 最高优先级 |
| P1 | 高优先级 |
| P2 | 中优先级 |
| P3 | 默认优先级 |
| P4 | 低优先级 |

### 满意度评分 (rating)

| 值 | 含义 |
|---|---|
| 1 | 非常不满意 |
| 2 | 不满意 |
| 3 | 一般 |
| 4 | 满意 |
| 5 | 非常满意 |
