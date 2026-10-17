# 工单系统（121-full）技术契约

> 本文档为前后端共同遵循的 API 契约，是接口字段级细节的唯一来源。整体架构、模块边界与状态机见 `docs/wi-t1000293/architecture-baseline.md`。

## 1. 通用约定

- **Base 路径**：所有端点以 `/api` 为前缀；请求/响应体均为 UTF-8 JSON。
- **身份标识**：每个请求必须携带请求头 `X-User-Id: <整数用户id>`（来自 `GET /api/users`）。缺失、非整数或对应用户不存在时返回 `401`（错误码 `INVALID_USER`）。前端在用户切换器选定后随所有请求附带该头。
- **错误格式**：非 2xx 响应体统一为 `{"error": {"code": "<CODE>", "message": "<可读说明>"}}`。

  | HTTP | code | 场景 |
  | --- | --- | --- |
  | 400 | `VALIDATION_ERROR` | 请求字段缺失/类型错误/枚举非法 |
  | 400 | `INVALID_USER`（同 401 语义时用 401） | 见上，统一返回 401 |
  | 401 | `INVALID_USER` | 用户头缺失或无效 |
  | 403 | `FORBIDDEN` | 操作者角色不满足端点要求 |
  | 404 | `NOT_FOUND` | 路径资源（工单/公司/业务组/分类/用户）不存在 |
  | 409 | `INVALID_STATE` | 工单当前状态不允许该操作 |
  | 409 | `CONFLICT` | 唯一约束冲突（规则重复、重复评价等） |

- **时间格式**：所有时间字段为 ISO 8601 UTC 字符串（毫秒精度，如 `2026-10-17T09:15:00.605Z`）。
- **枚举**：
  - 优先级 `priority`：`P0 | P1 | P2 | P3 | P4`
  - 工单状态 `status`：`created | pending_assignment | processing | completed | cancelled`
  - 事件类型 `type`：`created | dispatched | assigned | reassigned | completed | cancelled | rated`
  - API 只返回枚举原值；中文标签（“待处理”等）由前端映射展示。
- **幂等性**：除下文特别标注外，POST 端点为业务动作，不承诺幂等；对已终态或状态不匹配的重复动作返回 `409 INVALID_STATE` 而非静默重放。
- **对象引用**：引用对象统一以 `{id, name}` 概要返回；`null` 表示尚未指派。

## 2. 用户与组织配置

### 2.1 GET /api/users

- **用途**：用户切换器数据源。
- **角色**：任意有效用户。
- **响应** `200`：`{"users": [User...]}`

  User 对象：

  | 字段 | 类型 | 可空 | 说明 |
  | --- | --- | --- | --- |
  | `id` | integer | 否 | 用户标识（用于 `X-User-Id`） |
  | `name` | string | 否 | 姓名 |
  | `email` | string | 否 | 邮箱 |
  | `company` | `{id, name}` | 否 | 所属公司 |
  | `department` | string | 否 | 部门（可为空字符串） |
  | `isCompanyAdmin` | boolean | 否 | 是否该公司管理员 |

### 2.2 POST /api/companies/{companyId}/business-groups

- **用途**：为公司新增业务组。
- **角色**：该公司的管理员（`isCompanyAdmin` 且 `company.id == companyId`）。
- **请求体**：`{"name": string /* 必填，非空 */}`
- **响应** `201`：BusinessGroup 对象（见 2.4）。
- **错误**：`404 NOT_FOUND`（公司不存在）；`409 CONFLICT`（公司内同名组）；`403 FORBIDDEN`。

### 2.3 PUT /api/business-groups/{groupId}/members

- **用途**：整组覆盖设置业务组成员。
- **角色**：该组所属公司的管理员。
- **请求体**：`{"userIds": [integer /* 必填，可为空数组 */]}`
  - 数组元素必须存在且属于该公司；重复元素视为一次。
