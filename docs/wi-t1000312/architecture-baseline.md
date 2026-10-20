# 系统设计

- Work Item：wi-t1000312
- 业务任务：126-ticket（工单系统）
- 阶段：design（路线：fullstack-complex）
- 需求基线：`docs/wi-t1000312/requirements.md`
- 日期：2026-10-20

<!-- system-design: scope -->
## 1. 整体方案与设计基线

新建单仓库全栈应用，一个 Hono 服务同时承载 REST API 与 React/Vite SPA 静态资源，SQLite 文件数据库为唯一权威数据存储，满足多公司多角色跨用户共享、公司数据隔离、邮件通知与统计聚合的服务端能力要求。

- 服务端框架：Hono（Node ≥ 20，ESM）
- 前端：React + Vite SPA（Tailwind）
- 数据库：SQLite（`@commonapp/dbkit`），默认 `./data/application.db`（相对应用包根），`DB_PATH` 覆盖，打开前创建父目录；schema 变更仅通过版本化迁移（`src/server/migrations/sqlite/`，相对应用包根）
- 认证：`@commonapp/authkit` 密码登录 + Bearer token；用户与凭证存储 `@commonapp/userkit`
- 邮件：`@commonapp/emailkit`（SMTP 可配置；发送记录由项目自有 outbox 表持久化）
- 包管理：npm；端口 `PORT` 可配置

### 1.1 已选 CommonApp 模块

| 模块 | 包/版本 | manifest SHA-256 | 承载能力 | 集成边界 |
| --- | --- | --- | --- | --- |
| dbkit | @commonapp/dbkit 0.2.0 | sha256:f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | SQLite 连接、参数化查询、事务、版本化迁移 | 项目通过 `createDb`/`runMigrations`/`db.transaction` 使用；运行依赖 better-sqlite3 |
| authkit | @commonapp/authkit 0.1.2 | sha256:a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | 密码登录路由、Bearer 认证中间件、token 签发、登录限流 | 项目提供 `UserResolver`（基于 userkit + 角色扩展）；`createAuth` 装配 `requireAnyAuth`/`createLoginRoute`（loginField=email） |
| userkit | @commonapp/userkit 0.1.0 | sha256:40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 本地用户表、密码凭证、`UserStore`/`UserResolver` | 项目不修改其表结构；部门与角色经项目扩展表 `user_profiles` 关联，`getRoles` 回调读取 |
| emailkit | @commonapp/emailkit 0.1.0 | sha256:a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | SMTP 邮件发送（sent/skipped/failed） | 模块不持久化 outbox、不重试；项目负责 SMTP 配置加载、发送记录落库与失败可见性；运行依赖 nodemailer |

- 模块安装标记：`commonapp install: dbkit`、`commonapp install: authkit`、`commonapp install: userkit`、`commonapp install: emailkit`
- 初始化输入：`docs/wi-t1000312/workspace-bootstrap.json`（新项目，依赖闭包含 dbkit）

### 1.2 未选模块及理由

- **permissionkit**：需求角色集合小且固定（提交人/处理人/配置管理员三个推导角色），公司隔离用"用户公司归属 + 角色判定 + 查询行级过滤"即可承载，RBAC 注册表带来的角色-权限映射管理超出最小设计。
- **auditkit**：需求 §5.12/AC-13 要求工单操作日志可在工单维度查询展示；auditkit 公开查询接口（`list`）仅支持按操作人或事件类型过滤，不支持按业务对象过滤，直接查其私有表违反模块边界。工单日志改由项目自有 `ticket_logs` 表实现（§4）。
- **attachment / i18n**：需求分别无附件与国际化要求。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

服务端按业务域组织路由与服务模块；每个业务对象有唯一数据归属。接口字段级契约（method/path、请求/响应字段、类型、可空性、错误码、授权、幂等性）以 `docs/wi-t1000312/technical-contract.md` 为唯一来源，本节仅保留职责与调用方向。

