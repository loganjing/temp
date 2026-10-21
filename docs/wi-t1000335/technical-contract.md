# 工单系统（137-ticket）技术契约

适用范围：React SPA 与 Hono 服务端共同遵循的 API 契约。JSON 字段命名 camelCase；数据库列 snake_case（见架构基线第 3 节）。本文件是 method/path、请求/响应字段、类型、可空性、错误、授权与幂等性的唯一来源。

## 1. 通用约定

- 基础路径 `/api`；请求/响应均为 JSON；时间字段为 ISO 8601 UTC 字符串。
- **认证**：除 `POST /api/auth/login` 外所有端点要求 `Authorization: Bearer <token>`；缺失/无效/过期 → `401 unauthorized`。
- **公司隔离**：凡涉及工单资源的端点，若目标工单 `companyId != 当前用户.companyId`，一律 `404 not_found`（与"工单不存在"同响应，不泄露他公司工单存在性）。列表/统计/工作台查询在 SQL 层强制公司过滤。
- **错误体**：`{ "error": { "code": "<code>", "message": "<人类可读>" } }`；code 枚举见第 7 节。
- **列表分页**：当前基线不分页，返回全量并支持筛选/搜索/排序（验收数据规模有限）。
- **公司筛选参数**：列表/统计/工作台预留 `companyId` 查询参数；当前用户权限集合 = 所属公司，传入其他公司 ID 时返回空结果集（不报错），以保持筛选语义可观察。

## 2. 状态与枚举

| 枚举 | 取值 | UI 显示 |
| --- | --- | --- |
| TicketStatus | `pending_assignment` / `processing` / `completed` / `cancelled` | 待分配 / 待处理 / 完成 / 取消 |
| Priority | `P0` / `P1` / `P2` / `P3` / `P4` | 同值徽标（红/橙/黄/蓝/灰） |
| NotificationStatus | `sent` / `failed` | 已发送 / 发送失败 |
| AuditAction | `ticket_created` / `ticket_assigned` / `ticket_replied` / `ticket_transferred` / `ticket_completed` / `ticket_cancelled` / `ticket_rated` | 创建/分配/回复/转派/处理完成/取消/评价 |

**状态机（唯一合法迁移）**：

- 创建 → `pending_assignment`（写 `ticket_created`）；同一创建流程内命中分配规则 → `processing`（写 `ticket_assigned`）。
- `processing` → `completed`（完成操作；写 `ticket_completed`）。
- `pending_assignment` | `processing` → `cancelled`（取消操作；写 `ticket_cancelled`）。
- 其余任何迁移请求 → `409 invalid_status`。`completed`/`cancelled` 为终态，不允许重开。

## 3. 数据结构（响应体）

```
Ticket {
  ticketNo: string            // 唯一，如 "TKT-000001"
  subject: string
  description: string
  category: string
  priority: "P0"|"P1"|"P2"|"P3"|"P4"
  status: TicketStatus
  company: { id: number, name: string }
  submitter: { id: number, name: string, email: string, department: string }
  currentGroup: { id: number, name: string } | null   // null = 待分配未归属
  handler: { id: number, name: string } | null        // 完成时记录的处理人
  handledAt: string | null                           // 处理时间
  createdAt: string
  updatedAt: string
}
Reply { id: number, author: { id: number, name: string }, content: string, createdAt: string }
Rating { score: number /*1..5*/, comment: string|null, raterId: number, createdAt: string }
NotificationRecord { id: number, recipientEmail: string, subject: string, status: "sent"|"failed", sentAt: string, detail: string|null }
Group { id: number, name: string, companyId: number, members: [{ id: number, name: string, email: string, department: string }] }
AssignmentRule { id: number, category: string, groupId: number, groupName: string }
AuditEntry { id: number, action: AuditAction, operator: { id: number, name: string }, ticketNo: string, detail: string|null /*JSON 摘要*/, createdAt: string }
CurrentUser { id, name, email, company: { id, name }, department: string, groupIds: number[] }
```

## 4. 端点定义

### 4.1 identity（authkit + userkit）

- `POST /api/auth/login`：请求 `{ email: string, password: string }` → `200 { token: string, user: CurrentUser }`；失败 `401 invalid_credentials`。端点由 authkit starter 提供，登录成功响应并入 CurrentUser 扩展字段。
- `GET /api/me` → `200 CurrentUser`（含所属业务组 ID 列表，供工作台使用）。
- 用户管理端点遵循 userkit starter 生成（`/api/users` 增改查）；创建/更新用户的请求体在 starter 字段之上增加 `companyId: number`、`department: string`（均必填，公司须存在）。用户管理仅要求已登录（starter 约定，不区分角色），公司隔离仍约束可见范围。

### 4.2 ticket

