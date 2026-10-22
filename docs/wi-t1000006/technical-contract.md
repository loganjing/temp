# 技术契约（工单系统 API）

本文件是接口字段级细节的唯一来源。架构基线只保留接口摘要与引用。所有接口为 JSON over HTTP；除认证端点外均需有效会话（`Authorization: Bearer <token>`）。

## 0. 通用约定

- 基础路径：`/api`。请求与响应均为 `application/json; charset=utf-8`。
- 时间：UTC ISO-8601 字符串，例如 `2026-01-05T08:30:00.000Z`。所有时间由服务端生成，客户端传入的时间字段一律忽略。
- 标识：`id` 为字符串（UUID v4）。`memberId`、`groupId`、`departmentId`、`companyId` 均为字符串标识。
- 分页：`page`（从 1 开始，默认 1）、`pageSize`（默认 20，最大 100）；响应包含 `{ items, total, page, pageSize }`。
- 枚举：
  - `priority`：`P0` | `P1` | `P2` | `P3` | `P4`
  - `status`：`created`（创建）| `pending_assignment`（待分配）| `pending_processing`（待处理）| `completed`（完成）| `cancelled`（取消）
  - `role`：`submitter` | `agent` | `configurator` | `manager`
  - `notificationStatus`：`success` | `failed`
- 错误响应统一为 `{ "error": { "code": "<string>", "message": "<string>", "details"?: <object> } }`。
- 通用错误码：

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `invalid_request` | 字段缺失、类型或取值非法；`details.fields` 列出字段与原因 |
| 401 | `unauthenticated` | 无会话或会话失效 |
| 403 | `forbidden` | 已认证但缺少该操作所需权限或数据范围不匹配 |
| 404 | `not_found` | 对象不存在，或对象不属于当前公司范围（跨公司访问一律返回 404，避免暴露他公司对象存在性） |
| 409 | `conflict` | 状态或唯一性冲突（重复评价、重复分类规则、非法状态流转） |
| 422 | `state_violation` | 业务状态不允许该操作（例如取消已完成工单） |
| 500 | `internal_error` | 未预期错误 |

- 公司范围：所有读写都以会话对应的 `companyId` 为范围。请求体中出现的 `companyId` 一律忽略；对范围外对象的 `id` 按不存在处理（404）。这条规则是本系统的授权边界，任何端点不得例外。
- 幂等性：所有写接口不使用幂等键。除重复评价（`ticket_ratings.ticket_id` 唯一）与重复分类规则（`assignment_rules` 唯一）返回 409 外，重复提交会产生新的回复/转派/日志记录，属预期行为。
- 日志：每个成功的写操作在同一请求内写入一条 audit 事件（见第 6 节），事件失败不影响写操作结果，但必须在服务端记录可诊断的错误。

## 1. 身份与上下文

认证端点由 `authkit`/`userkit` 提供（登录、登出、当前会话解析），其字段以模块自身契约为准，本文件不重复定义。本项目新增一个上下文端点：

### GET /api/me/context

用途：返回当前登录用户在本系统内的业务上下文，供前端渲染公司范围与可用操作。

权限：任意已认证用户。

响应 200：

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `userId` | string | 否 | 本地账号标识 |
| `memberId` | string | 否 | 本系统成员标识（当前公司内） |
| `displayName` | string | 否 | 姓名 |
| `email` | string | 否 | 通知邮箱 |
| `companyId` | string | 否 | 所属公司 |
| `companyName` | string | 否 | 公司名称 |
| `departmentId` | string | 是 | 所属部门；未设置时为 `null` |
| `departmentName` | string | 是 | 部门名称；未设置时为 `null` |
| `roles` | string[] | 否 | 角色码集合，至少含一个 |
| `permissions` | string[] | 否 | 权限键集合（见第 7 节） |

## 2. 工单

### 2.1 POST /api/tickets — 创建工单

权限：`ticket:create`。提交人信息取当前会话成员，不从请求体接收。

请求体：

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `subject` | string | 是 | 1–200 字符，去首尾空白后非空 |
| `description` | string | 是 | 1–5000 字符 |
| `category` | string | 是 | 1–50 字符 |
| `priority` | string | 是 | `P0`–`P4` |

