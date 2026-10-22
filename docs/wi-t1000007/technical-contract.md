# 技术契约

工单系统（wi-t1000007）前后端共享的接口与字段契约。本文是字段级细节的唯一来源；架构与模块边界见 `architecture-baseline.md`。

## 1. 通用约定

- **基础路径**：`/api`，请求与响应体为 `application/json; charset=utf-8`。
- **会话**：身份由 HttpOnly `session_user` Cookie 承载（值为用户 ID）。除 `GET /session`、`POST /session` 外，所有接口在缺少有效会话时返回 `401 UNAUTHENTICATED`。
- **公司作用域**：请求体/查询中的 `companyId` 仅为筛选输入。服务端将其与操作者所属公司求交：操作者所属公司之外的值不放大可见范围，越界资源按不存在处理。
- **时间格式**：所有时间字段为 UTC ISO-8601 字符串（`2026-10-22T09:31:00.000Z`），由服务端生成。
- **错误响应**：`{ "error": { "code": string, "message": string, "details"?: object } }`。

| 错误码 | HTTP | 含义 |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | 缺少或无效会话 |
| `FORBIDDEN` | 403 | 身份不具备该能力（角色守卫） |
| `NOT_FOUND` | 404 | 资源不存在或不在可见公司范围内 |
| `VALIDATION_FAILED` | 400 | 入参校验失败，`details.fields` 给出字段级问题 |
| `INVALID_TRANSITION` | 409 | 状态规则不允许的操作（终态工单的回复/转派/完成/取消，未完成工单评价） |
| `ALREADY_RATED` | 409 | 该工单已提交过评价 |
| `DUPLICATE_RULE` | 409 | 同一公司同一分类已存在启用规则 |
| `INTERNAL` | 500 | 未预期错误 |

- **枚举**：`priority` ∈ `P0|P1|P2|P3|P4`；`status` ∈ `created|pending_assignment|pending_handling|completed|cancelled`；`assignedMode` ∈ `auto|manual`；`replyAuthorRole` ∈ `submitter|handler`；`logAction` ∈ `ticket_created|ticket_assigned|ticket_transferred|ticket_replied|ticket_status_changed|ticket_completed|ticket_cancelled|rating_submitted`；`notificationStatus` ∈ `queued|sent|failed`。
- **幂等性**：`POST` 类业务动作以资源状态为幂等边界——对终态工单的重复动作返回 `INVALID_TRANSITION` 而非重复写入；`PUT /business-groups/{id}/members` 为全量覆盖，重复提交结果一致。

## 2. 会话与身份

### `GET /api/session`
返回当前操作者上下文，供界面渲染所属公司与可用能力。
```json
{ "user": { "id": "u1", "name": "张伟", "email": "zhangwei@acme.com", "companyId": "c1", "companyName": "Acme", "department": "研发部", "role": "handler" },
  "capabilities": ["submit_ticket", "handle_ticket", "configure_assignment", "view_stats"] }
```
无会话时返回 `{ "user": null, "capabilities": [] }`（不返回 401，便于渲染身份切换入口）。

### `POST /api/session`
切换/登录操作者，用于多公司身份验证。
- 请求：`{ "userId": "u1" }`（`required`）
- 响应：同 `GET /api/session`
- 错误：`VALIDATION_FAILED`（用户不存在时用 `NOT_FOUND`）

## 3. 工单

工单对象（列表与详情共用）：
```json
{
  "id": "tk_000123", "companyId": "c1", "companyName": "Acme",
  "subject": "打印机无法连接", "description": "三楼打印机…", "category": "硬件故障",
  "priority": "P2", "status": "pending_handling",
  "submitter": { "id": "u9", "name": "李娜", "email": "lina@acme.com", "companyId": "c1", "department": "财务部" },
  "createdAt": "2026-10-22T09:31:00.000Z",
  "assignment": { "groupId": "g1", "groupName": "IT 支持组", "assignedAt": "2026-10-22T09:31:00.200Z", "assignedMode": "auto", "assigneeId": null },
  "completion": { "handledBy": { "id": "u3", "name": "王强" }, "handledAt": "2026-10-22T10:05:00.000Z" },
  "cancelledAt": null,
  "rating": { "score": 5, "ratedBy": { "id": "u9", "name": "李娜" }, "ratedAt": "2026-10-22T11:00:00.000Z" },
  "replyCount": 3
}
```
`assignment` 在未分配时为 `null`；`completion`、`cancelledAt`、`rating` 按状态为空值。

### `POST /api/tickets`
创建工单并触发自动分配。
- 能力：`submit_ticket`
- 请求：
  - `subject`（string，必填，1–200）
  - `description`（string，必填，1–5000）
  - `category`（string，必填，1–64）
  - `priority`（enum，必填）
  - `companyId`（string，可选）：仅用于提交人属于多公司时的选择；服务端以操作者所属公司为准
