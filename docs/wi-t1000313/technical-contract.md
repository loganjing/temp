# 技术契约（127-ticket 工单系统）

> 工作项：wi-t1000313 ｜ 前后端共同遵循的 API 与数据契约，字段级定义以本文件为唯一来源。架构结论见 `docs/wi-t1000313/architecture-baseline.md`。

## 1. 通用约定

- 基础路径：`/api`；请求/响应内容类型 `application/json; charset=utf-8`。
- 认证：除 `POST /api/auth/login` 外，全部端点要求 `Authorization: Bearer <token>`（authkit 登录发放）。未认证或 Token 失效 → 401 `UNAUTHENTICATED`。
- 时间：ISO 8601 UTC 字符串（如 `2026-10-20T08:30:00.000Z`）。
- 分页：`page`（1 起）、`page_size`（默认 20，最大 100）；列表响应统一为 `{ "items": [...], "page": <int>, "page_size": <int>, "total": <int> }`。
- 错误模型：`{ "error": { "code": "<CODE>", "message": "<可读信息>" } }`。常用码：`UNAUTHENTICATED`(401)、`INVALID_CREDENTIALS`(401)、`FORBIDDEN`(403)、`NOT_FOUND`(404)、`VALIDATION_FAILED`(400)、`INVALID_STATE`(409)、`ALREADY_RATED`(409)、`DUPLICATE_NAME`(409)、`DUPLICATE_EMAIL`(409)、`DUPLICATE_MEMBER`(409)、`GROUP_IN_USE`(409)、`GROUP_COMPANY_MISMATCH`(400)、`USER_COMPANY_MISMATCH`(400)。
- 数据域语义：不在请求者数据域内的资源一律 404（不泄露存在性）；域内但角色不允许的动作 403。
- 幂等：创建类端点非幂等（重复提交生成新工单/新回复）；`PUT /api/assignment-rules` 按（公司, 分类）upsert；满意度评价每工单仅一次。

## 2. 角色与数据域

`user_profiles.role ∈ { submitter, handler, ops }`。任何已认证用户（含 handler/ops）均可提交工单。

| 角色 | 工单读取 | 工单操作 | 管理与跨公司 |
|---|---|---|---|
| submitter | 本人提交的工单 | 回复（本人工单）、取消（本人非终态工单）、满意度评价（本人已完成工单） | 无 |
| handler | 本公司全部工单 | 回复、手动分配、转派、完成 | 本公司业务组与分配规则只读 |
| ops | 全部公司工单 | 回复、手动分配、转派、完成、取消 | 公司/用户档案/业务组/分配规则管理、审计检索、跨公司统计与工作台公司筛选 |

## 3. 数据模型（项目表，SQLite）

| 表 | 字段（类型/约束/可空） |
|---|---|
| companies | id INTEGER PK 自增；name TEXT NOT NULL UNIQUE；created_at TEXT NOT NULL |
| user_profiles | user_id INTEGER PK（关联 platform_users.id）；company_id INTEGER NOT NULL（关联 companies.id）；display_name TEXT NOT NULL；department TEXT NULL；role TEXT NOT NULL CHECK IN ('submitter','handler','ops')；created_at TEXT NOT NULL；updated_at TEXT NOT NULL |
| business_groups | id INTEGER PK 自增；company_id INTEGER NOT NULL；name TEXT NOT NULL；created_at TEXT NOT NULL；UNIQUE(company_id, name) |
| business_group_members | group_id INTEGER NOT NULL；user_id INTEGER NOT NULL；added_at TEXT NOT NULL；PK(group_id, user_id) |
| assignment_rules | id INTEGER PK 自增；company_id INTEGER NOT NULL；category TEXT NOT NULL；group_id INTEGER NOT NULL；created_at TEXT NOT NULL；UNIQUE(company_id, category) |
| tickets | id INTEGER PK 自增；ticket_no TEXT NOT NULL UNIQUE；subject TEXT NOT NULL；description TEXT NOT NULL；category TEXT NOT NULL；priority TEXT NOT NULL CHECK IN ('P0','P1','P2','P3','P4')；status TEXT NOT NULL CHECK IN ('created','pending_assignment','in_progress','completed','cancelled')；company_id INTEGER NOT NULL；submitter_user_id INTEGER NOT NULL；submitter_name TEXT NOT NULL；submitter_department TEXT NULL；submitter_email TEXT NOT NULL；created_at TEXT NOT NULL；assigned_group_id INTEGER NULL；assigned_handler_id INTEGER NULL；handled_by INTEGER NULL；handled_at TEXT NULL；completed_at TEXT NULL；cancelled_at TEXT NULL；cancel_reason TEXT NULL |
| ticket_replies | id INTEGER PK 自增；ticket_id INTEGER NOT NULL；author_user_id INTEGER NOT NULL；author_name TEXT NOT NULL；content TEXT NOT NULL；created_at TEXT NOT NULL |
| ticket_ratings | ticket_id INTEGER PK（关联 tickets.id）；score INTEGER NOT NULL CHECK BETWEEN 1 AND 5；comment TEXT NULL；created_at TEXT NOT NULL |