处理：在单个事务内分配 `ticket_no`（按 `ticket_no_sequences` 公司内递增），插入工单，记录提交人快照（`submitter_name`、`submitter_email`、`submitter_department`），并按 `assignment_rules` 查询该公司的“分类→业务组”规则：
- 命中：写入 `group_id`，`status = pending_assignment`，写入 `ticket_assignments(kind='auto', actor_member_id=NULL)` 与 audit 事件 `ticket.auto_assigned`。
- 未命中：`group_id = NULL`，`status = created`。

响应 201：`{ "ticket": <Ticket> }`（`Ticket` 见 2.3）。同时写入 audit 事件 `ticket.created`。

错误：400（字段校验失败）、401、403（无 `ticket:create`）。

### 2.2 GET /api/tickets — 工作台/列表查询

权限：`ticket:read`。范围：本公司工单。提交人角色只能看到自己提交的工单，其余角色可见公司内全部工单。

查询参数（全部可选）：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `status` | string | 状态枚举值；工单工作台固定传 `pending_processing` |
| `category` | string | 按分类精确匹配 |
| `priority` | string | 按优先级精确匹配 |
| `groupId` | string | 按业务组过滤 |
| `assigneeMemberId` | string | 按当前处理人过滤；传 `me` 表示当前成员 |
| `companyId` | string | 仅在调用者具备跨公司可见性时为有效筛选；否则被忽略（当前设计下普通用户始终被限制在本公司） |
| `q` | string | 关键字，匹配 `ticket_no`、`subject`、`description`、`submitter_name` |
| `sort` | string | `created_at` \| `priority` \| `ticket_no`，默认 `created_at`；降序为前缀 `-`（如 `-priority`，排序权重 P0 最前） |
| `page` / `pageSize` | number | 分页，见第 0 节 |

响应 200：`{ "items": <TicketSummary[]>, "total": number, "page": number, "pageSize": number }`。

`TicketSummary` 字段：`id`、`ticketNo`、`subject`、`category`、`priority`、`status`、`groupId`（可空）、`groupName`（可空）、`assigneeMemberId`（可空）、`assigneeName`（可空）、`submitterName`、`createdAt`、`completedAt`（可空）。

错误：400（枚举或分页非法）、401、403。

### 2.3 GET /api/tickets/:id — 工单详情

权限：`ticket:read`。范围：本公司；提交人只能读取自己提交的工单（否则 404）。

响应 200：`{ "ticket": <Ticket> }`，其中 `Ticket`：

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 否 | 工单唯一 ID |
| `ticketNo` | string | 否 | 公司内可读编号 |
| `subject` / `description` / `category` / `priority` / `status` | string | 否 | 主数据 |
| `groupId` / `groupName` | string | 是 | 当前所属业务组 |
| `assigneeMemberId` / `assigneeName` | string | 是 | 当前处理人 |
| `createdAt` | string | 否 | 创建时间 |
| `completedAt` / `completedByName` | string | 是 | 完成时间与处理人（完成时写入） |
| `cancelledAt` | string | 是 | 取消时间 |
| `submitter` | object | 否 | `{ memberId, name, companyId, companyName, departmentId, departmentName, email }`，用于处理人查看提交人完整信息 |
| `submitterHistory` | array | 否 | 同一提交人在本公司的其他工单：`[{ id, ticketNo, subject, category, status, priority, createdAt }]`，按创建时间降序，最多 20 条 |
| `replies` | array | 否 | `[{ id, authorMemberId, authorName, authorRole, content, createdAt }]`，按 `createdAt` 升序 |
| `assignments` | array | 否 | `[{ id, kind, fromMemberName, toMemberName, toGroupName, actorName, createdAt }]`，按 `createdAt` 升序 |
| `rating` | object | 是 | `{ score, comment, createdAt }` |
| `notifications` | array | 否 | `[{ id, channel, recipientEmail, status, error, createdAt, sentAt }]` |

错误：401、403、404。

### 2.4 POST /api/tickets/:id/replies — 回复工单

权限：`ticket:reply`。范围：本公司；提交人只能回复自己提交的工单。

请求体：`{ "content": string }`（1–5000 字符，必填）。