- 响应 `201`：`{ "ticket": <工单对象> }`，`id` 服务端生成且唯一。
- 副作用：写入 `ticket_created` 日志；命中启用规则时写入 `ticket_assigned` 日志并把状态置为 `pending_handling`，否则状态为 `pending_assignment`。
- 错误：`VALIDATION_FAILED`

### `GET /api/tickets`
工单查询（工作台与列表共用）。
- 查询参数（全部可选）：`q`（关键字，匹配主题/描述/工单 ID）、`category`、`priority`、`status`、`companyId`、`sort` ∈ `createdAt_desc`（默认）|`createdAt_asc`、`page`（默认 1）、`pageSize`（默认 20，最大 100）
- 响应：`{ "items": [<工单对象>...], "total": 42, "page": 1, "pageSize": 20 }`
- 可见性：结果恒为操作者所属公司范围；`status=pending_handling` 即工作台待处理列表。
- 错误：`VALIDATION_FAILED`

### `GET /api/tickets/{id}`
工单详情。
- 响应：`{ "ticket": <工单对象>, "replies": [<回复>...], "transfers": [<转派>...], "logs": [<日志>...] }`
- 回复按 `createdAt` 升序；日志按 `createdAt` 升序。
- 错误：`NOT_FOUND`（公司范围外或不存在）

### `POST /api/tickets/{id}/replies`
追加一轮回复。
- 能力：`submit_ticket` 或 `handle_ticket`
- 请求：`{ "content": "string，必填，1–5000" }`
- 响应 `201`：`{ "reply": { "id": "rp_1", "ticketId": "tk_000123", "author": { "id": "u3", "name": "王强" }, "authorRole": "handler", "content": "…", "createdAt": "…" } }`
- 副作用：写入 `ticket_replied` 日志；`authorRole` 由服务端根据操作者是否为提交人判定。
- 错误：`NOT_FOUND`、`INVALID_TRANSITION`（工单为 `completed`/`cancelled`）

### `POST /api/tickets/{id}/transfer`
转派。
- 能力：`handle_ticket`
- 请求（`groupId` 与 `assigneeId` 至少其一）：`{ "groupId": "g2", "assigneeId": "u7", "note": "可选，≤500" }`
- 响应 `200`：`{ "ticket": <工单对象>, "transfer": { "id": "tf_1", "fromGroupId": "g1", "fromUserId": "u3", "toGroupId": "g2", "toUserId": "u7", "transferredBy": { "id": "u3", "name": "王强" }, "transferredAt": "…" } }`
- 校验：目标业务组/成员必须属于同一公司；状态必须为 `pending_handling`；转派后状态保持 `pending_handling`，`assignment.assignedMode` 更新为 `manual`。
- 副作用：写入 `ticket_transferred` 日志。
- 错误：`VALIDATION_FAILED`、`NOT_FOUND`、`INVALID_TRANSITION`

### `POST /api/tickets/{id}/complete`
完成处理。
- 能力：`handle_ticket`
- 请求：`{ "resolution": "string，可选，≤2000" }`
- 响应 `200`：`{ "ticket": <工单对象>, "notification": { "id": "em_1", "toEmail": "lina@acme.com", "status": "sent", "createdAt": "…" } }`
- 副作用：状态置 `completed`，记录处理人与处理时间；入队并向提交人邮箱发送完成通知；写入 `ticket_status_changed` 与 `ticket_completed` 日志。
- 错误：`NOT_FOUND`、`INVALID_TRANSITION`（非 `pending_handling`）

### `POST /api/tickets/{id}/cancel`
取消工单。
- 请求：`{ "reason": "string，可选，≤500" }`
- 响应 `200`：`{ "ticket": <工单对象> }`
- 校验：仅 `created`/`pending_assignment`/`pending_handling` 可取消。
- 副作用：写入 `ticket_cancelled` 与 `ticket_status_changed` 日志。
- 错误：`NOT_FOUND`、`INVALID_TRANSITION`

### `POST /api/tickets/{id}/rating`
提交满意度评价。
- 能力：`submit_ticket`，且操作者必须为该工单提交人
- 请求：`{ "score": 1..5 }`（integer，必填）
- 响应 `201`：`{ "rating": { "score": 5, "ratedBy": { "id": "u9", "name": "李娜" }, "ratedAt": "…", "ticketId": "tk_000123" } }`
- 校验：工单必须为 `completed`；每单仅一次（唯一约束）。
- 副作用：写入 `rating_submitted` 日志。
- 错误：`VALIDATION_FAILED`、`FORBIDDEN`、`INVALID_TRANSITION`（未完成）、`ALREADY_RATED`

### `GET /api/tickets/{id}/logs`
- 响应：`{ "items": [<日志>...] }`；日志对象：`{ "id": "lg_1", "ticketId": "tk_000123", "action": "ticket_replied", "actor": { "id": "u3", "name": "王强" }, "createdAt": "…", "detail": { } }`
- 错误：`NOT_FOUND`