- 模块表（不重复定义，由模块迁移建立）：`platform_users`（userkit）、`platform_audit_events`（auditkit）。
- 分类为字符串精确匹配（规则匹配与统计聚合）；推荐基线分类由迁移种子提供：账户与权限、功能使用、数据问题、性能问题、集成对接、其他。
- `user_profiles.company_id` 创建后不可变更（公司归属调整通过新建用户实现，保证历史工单数据域稳定）。

## 4. 认证与当前用户

- `POST /api/auth/login`（starter 提供）｜请求：`{ "email": string, "password": string }`｜响应 200：`{ "token": string, "user": CurrentUser }`｜错误：401 `INVALID_CREDENTIALS`。
- `POST /api/auth/logout`｜响应 204。
- `GET /api/auth/me`｜响应 200：CurrentUser。
- CurrentUser：`{ "id": integer, "email": string, "display_name": string, "company_id": integer, "department": string|null, "role": "submitter"|"handler"|"ops" }`。
- 首个账户初始化遵循 starter 生成流程；后续账户经 `POST /api/admin/users` 创建。

## 5. 管理端（仅 ops；其他角色 403）

- `GET /api/admin/companies` → 200 `{ items: [Company] }`；Company = `{ id, name, created_at }`。
- `POST /api/admin/companies`｜请求 `{ name: string(1-100) }` → 201 Company｜409 `DUPLICATE_NAME`。
- `GET /api/admin/users?company_id=integer` → 200 `{ items: [AdminUser] }`；AdminUser = `{ user_id, email, display_name, company_id, department, role }`。
- `POST /api/admin/users`｜请求 `{ email: string, password: string(≥8), display_name: string(1-100), company_id: integer, department?: string(0-100), role: "submitter"|"handler"|"ops" }` → 201 AdminUser｜400 `VALIDATION_FAILED`｜409 `DUPLICATE_EMAIL`。语义：同一事务内创建 userkit 本地用户与项目档案；email 全局唯一。
- `PATCH /api/admin/users/{user_id}`｜请求 `{ display_name?: string, department?: string, role?: "submitter"|"handler"|"ops" }` → 200 AdminUser｜404。`company_id` 不可变更。

## 6. 业务组与分配规则

