# 132-ticket 工单系统 — 技术契约

字段级 API 契约。本文是 method/path、请求/响应字段、类型、可空性、错误、授权与幂等性的唯一来源；`architecture-baseline.md` 仅保留接口摘要。

## 0. 通用约定

- 基础路径 `/api`，请求/响应均为 UTF-8 JSON。
- 认证：`Authorization: Bearer <token>`（authkit 签发）。未登录访问受保护接口返回 `401 {"error":{"code":"UNAUTHORIZED","message":"..."}}`。
- 角色缩写：`S`=submitter，`A`=agent，`AD`=admin，`V`=viewer。标注在每条接口的"授权"中；登录（`AUTH`）表示任意已登录用户。
- 错误结构统一为 `{"error":{"code":"<CODE>","message":"<人类可读说明>"}}`；常用状态码：400 参数校验（`VALIDATION`）、401（`UNAUTHORIZED`/`INVALID_CREDENTIALS`）、403（`FORBIDDEN`）、404（`NOT_FOUND`，含越权访问他公司工单时的资源隐藏）、409 状态/唯一性冲突（`INVALID_STATE`/`DUPLICATE_*`）。
- 时间字段：ISO 8601 UTC 字符串（如 `2026-10-21T08:30:00Z`），一律可空性标注为"非空"，除非注明可空。
- 分页：列表接口支持 `page`（默认 1，≥1）与 `pageSize`（默认 20，1-100）；响应为 `{"items":[...],"total":<int>,"page":<int>,"pageSize":<int>}`。
- 枚举：`priority ∈ P0|P1|P2|P3|P4`；`status ∈ created|pending_assignment|in_progress|completed|cancelled`；`role ∈ submitter|agent|admin|viewer`。
- 幂等：`PUT`/`DELETE` 幂等（重复删除返回 204 或 404，取首次结果）；`POST` 不幂等，唯一性由表约束兜底并返回 409。

## 1. 认证与当前用户

### POST /api/auth/login
- 授权：公开。
- 请求：`{"username":<string 非空>,"password":<string 非空>}`
- 响应 200：`{"token":<string>,"user":{"userId":<int>,"username":<string>,"displayName":<string>,"email":<string 可空>,"companyId":<int 可空>,"department":<string 可空>,"role":<string 可空>}}`（业务档案未设置时对应字段为 null）
- 错误：401 `INVALID_CREDENTIALS`。

### POST /api/auth/logout
- 授权：AUTH。响应 204（幂等，token 失效）。

### GET /api/me
- 授权：AUTH。
- 响应 200：`{"userId":<int>,"username":<string>,"displayName":<string>,"email":<string>,"companyId":<int>,"companyName":<string 可空>,"department":<string>,"role":<string>}`

## 2. 用户管理（业务档案）

认证身份（用户名、密码凭证）经 userkit 存储；本组接口负责开户与业务档案。实现阶段必须在本组路由追加 admin 角色检查（见架构基线第 6 节限制）。

### GET /api/users
- 授权：AD。查询：`companyId`（可空，过滤）。
- 响应 200：`{"items":[{"userId":<int>,"username":<string>,"displayName":<string>,"email":<string>,"companyId":<int>,"companyName":<string>,"department":<string>,"role":<string>}],"total":<int>,"page":<int>,"pageSize":<int>}`

### POST /api/users
- 授权：AD。请求：`{"username":<string 3-64 唯一>,"password":<string ≥8>,"displayName":<string 1-64>,"email":<string email 格式>,"companyId":<int 存在>,"department":<string 0-64>,"role":<role 枚举>}`
- 响应 201：创建后的用户对象（同 GET 列表项）。
- 错误：400 `VALIDATION`；409 `USERNAME_TAKEN`。

### PUT /api/users/{userId}/profile
- 授权：AD。请求字段均可选：`{"displayName":<string>,"email":<string>,"companyId":<int>,"department":<string>,"role":<role>}`（密码不在本接口）。
- 响应 200：更新后的用户对象。错误：404 `NOT_FOUND`、400 `VALIDATION`。幂等。

## 3. 公司与分类

### GET /api/companies
- 授权：AD。响应 200：`{"items":[{"id":<int>,"name":<string>}]}`（全量，不分页）。

### POST /api/companies
- 授权：AD。请求：`{"name":<string 1-100 唯一>}`。响应 201：`{"id":<int>,"name":<string>}`。错误：400、409 `DUPLICATE_COMPANY`。

### GET /api/categories
- 授权：AUTH。响应 200：`{"items":[{"id":<int>,"name":<string>}]}`（按 sort_order 全量）。只读字典，无管理接口（需求未规定分类管理）。

## 4. 业务组与成员

### GET /api/companies/{companyId}/groups
- 授权：AD。响应 200：`{"items":[{"id":<int>,"name":<string>,"memberCount":<int>}]}`。

### POST /api/companies/{companyId}/groups
- 授权：AD。请求：`{"name":<string 1-100>}`。响应 201：组对象。错误：400、404（公司不存在）、409 `DUPLICATE_GROUP`。

