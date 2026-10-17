# 技术契约：工单管理系统 API（ticket-1）

> 本文件是工单管理系统全部 HTTP 接口字段级细节的唯一来源；架构基线只保留接口摘要。
> 约定：所有请求/响应为 JSON（`Content-Type: application/json`）；时间为 ISO-8601 字符串（UTC）；ID 为字符串。
> 身份模型（AD-1）：服务端信任请求声明的 `operatorId`，不实现认证；写操作均需 `operatorId`。

## 通用约定

- 成功响应：200（查询）/ 201（创建，返回创建结果）。
- 错误响应统一结构：

```json
{ "error": { "code": "TICKET_NOT_FOUND", "message": "工单不存在" } }
```

- 错误码：`VALIDATION_ERROR`（422）、`NOT_FOUND`（404）、`INVALID_STATE`（409，非法状态流转）、`CONFLICT`（409，唯一约束冲突，如重复规则/重复成员）、`INTERNAL_ERROR`（500）。
- 枚举值：
  - priority：`P0` | `P1` | `P2` | `P3` | `P4`
  - status：`created` | `pending_assignment` | `pending_handling` | `completed` | `cancelled`
- 幂等性：本应用为单机会话工具，创建类接口不做幂等键；状态流转接口（assign/transfer/complete/cancel）以状态前置校验保证不重复生效，非法流转返回 409 且不产生副作用。

## 1. 初始数据

### GET /api/bootstrap

返回公司、用户、业务组初始数据，供身份选择器与筛选。

响应 200：

```json
{
  "companies": [{ "id": "c_1", "name": "示例公司" }],
  "users": [{ "id": "u_1", "name": "张三", "email": "zhangsan@example.com", "companyId": "c_1", "department": "IT部" }],
  "groups": [{ "id": "g_1", "companyId": "c_1", "name": "网络组", "memberIds": ["u_2"] }]
}
```

## 2. 用户资料

### POST /api/users

新建用户（提交人或处理人资料）。

请求：

```json
{ "name": "李四", "email": "lisi@example.com", "companyId": "c_1", "department": "财务部" }
```

- `name`：string，必填；`email`：string，必填；`companyId`：string，必填；`department`：string | null，可空。
- 响应 201：`{ "id": "u_3", "name": "李四", "email": "lisi@example.com", "companyId": "c_1", "department": "财务部", "createdAt": "2026-10-17T00:00:00.000Z" }`
- 邮箱重复返回 409 `CONFLICT`。

### GET /api/users/:id/tickets

提交人历史工单（该用户创建的全部工单，按创建时间倒序）。

响应 200：

```json
{ "tickets": [{ "id": "TCK-...", "subject": "无法登录", "status": "completed", "priority": "P2", "createdAt": "..." }] }
```

## 3. 业务组与成员

### GET /api/companies/:id/groups

响应 200：

```json
{ "groups": [{ "id": "g_1", "name": "网络组", "memberIds": ["u_2", "u_5"] }] }
```

### POST /api/companies/:id/groups

请求：`{ "name": "账务组" }`（string，必填）。
响应 201：`{ "id": "g_2", "companyId": "c_1", "name": "账务组", "memberIds": [], "createdAt": "..." }`

### POST /api/groups/:id/members

设置业务组成员（全量替换该组成员集合）。

请求：`{ "userIds": ["u_2", "u_5"] }`（string[]，必填；成员须属于该公司）。
响应 200：`{ "id": "g_1", "memberIds": ["u_2", "u_5"] }`

## 4. 自动分配规则

### GET /api/companies/:id/assignment-rules

响应 200：

```json
{ "rules": [{ "id": "r_1", "category": "网络故障", "groupId": "g_1", "groupName": "网络组" }] }
```

### POST /api/companies/:id/assignment-rules

请求：`{ "category": "网络故障", "groupId": "g_1" }`（均必填；groupId 须属于该公司）。
响应 201：`{ "id": "r_1", "companyId": "c_1", "category": "网络故障", "groupId": "g_1", "createdAt": "..." }`
- 同一公司同一分类重复配置返回 409 `CONFLICT`。

## 5. 工单

### POST /api/tickets

创建工单；同一事务内评估自动分配规则。

请求：

```json
{
  "operatorId": "u_1",
  "subject": "无法登录邮箱",
  "description": "今天早上开始无法登录",
  "category": "网络故障",
  "priority": "P2",
  "submitter": { "name": "张三", "email": "zhangsan@example.com", "department": "IT部" }
}
```

- `operatorId`：string，必填（当前身份选择器选定用户）。
- `subject`：string，必填，1–200 字符；`description`：string，必填。
- `category`：string，必填；`priority`：enum，必填。
- `submitter`：必填；`name`/`email` 必填，`department` 可空。服务端按 `email` 归并/新建 `users` 记录：邮箱已存在则更新姓名与部门（以本次提交为准），否则新建；`companyId` 取该公司上下文（operator 所属公司）。
- 响应 201：工单对象（见 GET /api/tickets/:id 的 ticket 字段）；`status` 为 `pending_handling`（命中规则）或 `pending_assignment`（未命中）。
- 校验失败返回 422。

### GET /api/tickets

工单列表。查询参数（均可选）：`companyId`、`status`、`category`、`submitterId`、`groupId`、`keyword`（主题包含匹配）。
按创建时间倒序。