```
React SPA (Vite)
   │  Bearer token · REST /api/*
   ▼
Hono 服务
   ├─ auth 装配（authkit + userkit + user_profiles 角色/部门）
   ├─ 工单域（创建/列表/详情/状态流转/回复/评价）
   ├─ 配置域（公司·业务组·成员·分类规则）
   ├─ 统计域（分布/仪表盘聚合查询）
   ├─ 通知域（emailkit 发送 + outbox 记录）
   └─ 日志域（ticket_logs 记录与查询）
   ▼
SQLite（dbkit，版本化迁移）
```

### 2.1 身份与访问（auth + userkit）

- 职责：密码登录签发 token；请求级认证解析当前用户（id、角色、公司、部门）；角色与公司归属是所有公司隔离判定的唯一依据。
- 数据归属：`users` 表归 userkit（含 name/email/phone/companyId/passwordHash，项目经 `UserStore` API 读写，不直接操作其表）；部门与角色归项目 `user_profiles` 表（每用户一行：department、role ∈ submitter|handler|admin）。
- 接口摘要：`POST /api/auth/login`、`GET /api/me`；`GET /api/users?companyId=`（handler/admin 供成员选择）。

### 2.2 工单核心（tickets）

- 职责：工单创建（含提交人归属与 SLA 优先级）、列表（筛选/搜索/排序/分页，公司隔离）、详情、状态流转（人工分配、转派、完成、取消）、提交人完整信息（含历史工单）。
- 数据归属：`tickets`、`ticket_sequence`（工单号发号）；提交人姓名/公司/部门/邮箱经 `users`+`user_profiles` 关联读取。
- 公司隔离规则：submitter 的全部工单查询强制 `company_id = 当前用户公司`；handler/admin 可跨公司并在查询上叠加可选公司筛选参数；对越权访问的目标工单返回 404（存在性不泄露）。
- 自动分配：创建事务内按 `(company_id, category)` 查分类规则，命中则写入业务组并将状态置为待处理，未命中保持待分配。
- 状态机（唯一状态字段，终态不可逆）：`PENDING_ASSIGNMENT → PROCESSING → COMPLETED`；`PENDING_ASSIGNMENT/PROCESSING → CANCELLED`。创建即待分配（"创建"为提交动作，见需求基线 §4 推荐口径）。
- 接口摘要：`POST /api/tickets`、`GET /api/tickets`、`GET /api/tickets/:id`、`POST /api/tickets/:id/assign`、`POST /api/tickets/:id/reassign`、`POST /api/tickets/:id/complete`、`POST /api/tickets/:id/cancel`、`GET /api/tickets/:id/submitter`。

### 2.3 回复与评价（replies / ratings）

- 职责：同一工单多轮回复（记录回复人、回复时间、内容，按时间序）；首条回复回填 `first_reply_at`（平均响应时间口径：创建 → 首次回复）；完成工单的满意度评价（1-5 分）。
- 数据归属：`replies`、`ratings`（一工单一评，唯一约束）。
- 接口摘要：`GET /api/tickets/:id/replies`、`POST /api/tickets/:id/replies`、`POST /api/tickets/:id/rating`。

### 2.4 配置管理（groups / rules）

- 职责：为公司维护多个业务组及成员；维护"分类 → 业务组"分配规则（公司内分类唯一映射）。
- 数据归属：`companies`（预置种子数据，需求无公司管理功能点）、`groups`、`group_members`、`category_rules`。
- 接口摘要：`GET /api/companies`、`GET /api/groups?companyId=`、`POST /api/groups`、`PUT /api/groups/:id`（含成员全量设置）、`POST /api/category-rules`、`GET /api/category-rules?companyId=`、`DELETE /api/category-rules/:id`。

### 2.5 通知（notifications）