### PUT /api/groups/{groupId}
- 授权：AD。请求：`{"name":<string 1-100>}`。响应 200：组对象。错误：404、409。幂等。

### DELETE /api/groups/{groupId}
- 授权：AD。响应 204。错误：404；409 `GROUP_HAS_TICKETS`（该组当前存在已分配未终态工单时不允许删除，防止悬挂分配）。

### GET /api/groups/{groupId}/members
- 授权：AD。响应 200：`{"items":[{"userId":<int>,"displayName":<string>,"email":<string>,"department":<string>}]}`。

### POST /api/groups/{groupId}/members
- 授权：AD。请求：`{"userId":<int 存在>}`。响应 201：成员对象。错误：404、409 `DUPLICATE_MEMBER`。

### DELETE /api/groups/{groupId}/members/{userId}
- 授权：AD。响应 204。错误：404（组成员不存在时）。

## 5. 分类自动分配规则

### GET /api/companies/{companyId}/routing-rules
- 授权：AD。响应 200：`{"items":[{"id":<int>,"categoryId":<int>,"categoryName":<string>,"groupId":<int>,"groupName":<string>}]}`。

### POST /api/companies/{companyId}/routing-rules
- 授权：AD。请求：`{"categoryId":<int>,"groupId":<int>}`。
- 响应 201：规则对象。错误：400 `VALIDATION`；404（分类/组不存在）；400 `RULE_GROUP_MISMATCH`（组不属于该公司）；409 `DUPLICATE_RULE`（同公司同分类已有规则）。

### PUT /api/routing-rules/{ruleId}
- 授权：AD。请求：`{"groupId":<int>}`。响应 200：规则对象。错误同上。幂等。

### DELETE /api/routing-rules/{ruleId}
- 授权：AD。响应 204。错误：404。

## 6. 工单

### POST /api/tickets
- 授权：S。
- 请求：`{"subject":<string 1-200>,"description":<string 1-5000>,"categoryId":<int 存在>,"priority":<P0-P4>}`
- 行为：服务端以提交人档案确定 `companyId`；生成 `ticketNo`（"TK-" + 6 位零填充序号，全局唯一）；事务内创建（`created`）→ 入分配队列（`pending_assignment`）→ 查该公司规则 `(companyId, categoryId)`：命中则 `assigned_group_id=规则组`、状态 `in_progress` 并记 `auto_assigned` 日志；未命中保持 `pending_assignment` 并记 `queued` 日志。
- 响应 201：工单对象（见 GET /api/tickets/{id} 的 `ticket`，含 `assignedGroupId` 可空、`assignedGroupName` 可空）。
- 错误：400 `VALIDATION`。

### GET /api/tickets
- 授权：S | A。
- 视图域（服务端强制，前端不可越权）：
  - S：`submitter_id = 当前用户`（公司隔离与本人限定同时生效）。
  - A：`assigned_group_id ∈ 当前用户所属业务组`（跨公司，由成员关系授权）。
- 查询参数（均可空）：`status`、`priority`、`categoryId`、`companyId`（公司维度筛选，A 工作台用；S 忽略该参数）、`search`（`ticketNo` 精确或 `subject` 模糊，不区分大小写）、`sort`（`createdAt`|`priority`|`ticketNo`，默认 `createdAt`）、`order`（`asc`|`desc`，默认 `desc`）、`page`、`pageSize`。A 的工作台默认视图为 `status=in_progress`（由前端传参，服务端不隐式过滤）。
- 响应 200：`{"items":[<工单摘要>],"total":<int>,"page":<int>,"pageSize":<int>}`
- 工单摘要：`{"id":<int>,"ticketNo":<string>,"subject":<string>,"categoryName":<string>,"priority":<string>,"status":<string>,"companyId":<int>,"companyName":<string>,"submitterName":<string>,"assignedGroupName":<string 可空>,"createdAt":<string>}`

### GET /api/tickets/{ticketId}
- 授权：可见者 = 提交人本人 | 当前分配组成员 | `completed_by` 为本人 | AD。不满足返回 404（资源隐藏，不暴露存在性）。
- 响应 200：`{"ticket":<工单摘要 + 以下字段>,"description":<string>,"assignedGroupId":<int 可空>,"completedByName":<string 可空>,"completedAt":<string 可空>,"cancelledByName":<string 可空>,"cancelledAt":<string 可空>,"submitter":{"userId":<int>,"displayName":<string>,"email":<string>,"companyName":<string>,"department":<string>,"historyTotal":<int>},"submitterHistory":[{"ticketNo":<string>,"subject":<string>,"status":<string>,"createdAt":<string>}],"replies":[{"id":<int>,"authorName":<string>,"authorSide":<string>,"content":<string>,"createdAt":<string>}],"satisfaction":<可空 {"rating":<int 1-5>,"comment":<string 可空>,"ratedAt":<string>}>,"emailLog":<可空 {"toEmail":<string>,"status":<string>,"sentAt":<string>}，仅 A/AD 视角返回>`
- `submitterHistory`：该提交人全部历史工单（按创建时间倒序，最多 50 条）；`historyTotal` 为总数。
- 错误：404。