前置状态：`created` | `pending_assignment` | `pending_processing`。`completed` 或 `cancelled` 时返回 422 `state_violation`。

响应 201：`{ "reply": { id, authorMemberId, authorName, authorRole, content, createdAt } }`。写入 audit 事件 `ticket.replied`。

错误：400、401、403、404、422。

### 2.5 POST /api/tickets/:id/assign — 分配给业务组/处理人

权限：`ticket:assign`。范围：本公司。目标业务组与处理人必须属本公司。

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `groupId` | string | 是 | 目标业务组 |
| `assigneeMemberId` | string | 否 | 指定处理人；必须为该业务组成员。省略时仅落到业务组 |

前置状态：`created` | `pending_assignment`（重复分配已待处理工单返回 422）。

处理：写入 `group_id`；若给定 `assigneeMemberId` 则写入该处理人并将 `status` 置为 `pending_processing`，否则保持 `pending_assignment`；追加 `ticket_assignments(kind='assign')` 与 audit 事件 `ticket.assigned`。

响应 200：`{ "ticket": <Ticket> }`。

错误：400、401、403、404（业务组/成员不存在或跨公司）、422。

### 2.6 POST /api/tickets/:id/transfer — 转派

权限：`ticket:transfer`。范围：本公司。调用者必须是该工单的当前处理人，或具备 `ticket:assign` 的管理范围。

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `toMemberId` | string | 是 | 目标处理人，必须属本公司且处于启用状态 |
| `toGroupId` | string | 否 | 目标业务组；省略时沿用当前业务组，或取目标处理人所属的任一业务组 |
| `reason` | string | 否 | 0–500 字符 |

前置状态：`pending_assignment` | `pending_processing`。其他状态返回 422。

处理：把当前处理人记入 `from_member_id`，写入新处理人与目标业务组，`status` 置为 `pending_processing`；追加 `ticket_assignments(kind='transfer')` 与 audit 事件 `ticket.transferred`。原处理方轨迹保留在 `ticket_assignments` 中。

响应 200：`{ "ticket": <Ticket> }`。

错误：400、401、403、404、422。

### 2.7 POST /api/tickets/:id/complete — 完成工单

权限：`ticket:complete`。范围：本公司。调用者必须是当前处理人，或具备 `ticket:assign` 的管理范围。

请求体：`{ "resolution"?: string }`（0–2000 字符，可选处理说明；提供时作为一条处理回复记录写入）。

前置状态：`pending_processing`。其他状态返回 422。

处理：在事务内写入 `status = completed`、`completed_at`、`completed_by_member_id`，并追加 audit 事件 `ticket.completed`。事务提交后，由 notification 模块向 `submitter_email` 发送完成通知邮件并写入 `notifications`，再写入 audit 事件 `ticket.completion_notified`（携带发送结果 `success`/`failed`）。邮件失败不回滚完成状态。

响应 200：`{ "ticket": <Ticket>, "notification": { id, status, error, sentAt } }`。

错误：400、401、403、404、422。

### 2.8 POST /api/tickets/:id/cancel — 取消工单

权限：`ticket:cancel`。范围：本公司；提交人可取消自己提交的未完成工单。

前置状态：`created` | `pending_assignment` | `pending_processing`。`completed` 与 `cancelled` 返回 422 `state_violation`（已完成工单不可取消）。

请求体：`{ "reason"?: string }`（0–500 字符）。

处理：写入 `status = cancelled`、`cancelled_at`，追加 audit 事件 `ticket.cancelled`。

响应 200：`{ "ticket": <Ticket> }`。

错误：400、401、403、404、422。

### 2.9 POST /api/tickets/:id/rating — 满意度评价

权限：`ticket:rate`。范围：本公司；只有该工单的提交人可以评价。

请求体：`{ "score": number, "comment"?: string }`。`score` 为 1–5 整数（必填），`comment` 0–1000 字符。

前置状态：`completed`。其他状态返回 422。同一工单已有评价返回 409 `conflict`（不支持修改）。

处理：插入 `ticket_ratings`，追加 audit 事件 `ticket.rated`。

响应 201：`{ "rating": { score, comment, createdAt } }`。

错误：400、401、403、404、409、422。

### 2.10 GET /api/tickets/:id/notifications — 通知结果

