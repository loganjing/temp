# 技术契约（135-ticket 工单系统）

> 本文是工单系统前后端共同遵循的 API 与数据契约的唯一字段级来源。架构结论与模块边界见 docs/wi-t1000333/architecture-baseline.md。

## 1. 通用约定

- 路径前缀 `/api`；请求与响应均为 UTF-8 JSON；除登录外全部接口要求 `Authorization: Bearer <token>`。
- 时间：ISO-8601 UTC 字符串（如 `2026-10-21T08:30:00Z`）。
- 错误响应统一为 `{ "error": { "code": "<machine-code>", "message": "<人读信息>" } }`；HTTP 状态：400 参数格式错误、401 未认证/凭证无效、403 已认证但无权限、404 资源不存在或不可见（公司隔离下不区分两者）、409 状态或唯一性冲突、422 语义校验失败、500 内部错误。
- 幂等：满意度评价每工单一次（重复提交 409）；其余写操作不要求幂等，但受状态机前置保护（非法状态迁移 409）。
- 列表接口不分页，返回可见范围内全部结果并按请求排序。
- 标识：公司、用户、业务组、分类、工单、回复的 id 均由服务端生成。工单ID即工单整数 id（前端呈现为 `#<id>`）。
- 权限角色判定（服务端计算）：
  - 提交人：已登录且已设置组织档案（user_org）的普通用户。
  - 处理人：当前工单归属业务组的成员（组成员关系可跨公司）。
  - 公司配置管理员：user_org.is_company_admin = 1 的用户，权限范围限本公司。

## 2. 身份与账户（脚手架提供 + 组织扩展）

- `POST /api/auth/login`：body `{ "username": string, "password": string }` → 200 `{ "token": string, "user": { "id": string, "name": string, "email": string } }`；401 凭证无效。（脚手架提供）
- `POST /api/auth/logout`：→ 204。（脚手架提供）
- `GET /api/auth/me`：→ 200 `{ "user": { "id": string, "name": string, "email": string }, "org": { "companyId": int, "companyName": string, "department": string, "isCompanyAdmin": boolean } | null, "groups": [ { "id": int, "name": string, "companyId": int } ] }`。组织档案与组成员由组织模块扩展；未设置组织档案时 org 为 null（可登录但无法创建工单）。
- 用户账户管理（创建/更新账户与密码）：由脚手架提供，字段以脚手架为准；组织归属设置见 4.7。

## 3. 工单

枚举：

- `TicketStatus`: `awaiting_assignment`（待分配）| `pending`（待处理）| `completed`（已完成）| `cancelled`（已取消）
- `Priority`: `P0` | `P1` | `P2` | `P3` | `P4`
- `ReplySide`: `submitter` | `handler`

对象：

- `TicketSummary`：`{ "id": int, "subject": string, "status": TicketStatus, "priority": Priority, "category": { "id": int, "name": string }, "company": { "id": int, "name": string }, "submitter": { "id": string, "name": string, "email": string, "department": string }, "createdAt": string, "assignedGroup": { "id": int, "name": string } | null, "handler": { "id": string, "name": string } | null, "handledAt": string | null, "ratingScore": int | null }`
- `Reply`：`{ "id": int, "author": { "id": string, "name": string }, "side": ReplySide, "content": string, "createdAt": string }`
- `TicketDetail`：TicketSummary 全部字段 + `{ "description": string, "replies": [ Reply ], "rating": { "score": int, "createdAt": string } | null }`

### 3.1 POST /api/tickets（创建工单）

- 权限：已登录且 org 非 null 的用户（提交人身份）。
- body：`{ "subject": string（必填，1..200）, "description": string（必填，1..10000）, "categoryId": int（必填，须存在）, "priority": Priority（必填） }`
- 行为：单事务内创建工单（company 取当前用户 org.companyId，submitter 取当前用户 id，createdAt 取当前时间）；按 `(companyId, categoryId)` 查 assignment_rules，命中则写入 assignedGroupId、status=`pending` 并记录 `ticket_auto_assigned` 审计；未命中 status=`awaiting_assignment`；两种情况均记录 `ticket_created` 审计。
- 响应：201 TicketDetail（replies 为空）。
- 错误：422 org 缺失或字段校验失败；400 categoryId 不存在。

### 3.2 GET /api/tickets（列表，含工作台）