- 职责：工单完成后向提交人邮箱发送通知邮件（主题含工单号与主题）；每次发送落一条 outbox 记录（sent/skipped/failed + 错误信息），作为发送结果的可查证据与失败可见性承载。
- 数据归属：`notifications` 表归本项目；外部调用仅 emailkit `send()`。
- 接口摘要：`GET /api/tickets/:id/notifications`。

### 2.6 统计分析（stats）

- 职责：只读聚合，无自有数据。按公司维度（`tickets.company_id`）与部门维度（提交人 `user_profiles.department`）统计工单分布；仪表盘指标：工单量、平均响应时间（仅计已首回工单）、满意度（已评价工单平均分）、热点问题（按分类聚合的工单量排名 Top 5）。
- 接口摘要：`GET /api/stats/distribution?dimension=company|department`、`GET /api/stats/dashboard`。

### 2.7 工单日志（ticket_logs）

- 职责：记录工单关键操作（创建、分配、转派、回复、完成、取消、评价），每条含操作人、操作时间、操作类型与详情（如转派目标）；随操作事务写入，按工单查询按时间排列。
- 数据归属：`ticket_logs` 归本项目（选型理由见 §1.2）。
- 接口摘要：`GET /api/tickets/:id/logs`。

## 3. UI 全局基线

- 应用/业务模板：`helpdesk`（工单受理与处理闭环）。
- 展示模板：`split-master-detail`——左侧导航应用壳 + 主工作区"工单列表（master）+ 当前工单详情（detail）"并列；统计页与配置页在同一应用壳下作为独立主工作区，沿用同一视觉与导航基线（统计页采用顶部筛选 + KPI 行 + 分布图表 + 明细列表；配置页采用分组表单 + 表格）。
- 视觉预设：Modern SaaS——柔和中性色、细边界、少阴影、中等圆角、清晰字体；单一主色 + 状态色（P0-P4 优先级与工单状态用状态色徽章区分）；动效仅用于操作反馈（toast、行内状态切换）。
- 布局与设备：桌面 Web；左侧导航（工作台、我的工单、统计分析、配置管理——按角色显隐）+ 顶部上下文栏（当前用户姓名/公司/角色、退出登录）+ 主工作区。窄屏非需求范围。
- 关键全局状态：加载（列表骨架屏）、空数据（各列表/图表空态文案）、错误（请求失败统一错误条）、无权限（跨公司/角色越权返回 403/404 的明确提示）、成功（操作 toast）。可能截断的文本（主题、描述、详情）提供展开或悬停全文。
- 页面清单：`/login`、`/workbench`（handler/admin：待处理/待分配队列 + 详情）、`/tickets`（submitter 我的工单列表 + 详情）、`/tickets/:id`（详情：基础信息、提交人完整信息卡含历史工单入口、回复流、按角色渲染的处理操作与评价区、操作日志、通知记录）、`/stats`（分布 + 仪表盘）、`/settings`（admin：业务组/成员/分类规则）。
- 选择依据：核心动作是高频逐条处理工单记录（需求 §5.10 工作台、§6 旅程B），master-detail 使列表筛选与当前记录详情协同；统计与配置为低频后台页，不改变全局壳与视觉基线。

## 4. 数据模型与迁移

全部 schema 变更通过版本化迁移文件交付（`src/server/migrations/sqlite/NNNN_*.sql`，相对应用包根），禁止 ORM 自动同步或手工改表。userkit 迁移 `0001_platform_users.sql` 建 users 表；项目迁移自 `0002` 起编号，创建以下表，工单号发号与自动分配均发生在创建事务内。

