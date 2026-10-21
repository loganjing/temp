# 工单系统（134-ticket）技术契约（API）

本文件是前后端共同遵循的字段级 API 唯一来源；架构结论见 `docs/wi-t1000332/architecture-baseline.md`。

## 0. 通用约定

- 传输：HTTP/JSON，UTF-8；同源部署（SPA 由同一 Hono 进程托管）。
- 认证：除 `POST /api/auth/login` 外全部端点要求 Bearer 凭证（authkit 会话）；未认证返回 `401 {"error":{"code":"UNAUTHENTICATED","message":"未登录或会话已过期"}}`。
- 公司隔离：单据级端点按当前用户所属公司强制过滤。工单/配置/用户/日志明细对他公司资源返回 `403 {"error":{"code":"FORBIDDEN_COMPANY","message":"无权访问其他公司的数据"}}`；列表天然过滤（跨公司筛选条件返回空结果集）。统计端点为需求授权的跨公司聚合，仅返回聚合数字。
- 时间：ISO-8601 UTC 字符串（如 `2026-10-21T08:30:00.000Z`）。
- 分页：`page`（从 1 起，默认 1）、`pageSize`（默认 20，最大 100）；响应 `{ "items": [...], "total": <number>, "page": <number>, "pageSize": <number> }`。
- 校验错误：`400 {"error":{"code":"VALIDATION","message":"…","details":[{"field":"<camelCase 字段>","message":"…"}]}}`。
- 幂等性：全部写端点为业务动作型，重复提交按当前状态机校验拒绝（`409` 或 `400`），不采用客户端幂等键。
- 命名映射：JSON 字段 camelCase；数据库列 snake_case；映射责任在服务端模块，前端不接触数据库命名。
- 鉴权边界（需求未规定权限模型）：单据操作限工单所属公司已登录用户；满意度评价限提交人本人（`403 NOT_SUBMITTER`）。

## 1. 认证与用户（starter + 扩展）

| 端点 | 用途 | 请求 | 响应 | 错误/备注 |
| --- | --- | --- | --- | --- |
| `POST /api/auth/login` | 登录 | `{ "email": string, "password": string }`（均必填） | `200 { "token": string, "user": UserProfile }` | `401 INVALID_CREDENTIALS`。由 workspace-init starter（authkit+userkit）提供 |
| `GET /api/auth/me` | 当前用户 | — | `200 UserProfile` | `401` |
| `POST /api/auth/logout` | 退出 | — | `200 { "ok": true }` | `401` |
| `GET /api/users` | 本公司用户列表（业务组成员选择等） | `?keyword?`（姓名/邮箱前缀过滤，可空） | `200 { "items": UserProfileSummary[] }` | 只读，公司隔离 |

`UserProfile`：`{ "userId": number, "name": string, "email": string, "companyId": number, "companyName": string, "department": string }`（department 无值时为空串，非 null）。
`UserProfileSummary`：`{ "userId": number, "name": string, "email": string, "department": string }`。
用户创建/管理端点由 starter 生成，工单域要求其支持公司名（不存在则创建 company）与部门字段；本契约不重复定义其表单字段，实现阶段以 starter 端点为基础扩展。

## 2. 工单域

### 2.1 提交

`POST /api/tickets`

请求：`{ "subject": string(1..200，必填), "description": string(1..5000，必填), "category": string(1..50，必填), "priority": "P0"|"P1"|"P2"|"P3"|"P4"(必填) }`

响应：`201 TicketDetail`（`status` 为自动分配结果：命中规则 → `pending_processing` 且 `assignedGroup` 非空；未命中 → `pending_assignment`；写审计事件 `ticket.created`）

### 2.2 列表（工作台/我的工单共用）

`GET /api/tickets`

查询参数（均可选）：`status`（枚举）、`category`、`priority`、`groupId`（本公司业务组）、`companyId`（公司维度筛选；默认与本人公司相同；传他公司 → 空结果集，不报错）、`q`（工单号/主题关键字，不区分大小写子串）、`mine=true`（仅本人提交）、`sort`（`createdAt`|`priority`|`ticketNo`，默认 `createdAt`）、`order`（`asc`|`desc`，默认 `desc`）、`page`、`pageSize`。

响应：`200 { "items": TicketListItem[], "total": number, "page": number, "pageSize": number }`

`TicketListItem`：`{ "ticketId": number, "ticketNo": string, "subject": string, "category": string, "priority": enum, "status": enum, "companyId": number, "companyName": string, "submitterName": string, "assignedGroupId": number|null, "assignedGroupName": string|null, "handlerId": number|null, "handlerName": string|null, "replyCount": number, "createdAt": string, "completedAt": string|null }`