响应 200：

```json
{ "tickets": [{ "id": "TCK-...", "subject": "无法登录邮箱", "status": "pending_handling", "priority": "P2", "category": "网络故障", "submitterName": "张三", "assignedGroupId": "g_1", "createdAt": "..." }] }
```

### GET /api/tickets/:id

工单详情：主记录 + 提交人资料 + 回复线程 + 转派记录 + 处理记录 + 评价。

响应 200：

```json
{
  "ticket": {
    "id": "TCK-...",
    "subject": "无法登录邮箱",
    "description": "今天早上开始无法登录",
    "category": "网络故障",
    "priority": "P2",
    "status": "completed",
    "submitter": { "id": "u_1", "name": "张三", "email": "zhangsan@example.com", "companyId": "c_1", "department": "IT部" },
    "assignedGroupId": "g_1",
    "createdAt": "...",
    "handlerId": "u_2",
    "handledAt": "...",
    "cancelledAt": null
  },
  "replies": [{ "id": "rp_1", "authorId": "u_2", "authorName": "王五", "content": "请重启路由器", "createdAt": "..." }],
  "transfers": [{ "id": "tr_1", "fromGroupId": "g_1", "toGroupId": "g_2", "toUserId": null, "operatorId": "u_2", "note": null, "createdAt": "..." }],
  "evaluation": null
}
```

- `replies` 按创建时间正序；`evaluation` 无评价时为 `null`。
- 工单不存在返回 404。

### POST /api/tickets/:id/replies

请求：`{ "operatorId": "u_2", "content": "请重启路由器" }`（`content` 必填）。
- 工单处于 `cancelled` 时返回 409 `INVALID_STATE`。
- 响应 201：`{ "id": "rp_1", "ticketId": "TCK-...", "authorId": "u_2", "content": "请重启路由器", "createdAt": "..." }`

### POST /api/tickets/:id/assign

分配工单到业务组（`pending_assignment` → `pending_handling`）。

请求：`{ "operatorId": "u_2", "groupId": "g_1" }`（`groupId` 必填，须为工单所属公司的业务组）。
- 响应 200：工单对象（`status: "pending_handling"`，`assignedGroupId` 为目标组）。
- 当前状态非 `pending_assignment` 返回 409 `INVALID_STATE`。

### POST /api/tickets/:id/transfer

转派待处理工单（`pending_handling` → `pending_handling`，归属变更，留转派记录）。

请求：

```json
{ "operatorId": "u_2", "toGroupId": "g_2", "toUserId": null, "note": "需要账务组协助" }
```

- `toGroupId` 与 `toUserId` 至少一个非空；`toGroupId` 须属于该公司；`toUserId` 须属于该公司（转派给成员时以其所属业务组为归属组记录 `toGroupId`）。
- `note` 可空。`fromGroupId` 取转派前 `assigned_group_id`。
- 响应 200：`{ "ticket": { ...工单对象, "assignedGroupId": "g_2" }, "transfer": { "id": "tr_1", "ticketId": "TCK-...", "fromGroupId": "g_1", "toGroupId": "g_2", "toUserId": null, "operatorId": "u_2", "note": "需要账务组协助", "createdAt": "..." } }`
- 当前状态非 `pending_handling` 返回 409 `INVALID_STATE`。

### POST /api/tickets/:id/complete

完成处理（`pending_handling` → `completed`，记录处理人与处理时间）。

请求：`{ "operatorId": "u_2" }`。
- 响应 200：工单对象（`status: "completed"`，`handlerId`、`handledAt` 已记录）。
- 当前状态非 `pending_handling` 返回 409 `INVALID_STATE`。

### POST /api/tickets/:id/cancel

取消工单（`created`/`pending_assignment`/`pending_handling` → `cancelled`）。

请求：`{ "operatorId": "u_1", "note": null }`（`note` 可空；取消原因不必填）。
- 响应 200：工单对象（`status: "cancelled"`，`cancelledAt` 已记录）。
- 当前状态为 `completed`/`cancelled` 返回 409 `INVALID_STATE`。

### PUT /api/tickets/:id/evaluation

提交满意度评价（工单 `completed` 后可评价；每工单一条，允许覆盖更新）。

请求：`{ "operatorId": "u_1", "rating": 5, "comment": "处理很快" }`

- `rating`：integer，必填，1–5（最小量表，见 AD-4）；`comment`：string | null，可空。
- `operatorId` 应为工单提交人；非提交人返回 409 `CONFLICT`（评价归属冲突）。
- 响应 200：`{ "id": "ev_1", "ticketId": "TCK-...", "rating": 5, "comment": "处理很快", "createdAt": "...", "updatedAt": "..." }`
- 工单未完成返回 409 `INVALID_STATE`。

## 6. 数据与映射责任

- 提交人归并（邮箱 → users 记录）、公司上下文推导、自动分配规则匹配、状态机流转校验均在服务端 `ticketing`/`assignment`/`resolution` 模块内完成；前端不本地推导状态或归属。
- 前端展示所需的 `submitterName`、`groupName`、`authorName` 等展示字段由服务端在响应中拼装，前端不持有用户/业务组主数据。
- 数据库 schema 与迁移见 `migrations/sqlite/`；schema 变更只通过新增迁移文件，不使用自动同步。
