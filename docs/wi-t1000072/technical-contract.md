# 技术契约（工单系统）

本文件是接口字段、ID 类型与错误语义的唯一来源；架构基线只保留接口摘要。

## 1. 实体 ID 对照

| 实体 | 生成方 | 数据库列 / 类型 | 外键类型 | API JSON | 前端类型 | 转换与校验位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 公司 companyId | 种子/迁移（稳定业务码） | `companies.id` TEXT | TEXT | string | string | 服务端只接受数据库返回值，前端仅透传 |
| 部门 departmentId | 种子/迁移 | `departments.id` TEXT | TEXT | string | string | 同上 |
| 平台用户 userId | userkit `createId()` | `platform_users.id` TEXT | TEXT | string | string | authkit 会话中的 `userId` 直接复用，不做类型转换 |
| 业务组 groupId | 服务端 `crypto.randomUUID()` | `business_groups.id` TEXT | TEXT | string | string | 服务端生成 |
| 分类 categoryId | 种子/迁移（稳定业务码） | `categories.id` TEXT | TEXT | string | string | 服务端读取 |
| 分配规则 ruleId | 服务端 UUID | `assignment_rules.id` TEXT | TEXT | string | string | 服务端生成 |
| 工单 ticketId | 服务端 `ticket_sequences` 自增 → 格式化 | `tickets.id` TEXT（`TK-000001`） | TEXT | string | string | 服务端格式化；API 传入按大写归一后校验 `/^TK-\d{6,}$/` |
| 回复 replyId | 服务端 UUID | `ticket_replies.id` TEXT | ticketId TEXT | string | string | 服务端生成 |
| 日志 eventId | 服务端 UUID | `ticket_events.id` TEXT | ticketId TEXT | string | string | 服务端生成 |
| 通知 notificationId | 服务端 UUID | `ticket_notifications.id` TEXT | ticketId TEXT | string | string | 服务端生成 |

所有 ID 在数据库、API 与前端都是 `string`，不存在数字主键转换。

## 2. 数据模型（SQLite，`src/server/migrations/sqlite/`）

除特别说明外，时间列为 ISO-8601 UTC 字符串（`TEXT`），由服务端生成。

### 2.1 身份与组织

- `platform_users`（userkit 迁移 `0001_platform_users.sql`）：`id TEXT PK`、`name`、`email UNIQUE`、`phone`、`enabled`、`company_id`、`password_hash`、`password_change_required`、`created_at`、`updated_at`。
- `companies`：`id TEXT PK`、`name TEXT NOT NULL`、`code TEXT UNIQUE NOT NULL`、`created_at`。
- `departments`：`id TEXT PK`、`company_id TEXT NOT NULL → companies(id)`、`name TEXT NOT NULL`、`created_at`；`UNIQUE(company_id, name)`。
- `user_profiles`：`user_id TEXT PK → platform_users(id)`、`department_id TEXT NOT NULL → departments(id)`、`role TEXT NOT NULL CHECK(role IN ('submitter','handler','admin','ops'))`、`created_at`。角色单值；一个账号在本系统内只承担一个角色。

### 2.2 业务组与分配规则

- `business_groups`：`id TEXT PK`、`company_id TEXT NOT NULL → companies(id)`、`name TEXT NOT NULL`、`created_at`；`UNIQUE(company_id, name)`。
- `business_group_members`：`group_id TEXT → business_groups(id) ON DELETE CASCADE`、`user_id TEXT → platform_users(id)`、`added_at`；`PRIMARY KEY(group_id, user_id)`。写入时校验成员与组属于同一公司。
- `categories`：`id TEXT PK`、`code TEXT UNIQUE`、`name TEXT NOT NULL`、`active INTEGER NOT NULL DEFAULT 1`、`created_at`。
- `assignment_rules`：`id TEXT PK`、`company_id TEXT NOT NULL`、`category_id TEXT NOT NULL → categories(id)`、`group_id TEXT NOT NULL → business_groups(id)`、`created_at`、`updated_at`；`UNIQUE(company_id, category_id)`。写入时校验 `group.company_id = company_id`。