- `GET /api/business-groups?company_id=integer` → 200 `{ items: [BusinessGroup] }`；BusinessGroup = `{ id, company_id, name, members: [{ user_id, display_name, department }] }`。权限：ops（任意公司）或该公司 handler（仅本公司）。
- `POST /api/business-groups`（仅 ops）｜请求 `{ company_id: integer, name: string(1-100) }` → 201 BusinessGroup（members 为空）｜409 `DUPLICATE_NAME`。
- `PATCH /api/business-groups/{id}`（仅 ops）｜请求 `{ name: string(1-100) }` → 200｜409 `DUPLICATE_NAME`。
- `DELETE /api/business-groups/{id}`（仅 ops）→ 204｜409 `GROUP_IN_USE`（存在 status='in_progress' 且 assigned_group_id 指向该组的工单）。
- `POST /api/business-groups/{id}/members`（仅 ops）｜请求 `{ user_id: integer }` → 201 `{ user_id, display_name, department }`｜400 `USER_COMPANY_MISMATCH`（用户不属于该公司）｜409 `DUPLICATE_MEMBER`。
- `DELETE /api/business-groups/{id}/members/{user_id}`（仅 ops）→ 204。
- `GET /api/assignment-rules?company_id=integer` → 200 `{ items: [AssignmentRule] }`；AssignmentRule = `{ id, company_id, category, group_id, group_name }`。权限同业务组读取。
- `PUT /api/assignment-rules`（仅 ops，按（company_id, category）upsert）｜请求 `{ company_id: integer, category: string(1-50), group_id: integer }` → 200（更新）或 201（新建）AssignmentRule｜400 `GROUP_COMPANY_MISMATCH`（目标组不属于该公司）。
- `DELETE /api/assignment-rules/{id}`（仅 ops）→ 204。

## 7. 工单

对象定义：

- TicketSummary（列表）：`{ id, ticket_no, subject, category, priority, status, company_id, company_name, submitter_name, created_at, assigned_group_id, assigned_group_name, assigned_handler_id, handled_at }`。
- TicketDetail（详情）：TicketSummary 全部字段，另含 `{ description, submitter_user_id, submitter_department, submitter_email, handled_by, handled_by_name, completed_at, cancelled_at, cancel_reason, rating: { score, comment, created_at } | null, replies: [Reply] }`。
- Reply：`{ id, author_user_id, author_name, content, created_at }`。

### 7.1 POST /api/tickets（创建）

- 权限：任何已认证用户。
- 请求：`{ subject: string(1-200), description: string(1-5000), category: string(1-50), priority: "P0"|"P1"|"P2"|"P3"|"P4" }`。
- 语义：提交人=当前用户；公司=当前用户公司；快照 submitter_name/submitter_department/submitter_email；生成唯一 ticket_no（`TKT-NNNNNN`，事务内序号）；初始状态 `created` 后在同一请求内执行自动分配——命中（company_id, category）规则 → 设置 assigned_group_id、状态 `in_progress`；未命中 → 状态 `pending_assignment`。写审计 `ticket.created`（命中时追加 `ticket.auto_assigned`）。
- 响应：201 TicketDetail｜400 `VALIDATION_FAILED`。

### 7.2 GET /api/tickets（工作台/我的工单列表）

- 参数：`scope=mine|workbench`（默认 `mine`）、`status`（逗号分隔多值；scope=workbench 时默认 `in_progress`）、`category`、`priority`、`company_id`（仅 scope=workbench 且 ops 生效）、`q`（搜索：ticket_no 前缀或 subject/submitter_name 包含）、`sort=created_at|priority`（默认 created_at）、`order=asc|desc`（默认 desc）、`page`、`page_size`。
- 语义：
  - `scope=mine`：当前用户提交的工单（全部状态），强制 submitter_user_id=当前用户。
  - `scope=workbench`：待处理队列。handler → 本公司；ops → 全部公司（company_id 可选过滤）；submitter → 403 `FORBIDDEN`。
  - 非 ops 传入 `company_id` → 403 `FORBIDDEN`（明确拒绝越域筛选，不静默忽略）。
  - priority 排序按 P0→P4 优先；created_at 按时间排序。
- 响应：200 `{ items: [TicketSummary], page, page_size, total }`。

### 7.3 GET /api/tickets/{id}

- 权限：数据域内（submitter 本人 / handler 本公司 / ops）；越域 404 `NOT_FOUND`。
- 响应：200 TicketDetail。

### 7.4 POST /api/tickets/{id}/replies（多轮回复）

- 权限：工单提交人、本公司 handler 或 ops。
- 请求：`{ content: string(1-5000) }`。
- 前置：状态 ∈ {pending_assignment, in_progress}（终态 → 409 `INVALID_STATE`）。
- 语义：author=当前用户（快照姓名）；写审计 `ticket.replied`。
- 响应：201 Reply。

### 7.5 POST /api/tickets/{id}/assign（手动分配）