- `companies(id PK, name UNIQUE, created_at)`：预置种子（验收与演示用公司A/公司B 等）。
- `user_profiles(user_id PK → users.id, department NULL, role NOT NULL CHECK IN submitter|handler|admin)`：部门支撑提交人信息展示与按部门统计；角色支撑公司隔离与页面显隐。用户创建 = userkit `UserStore.create` + 本表写入（同一事务）。
- `groups(id PK, company_id → companies, name, created_at, UNIQUE(company_id, name))`。
- `group_members(group_id, user_id, PK(group_id, user_id))`：成员须属于组所属公司。
- `category_rules(id PK, company_id, category, group_id → groups, UNIQUE(company_id, category))`：自动分配依据。
- `tickets(id PK 'TK-xxxxxx', company_id, title, description, category, priority CHECK IN P0..P4, status CHECK IN PENDING_ASSIGNMENT|PROCESSING|COMPLETED|CANCELLED, submitter_id → users, assigned_group_id NULL, assignee_id NULL, completed_by NULL, completed_at NULL, first_reply_at NULL, created_at, updated_at)`：工单号由 `ticket_sequence` 事务内发号，格式 `TK-` + 6 位零填充；提交人信息经 join 读取（权威数据在用户侧）。
- `replies(id PK, ticket_id → tickets, author_id → users, content, created_at)`；首条回复回填 `tickets.first_reply_at`。
- `ratings(id PK, ticket_id → tickets UNIQUE, rater_id → users, score CHECK 1..5, comment NULL, created_at)`：一工单一评。
- `ticket_logs(id PK, ticket_id → tickets, actor_id NULL → users, action, detail NULL, created_at)`：action ∈ ticket.created|ticket.assigned|ticket.reassigned|ticket.replied|ticket.completed|ticket.cancelled|ticket.rated。
- `notifications(id PK, ticket_id → tickets, to_email, subject, body, status CHECK IN sent|skipped|failed, error NULL, created_at)`：outbox 发送记录。
- 种子数据：公司、各角色用户（密码凭证）、业务组/成员/分类规则示例、已知分布的工单样本（供统计验收），以幂等种子迁移或启动种子脚本交付。

关键事务：工单创建（发号 + 写 tickets + 自动分配 + 日志）、完成（状态 + 处理人/时间 + 日志，邮件在事务提交后发送并记录）、转派（归属变更 + 日志）、评价（写 ratings + 日志）。

## 5. 外部集成（邮件）

- 唯一外部调用：emailkit `send()` → SMTP（配置：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`、`SMTP_FROM_NAME`；`SMTP_HOST` 为空禁用投递，返回 skipped）。凭证只经环境变量，不入库不入版本库。
- 发送时机：工单完成事务提交后异步尝试；邮件失败不回滚工单完成。
- 失败可见性：`notifications.status=failed` + error 文本，工单详情的通知记录区可见；无重试（超出需求最小范围），失败可人工重新触发完成通知的补发由后续阶段按需扩展。
- 通知对象：工单记录的提交人邮箱（users.email）；主题含工单号与主题（验收口径"含工单标识"）。

## 6. 运行与验收约定

- 常规启动：应用包内 `npm start`（Node 入口 `src/server/index.ts` 启动 Hono 服务并托管前端构建产物）；前端构建 `npm run build`（类型检查 + Vite 构建）；开发模式 `npm run dev:server`（服务端 watch，`PORT` 默认 3000）与 `npm run dev:web`（Vite 端口 5173，`/api` 代理到 3000）。端口 `PORT` 可配置。
- 数据库：默认 `DB_PATH=./data/application.db`（相对应用包根），启动前自动创建父目录；隔离验收用独立 `DB_PATH` 指向临时路径 + 空闲 `PORT`。
- 验收命令与常规启动分开记录；若验收脚本负责启动和清理服务，只运行该脚本，不额外后台启动服务。
- 冷启动检查：Node/npm + `package-lock.json` 由包管理器负责 vendor 模块文件与锁文件。

## 7. 设计结论

- 结论：`ready`——核心边界（公司行级隔离 + 角色判定）、数据权威（SQLite 单库）、外部行为（邮件）均已可安全确定，无阻塞项。
- 残留风险：SMTP 参数未规定（需求未规定发送机制）——以环境变量承载，无配置时发送记录为 skipped，验收可依赖发送记录证据；工单 SLA 各优先级时限未规定——仅承载优先级枚举字段，不引入时限计算。