- query：`status?: TicketStatus`；`companyId?: int`；`q?: string`（匹配：工单 id 精确、subject 与提交人姓名不区分大小写子串）；`sort?: created_at_desc（默认） | created_at_asc | priority_asc | priority_desc`（priority_asc 为 P0→P4 紧急优先）。
- 可见范围（服务端判定并过滤）：本公司用户 → 本公司全部工单；业务组成员 → 其成员组所辖工单；公司配置管理员 → 本公司全部工单；多角色取并集。`companyId` 参数在可见范围内再过滤。
- 响应：200 `{ "tickets": [ TicketSummary ] }`。
- 工作台语义：工作台页固定传 `status=pending` 调用本接口（非待处理工单不出现在工作台列表）。

### 3.3 GET /api/tickets/:id（详情）

- 权限：本公司用户、当前归属业务组成员或该公司公司配置管理员；否则 404。
- 响应：200 TicketDetail（replies 按 createdAt 升序）。

### 3.4 GET /api/tickets/:id/submitter-history（提交人完整信息与历史工单）

- 权限：同 3.3。
- 响应：200 `{ "submitter": { "id": string, "name": string, "email": string, "company": { "id": int, "name": string }, "department": string }, "tickets": [ { "id": int, "subject": string, "status": TicketStatus, "priority": Priority, "createdAt": string } ] }`（该提交人全部历史工单，按 createdAt 降序）。

### 3.5 POST /api/tickets/:id/replies（回复）

- 权限：工单提交人或当前归属业务组成员；不可见返回 404，可见但非参与者返回 403。
- body：`{ "content": string（必填，1..10000） }`
- 行为：单事务内插入回复（side 由服务端判定：作者为提交人 → submitter，否则 handler）；若 side=handler 且 tickets.first_reply_at 为空则置为当前时间；记录 `ticket_replied` 审计。
- 响应：201 Reply。

### 3.6 POST /api/tickets/:id/assign（手工分配）

- 权限：该工单所属公司的公司配置管理员。
- 前置：status=`awaiting_assignment`（否则 409）；body `groupId` 须为该公司业务组（否则 422）。
- body：`{ "groupId": int }`
- 行为：单事务内写入 assignedGroupId、status=`pending`；记录 `ticket_manually_assigned` 审计。
- 响应：200 TicketSummary。

### 3.7 POST /api/tickets/:id/transfer（转派）

- 权限：当前归属业务组成员或该公司公司配置管理员。
- 前置：status=`pending`（否则 409）；body `targetGroupId` 须为该工单公司的其他业务组（409 目标组与当前组相同；422 组不属于该公司或不存在）。
- body：`{ "targetGroupId": int }`
- 行为：单事务内更新 assignedGroupId 为目标组（status 保持 `pending`）；记录 `ticket_transferred` 审计（detail 含原组与目标组）。
- 响应：200 TicketSummary。

### 3.8 POST /api/tickets/:id/complete（完成处理）

- 权限：当前归属业务组成员或该公司公司配置管理员。
- 前置：status=`pending`（否则 409）。
- 行为：单事务内写入 handler_user_id=当前用户、handled_at=当前时间、status=`completed`，记录 `ticket_completed` 审计；事务提交后同步发送完成通知邮件（见第 7 节），发送结果并入响应并记录 `ticket_email_sent` / `ticket_email_failed` 审计。
- 响应：200 `{ "ticket": TicketSummary, "notification": { "emailSent": boolean, "error": string | null } }`。

### 3.9 POST /api/tickets/:id/cancel（取消）

- 权限：工单提交人或该公司公司配置管理员。
- 前置：status ∈ {`awaiting_assignment`, `pending`}（否则 409）。
- 行为：单事务内置 status=`cancelled`；记录 `ticket_cancelled` 审计。
- 响应：200 TicketSummary。

### 3.10 POST /api/tickets/:id/rating（满意度评价）

- 权限：工单提交人。
- 前置：status=`completed`（否则 409）；该工单未评价过（否则 409）。
- body：`{ "score": int（必填，1..5） }`
- 行为：单事务内写入评价（每工单唯一）；记录 `ticket_rated` 审计。
- 响应：201 `{ "score": int, "createdAt": string }`。

### 3.11 GET /api/tickets/:id/logs（工单操作日志）

- 权限：同 3.3。
- 响应：200 `{ "events": [ { "id": int, "type": AuditEventType, "actor": { "id": string, "name": string }, "createdAt": string, "ticketId": int, "detail": object | null } ] }`（按 createdAt 升序）。

## 4. 组织与配置

对象：

