# 技术契约（128-ticket 工单系统）

本文件是前后端共同遵循的接口与数据契约的唯一来源；`architecture-baseline.md` 仅保留接口摘要。所有接口均挂载于服务端 API 前缀 `/api` 下。

## 1. 通用约定

- **认证**：除 `POST /api/auth/login` 外，所有接口要求 `Authorization: Bearer <token>`。token 由 authkit 签发。未认证返回 401。
- **公司隔离**：认证后每个请求携带用户公司上下文（来自 `user_profiles.company_id`）。所有工单域资源（工单、回复、评价、日志、通知、业务组、规则、统计）仅限本公司；跨公司资源返回 **404**（`NOT_FOUND`），不确认资源存在性。
- **角色**：`submitter`（提交人）、`agent`（处理人/业务组成员）、`company_admin`（公司配置角色，具备 agent 全部能力）。角色守卫失败返回 **403**（`FORBIDDEN`）。
- **错误结构**：统一 JSON：
  ```json
  { "error": { "code": "string", "message": "string" } }
  ```
  常用 code：`UNAUTHORIZED`(401)、`FORBIDDEN`(403)、`NOT_FOUND`(404)、`VALIDATION`(400)、`STATE_CONFLICT`(409)。
- **时间**：ISO-8601 UTC 字符串（如 `2026-10-20T08:30:00.000Z`）。服务端生成，客户端只读。
- **幂等性**：`dispatch`、`cancel`、`complete`、`rating` 等状态推进接口按状态守卫幂等重放（重复调用返回当前状态或 409，见 §3）；创建/回复类接口自然幂等（重复插入产生新记录，客户端避免重复提交）。
- **分页**：列表接口支持 `page`（≥1，默认 1）与 `pageSize`（1–100，默认 20），响应含 `items` 与 `total`。

## 2. 数据模型与字段

### 2.1 基础与用户

| 表 | 字段（类型，约束） |
| --- | --- |
| `companies` | `id` INTEGER PK；`name` TEXT NOT NULL；`created_at` TEXT NOT NULL |
| `users` | userkit 模块自有实现（登录名、密码凭证）；应用仅经其公开 API 访问，不直接依赖其内部列 |
| `user_profiles` | `user_id` TEXT PK（关联 userkit 用户）；`display_name` TEXT NOT NULL；`email` TEXT NOT NULL；`company_id` INTEGER NOT NULL FK→companies；`department` TEXT NULL；`role` TEXT NOT NULL CHECK IN ('submitter','agent','company_admin') |

### 2.2 分配域

| 表 | 字段 |
| --- | --- |
| `groups` | `id` INTEGER PK；`company_id` INTEGER NOT NULL FK；`name` TEXT NOT NULL；`created_at` TEXT NOT NULL；UNIQUE(`company_id`,`name`) |
| `group_members` | `group_id` INTEGER NOT NULL FK；`user_id` TEXT NOT NULL；PK(`group_id`,`user_id`) |
| `company_categories` | `company_id` INTEGER NOT NULL FK；`category` TEXT NOT NULL；PK(`company_id`,`category`) |
| `category_rules` | `id` INTEGER PK；`company_id` INTEGER NOT NULL FK；`category` TEXT NOT NULL；`group_id` INTEGER NOT NULL FK；UNIQUE(`company_id`,`category`) |

### 2.3 工单域