- **响应** `200`：更新后的 BusinessGroup 对象。
- **错误**：`404`、`400 VALIDATION_ERROR`（成员不属于该公司或不存在）、`403 FORBIDDEN`。
- **幂等性**：同一成员集合重复提交结果一致（覆盖式写入）。

### 2.4 GET /api/companies/{companyId}/business-groups

- **用途**：公司业务组及成员列表（配置读回）。
- **角色**：任意有效用户。
- **响应** `200`：`{"groups": [BusinessGroup...]}`

  BusinessGroup 对象：

  | 字段 | 类型 | 可空 | 说明 |
  | --- | --- | --- | --- |
  | `id` | integer | 否 | 业务组标识 |
  | `companyId` | integer | 否 | 所属公司 |
  | `name` | string | 否 | 组名 |
  | `members` | `[User...]` | 否 | 成员列表（User 同 2.1，可为空数组） |

### 2.5 POST /api/companies/{companyId}/assignment-rules

- **用途**：配置公司“分类 → 业务组”自动分配规则。
- **角色**：该公司管理员。
- **请求体**：`{"categoryId": integer /* 必填 */, "groupId": integer /* 必填 */}`
  - 分类必须存在；业务组必须属于该公司。
- **响应** `201`：AssignmentRule 对象：`{"id", "category": {id, name}, "group": {id, name}}`
- **错误**：`404`、`400 VALIDATION_ERROR`、`409 CONFLICT`（该公司该分类已存在规则）、`403 FORBIDDEN`。

### 2.6 GET /api/companies/{companyId}/assignment-rules

- **用途**：公司分配规则读回。
- **角色**：任意有效用户。
- **响应** `200`：`{"rules": [AssignmentRule...]}`

### 2.7 GET /api/categories / POST /api/categories

- **用途**：问题分类列表 / 新增分类。
- **角色**：GET 任意有效用户；POST 任意公司管理员（不限公司）。
- **POST 请求体**：`{"name": string /* 必填，非空 */}`
- **响应**：GET `200`：`{"categories": [{"id", "name"}...]}`；POST `201`：`{"id", "name"}`
- **错误**：`409 CONFLICT`（同名分类已存在）。

## 3. 工单

### 3.1 Ticket 对象（列表与详情共用）

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `id` | integer | 否 | 工单标识（路径参数） |
| `ticketNo` | string | 否 | 系统生成的展示工单号（`TK-0001` 起，全局唯一递增） |
| `subject` | string | 否 | 主题 |
| `description` | string | 否 | 描述（可为空字符串） |
| `category` | `{id, name}` | 否 | 问题分类 |
| `priority` | string | 否 | `P0`–`P4` |
| `status` | string | 否 | 工单状态枚举 |
| `submitter` | User | 否 | 提交人完整概要（含姓名/邮箱/公司/部门） |
| `assignedGroup` | `{id, name}` 或 `null` | 是 | 所属业务组 |
| `assignee` | `{id, name}` 或 `null` | 是 | 当前处理人 |
| `createdAt` | string(ISO) | 否 | 创建时间 |
| `updatedAt` | string(ISO) | 否 | 最近更新时间 |
| `completedAt` | string(ISO) 或 `null` | 是 | 完成时间 |
| `completedBy` | `{id, name}` 或 `null` | 是 | 处理人（完成操作执行者） |
| `replyCount` | integer | 否 | 回复数（列表场景返回） |
| `rating` | `{"score": integer, "comment": string或null, "createdAt": string}` 或 `null` | 是 | 满意度评价 |

详情响应（3.3）额外包含 `replies`、`events`、`timeline` 汇总字段除外（见各端点）。

### 3.2 POST /api/tickets

- **用途**：提交人创建工单；系统生成工单号并记录提交人信息与创建时间。
- **角色**：任意有效用户（作为提交人）。
- **请求体**：

  | 字段 | 类型 | 必填 | 约束 |
  | --- | --- | --- | --- |
  | `subject` | string | 是 | 非空 |
  | `description` | string | 否 | 默认空字符串 |
  | `categoryId` | integer | 是 | 必须存在于分类列表 |
  | `priority` | string | 是 | `P0`–`P4` 枚举 |