- `Group`：`{ "id": int, "companyId": int, "name": string, "members": [ { "userId": string, "name": string } ] }`
- `Rule`：`{ "id": int, "companyId": int, "category": { "id": int, "name": string }, "group": { "id": int, "name": string } }`

### 4.1 GET /api/categories

- 权限：任何已登录用户。
- 响应：200 `[ { "id": int, "name": string } ]`。

### 4.2 POST /api/groups（创建业务组）

- 权限：body.companyId 所指公司的公司配置管理员。
- body：`{ "companyId": int（必填）, "name": string（必填，1..100） }`
- 响应：201 Group（members 为空）；409 同公司重名；422 公司不存在。

### 4.3 GET /api/groups?companyId=

- 权限：companyId 所指公司的公司配置管理员。
- 响应：200 `[ Group ]`（含成员列表）。

### 4.4 PUT /api/groups/:id/members（设置业务组成员）

- 权限：该组所属公司的公司配置管理员。
- body：`{ "userIds": [ string ]（必填，全量替换成员列表；用户须为已存在账户，可跨公司） }`
- 响应：200 Group；422 含不存在用户。

### 4.5 POST /api/assignment-rules（配置分类自动分配规则）

- 权限：body.companyId 所指公司的公司配置管理员。
- body：`{ "companyId": int, "categoryId": int, "groupId": int }`
- 约束：groupId 须为该公司的业务组（422）；`(companyId, categoryId)` 唯一（409 已存在规则）。
- 响应：201 Rule。

### 4.6 GET /api/assignment-rules?companyId=

- 权限：companyId 所指公司的公司配置管理员。
- 响应：200 `[ Rule ]`。

### 4.7 PUT /api/users/:id/org（设置用户组织档案）

- 权限：body.companyId 所指公司的公司配置管理员。
- body：`{ "companyId": int（必填）, "department": string（必填，1..100）, "isCompanyAdmin": boolean（可选，默认 false） }`
- 响应：200 `{ "userId": string, "companyId": int, "companyName": string, "department": string, "isCompanyAdmin": boolean }`；422 公司不存在或用户不存在。

### 4.8 GET /api/users?companyId=（公司用户目录）

- 权限：companyId 所指公司的公司配置管理员。
- 响应：200 `[ { "id": string, "name": string, "email": string, "org": { "companyId": int, "companyName": string, "department": string, "isCompanyAdmin": boolean } | null } ]`（返回全部账户，便于将未入组用户纳入本公司管理；含未设置 org 的账户）。

## 5. 统计

### 5.1 GET /api/stats/distribution?dimension=company|department&companyId=

- 权限：业务组成员或公司配置管理员；统计范围=该用户可见工单（成员组所辖 ∪ 本公司管理员的本公司全部，取并集），`companyId` 在范围内再过滤。
- 响应：200 `{ "items": [ { "key": string, "count": int } ] }`；`dimension=company` 时 key 为公司名；`dimension=department` 时 key 为提交人部门（按 user_org.department 聚合）。

### 5.2 GET /api/stats/dashboard?companyId=

- 权限与范围：同 5.1。
- 响应：200 `{ "volume": int, "avgResponseSeconds": number | null, "satisfactionAvg": number | null, "ratedCount": int, "hotCategories": [ { "category": string, "count": int } ] }`（hotCategories 按工单量降序取前 10）。
- 口径：volume=范围内工单总数；avgResponseSeconds=存在 first_reply_at 的工单 `(first_reply_at − createdAt)` 的平均秒数（无样本为 null）；satisfactionAvg=已完成且已评价工单的平均评分（无样本为 null）；ratedCount=已评价工单数。

## 6. 数据模型（SQLite）

### 6.1 表结构（本项目工单域）