| 表 | 字段 |
| --- | --- |
| `tickets` | `id` INTEGER PK；`ticket_no` TEXT NOT NULL UNIQUE（展示编号，`TK-` + 6 位零填充）；`company_id` INTEGER NOT NULL FK；`subject` TEXT NOT NULL（≤200 字符）；`description` TEXT NOT NULL（≤5000 字符）；`category` TEXT NOT NULL；`priority` TEXT NOT NULL CHECK IN ('P0','P1','P2','P3','P4')；`status` TEXT NOT NULL CHECK IN ('created','pending_assignment','processing','completed','cancelled')；`submitter_user_id` TEXT NOT NULL；`submitter_name` TEXT NOT NULL（快照）；`submitter_email` TEXT NOT NULL（快照）；`submitter_department` TEXT NULL（快照）；`group_id` INTEGER NULL FK（当前归属业务组）；`assignee_user_id` TEXT NULL（当前受理人，转派到成员时设置）；`handler_user_id` TEXT NULL（完成时记录处理人）；`handler_name` TEXT NULL（快照）；`created_at` TEXT NOT NULL；`dispatched_at` TEXT NULL；`assigned_at` TEXT NULL（归属业务组时间）；`first_reply_at` TEXT NULL；`completed_at` TEXT NULL；`cancelled_at` TEXT NULL |
| `ticket_replies` | `id` INTEGER PK；`ticket_id` INTEGER NOT NULL FK；`company_id` INTEGER NOT NULL；`author_user_id` TEXT NOT NULL；`author_name` TEXT NOT NULL（快照）；`author_kind` TEXT NOT NULL CHECK IN ('submitter','agent')；`content` TEXT NOT NULL（≤5000 字符）；`created_at` TEXT NOT NULL |
| `ratings` | `id` INTEGER PK；`ticket_id` INTEGER NOT NULL UNIQUE FK；`company_id` INTEGER NOT NULL；`rater_user_id` TEXT NOT NULL（须为该工单提交人）；`score` INTEGER NOT NULL CHECK 1–5；`comment` TEXT NULL（≤1000 字符）；`created_at` TEXT NOT NULL |
| `ticket_activity` | `id` INTEGER PK；`ticket_id` INTEGER NOT NULL FK；`company_id` INTEGER NOT NULL；`action` TEXT NOT NULL CHECK IN ('created','dispatched','assigned','replied','transferred','completed','cancelled','rated')；`operator_user_id` TEXT NULL（系统动作可为空）；`operator_name` TEXT NOT NULL；`detail` TEXT NULL（JSON 字符串：目标组、原因等）；`occurred_at` TEXT NOT NULL |
| `notification_log` | `id` INTEGER PK；`ticket_id` INTEGER NOT NULL FK；`company_id` INTEGER NOT NULL；`recipient_email` TEXT NOT NULL；`subject` TEXT NOT NULL；`status` TEXT NOT NULL CHECK IN ('sent','skipped','failed')；`sent_at` TEXT NOT NULL |

提交人快照字段在创建时从 `user_profiles` 复制，后续不随档案变更回填（保证工单记录稳定）。

## 3. 工单状态机

| 当前状态 | 动作 | 目标状态 | 守卫（服务端裁决） |
| --- | --- | --- | --- |
| `created` | dispatch（进入分配流程） | `pending_assignment` | 本公司用户；工单为 created 态 |
| `pending_assignment` | 规则命中 / 人工归属（transfer） | `processing` | 规则：`(company_id, category)` 命中 `category_rules`；归属时写 `group_id`、`assigned_at` |
| `processing` | transfer（转派） | `processing` | 变更 `group_id`（可同时设置 `assignee_user_id`），记录 transferred 日志 |
| `processing` | complete | `completed` | agent/company_admin；写 `handler_user_id`、`handler_name`、`completed_at`；触发邮件通知 |
| `created` / `pending_assignment` / `processing` | cancel | `cancelled` | 本公司 agent/company_admin 或提交人本人取消自己的工单；写 `cancelled_at` |
| `completed` | rating | 状态不变 | 仅提交人本人；一工单一条评价（重复返回 409 `STATE_CONFLICT`） |

状态推进冲突一律返回 409 `{code:'STATE_CONFLICT'}`，响应体附当前 `status` 于 `message`。

## 4. API 契约

### 4.1 认证与当前用户

**POST /api/auth/login**（公开）
- 请求：`{ "username": string, "password": string }`
- 响应 200：`{ "token": string, "user": UserProfile }`
- 错误：401 `UNAUTHORIZED`
- UserProfile：`{ "id": string, "displayName": string, "email": string, "companyId": integer, "companyName": string, "department": string|null, "role": "submitter"|"agent"|"company_admin" }`

**GET /api/auth/me**（任意登录用户）
- 响应 200：`{ "user": UserProfile }`

### 4.2 工单

**POST /api/tickets**（submitter/agent/company_admin；提交人视角）
- 请求：`{ "subject": string(1–200), "description": string(1–5000), "category": string(须在本公司 company_categories 清单内), "priority": "P0"|"P1"|"P2"|"P3"|"P4" }`
- 行为：落库（`status:'created'`），写 `ticket_activity(created)`；**不做分配**（由前端随后调用 dispatch）。
- 响应 201：`{ "ticket": Ticket }`

**POST /api/tickets/:id/dispatch**（本公司登录用户）
- 行为：`created → pending_assignment`，写 `dispatched_at` 与 `dispatched` 日志；随后执行规则匹配：命中 → 设置 `group_id`、`assigned_at`，置 `processing`，写 `assigned` 日志；未命中 → 停留 `pending_assignment`。
- 响应 200：`{ "ticket": Ticket }`（终态：processing 或 pending_assignment）
- 错误：404（不存在/跨公司）；409（非 created 态重复 dispatch）
- 幂等：仅 created 态可执行。