- **行为**：落库状态 `created`；同一请求内若提交人公司存在该分类的分配规则，则自动指派目标业务组（`assignee` 取组内第一位成员；空组时 `assignee` 为 `null`）并将状态置为 `processing`；未命中规则则停留 `created`。事件时间线记录 `created` 及（命中时）`dispatched`、`assigned` 事件。
- **响应** `201`：Ticket 详情响应（同 3.3，含 `replies: []`、`events: [...]`）。
- **错误**：`400 VALIDATION_ERROR`。

### 3.3 GET /api/tickets/{ticketId}

- **用途**：工单详情读回（提交人完整信息、回复、事件时间线、评价）。
- **角色**：任意有效用户。
- **响应** `200`：Ticket 对象，并附加：

  | 字段 | 类型 | 说明 |
  | --- | --- | --- |
  | `replies` | `[Reply...]` | 回复列表，按 `createdAt` 升序 |
  | `events` | `[Event...]` | 事件时间线，按 `createdAt` 升序 |

  Reply 对象：`{"id": integer, "author": {id, name}, "content": string, "createdAt": string(ISO)}`

  Event 对象：`{"id": integer, "type": 事件枚举, "actor": {id, name}, "detail": object, "createdAt": string(ISO)}`
  `detail` 按类型：`assigned/reassigned`：`{"group": {id, name}, "assignee": {id, name}或null, "previousAssignee": {id, name}或null}`；`cancelled`：`{"reason": string或null}`；其余类型为 `{}`。

- **错误**：`404 NOT_FOUND`。

### 3.4 GET /api/tickets

- **用途**：工单列表。
- **角色**：任意有效用户。
- **查询参数**（均可选，多条件 AND）：`status`（状态枚举）、`categoryId`、`companyId`、`submitterId`。
- **响应** `200`：`{"tickets": [Ticket...]}`，按 `createdAt` 降序（Ticket 为列表形态，含 `replyCount`）。
- **错误**：`400 VALIDATION_ERROR`（枚举非法）。

### 3.5 GET /api/users/{userId}/tickets

- **用途**：提交人历史工单（处理工单时查看提交人完整信息的一部分）。
- **角色**：任意有效用户。
- **响应** `200`：`{"tickets": [Ticket...]}`，该用户提交的全部工单，按 `createdAt` 降序。
- **错误**：`404 NOT_FOUND`。

### 3.6 POST /api/tickets/{ticketId}/dispatch

- **用途**：进入分配流程（`created → pending_assignment`）。
- **角色**：提交人、该公司管理员、该公司任意业务组成员。人工分配流程中由分配面板打开时调用（使“待分配”状态可观察）。
- **请求体**：无。
- **响应** `200`：Ticket 详情响应（同 3.3）。
- **错误**：`404`；`409 INVALID_STATE`（状态非 `created`）；`403 FORBIDDEN`。

### 3.7 POST /api/tickets/{ticketId}/assign

- **用途**：人工指派业务组与处理人（`pending_assignment` 或 `created → processing`；`created` 起点时服务端先内部流转 `dispatched` 事件再指派）。
- **角色**：该公司管理员、该公司任意业务组成员。
- **请求体**：

  | 字段 | 类型 | 必填 | 约束 |
  | --- | --- | --- | --- |
  | `groupId` | integer | 是 | 必须属于工单提交人的公司 |
  | `assigneeId` | integer | 否 | 省略或 `null` 时取组内第一位成员（空组时为 `null`）；提供时必须是该组成员 |

- **响应** `200`：Ticket 详情响应。
- **错误**：`404`；`400 VALIDATION_ERROR`；`409 INVALID_STATE`（状态不在 `created|pending_assignment`）；`403 FORBIDDEN`。

### 3.8 POST /api/tickets/{ticketId}/replies