- `POST /api/tickets`
  - 请求：`{ subject: string(1..200), description: string(1..5000), category: string(1..64), priority: Priority }`
  - 行为：创建工单（`company = 当前用户公司`，`submitter = 当前用户`，服务端生成 `ticketNo`，状态 `pending_assignment`）；同一请求内查 `assignment_rules(company, category)`，命中则置 `current_group_id` 并转 `processing`；未命中停留 `pending_assignment`。写 `ticket_created`（+命中时 `ticket_assigned`）审计。
  - 响应：`201 { ticket: Ticket }`
  - 错误：`400 validation_failed`；`401 unauthorized`。非幂等（重复提交产生多张工单）。
- `GET /api/tickets?status=&category=&priority=&companyId=&q=&sort=created_at|priority&order=asc|desc&mine=true|false`
  - 权限：已登录；范围 = 本公司全部工单（`mine=true` 限提交人为当前用户）。`q` 匹配 `subject`（包含）或 `ticketNo`（精确）。默认 `sort=created_at&order=desc`。
  - 响应：`200 { items: Ticket[] }`
- `GET /api/tickets/:ticketNo`
  - 响应：`200 { ticket: Ticket, replies: Reply[] /*时间升序*/, rating: Rating|null, notifications: NotificationRecord[] }`
  - 错误：`404 not_found`（不存在或跨公司）。
- `POST /api/tickets/:ticketNo/replies`
  - 请求：`{ content: string(1..5000) }`
  - 权限：提交人或当前业务组成员；工单状态 ∈ `pending_assignment|processing`。
  - 响应：`201 { reply: Reply }`；错误：`400 validation_failed`、`403 forbidden`、`404 not_found`、`409 invalid_status`。写 `ticket_replied`。非幂等。
- `POST /api/tickets/:ticketNo/transfer`
  - 请求：`{ toGroupId: number }`
  - 权限：当前业务组成员；工单状态 = `processing`；`toGroupId` 必须为同公司其他业务组。
  - 行为：更新 `current_group_id`，状态保持 `processing`。
  - 响应：`200 { ticket: Ticket }`；错误：`400 validation_failed`（组不存在/非本公司/同组）、`403 forbidden`、`404 not_found`、`409 invalid_status`。写 `ticket_transferred`（detail 含 from/to 组）。
- `POST /api/tickets/:ticketNo/complete`
  - 权限：当前业务组成员；状态 = `processing`。
  - 行为：单事务置 `handler_id = 当前用户`、`handled_at = now`、状态 `completed` 并写 `ticket_completed`；事务提交后发送邮件并写 `notification_log`（发送失败记录 failed，不回滚）。
  - 响应：`200 { ticket: Ticket }`；错误：`403 forbidden`、`404 not_found`、`409 invalid_status`（重复完成/取消后完成等）。
- `POST /api/tickets/:ticketNo/cancel`
  - 权限：提交人；状态 ∈ `pending_assignment|processing`。
  - 响应：`200 { ticket: Ticket }`；错误：`403 forbidden`、`404 not_found`、`409 invalid_status`。写 `ticket_cancelled`。
- `POST /api/tickets/:ticketNo/rating`
  - 请求：`{ score: integer(1..5), comment?: string(0..1000) }`
  - 权限：提交人；状态 = `completed`；该工单未评价过（唯一键）。
  - 响应：`201 { rating: Rating }`；错误：`400 validation_failed`、`403 forbidden`、`404 not_found`、`409 already_rated`、`409 invalid_status`。写 `ticket_rated`。重复提交 → `409 already_rated`（幂等拒绝）。
- `GET /api/tickets/:ticketNo/submitter`
  - 响应：`200 { submitter: { id, name, email, department, company: { id, name } }, history: Ticket[] /*该提交人既往工单，时间倒序*/ }`
  - 权限：本公司已登录用户（处理视图）。错误：`404 not_found`。
- `GET /api/tickets/:ticketNo/audit-logs` → `200 { items: AuditEntry[] /*时间升序*/ }`；`404 not_found`。
- `GET /api/tickets/:ticketNo/notifications` → `200 { items: NotificationRecord[] }`；`404 not_found`。

### 4.3 workbench

- `GET /api/workbench/tickets?companyId=&category=&priority=&q=&sort=created_at|priority&order=asc|desc&group=true|false`
  - 范围：当前用户 `groupIds` 并集中状态为 `processing` 的工单（公司 = 本公司）。`group=false` 可查看全公司待处理（仍限本公司）；默认 `group=true`。`q`/`sort` 语义同 4.2 列表。
  - 响应：`200 { items: Ticket[] }`。

### 4.4 assignment（业务组与规则）

权限：本公司已登录用户（需求未规定管理角色，公司边界即权限边界；开放问题记录于架构基线）。