### POST /api/tickets/{ticketId}/replies
- 授权：工单可见者（同 GET 详情）。
- 请求：`{"content":<string 1-5000>}`
- 行为：写入回复；`authorSide` 服务端判定（操作者为工单提交人 → `submitter`，否则 `agent`）；记 `replied` 日志。
- 响应 201：`{"id":<int>,"authorName":<string>,"authorSide":<string>,"content":<string>,"createdAt":<string>}`。错误：404、400。

### POST /api/tickets/{ticketId}/transfer
- 授权：A 且为当前分配组成员。
- 请求：`{"targetGroupId":<int>}`
- 行为：校验工单 `status=in_progress`；目标组属于工单 `companyId` 且 ≠ 当前组；事务内更新 `assigned_group_id`（状态保持 `in_progress`），记 `transferred` 日志（detail 含原组与新组名称）。
- 响应 200：更新后的工单对象。错误：400 `TARGET_COMPANY_MISMATCH`；409 `INVALID_STATE`（非待处理）；409 `SAME_GROUP`；404。

### POST /api/tickets/{ticketId}/complete
- 授权：A 且为当前分配组成员。
- 行为：校验 `status=in_progress`；事务内置 `completed`、`completed_by`、`completed_at`，记 `completed` 日志；事务提交后发送完成通知邮件（收件人 = 提交人档案邮箱），发送结果写 `email_logs`（SMTP 未配置 → `skipped`；异常 → `failed`，不回滚工单状态）。
- 响应 200：`{"ticket":<工单对象 含 completedByName/completedAt>,"emailLog":{"toEmail":<string>,"status":<sent|failed|skipped>,"error":<string 可空>}}`
- 错误：409 `INVALID_STATE`（非待处理或终态）、404。

### POST /api/tickets/{ticketId}/cancel
- 授权：提交人本人 | AD。
- 行为：校验 `status ∈ created|pending_assignment|in_progress`；置 `cancelled`、`cancelled_by`、`cancelled_at`，记 `cancelled` 日志。
- 响应 200：更新后的工单对象。错误：409 `INVALID_STATE`（终态不可取消）、404。

### POST /api/tickets/{ticketId}/satisfaction
- 授权：S 且为工单提交人本人。
- 请求：`{"rating":<int 1-5>,"comment":<string 0-500 可空>}`
- 行为：校验 `status=completed` 且未评价（`satisfaction_ratings.ticket_id` 唯一约束兜底）；写入评价并记 `rated` 日志。
- 响应 201：`{"rating":<int>,"comment":<string 可空>,"ratedAt":<string>}`。错误：409 `INVALID_STATE`（未完成）、409 `ALREADY_RATED`、404、400。

### GET /api/tickets/{ticketId}/logs
- 授权：工单可见者（同 GET 详情）。
- 响应 200：`{"items":[{"id":<int>,"action":<string>,"operatorName":<string>,"detail":<string 可空>,"createdAt":<string>}],"total":<int>,"page":<int>,"pageSize":<int>}`（时间升序；action 展示名由前端映射中文标签）。

## 7. 统计分析

### GET /api/stats/distribution
- 授权：AD | V。查询：`dimension`（`company`|`department`，默认 `company`）。
- 行为：`company` 按 `tickets.company_id` 聚合各公司工单数；`department` 按提交人 `user_profiles.department` 聚合各部门工单数（含跨公司汇总，运营视角）。
- 响应 200：`{"dimension":<string>,"items":[{"key":<string>,"name":<string>,"count":<int>}]}`（按 count 降序）。

### GET /api/stats/dashboard
- 授权：AD | V。
- 口径（对应需求 5.6 推荐基线）：
  - 工单量：总量 + 按状态分布；
  - 平均响应时间：工单 `created_at` 至首条 `author_side='agent'` 回复的平均间隔（分钟，保留 1 位小数；无样本时为 null）；
  - 满意度：已评价工单平均分（保留 2 位小数）+ 已评价数；无评价时 average=null；
  - 热点问题：按 `category_id` 聚合工单量排名 Top 5。
- 响应 200：`{"ticketVolume":{"total":<int>,"byStatus":{"created":<int>,"pending_assignment":<int>,"in_progress":<int>,"completed":<int>,"cancelled":<int>}},"avgResponseMinutes":<number 可空>,"satisfaction":{"average":<number 可空>,"ratedCount":<int>},"hotCategories":[{"categoryId":<int>,"name":<string>,"count":<int>}]}`

## 8. 变更与映射责任

- 前端不执行角色/公司过滤的安全判断，仅按角色渲染；数据域过滤全部在服务端。
- `authorSide`、`ticketNo`、`companyId`（取自提交人档案）、各类日志与时间戳均由服务端生成，前端只读。
- 状态中文标签（创建/待分配/待处理/完成/取消）、操作类型中文标签由前端静态映射。