### 2.3 工单

- `ticket_sequences`：`name TEXT PK`（固定 `'ticket'`）、`next_seq INTEGER NOT NULL`（单一全局序列，编号在工单事务内自增，保证跨公司全局唯一）。
- `tickets`：
  - `id TEXT PK`（`TK-` + 6 位以上序号，全局唯一）
  - `company_id TEXT NOT NULL`、`department_id TEXT NOT NULL`
  - `title TEXT NOT NULL`（1–200 字符）、`description TEXT NOT NULL`（1–5000 字符）
  - `category_id TEXT NOT NULL → categories(id)`
  - `priority TEXT NOT NULL CHECK(priority IN ('P0','P1','P2','P3','P4'))`
  - `status TEXT NOT NULL CHECK(status IN ('unassigned','in_progress','completed','cancelled'))`
  - `submitter_id TEXT NOT NULL`、`submitter_name TEXT NOT NULL`、`submitter_email TEXT NOT NULL`（创建时快照）
  - `group_id TEXT NULL`（当前承接业务组）、`assignee_id TEXT NULL`（处理人）、`assignee_name TEXT NULL`
  - `created_at TEXT NOT NULL`、`updated_at TEXT NOT NULL`、`first_response_at TEXT NULL`、`completed_at TEXT NULL`、`cancelled_at TEXT NULL`
  - `satisfaction_score INTEGER NULL CHECK(satisfaction_score BETWEEN 1 AND 5)`、`satisfaction_comment TEXT NULL`、`satisfaction_at TEXT NULL`
  - 索引：`(company_id, status, created_at)`、`(group_id, status)`、`(submitter_id, created_at)`、`(category_id)`。
- `ticket_replies`：`id TEXT PK`、`ticket_id TEXT NOT NULL → tickets(id)`、`author_id TEXT NOT NULL`、`author_name TEXT NOT NULL`、`author_role TEXT NOT NULL`、`body TEXT NOT NULL`（1–5000 字符）、`created_at TEXT NOT NULL`；索引 `(ticket_id, created_at)`。首条非提交人回复时同事务写 `tickets.first_response_at`。
- `ticket_transfers`：`id TEXT PK`、`ticket_id TEXT NOT NULL`、`from_group_id TEXT NOT NULL`、`to_group_id TEXT NOT NULL`、`actor_id TEXT NOT NULL`、`actor_name TEXT NOT NULL`、`created_at TEXT NOT NULL`。
- `ticket_events`：`id TEXT PK`、`ticket_id TEXT NOT NULL`、`action TEXT NOT NULL`（`created`/`assigned`/`auto_assigned`/`replied`/`transferred`/`priority_changed`/`completed`/`cancelled`/`rated`/`email_sent`/`email_skipped`/`email_failed`）、`actor_id TEXT NULL`（系统动作为 `system`）、`actor_name TEXT NOT NULL`、`result TEXT NOT NULL`（`success`/`failed`）、`detail TEXT NULL`（JSON 字符串，含前后状态、原/目标业务组等）、`created_at TEXT NOT NULL`；索引 `(ticket_id, created_at, rowid)`。仅追加，无更新/删除接口。
- `ticket_notifications`：`id TEXT PK`、`ticket_id TEXT NOT NULL`、`kind TEXT NOT NULL DEFAULT 'completion'`、`recipient_email TEXT NOT NULL`、`subject TEXT NOT NULL`、`body TEXT NOT NULL`、`status TEXT NOT NULL CHECK(status IN ('sent','skipped','failed'))`、`provider_message_id TEXT NULL`、`error_code TEXT NULL`、`error_message TEXT NULL`、`attempt INTEGER NOT NULL DEFAULT 1`、`created_at TEXT NOT NULL`、`sent_at TEXT NULL`；索引 `(ticket_id, created_at)`。

### 2.4 迁移顺序