- `GET /api/groups` → `200 { items: Group[] }`（本公司，含成员列表）。
- `POST /api/groups`：`{ name: string(1..64) }` → `201 { group: Group }`；`400 validation_failed`、`409 group_exists`（同公司同名）。
- `PUT /api/groups/:id`：`{ name }` → `200 { group: Group }`；`404 not_found`、`409 group_exists`。
- `DELETE /api/groups/:id` → `200 { ok: true }`；若组仍承载 `pending_assignment|processing` 工单 → `409 group_in_use`；`404 not_found`。
- `POST /api/groups/:id/members`：`{ userId: number }`（本公司用户）→ `201 { group: Group }`；`400 validation_failed`（跨公司用户）、`409 already_member`、`404 not_found`。
- `DELETE /api/groups/:id/members/:userId` → `200 { group: Group }`；`404 not_found`。
- `GET /api/assignment-rules` → `200 { items: AssignmentRule[] }`（本公司）。
- `POST /api/assignment-rules`：`{ category: string(1..64), groupId: number }`（本公司组）→ `201 { rule: AssignmentRule }`；`400 validation_failed`、`409 rule_exists`（同公司同分类已有规则）。
- `PUT /api/assignment-rules/:id`：`{ category, groupId }` → `200 { rule: AssignmentRule }`；`404/409 rule_exists`。
- `DELETE /api/assignment-rules/:id` → `200 { ok: true }`；`404 not_found`。

### 4.5 stats

- `GET /api/stats/distribution?dimension=company|department`
  - 范围：本公司工单。`dimension=company` 按公司（当前为单行）、`dimension=department` 按提交人部门聚合。
  - 响应：`200 { dimension, rows: [{ key: string, label: string, count: number }] }`，count 按行降序。
- `GET /api/stats/dashboard`
  - 响应：`200 { ticketCount: number, avgResponseMinutes: number|null, satisfaction: number|null /*1..5 均分*/, topCategories: [{ category: string, count: number }] /*前10，量降序*/ }`
  - 口径（冻结）：`avgResponseMinutes` = 各工单"处理方（author != submitter）最早回复时间 − 创建时间"的分钟均值，无处理方回复样本时为 `null`；`satisfaction` = 已完成且已评价工单的评分均值，无样本为 `null`。

### 4.6 audit

- `GET /api/audit-logs?action=&ticketNo=&from=&to=` → `200 { items: AuditEntry[] }`（本公司范围，时间倒序；`from/to` 为 ISO 时间，`action` 为 AuditAction 枚举）。

## 5. 权限矩阵（工单操作）

| 操作 | 提交人 | 当前业务组成员 | 本公司其他用户 |
| --- | --- | --- | --- |
| 查看列表/详情/搜索 | ✓ | ✓ | ✓ |
| 创建工单 | ✓ | ✓ | ✓ |
| 回复 | ✓ | ✓ | ✗（403） |
| 转派 / 完成 | ✗（403） | ✓ | ✗（403） |
| 取消（未完成状态） | ✓ | ✗（403） | ✗（403） |
| 评价（已完成） | ✓ | ✗（403） | ✗（403） |
| 查看提交人完整信息/历史工单 | ✓ | ✓ | ✓ |
| 业务组与规则管理 | ✓ | ✓ | ✓ |

跨公司一律 404（见通用约定），优先于矩阵判断。

## 6. 事务、一致性与幂等

- **创建+自动分配**：创建事务（工单落库 + `ticket_created`）提交后执行分配事务（置组 + 转 `processing` + `ticket_assigned`）；两步均在同一 HTTP 请求内完成，任一步失败则返回错误且不留半分配状态（分配失败时工单停留 `pending_assignment`）。
- **转派/完成/取消/评分**：单事务（状态更新 + 审计事件）；完成的邮件发送与 `notification_log` 写入在事务提交后执行，失败不影响工单状态。
- **幂等性**：完成/取消/转派在非法状态下重复调用 → `409`；评分重复 → `409 already_rated`；创建与回复为非幂等操作（重复请求产生新资源，客户端以成功响应为准）。
- **审计顺序**：审计事件与业务变更同事务写入，`createdAt` 由服务端生成，保证日志时间与操作顺序一致。

## 7. 错误码附录

| code | HTTP | 场景 |
| --- | --- | --- |
| `unauthorized` | 401 | 缺失/无效 Bearer 令牌 |
| `invalid_credentials` | 401 | 登录邮箱或密码错误 |
| `not_found` | 404 | 资源不存在或跨公司访问 |
| `forbidden` | 403 | 已认证但无操作权限（见第 5 节矩阵） |
| `validation_failed` | 400 | 字段缺失、超长、格式或取值非法 |
| `invalid_status` | 409 | 状态机不允许的迁移 |
| `already_rated` | 409 | 工单已存在满意度评价 |
| `rule_exists` | 409 | 同公司同分类规则已存在 |
| `group_exists` | 409 | 同公司同名业务组已存在 |
| `already_member` | 409 | 用户已是业务组成员 |
| `group_in_use` | 409 | 业务组仍承载未完结工单 |

## 8. 迁移与验收数据

- 全部 schema 经 `migrations/sqlite/*.sql` 版本化迁移（dbkit `runMigrations`，服务启动执行）。
- 验收种子（多公司、多部门用户、业务组与规则、多分类多状态含已完成已评价工单）由独立验收脚本写入 `DB_PATH` 指定的隔离测试库，并在结束时清理本次启动的进程；不进入常规数据库。