权限：`ticket:read`（提交人可见自己工单的通知结果）。响应 200：`{ "items": [{ id, channel, recipientEmail, status, error, createdAt, sentAt }] }`，按 `createdAt` 升序。

错误：401、403、404。

## 3. 组织配置

### 3.1 GET /api/org/groups — 业务组列表

权限：`org:read`。响应 200：`{ "items": [{ id, name, description, memberCount, createdAt, updatedAt }] }`（本公司范围，按 `name` 升序）。

### 3.2 POST /api/org/groups — 新建业务组

权限：`org:configure`。请求体：`{ "name": string (1–100, 必填), "description"?: string (0–500), "memberIds"?: string[] }`。`memberIds` 中的成员必须属本公司。同名业务组返回 409。

响应 201：`{ "group": { id, name, description, members: [{ memberId, displayName }], createdAt, updatedAt } }`。写入 audit 事件 `org.group_created`。

### 3.3 PATCH /api/org/groups/:id — 修改业务组

权限：`org:configure`。请求体：`{ "name"?: string, "description"?: string }`。响应 200：`{ "group": <Group> }`。写入 audit 事件 `org.group_updated`。同名冲突 409；跨公司 404。

### 3.4 PUT /api/org/groups/:id/members — 设置业务组成员

权限：`org:configure`。请求体：`{ "memberIds": string[] }`（全量替换，允许空数组；成员必须属本公司）。响应 200：`{ "group": <Group> }`。写入 audit 事件 `org.group_members_updated`。

### 3.5 GET /api/org/assignment-rules — 自动分配规则列表

权限：`org:read`。响应 200：`{ "items": [{ id, category, groupId, groupName, createdAt, updatedAt }] }`（本公司范围）。

### 3.6 POST /api/org/assignment-rules — 新建规则

权限：`org:configure`。请求体：`{ "category": string (1–50, 必填), "groupId": string (必填) }`。同一公司同一分类唯一，重复返回 409 `conflict`。响应 201：`{ "rule": { id, category, groupId, groupName, createdAt, updatedAt } }`。写入 audit 事件 `org.assignment_rule_created`。

### 3.7 PATCH /api/org/assignment-rules/:id — 修改规则

权限：`org:configure`。请求体：`{ "category"?: string, "groupId"?: string }`。响应 200：`{ "rule": <Rule> }`。写入 audit 事件 `org.assignment_rule_updated`。唯一性冲突 409。

### 3.8 DELETE /api/org/assignment-rules/:id — 删除规则

权限：`org:configure`。响应 200：`{ "deleted": true }`。写入 audit 事件 `org.assignment_rule_deleted`。不存在或跨公司 404。

### 3.9 GET /api/org/members — 本公司成员

权限：`org:read`。查询参数：`activeOnly`（boolean，默认 `true`）、`q`（匹配姓名或邮箱）。响应 200：`{ "items": [{ memberId, displayName, email, departmentId, departmentName, roles }] }`。用于业务组成员编辑与处理人选择。

## 4. 统计与分析

统计范围固定为当前公司（公司隔离优先；跨公司汇总不在本次范围内）。所有指标在请求时实时聚合。

### 4.1 GET /api/analytics/distribution

权限：`analytics:read`。查询参数：`by`（必填，`company` | `department`）、`from`/`to`（可选，按工单创建时间过滤）。

响应 200：

```json
{
  "by": "department",
  "total": 42,
  "items": [{ "key": "<departmentId 或 companyId>", "name": "售后部", "count": 17 }]
}
```

口径：计数依据本公司范围内工单；`by=company` 时返回本公司一条及状态细分（`items[0].count` 等于公司实际工单数）；`by=department` 时按提交人所属部门分组，提交人无部门归入 `key="unassigned"`、`name="未设置部门"`，各组计数之和等于 `total`。

### 4.2 GET /api/analytics/overview

权限：`analytics:read`。查询参数：`from`/`to`（可选，按工单创建时间过滤）、`groupId`（可选）、`category`（可选）。