`0001_platform_users.sql`（userkit）→ `0002_org.sql`（companies、departments、user_profiles）→ `0003_groups_rules.sql` → `0004_tickets.sql` → `0005_events_notifications.sql`。迁移文件只前进不修改；种子数据由启动时的幂等 `seed` 步骤写入（存在即跳过）。

## 3. 认证与会话

- 登录：`POST /api/auth/login`，body `{ "email": string, "password": string }`；由 authkit 登录路由处理（`loginField: "email"`，`findByCredential` 经 userkit 按邮箱查用户）。
- 成功：`200 { "token": string, "user": { "id", "role", "status", "name", "email", "companyId", "departmentId", "roles": [] } }`。会话有效期默认 12 小时。
- 失败：`401`（`error.code=invalid_credentials`）；账号停用 `403`（`account_disabled`）；限流 `429`（`rate_limited`）。
- 所有 `/api/**`（除登录）要求 `Authorization: Bearer <token>`；缺失/失效返回 `401`（`not_authenticated`）。
- `GET /api/auth/me`：返回当前用户 `{ id, name, email, role, companyId, companyName, departmentId, departmentName, roles }`。

## 4. 接口清单

约定：请求与响应均为 JSON；错误体统一为平台形状 `{ "error": { "code": "<code>", "message": "<可读说明>" } }`，下文只标注 HTTP 状态与 `error.code`；列表响应 `{ "items": [...], "total": number }`；分页参数 `page`（默认 1）、`pageSize`（默认 20，最大 100）。

### 4.1 工单

- `GET /api/tickets`：查询参数 `companyId`、`departmentId`、`status`、`priority`、`categoryId`、`groupId`、`q`（主题或工单 ID 模糊匹配）、`sort`（`createdAt_desc` 默认 | `createdAt_asc` | `priority_asc` | `priority_desc`）、`page`、`pageSize`。按当前用户可见范围强制过滤；`companyId` 对平台运营生效，对其他角色只能是本公司。返回列表项：`id, title, categoryId, categoryName, priority, status, companyId, companyName, departmentId, departmentName, submitterId, submitterName, groupId, groupName, assigneeId, assigneeName, createdAt, satisfactionScore`。
- `POST /api/tickets`：仅提交人。body `{ title, description, categoryId, priority }`；服务端取当前用户档案写入公司/部门/姓名/邮箱快照，生成 `TK-` 编号，按本公司规则自动分配。`201` 返回工单详情；校验失败返回 `400`（`error.code=validation_error`，附 `fields` 指明缺失或越界字段）。
- `GET /api/tickets/:ticketId`：按可见范围返回详情：工单字段 + `groupName`、`categoryName`、`companyName`、`departmentName`、`canReply`、`canAssign`、`canTransfer`、`canComplete`、`canCancel`、`canRate`、`canChangePriority`（服务端计算的能力标记，前端据此渲染）。越权返回 `403`（`forbidden`）；不存在返回 `404`（`not_found`）。
- `GET /api/tickets/:ticketId/submitter`：提交人姓名、邮箱、公司、部门与该提交人在**同公司范围内**的历史工单概览 `[{ id, title, status, priority, createdAt, categoryName }]`（按创建时间倒序，最多 50 条，不含其他公司数据）。仅处理人/管理员/平台运营可读。
- `POST /api/tickets/:ticketId/replies`：body `{ body }`。提交人可回复本人工单；处理人/管理员需在可见范围内。终态返回 `409`（`ticket_closed`）。返回新回复 `{ id, ticketId, authorId, authorName, authorRole, body, createdAt }`，同事务写日志并按需写 `first_response_at`。
- `GET /api/tickets/:ticketId/replies`：按 `created_at asc, rowid asc` 返回全部回复。
- `POST /api/tickets/:ticketId/assign`：body `{ groupId }`。仅管理员（本公司）或可见范围内的处理人；仅 `unassigned` 可分配。校验组属于工单公司；成功后 `status = in_progress`、写 `group_id`、日志 `assigned`。冲突返回 `409`（`invalid_transition`）。
- `POST /api/tickets/:ticketId/transfer`：body `{ toGroupId }`。仅处理人/管理员；仅 `in_progress` 且操作者属于当前承接组（管理员不要求属于该组）；目标组必须同公司且不同于当前组。保持 `in_progress`，写 `ticket_transfers`、更新 `group_id`、清空/保留 `assignee_id`（转派后置空，等待目标组成员认领），写日志 `transferred`。
- `POST /api/tickets/:ticketId/complete`：仅处理人/管理员；要求 `in_progress`。写 `status='completed'`、`completed_at`、`assignee_id/assignee_name` 为操作者（若此前无处理人）。同事务生成完成通知记录并尝试发信，写日志 `completed` 与邮件结果。响应含详情与 `notification: { id, status }`。邮件失败不改变 `completed`。
- `POST /api/tickets/:ticketId/cancel`：提交人（本人工单）、处理人/管理员（可见范围）；仅 `unassigned` 或 `in_progress`。写 `status='cancelled'`、`cancelled_at`、日志 `cancelled`。
- `PATCH /api/tickets/:ticketId/priority`：body `{ priority }`（P0–P4）。仅处理人/管理员，且 `in_progress`；日志 `priority_changed` 记录前后值。
- `POST /api/tickets/:ticketId/rating`：body `{ score: 1..5, comment?: string }`。仅提交人本人、`completed`、且尚未评价；重复提交返回 `409`（`already_rated`）。写评分、意见、时间与日志 `rated`。