- **用途**：多轮回复。
- **角色**：工单提交人或当前处理人（`assignee`）。
- **请求体**：`{"content": string /* 必填，非空 */}`
- **行为**：任意状态下均可回复（需求未规定状态限制）；写入回复并追加 `replied` 语义至回复列表（不产生工单事件）。`updatedAt` 更新。
- **响应** `201`：`{"reply": Reply, "ticket": Ticket详情}`。
- **错误**：`404`；`400 VALIDATION_ERROR`；`403 FORBIDDEN`。

### 3.9 POST /api/tickets/{ticketId}/reassign

- **用途**：转派（`processing` 状态内变更当前处理方）。
- **角色**：当前处理人（`assignee`）或该公司管理员。
- **请求体**：

  | 字段 | 类型 | 必填 | 约束 |
  | --- | --- | --- | --- |
  | `groupId` | integer | 是 | 目标业务组，须属于该公司 |
  | `assigneeId` | integer | 否 | 同 3.7 默认规则 |

- **行为**：更新 `assignedGroup/assignee`，状态保持 `processing`；写入 `reassigned` 事件（含转派人、原/新处理方与目标组、时间），时间线可追溯。
- **响应** `200`：Ticket 详情响应。
- **错误**：`404`；`400`；`409 INVALID_STATE`（状态非 `processing`）；`403 FORBIDDEN`。

### 3.10 POST /api/tickets/{ticketId}/complete

- **用途**：完成处理。
- **角色**：当前处理人（`assignee`）或该公司管理员。
- **请求体**：无（可选 `"note": string` 写入完成事件 detail，不落库额外字段）。
- **行为**：状态 → `completed`，记录 `completedBy`（操作者）与 `completedAt`，写入 `completed` 事件。
- **响应** `200`：Ticket 详情响应。
- **错误**：`404`；`409 INVALID_STATE`（状态非 `processing`）；`403 FORBIDDEN`。

### 3.11 POST /api/tickets/{ticketId}/cancel

- **用途**：取消工单（分支终态，取消后不再进入处理流程）。
- **角色**：提交人或当前处理人（`assignee`）。
- **请求体**：`{"reason": string /* 可选 */}`
- **行为**：非终态（`created|pending_assignment|processing`）下可取消；状态 → `cancelled`，写入 `cancelled` 事件。
- **响应** `200`：Ticket 详情响应。
- **错误**：`404`；`409 INVALID_STATE`（已是终态）；`403 FORBIDDEN`。

### 3.12 POST /api/tickets/{ticketId}/rating

- **用途**：满意度评价（工单完成后由提交人提交）。
- **角色**：该工单提交人。
- **请求体**：

  | 字段 | 类型 | 必填 | 约束 |
  | --- | --- | --- | --- |
  | `score` | integer | 是 | 1–5 |
  | `comment` | string | 否 | 默认 `null` |

- **行为**：状态须为 `completed`；每工单仅一次；写入评价与 `rated` 事件。
- **响应** `201`：`{"rating": {"score", "comment", "createdAt"}}`
- **错误**：`404`；`400 VALIDATION_ERROR`；`409 INVALID_STATE`（未完成）；`409 CONFLICT`（已评价）；`403 FORBIDDEN`。

## 4. 映射与转换责任

- **服务端**：负责枚举校验、状态机合法性与角色判断；负责 DB 行 → API 对象的组装（联表生成 `{id, name}` 概要、`detail` JSON 解析为对象、可空字段映射为 `null`）；负责时间生成与 ISO 8601 UTC 格式化。
- **前端**：负责枚举 → 中文标签的展示映射（如 `pending_assignment` → “待分配”）、列表筛选参数拼装、`X-User-Id` 注入与用户切换器状态维护；不做任何业务合法性判断（以服务端响应为准）。
- **公开承诺的最小集**：本契约定义的字段与错误码为实现与验收的共同基准；实现可新增可选字段，但不得移除或改义本契约字段。