- 权限：ops 或本公司 handler。
- 请求：`{ group_id: integer, handler_id?: integer }`。
- 前置：status = `pending_assignment`（否则 409 `INVALID_STATE`）。
- 语义：group 须属工单公司（400 `GROUP_COMPANY_MISMATCH`）；设置 assigned_group_id 与可选 assigned_handler_id；状态 → `in_progress`；写审计 `ticket.assigned`。
- 响应：200 TicketDetail。

### 7.6 POST /api/tickets/{id}/transfer（转派）

- 权限：ops 或本公司 handler。
- 请求：`{ to_group_id: integer, to_handler_id?: integer, reason?: string(0-500) }`。
- 前置：status = `in_progress`。
- 语义：目标组须属工单公司（400 `GROUP_COMPANY_MISMATCH`）；更新 assigned_group_id/assigned_handler_id；状态保持 `in_progress`；写审计 `ticket.transferred`（details 含 from/to/reason，可追溯）。
- 响应：200 TicketDetail。

### 7.7 POST /api/tickets/{id}/complete（完成处理）

- 权限：ops 或本公司 handler。
- 请求：`{ resolution?: string(0-2000) }`。
- 前置：status = `in_progress`。
- 语义：同一事务内设置 handled_by=当前用户、handled_at=now、completed_at=now、状态 → `completed`（终态）；resolution 非空时追加为该处理人的一条回复。事务提交后触发邮件通知（第 10 节）；写审计 `ticket.completed` 与 `email.notification_sent|failed`。
- 响应：200 TicketDetail。

### 7.8 POST /api/tickets/{id}/cancel（取消）

- 权限：工单提交人或 ops。
- 请求：`{ reason?: string(0-500) }`。
- 前置：status ∈ {created, pending_assignment, in_progress}（终态 → 409 `INVALID_STATE`）。
- 语义：状态 → `cancelled`（终态）、记录 cancelled_at 与 cancel_reason；写审计 `ticket.cancelled`。
- 响应：200 TicketDetail。

### 7.9 POST /api/tickets/{id}/rating（满意度评价）

- 权限：仅工单提交人。
- 请求：`{ score: integer(1-5), comment?: string(0-1000) }`。
- 前置：status = `completed`；该工单未评价过（409 `ALREADY_RATED`）。
- 响应：201 `{ ticket_id, score, comment, created_at }`；写审计 `ticket.rated`。评价在工单详情中可见。

### 7.10 GET /api/tickets/{id}/submitter（提交人完整视图）

- 权限：ops、本公司 handler 或提交人本人；越域 404。
- 响应：200 `{ user_id, display_name, email, company: { id, name }, department, history: [{ ticket_no, subject, status, priority, created_at }] }`（该提交人的工单按创建时间倒序）。
- 语义：历史工单均属提交人所在公司，无跨公司泄漏。

## 8. 统计分析

### 8.1 GET /api/statistics/distribution

- 参数：`dimension=company|department`（必填）；`company_id?: integer`（仅 ops 生效）。
- 权限：ops（全量或按 company_id 过滤）；handler（本公司，传入 company_id 须等于本公司，否则 403）；submitter → 403。
- 语义：dimension=company → 按 tickets.company_id 计数；dimension=department → 按 tickets.submitter_department 计数（NULL 归入"未填写"）。
- 响应：200 `{ dimension, items: [{ key, label, count }] }`（count 降序）。

### 8.2 GET /api/statistics/dashboard

- 参数：`company_id?: integer`（仅 ops 生效）。
- 权限：ops（全量或过滤）或 handler（本公司）；submitter → 403。
- 响应：200
  - `ticket_volume: { total: integer, by_status: { created, pending_assignment, in_progress, completed, cancelled: integer } }`
  - `avg_response_time_minutes: number|null`（1 位小数；无样本为 null）
  - `satisfaction: { average: number|null, rated_count: integer, completed_count: integer }`
  - `hot_categories: [{ category, count }]`（top 10，计数降序）