### 4.2 日志与通知

- `GET /api/tickets/:ticketId/events`：按时间升序返回 `[{ id, action, actorId, actorName, result, detail, createdAt }]`；`detail` 返回解析后的对象或 `null`。可见范围与工单详情一致。
- `GET /api/tickets/:ticketId/notifications`：返回 `[{ id, kind, recipientEmail, subject, status, attempt, errorMessage, createdAt, sentAt }]`，按创建时间倒序；仅处理人/管理员/平台运营可读。
- `POST /api/tickets/:ticketId/notifications/:notificationId/resend`：仅处理人/管理员；原通知状态为 `failed` 或 `skipped` 时允许。追加一条新通知记录（`attempt = 原 attempt + 1`），返回新记录与发送状态；`sent` 状态不可重发，返回 `409`（`already_sent`）。

### 4.3 配置（管理员，限本公司）

- `GET /api/groups`：返回本公司业务组 `[{ id, name, companyId, memberCount, members: [{ userId, name, email, departmentName }], createdAt }]`。管理员返回本公司；处理人可读本公司组用于转派/分配选择；平台运营可读（不修改）。
- `POST /api/groups`：body `{ name }`；仅管理员；重名返回 `409`（`duplicate_group`）。
- `PATCH /api/groups/:groupId`：body `{ name }`；仅本公司管理员。
- `DELETE /api/groups/:groupId`：仅本公司管理员；存在未完成工单或分配规则引用时返回 `409`（`group_in_use`）。
- `POST /api/groups/:groupId/members`：body `{ userId }`；仅本公司管理员；成员须属于同公司；重复添加幂等返回现有关系；写日志无（配置变更记入服务端审计输出，不进入工单日志）。
- `DELETE /api/groups/:groupId/members/:userId`：仅本公司管理员；移除后该成员立即失去该组工单可见性。
- `GET /api/categories`：返回启用分类 `[{ id, code, name }]`。
- `GET /api/assignment-rules`：管理员返回本公司规则 `[{ id, categoryId, categoryName, groupId, groupName }]`。
- `POST /api/assignment-rules`：body `{ categoryId, groupId }`；仅本公司管理员；`UNIQUE(company_id, category_id)` 冲突返回 `409`（`rule_exists`）。
- `PUT /api/assignment-rules/:ruleId`：body `{ groupId }`；仅本公司管理员。
- `DELETE /api/assignment-rules/:ruleId`：仅本公司管理员。