响应 200：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ticketCount` | number | 范围内工单总数 |
| `statusBreakdown` | object | `{ created, pending_assignment, pending_processing, completed, cancelled }` 计数 |
| `avgFirstResponseSeconds` | number \| null | 平均响应时间＝范围内工单“创建时间→首次回复时间”间隔的算术平均；无回复工单不参与，全部无回复时为 `null` |
| `satisfaction` | object | `{ average: number \| null, count: number, distribution: { "1".."5": number } }`，仅统计已提交评价 |
| `hotCategories` | array | `[{ category, count }]`，按工单数量降序，取前 10，并列按分类名升序 |

错误：400（`by` 非法或时间格式非法）、401、403。

## 5. 操作日志

### GET /api/audit-events

权限：`audit:read`。范围：本公司事件（跨公司事件不可见）。

查询参数（全部可选）：`objectType`（如 `ticket`、`business_group`、`assignment_rule`）、`objectId`、`actorMemberId`（`system` 表示系统触发）、`action`、`from`/`to`（事件时间范围）、`page`/`pageSize`。

响应 200：`{ "items": [{ id, action, objectType, objectId, actorMemberId, actorName, occurredAt, details }], "total", "page", "pageSize" }`，默认按 `occurredAt` 降序。

`action` 取值集合（覆盖需求要求的日志范围）：

| action | 触发点 | 对象 |
| --- | --- | --- |
| `ticket.created` | 创建工单 | ticket |
| `ticket.auto_assigned` | 创建时按分类规则自动分配 | ticket |
| `ticket.assigned` | 人工分配业务组/处理人 | ticket |
| `ticket.transferred` | 转派 | ticket |
| `ticket.replied` | 回复 | ticket |
| `ticket.completed` | 完成（记录处理人与处理时间） | ticket |
| `ticket.cancelled` | 取消 | ticket |
| `ticket.rated` | 满意度评价 | ticket |
| `ticket.completion_notified` | 完成通知发送结果（`actorMemberId = "system"`） | ticket |
| `org.group_created` / `org.group_updated` / `org.group_members_updated` | 业务组与成员配置变更 | business_group |
| `org.assignment_rule_created` / `org.assignment_rule_updated` / `org.assignment_rule_deleted` | 自动分配规则配置变更 | assignment_rule |

每条事件必须包含操作对象（`objectType` + `objectId`）、操作人（`actorMemberId`，系统触发为 `system`）与时间（`occurredAt`）。

## 6. 权限键与角色映射

`permissionkit` 注册以下权限键；角色到权限的映射为推荐基线，可由用户调整：

| 权限键 | 用途 | submitter | agent | configurator | manager |
| --- | --- | --- | --- | --- | --- |
| `ticket:create` | 创建工单 | ✓ | ✓ | ✓ | ✓ |
| `ticket:read` | 查看工单（受范围限制） | ✓（仅本人） | ✓ | ✓ | ✓ |
| `ticket:reply` | 回复工单 | ✓（仅本人） | ✓ | ✓ | ✓ |
| `ticket:assign` | 分配业务组/处理人 | | ✓ | | ✓ |
| `ticket:transfer` | 转派 | | ✓ | | ✓ |
| `ticket:complete` | 完成工单 | | ✓ | | ✓ |
| `ticket:cancel` | 取消工单 | ✓（仅本人） | ✓ | ✓ | ✓ |
| `ticket:rate` | 满意度评价 | ✓（仅本人） | | | |
| `org:read` | 查看业务组与规则 | | ✓ | ✓ | ✓ |
| `org:configure` | 维护业务组、成员与规则 | | | ✓ | ✓ |
| `analytics:read` | 查看分布与仪表盘 | | | | ✓ |
| `audit:read` | 查看操作日志 | | | ✓ | ✓ |

权限只表达能力；数据范围（公司隔离与对象归属）在服务端对每个端点独立强制，任何权限都不能绕过公司范围。

## 7. 前端消费约定

- 应用启动先调用 `GET /api/me/context`，据此决定导航可见项与操作按钮可用性；收到 403 时展示无权限状态且不渲染受限数据。
- 所有写操作成功后以前端返回的最新对象刷新当前视图，不使用乐观更新替代服务端返回值。
- 403/404 在界面上一律呈现为“不存在或无权访问”，不区分两者，避免泄露他公司对象。
- 列表与详情的字段名与枚举值直接使用本文件定义，不在前端另建枚举映射。