- 指标口径：avg_response_time_minutes = mean(工单首条回复 created_at − 工单 created_at)（分钟），样本为存在回复的工单；satisfaction.average = mean(ticket_ratings.score)；hot_categories = 按 category 计数降序前 10。指标实时计算，随底层数据变化更新。

## 9. 审计日志

### 9.1 GET /api/audit-events

- 参数：`ticket_id?: integer`、`company_id?: integer`、`action?: string`、`page`、`page_size`。
- 权限：ops（全量）或 handler（本公司，company_id 强制为本公司）；submitter → 403。
- 响应：200 `{ items: [{ id, action, actor_user_id, actor_name, occurred_at, ticket_id: integer|null, company_id: integer|null, details: object }], page, page_size, total }`。
- 动作枚举（写入侧统一，均含操作者/时间/动作）：`ticket.created`、`ticket.auto_assigned`、`ticket.assigned`、`ticket.transferred`、`ticket.replied`、`ticket.completed`、`ticket.cancelled`、`ticket.rated`、`email.notification_sent`、`email.notification_failed`；管理类动作（公司/用户/业务组/规则）可另行记录，不作为验收必需集合。

## 10. 邮件通知契约

- 触发：`POST /api/tickets/{id}/complete` 事务提交成功后、响应返回前执行（事务外）。
- 收件人：`tickets.submitter_email`（创建时快照）。
- 主题：`[工单完成] {ticket_no} {subject}`；正文包含：处理人姓名、完成时间、工单号/主题/分类/优先级、resolution 摘要（若有）与评价引导。
- 结果：成功 → 审计 `email.notification_sent`；失败（含 SMTP 未配置/网络错误）→ 审计 `email.notification_failed`（details 含原因摘要）并输出服务端错误日志。两种结果均不改变工单状态，也不改变 complete 的成功响应。
- 配置：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`、`SMTP_FROM_NAME`（可选；emailkit 约定）；`SMTP_HOST` 为空时 emailkit 禁用外发邮件，此时通知无法送达，仍如实记录 `email.notification_failed`（原因：SMTP 未配置）。

## 11. 状态机（权威定义）

| 当前状态 | 动作 | 下一状态 | 附加效果 | 违规错误 |
|---|---|---|---|---|
| created | 自动分配命中（创建请求内） | in_progress | assigned_group_id | — |
| created | 无匹配规则（创建请求内） | pending_assignment | — | — |
| pending_assignment | assign | in_progress | assigned_group_id/assigned_handler_id | 409 INVALID_STATE |
| in_progress | transfer | in_progress | 归属变更 + 审计 | 409 INVALID_STATE |
| in_progress | complete | completed（终态） | handled_by/handled_at/completed_at + 邮件 | 409 INVALID_STATE |
| created / pending_assignment / in_progress | cancel | cancelled（终态） | cancelled_at/cancel_reason | 409 INVALID_STATE |
| completed | rating（仅提交人） | completed（不变） | ticket_ratings 写入 | 409 ALREADY_RATED |
| completed / cancelled | 其他状态变更动作 | —（终态） | — | 409 INVALID_STATE |

`created` 仅在创建请求内作为初始状态存在（瞬态），请求返回后的可观察状态为 `in_progress` 或 `pending_assignment`。

## 12. 环境变量与运行

- `PORT`：服务监听端口（可配置，默认 3000；开发模式 Vite 5173 将 `/api` 代理至 3000）。
- `DB_PATH`：SQLite 文件路径（默认 `./data/application.db`，相对 packageRoot；启动时自动创建父目录；测试用独立路径覆盖，亦可设 `:memory:`）。
- `JWT_SECRET`：authkit 认证密钥（初始化已在根目录 `.env` 生成随机值，部署时保持私密）。
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `SMTP_FROM_NAME`（可选）：邮件发送配置（emailkit 约定）；`SMTP_HOST` 为空时禁用外发邮件。
- 启动：`npm run build`（构建前端产物）后 `npm start`（`node --import tsx src/server/index.ts`，packageRoot 下）；开发：根目录 `npm run dev`；验收/验证脚本独立负责启动与清理（空闲端口 + `DB_PATH` 隔离库），仅运行该脚本，不额外后台启动服务。