### 4.4 统计

- `GET /api/stats/distribution?dimension=company|department&from&to&companyId?`：返回 `{ dimension, total, items: [{ key, label, count, ratio }] }`；`ratio` 为 0–1 小数，保留 4 位。按角色可见范围过滤；部门维度仅在 `companyId` 给出时返回该公司的部门（未给出时按 `departmentId` 汇总并带公司名）。
- `GET /api/stats/dashboard?from&to&companyId?`：默认最近 30 天（`from` 含当日 00:00，`to` 含当日 23:59，服务端按 UTC 计算并在响应回显 `range`）。返回：
  - `ticketCount`：范围内创建的工单数。
  - `avgFirstResponseMinutes`：范围内工单「创建 → 首次非提交人回复」的平均分钟数（仅已产生首次回复的工单；无样本为 `null`）。
  - `satisfaction: { average, ratedCount }`：范围内已完成且有评分的工单平均分与数量；无样本 `average = null`。
  - `hotCategories: [{ categoryId, categoryName, count }]`：范围内按分类计数降序前 5。
  - `statusBreakdown: [{ status, count }]`、`priorityBreakdown: [{ priority, count }]`（辅助图表数据）。

### 4.5 元数据

- `GET /api/meta/companies`：平台运营返回全部公司；其他角色仅返回本公司。
- `GET /api/meta/departments?companyId`：返回该公司部门（非平台运营强制为本公司）。

## 5. 错误码

| HTTP | error | 含义 |
| --- | --- | --- |
| 400 | `validation_error` | 字段缺失、越界（如 priority 非 P0–P4、score 不在 1–5） |
| 401 | `not_authenticated` / `invalid_credentials` | 未登录或凭证错误 |
| 403 | `forbidden` | 跨公司、非授权角色或非本组工单 |
| 404 | `not_found` | 工单/组/规则不存在（含无权访问时的统一返回策略：不暴露存在性时用 403） |
| 409 | `invalid_transition` / `ticket_closed` / `already_rated` / `rule_exists` / `duplicate_group` / `group_in_use` / `already_sent` | 状态或唯一性冲突 |
| 429 | `rate_limited` | 登录限流 |
| 500 | `internal_error` | 未预期错误（不回显内部细节） |

## 6. 幂等与并发

- 工单编号在 `db.transaction` 内对 `ticket_sequences`（`name='ticket'`）行执行 `UPDATE ... SET next_seq = next_seq + 1` 后读取，避免并发重号。
- 状态变更接口在事务内先以 `SELECT ... WHERE id = ? AND status IN (...)` 条件更新（`changes = 0` 即视为 `invalid_transition`），避免重复点击产生双重完成/重复通知。
- 评价以 `satisfaction_score IS NULL` 为条件更新，重复提交返回 `already_rated`。
- 重发邮件每次追加新记录，不修改历史记录。

## 7. 运行配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务端监听端口 |
| `DB_PATH` | `./data/application.db`（相对包根） | SQLite 文件路径；启动时创建父目录，测试可用独立路径覆盖 |
| `JWT_SECRET` | 开发默认值（启动日志告警） | 会话签名密钥，生产必须显式设置 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `SMTP_FROM_NAME` | 空 / `587` / 空 / 空 / `noreply@example.com` / `工单系统` | 未配置 `SMTP_HOST` 时完成通知记录为 `skipped`（未配置） |
| `SEED_DEMO_DATA` | `true` | 首次启动写入演示公司、部门、账号、业务组、分类与规则；已存在则跳过 |

启动与验收命令：`npm run build`（typecheck + 前端构建到 `dist/`）、`npm test`（Node 测试，含迁移与 HTTP 冒烟）、`npm start`（`node --import tsx src/server/index.ts`，托管 `dist/` 与 SPA 回退）、`npm run dev:server` + `npm run dev:web`（3000 服务端 + 5173 Vite 代理）。