**GET /api/tickets**（本公司登录用户）
- 查询参数：
  - `view`: `mine`(默认，我提交的) | `workbench`(工作台：本公司工单，可配合 `group` 过滤) | `company`(本公司全部，等价 workbench 无组过滤)
  - `status`: created|pending_assignment|processing|completed|cancelled（可多次，逗号分隔）
  - `category`: string；`priority`: P0–P4；`group`: integer（业务组 ID）
  - `q`: string（匹配 `ticket_no` 前缀/全等 或 `subject` 模糊，不区分大小写）
  - `sort`: `created_at`(默认)|`priority`|`status`；`order`: `desc`(默认)|`asc`
  - `page`、`pageSize`
- 响应 200：`{ "items": TicketSummary[], "total": integer }`
- 公司维度筛选说明：`view=company|workbench` 范围恒为登录用户公司；无跨公司选项（隔离边界）。
- TicketSummary：`{ "id": integer, "ticketNo": string, "subject": string, "category": string, "priority": string, "status": string, "submitterName": string, "groupName": string|null, "createdAt": string, "completedAt": string|null }`

**GET /api/tickets/:id**（本公司登录用户）
- 响应 200：`{ "ticket": Ticket, "replies": Reply[], "activity": ActivityEntry[], "notifications": NotificationEntry[], "rating": Rating|null, "submitter": { "userId": string, "displayName": string, "email": string, "companyName": string, "department": string|null, "historyTickets": TicketSummary[] } }`
- `submitter.historyTickets`：该提交人在本公司的工单（不含当前工单），按创建时间倒序，上限 20 条。
- Ticket：TicketSummary 全字段 + `description`、`submitterEmail`、`submitterDepartment`、`assigneeUserId`、`handlerName`、`dispatchedAt`、`assignedAt`、`firstReplyAt`、`cancelledAt`、`groupId`。
- Reply：`{ "id": integer, "authorName": string, "authorKind": "submitter"|"agent", "content": string, "createdAt": string }`
- ActivityEntry：`{ "id": integer, "action": string, "operatorName": string, "detail": string|null, "occurredAt": string }`
- NotificationEntry：`{ "id": integer, "recipientEmail": string, "subject": string, "status": "sent"|"skipped"|"failed", "sentAt": string }`
- Rating：`{ "score": integer(1–5), "comment": string|null, "createdAt": string }`
- 错误：404（不存在/跨公司）

**POST /api/tickets/:id/replies**（本公司登录用户）
- 请求：`{ "content": string(1–5000) }`
- 行为：插入回复（`author_kind` 按请求者角色与工单关系判定：提交人本人=submitter，agent/company_admin=agent）；工单尚无回复时更新 `first_reply_at`；写 `replied` 日志。
- 响应 201：`{ "reply": Reply }`

**POST /api/tickets/:id/transfer**（agent/company_admin）
- 请求：`{ "targetGroupId": integer(本公司业务组), "targetUserId": string|null(组内成员，可选), "reason": string|null(≤500) }`
- 行为：变更归属（`pending_assignment` 或 `processing` 态均可；`pending_assignment` 转派即人工归属）；置 `processing`，更新 `group_id`（及可选 `assignee_user_id`）；写 `transferred` 日志（detail 含目标组与原因）。
- 响应 200：`{ "ticket": Ticket }`
- 错误：404；403；400（目标组不属于本公司或不存在）

**POST /api/tickets/:id/complete**（agent/company_admin）
- 请求：`{ "resolution": string|null(≤2000, 完成说明，可选) }`
- 行为：`processing → completed`；写 `handler_user_id`、`handler_name`、`completed_at`；写 `completed` 日志；调用 notification 模块向 `submitter_email` 发送完成邮件并落 `notification_log`。邮件失败不回滚完成。
- 响应 200：`{ "ticket": Ticket, "notification": NotificationEntry }`
- 错误：404；403；409（非 processing 态）

**POST /api/tickets/:id/cancel**（提交人本人，或 agent/company_admin）
- 请求：`{ "reason": string|null(≤500) }`
- 行为：`created|pending_assignment|processing → cancelled`；写 `cancelled_at` 与 `cancelled` 日志。
- 响应 200：`{ "ticket": Ticket }`
- 错误：404；403；409（已完成工单不可取消）

**POST /api/tickets/:id/rating**（仅该工单提交人本人）
- 请求：`{ "score": integer(1–5), "comment": string|null(≤1000) }`
- 响应 201：`{ "rating": Rating }`
- 行为：写 `ratings` 与 `rated` 日志。
- 错误：404；403（非提交人）；409（工单未完成或已评价）

**GET /api/tickets/:id/activity**（本公司登录用户）
- 响应 200：`{ "items": ActivityEntry[] }`（按 occurred_at 升序）
- 错误：404

### 4.3 分配配置（company_admin）

**GET /api/groups** → 200 `{ "items": [{ "id": integer, "name": string, "memberCount": integer, "members": [{ "userId": string, "displayName": string }] }] }`