### 2.3 详情（处理时查看提交人完整信息）

`GET /api/tickets/:ticketId`

响应：`200 { "ticket": TicketListItem, "description": string, "submitter": { "userId": number, "name": string, "email": string, "companyName": string, "department": string, "historyTickets": [{ "ticketNo": string, "subject": string, "status": enum, "priority": enum, "createdAt": string }]（该提交人全部工单，时间倒序） }, "replies": [{ "replyId": number, "replierId": number, "replierName": string, "content": string, "repliedAt": string }]（时间正序）, "rating": null | { "score": number(1..5), "comment": string|null, "ratedAt": string } }`

错误：非本公司工单 `404 {"error":{"code":"NOT_FOUND","message":"工单不存在"}}`（详情页对跨公司资源以不存在呈现；操作端点用 403 拒绝，二者均满足 AC-02 的"不可见或被拒绝"）。

### 2.4 回复（多轮）

`POST /api/tickets/:ticketId/replies`

请求：`{ "content": string(1..5000，必填) }`
响应：`201 { "replyId": number, "replierId": number, "replierName": string, "content": string, "repliedAt": string }`
规则：本公司已登录用户可回复（提交人与处理侧双向，AC-03）；工单为终态（completed/cancelled）时 `400 INVALID_STATE`；写审计 `ticket.replied`。

### 2.5 人工分配（待分配 → 待处理）

`POST /api/tickets/:ticketId/assign`

请求：`{ "groupId": number(必填，本公司业务组) }`
响应：`200 TicketListItem`（status=`pending_processing`，assignedGroup 更新）
错误：非 `pending_assignment` 状态 `400 INVALID_STATE`；跨公司工单/组 `403 FORBIDDEN_COMPANY`；写审计 `ticket.assigned`。

### 2.6 转派（待处理下变更归属）

`POST /api/tickets/:ticketId/reassign`

请求：`{ "groupId": number|null, "handlerId": number|null }`（至少一项非 null；目标须属本公司）
响应：`200 TicketListItem`（状态保持 `pending_processing`，归属更新）
错误：非 `pending_processing` 状态 `400 INVALID_STATE`；跨公司 `403 FORBIDDEN_COMPANY`；写审计 `ticket.reassigned`（详情含原/新归属）。

### 2.7 完成（记录处理人/时间 + 邮件通知）

`POST /api/tickets/:ticketId/complete`

请求：`{ "resolution": string(0..1000，可选) }`
响应：`200 { "ticket": TicketListItem, "notification": { "outboxId": number, "channel": "smtp"|"local", "status": "queued"|"sent"|"failed" } }`
行为：事务内更新 status=`completed`、handler_id=当前用户、handled_at=now、completed_at=now，写审计 `ticket.completed` 与发件箱记录；事务外经通知域发送（SMTP 或仅本地记录）；发送失败不改变工单状态，`notification.status=failed`。
错误：非 `pending_processing` `400 INVALID_STATE`；跨公司 `403 FORBIDDEN_COMPANY`。

### 2.8 取消

`POST /api/tickets/:ticketId/cancel`

请求：`{ "reason": string(0..500，可选) }`
响应：`200 TicketListItem`（status=`cancelled`）
错误：终态工单 `400 INVALID_STATE`；写审计 `ticket.cancelled`。

### 2.9 满意度评价

`POST /api/tickets/:ticketId/rating`

请求：`{ "score": number(1..5，必填), "comment": string(0..500，可选) }`
响应：`201 { "score": number, "comment": string|null, "ratedAt": string }`
规则：仅提交人本人（`403 {"error":{"code":"NOT_SUBMITTER","message":"仅提交人可评价该工单"}}`）；仅 `completed` 状态（`400 INVALID_STATE`）；一单已评 `409 {"error":{"code":"RATING_EXISTS","message":"该工单已有评价"}}`；写审计 `ticket.rated`。

## 3. 分配配置域