### `GET /api/users/{id}/profile`
提交人资料与历史工单（处理工单时使用）。
- 响应：
```json
{ "user": { "id": "u9", "name": "李娜", "email": "lina@acme.com", "companyId": "c1", "companyName": "Acme", "department": "财务部" },
  "historyTickets": { "items": [ { "id": "tk_000100", "subject": "…", "status": "completed", "createdAt": "…" } ], "total": 4 } }
```
- 可见性：仅返回同一公司范围内的历史工单。
- 错误：`NOT_FOUND`

## 4. 业务组与分配规则

### `GET /api/business-groups`
- 查询：`companyId`（可选）
- 响应：`{ "items": [ { "id": "g1", "companyId": "c1", "name": "IT 支持组", "members": [ { "id": "u3", "name": "王强", "email": "…", "department": "IT 部" } ] } ] }`
- 可见性：仅本公司。

### `POST /api/business-groups`
- 能力：`configure_assignment`
- 请求：`{ "name": "string，必填，1–64", "companyId": "可选，服务端以操作者所属公司为准" }`
- 响应 `201`：`{ "group": { "id": "g2", "companyId": "c1", "name": "财务支持组", "members": [] } }`
- 错误：`VALIDATION_FAILED`、`FORBIDDEN`

### `PUT /api/business-groups/{id}/members`
- 能力：`configure_assignment`
- 请求：`{ "memberIds": ["u3", "u7"] }`（全量覆盖，可为空数组）
- 响应 `200`：`{ "group": { "id": "g1", "members": [ … ] } }`
- 校验：所有成员必须属于该业务组所在公司。
- 错误：`VALIDATION_FAILED`、`NOT_FOUND`、`FORBIDDEN`

### `GET /api/assignment-rules`
- 响应：`{ "items": [ { "id": "r1", "companyId": "c1", "category": "硬件故障", "groupId": "g1", "groupName": "IT 支持组", "enabled": true } ] }`

### `POST /api/assignment-rules`
- 能力：`configure_assignment`
- 请求：`{ "category": "string，必填", "groupId": "string，必填", "enabled": true }`
- 响应 `201`：`{ "rule": <规则> }`
- 校验：`groupId` 属于本公司；同一公司同一分类的启用规则唯一。
- 错误：`VALIDATION_FAILED`、`DUPLICATE_RULE`、`FORBIDDEN`

### `PUT /api/assignment-rules/{id}`
- 请求：`{ "groupId": "可选", "enabled": "可选" }`；响应 `{ "rule": <规则> }`
- 错误：`NOT_FOUND`、`VALIDATION_FAILED`、`DUPLICATE_RULE`、`FORBIDDEN`

## 5. 统计

### `GET /api/stats/distribution`
- 查询：`dimension` ∈ `company|department`（必填）
- 响应：`{ "dimension": "department", "items": [ { "key": "财务部", "label": "财务部", "count": 7 } ], "total": 12 }`
- 口径：计数为该可见范围内工单数量；公司维度按 `companyId` 汇总，部门维度按提交人部门汇总。

### `GET /api/stats/dashboard`
- 查询：`companyId`（可选）
- 响应：
```json
{ "ticketCount": 12, "avgResponseMinutes": 42.5, "avgResponseSampleCount": 8,
  "avgSatisfaction": 4.6, "ratingSampleCount": 5,
  "hotCategories": [ { "category": "硬件故障", "count": 5 }, { "category": "网络", "count": 3 } ] }
```
- 口径：`ticketCount` 为可见范围工单总数；`avgResponseMinutes` 为有处理方回复工单「创建 → 首次处理方回复」时长均值（无样本时为 `null`，`avgResponseSampleCount` 为 0）；`avgSatisfaction` 为已评价工单评分均值（无样本时 `null`）；`hotCategories` 按分类工单量降序，取前 5。

## 6. 通知

### `GET /api/notifications`
- 查询：`ticketId`（可选）、`status`（可选）
- 响应：`{ "items": [ { "id": "em_1", "ticketId": "tk_000123", "toEmail": "lina@acme.com", "subject": "工单 tk_000123 已完成", "status": "sent", "createdAt": "…", "sentAt": "…", "error": null } ] }`
- 可见性：仅本公司工单的通知记录。

## 7. 前端调用约定

- 统一 `fetch` 封装：解析上述错误体，`NOT_FOUND`/`FORBIDDEN` 呈现"资源不存在或不可见"类反馈，`INVALID_TRANSITION`/`ALREADY_RATED`/`DUPLICATE_RULE` 呈现实体原因并保持界面状态不变。
- 会话上下文在应用启动时读取一次 `GET /api/session`；`user` 为 `null` 时渲染身份选择入口，不渲染业务数据区。
- 列表筛选、搜索、排序与分页状态保留在前端视图状态中并映射到 `GET /api/tickets` 的查询参数；不缓存工单内容作为权威数据。