**POST /api/groups** `{ "name": string(1–100) }` → 201 `{ "group": {...} }`；错误：400/409（重名）

**PUT /api/groups/:id/members** `{ "userIds": string[]（本公司用户） }`（全量替换成员）→ 200 `{ "group": {...} }`；错误：404/400（含非本公司用户）

**DELETE /api/groups/:id** → 204；错误：404/409（组仍被 category_rules 引用时先解除规则）

**GET /api/categories** → 200 `{ "items": ["string"] }`（本公司分类清单）

**POST /api/categories** `{ "category": string(1–50) }` → 201；409（已存在）

**DELETE /api/categories/:category** → 204；409（仍被规则引用）

**GET /api/category-rules** → 200 `{ "items": [{ "id": integer, "category": string, "groupId": integer, "groupName": string }] }`

**PUT /api/category-rules/:category** `{ "groupId": integer }`（存在则更新，不存在则创建）→ 200 `{ "rule": {...} }`；错误：400（分类不在清单或组不属于本公司）

**DELETE /api/category-rules/:category** → 204

### 4.4 统计（本公司登录用户）

**GET /api/stats/dashboard**
- 响应 200：
  ```json
  {
    "totalTickets": integer,
    "statusBreakdown": { "created": integer, "pending_assignment": integer, "processing": integer, "completed": integer, "cancelled": integer },
    "avgResponseMinutes": number|null,
    "avgRating": number|null,
    "ratedCount": integer,
    "hotCategories": [{ "category": string, "count": integer }]
  }
  ```
- 口径：`avgResponseMinutes` = 有 `first_reply_at` 的工单的 `(first_reply_at - created_at)` 平均分钟数（保留 1 位小数；无样本为 null）；`avgRating` = 已评价工单平均分（保留 2 位小数）；`hotCategories` = 按分类聚合工单量降序前 10。

**GET /api/stats/distribution?dimension=department|company**
- 响应 200：`{ "dimension": string, "items": [{ "label": string, "count": integer }] }`
- 口径：`department` 按提交人部门聚合（快照字段，空部门归入「未填写」）；`company` 在公司隔离范围内聚合（登录用户视角为本公司单行聚合，label 为公司名）。
- 错误：400（非法 dimension）

### 4.5 用户管理（userkit starter + 应用守卫）

userkit starter 生成的用户管理页面与 API 经 authkit 登录认证；**应用层必须叠加 company_admin 角色守卫**（starter 默认不校验角色，此为架构基线固定约束）。创建/编辑用户时同步维护 `user_profiles`（公司、部门、角色、显示名、邮箱）。

## 5. 邮件通知契约

- 触发：工单 `complete` 成功后，同步调用 `emailkit.send()` 一次。
- 收件人：`tickets.submitter_email`（创建时快照）。
- 主题：`[工单系统] 工单 {ticketNo}「{subject}」已完成`。
- 正文：text/html 双份，含工单编号、主题、处理人姓名、完成时间、满意度评价入口提示。
- 配置：`SMTP_HOST`（空=禁用投递→skipped）、`SMTP_PORT`（默认 587）、`SMTP_USER`/`SMTP_PASS`（成对提供或均省略）、`SMTP_FROM`、`SMTP_FROM_NAME`。
- 结果三态（与 emailkit 返回一致）写入 `notification_log.status`：`sent`/`skipped`/`failed`。失败不重试、不阻塞完成操作；记录可经工单详情查询。

## 6. 种子数据（npm run seed，幂等）

- 公司 A「云帆科技」与公司 B「远山制造」。
- 每公司用户：提交人 1（`a-submitter@demo.io` / `b-submitter@demo.io`）、处理人 2（业务组成员）、配置人 1（company_admin）；密码统一 `Demo#12345`（演示种子，非生产凭证）。
- 每公司业务组 2 个（如「技术支持组」「账务问题组」），处理人分别入组。
- 分类清单：`故障报修`、`账号问题`、`账务问题`、`功能咨询`。
- 规则示例：公司 A「故障报修」→技术支持组；公司 B「账务问题」→账务问题组。
- 不预置工单数据（由验收流程创建，保证统计口径从零可复现）。

## 7. 运行映射

- 启动：工作区根 `npm install && npm run build && npm start`；端口 `PORT`（默认 3000）；开发：工作区根 `npm run dev`（Vite 5173 代理 `/api` + 服务端 3000）。
- 数据库：`DB_PATH`（默认 `./data/application.db`，启动前创建父目录）。
- 迁移：`app/ticket-system/src/server/migrations/sqlite/` 版本化 SQL，启动时经 dbkit `runMigrations` 执行。
- 种子：`npm run seed`（幂等，可重复执行；实现阶段在应用包新增该脚本）。