| 端点 | 请求 | 响应 | 错误/备注 |
| --- | --- | --- | --- |
| `GET /api/groups` | — | `200 { "items": [{ "groupId": number, "name": string, "createdAt": string, "members": [{ "userId": number, "name": string, "email": string, "department": string }] }] }` | 本公司，写审计 `group.updated` 仅覆盖写操作 |
| `POST /api/groups` | `{ "name": string(1..50，必填), "memberIds": number[](可空数组) }` | `201 Group`（同上结构单项） | 名称在本公司重复 `409 GROUP_NAME_EXISTS`；成员须属本公司；写审计 `group.created` |
| `PUT /api/groups/:groupId` | `{ "name": string(1..50，可选), "memberIds": number[](可选，整体替换成员) }` | `200 Group` | 跨公司 `403 FORBIDDEN_COMPANY`；写审计 `group.updated` |
| `GET /api/category-rules` | — | `200 { "items": [{ "ruleId": number, "category": string, "groupId": number, "groupName": string }] }` | 本公司 |
| `POST /api/category-rules` | `{ "category": string(1..50，必填), "groupId": number(必填) }` | `201 Rule` | 同分类已有规则 `409 RULE_CATEGORY_EXISTS`；组须属本公司；写审计 `rule.created` |
| `PUT /api/category-rules/:ruleId` | `{ "category": string(1..50，可选), "groupId": number(可选) }` | `200 Rule` | 跨公司 `403`；写审计 `rule.updated` |
| `GET /api/categories` | — | `200 { "items": string[] }` | 本公司已用分类集合（tickets.category ∪ rules.category，字典序），供提交表单与规则表单选择 |

## 4. 统计域（跨公司聚合，需求 5.3/5.8 授权）

### 4.1 工单分布

`GET /api/stats/distribution?dimension=company|department`（dimension 必填，其他值 `400 VALIDATION`）

响应：`200 { "dimension": "company"|"department", "items": [{ "key": string, "label": string, "count": number }] }`（company 维度 label=公司名；department 维度 label="提交人部门"，空部门归入"未填写"；按 count 降序）

### 4.2 运营仪表盘

`GET /api/stats/dashboard`

响应：`200 { "totalTickets": number, "statusBreakdown": { "created": number, "pendingAssignment": number, "pendingProcessing": number, "completed": number, "cancelled": number }, "avgResponseMinutes": number|null, "avgSatisfaction": number|null, "hotCategories": [{ "category": string, "count": number }] }`

口径（需求推荐基线）：平均响应时间=创建→首次回复的平均分钟数（无回复工单不计入；全部无回复时为 null）；满意度=有评价工单的平均分（保留两位小数；无评价为 null）；热点问题=工单量最多的分类 Top 5（并列时按分类名字典序取前 5）。

## 5. 通知域

`GET /api/outbox?ticketId?&page&pageSize`（ticketId 可选过滤；时间倒序）

响应：`200 { "items": [{ "outboxId": number, "ticketId": number|null, "ticketNo": string, "toEmail": string, "subject": string, "body": string, "channel": "smtp"|"local", "status": "queued"|"sent"|"failed", "error": string|null, "createdAt": string, "sentAt": string|null }], "total": number, "page": number, "pageSize": number }`

完成通知邮件主题：`[工单完成] {ticketNo} {subject}`；收件人=提交人邮箱；正文含工单号、主题、处理人姓名、完成时间与评价引导。只读查询端点，作为 AC-09 送达证据与失败可见性入口。

## 6. 审计域

| 端点 | 用途 | 响应 |
| --- | --- | --- |
| `GET /api/tickets/:ticketId/logs` | 单工单操作日志（时间正序） | `200 { "items": AuditEvent[] }` |
| `GET /api/logs?page&pageSize` | 本公司操作日志（时间倒序，公司隔离） | `200 { "items": AuditEvent[], "total": number, "page": number, "pageSize": number }` |

`AuditEvent`：`{ "eventId": number, "action": string, "ticketId": number|null, "ticketNo": string|null, "operatorId": number, "operatorName": string, "detail": string(人可读摘要), "occurredAt": string }`

事件集合（覆盖需求 5.10）：`ticket.created`、`ticket.assigned`（自动/人工，detail 区分）、`ticket.replied`、`ticket.reassigned`、`ticket.completed`、`ticket.cancelled`、`ticket.rated`、`group.created`、`group.updated`、`rule.created`、`rule.updated`。自动分配在 `ticket.assigned` 的 detail 中标注"自动"。

## 7. 枚举与错误码汇总

- `priority`: `P0` | `P1` | `P2` | `P3` | `P4`
- `status`: `created` | `pending_assignment` | `pending_processing` | `completed` | `cancelled`
- 邮件 `channel`: `smtp` | `local`；`status`: `queued` | `sent` | `failed`
- 错误码：`UNAUTHENTICATED`(401)、`INVALID_CREDENTIALS`(401)、`FORBIDDEN_COMPANY`(403)、`NOT_SUBMITTER`(403)、`NOT_FOUND`(404)、`VALIDATION`(400)、`INVALID_STATE`(400)、`GROUP_NAME_EXISTS`(409)、`RULE_CATEGORY_EXISTS`(409)、`RATING_EXISTS`(409)