```
companies(id INTEGER PK AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)
user_org(user_id TEXT PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), department TEXT NOT NULL, is_company_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)
business_groups(id INTEGER PK AUTOINCREMENT, company_id INTEGER NOT NULL REFERENCES companies(id), name TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(company_id, name))
group_members(group_id INTEGER NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE, user_id TEXT NOT NULL, PRIMARY KEY(group_id, user_id))
categories(id INTEGER PK AUTOINCREMENT, name TEXT NOT NULL UNIQUE)
assignment_rules(id INTEGER PK AUTOINCREMENT, company_id INTEGER NOT NULL REFERENCES companies(id), category_id INTEGER NOT NULL REFERENCES categories(id), group_id INTEGER NOT NULL REFERENCES business_groups(id), UNIQUE(company_id, category_id))
tickets(id INTEGER PK AUTOINCREMENT, company_id INTEGER NOT NULL REFERENCES companies(id), subject TEXT NOT NULL, description TEXT NOT NULL, category_id INTEGER NOT NULL REFERENCES categories(id), priority TEXT NOT NULL CHECK(priority IN ('P0','P1','P2','P3','P4')), status TEXT NOT NULL CHECK(status IN ('awaiting_assignment','pending','completed','cancelled')), submitter_user_id TEXT NOT NULL, assigned_group_id INTEGER REFERENCES business_groups(id), handler_user_id TEXT, handled_at TEXT, first_reply_at TEXT, created_at TEXT NOT NULL)
ticket_replies(id INTEGER PK AUTOINCREMENT, ticket_id INTEGER NOT NULL REFERENCES tickets(id), author_user_id TEXT NOT NULL, author_side TEXT NOT NULL CHECK(author_side IN ('submitter','handler')), content TEXT NOT NULL, created_at TEXT NOT NULL)
ticket_ratings(ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id), submitter_user_id TEXT NOT NULL, score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5), created_at TEXT NOT NULL)
```

- 用户与凭证表由 userkit 拥有（随包迁移 0001_platform_users.sql）；审计事件表由 auditkit 拥有（随包迁移 0003_platform_audit_events.sql）。本项目仅以 user_id 引用用户表，不复制其 schema。
- 索引：`idx_tickets_company_status(company_id, status)`、`idx_tickets_group_status(assigned_group_id, status)`、`idx_tickets_submitter(submitter_user_id, created_at)`、`idx_replies_ticket_time(ticket_id, created_at)`。

### 6.2 迁移与种子

- 全部 DDL 经 dbkit 版本化迁移（app/ticket-system/src/server/migrations/sqlite/ 下的 SQL 文件，启动时 runMigrations 按序执行）；userkit 随包迁移 0001_platform_users.sql、auditkit 随包迁移 0003_platform_audit_events.sql 与本项目工单域迁移合入同一目录序列；禁止 ORM 自动同步或手工改库。
- 迁移种子：categories 固定集合：账号与权限、功能缺陷、数据问题、性能问题、集成对接、使用咨询。
- 启动种子（幂等，仅空库时执行）：创建公司A、公司B 与示例账号（公司A 提交人×2（不同部门）、公司A 处理人、公司A 公司配置管理员、公司B 提交人），账户经 userkit 用户 API 创建并设置组织档案；具体口令由实现阶段以环境变量或种子常量提供并记录。

### 6.3 事务清单

- 创建：INSERT tickets（+ 命中规则时 UPDATE assigned_group/status）+ `ticket_created`（+ `ticket_auto_assigned`）审计，单事务。
- 回复：INSERT ticket_replies（+ 首次处理端回复时 UPDATE first_reply_at）+ `ticket_replied` 审计，单事务。
- 手工分配/转派/完成/取消/评价：各自单事务 + 对应审计事件。
- 邮件：完成事务提交后发送，不属于事务。

## 7. 通知（邮件）契约

- 触发：POST /api/tickets/:id/complete 事务提交后同步发送。
- 收件人：工单提交人邮箱（userkit 账户 email）。
- 主题：`【工单完成】工单 #<id> <subject>`；正文（纯文本）包含：工单ID、主题、完成时间（handled_at）。
- 配置（环境变量）：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SENDER_ADDRESS`（默认 `noreply@ticket-system.local`）。
- 失败语义：发送失败不回滚完成状态；complete 响应 `notification.emailSent=false` 且 `error` 含原因；审计记录 `ticket_email_failed`；不自动重试。验收时使用本地可捕获的测试 SMTP 服务验证收件。

## 8. 审计事件契约

- `AuditEventType`: `ticket_created` | `ticket_auto_assigned` | `ticket_manually_assigned` | `ticket_transferred` | `ticket_replied` | `ticket_completed` | `ticket_email_sent` | `ticket_email_failed` | `ticket_cancelled` | `ticket_rated`
- 事件字段：`type`、`actor_user_id`（操作人）、`ticket_id`（关联工单）、`created_at`（操作时间）、`detail`（JSON，可空；如 transferred 记录 fromGroupId/toGroupId、rated 记录 score、email 事件记录收件人（经脱敏））。
- 事件由 auditkit 持久化并对敏感字段（邮箱地址）脱敏；工单域通过 3.11 接口读取，读取权限与工单详情一致；事件保留策略沿用平台默认（需求未规定保留期限）。
