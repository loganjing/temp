# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 项目形态与技术栈

本次为新建项目，采用 npm workspaces 单仓结构：仓库根目录是工作区入口，业务应用位于 `app/ticket`（下文以“应用包根目录”指代该目录，即后续的 `packageRoot`）。

| 层 | 选型 |
| --- | --- |
| 服务端 | Hono 4 + Node.js ≥20 + TypeScript，以 `tsx` 直接运行 `src/server/index.ts` |
| 前端 | React 18 + Vite 5 + TypeScript，React Router 6；生产构建产物由 Hono 静态回退托管 |
| 数据 | SQLite（better-sqlite3），经 CommonApp `dbkit` 提供连接、事务与版本化迁移 |
| 身份 | 本地账号密码登录（`authkit`）+ 平台用户表（`userkit`），JWT Bearer 会话 |
| 权限 | `permissionkit` 角色注册表与带数据范围的角色授予 |
| 邮件 | `emailkit` SMTP 发送 |
| UI | Ant Design 5 + `@ant-design/icons` |

整体是单个可运行的全栈应用：浏览器只与 `/api/*` 交互，服务端是唯一数据权威，承担公司隔离、工单状态机、操作日志与统计聚合。前端不做离线数据权威，也不缓存跨会话业务数据。

### 1.2 CommonApp 模块选择

| 模块 | 版本 / manifest SHA-256 | 需求匹配 | 集成边界 | 模块安装标记 |
| --- | --- | --- | --- | --- |
| `dbkit` | 0.2.0 / `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6` | 工单、回复、日志、配置需要事务与跨重启持久化 | 只使用其连接、查询、事务与迁移能力；本项目表结构在 `src/server/migrations/sqlite` 以版本化 SQL 管理 | `commonapp install: dbkit` |
| `authkit` | 0.1.2 / `a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02` | 多用户登录与会话，公司隔离的前置条件 | 使用 `createAuth` 生成的登录路由、Bearer 中间件与密码哈希；不启用 SSO/OAuth 通道 | `commonapp install: authkit` |
| `userkit` | 0.1.0 / `40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4` | 提交人姓名、邮箱取自账号；需要本地用户与凭证 | 复用其 `users` 表（`id` 为 TEXT）与 `createUserStore`；部门等业务属性放在本项目 `user_profiles` 扩展表 | `commonapp install: userkit` |
| `permissionkit` | 0.1.0 / `09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228` | 提交人、处理人、公司管理员与统计只读范围的能力区分 | 复用其角色/权限注册表与带范围的角色授予；公司隔离所需的 SQL 过滤仍由业务层实现 | `commonapp install: permissionkit` |
| `emailkit` | 0.1.0 / `a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c` | 工单完成时向提交人邮箱发送通知并记录结果 | 仅通过 `createEmailClient` 发送；发送结果（`sent`/`failed`/`skipped`）由本项目的通知记录承接 | `commonapp install: emailkit` |

未选用模块：

- `auditkit`：其 `list` 只能按操作人与事件类型过滤，无法按工单/公司范围检索；本期需要的工单操作日志要带业务变更摘要并按工单展示，因此由项目自有 `ticket_logs` 承担，平台级认证审计本期不接入。
- `attachment`：批准范围明确不含工单附件。
- `i18n`：需求未要求多语言，界面统一简体中文。

工作区初始化配置见 `docs/wi-t1000009/workspace-bootstrap.json`（内部输入，不作为面向用户的交付物）。初始化器的 UI 选项仅支持 `none`/`tailwind`，因此脚手架以 `none` 生成基础样式，Ant Design 由实现阶段作为应用依赖引入，不改动工作区初始化配置。

### 1.3 运行、数据与验证入口

- 开发启动：工作区根执行 `npm run dev`，并行启动 Vite 开发服务器（默认 5173）与 Hono 服务（默认 3000），Vite 将 `/api` 代理到后端。
- 生产启动：工作区根执行 `npm run build`，再执行 `npm start`；服务端读取 `PORT`（默认 3000），监听成功后同时提供 `/api` 与 `dist` 静态资源回退。
- 数据库：应用包根目录下的 `DB_PATH`，默认 `./data/application.db`；启动时先创建父目录再打开数据库，并执行 `src/server/migrations/sqlite` 下尚未应用的迁移。迁移只允许以版本化 SQL 新增，不使用 ORM 自动同步。
- 隔离验证：以独立 `DB_PATH`（每轮临时目录或临时文件）和空闲端口启动被测服务，等待真实监听就绪，只清理本轮启动的进程；不使用默认库做验收。
- 校验命令与应用启动命令分离：`npm run typecheck` 做客户端与服务端类型检查，`npm test` 运行 `node:test` 用例；验收脚本自行启动/清理服务时不额外后台启动服务。
- 初始数据：`npm run seed` 幂等写入演示数据（两家公司、含多部门的账号、业务组及成员、问题分类、自动分配规则、示例工单与评价），供人工验收、统计口径核对与工作台筛选演示使用。

### 1.4 全局 UI 基线

- 应用/业务模板：`helpdesk`（工单受理与处理的队列型后台）。
- 展示模板：`split-master-detail`，工作台与详情以“队列列表 + 当前记录详情”并列为主工作区；统计页在同一应用壳内采用“顶部时间范围 + 指标卡 + 分布与排行”仪表盘布局。
- 视觉风格：Modern SaaS。深色左侧导航、浅色工作区、顶部上下文栏、清晰标题与单一主操作；细边界、少阴影、中等圆角；一个主色加状态色（优先级与状态用文字标签 + 颜色区分，不依赖颜色单独表意）。
- 组件体系：Ant Design 5 + `@ant-design/icons`（表格、筛选表单、抽屉/弹窗、标签、时间线、指标卡），统一图标族；实现参考团包 `experts/general-app-development-expert/skills/general-app-implementation/assets/antd-workbench/example.jsx` 与 `example.css` 的版式，示例数据与文案不构成业务需求。
- 应用壳：左侧导航按角色显示“我的工单”“工单工作台”“业务组与成员”“分类与分配规则”“用户管理”“统计分析”；顶部上下文栏显示当前公司、当前用户（含部门）与退出入口；主工作区承载列表与详情。仅公司管理员可见配置类入口，提交人默认进入“我的工单”。
- 目标设备：桌面 Web（1280px 及以上为主）。窄窗口下表格最小宽度 1080px 并横向滚动，主题、状态等长文本以 Tooltip 展示全文；主要操作固定在详情头部或列表行内，不因横向滚动丢失。
- 全局状态：列表加载用骨架/表格 loading，空数据给出“暂无工单”及下一步入口，请求失败给出可读错误提示与重试，越权访问显示无权限说明并回到可见范围，写操作成功使用轻提示并把最新状态回写到当前详情；终态工单隐藏回复、转派、取消入口并说明不可再变更。

### 1.5 可重复验证约定

只有外部邮件投递属于不确定的异步外部事件（AC-10），其余流程都是确定的请求响应。为稳定复现：

- 验收前用 `npm run mail:sink` 启动仅测试环境的本地 SMTP 收件桩（`test/fixtures/fake-smtp.mjs`），并把 `SMTP_HOST`/`SMTP_PORT` 指向它：桩把投递写入 JSON 行文件以便核对收件人、主题与时间；对 `fail@` 前缀的收件地址返回 550，从而稳定复现“不可投递”路径。该入口不出现在产品界面，也不影响正常运行。
- 未配置 SMTP 时发送返回 `skipped`，通知记录显示“未配置”，可由处理人手动重试；该状态与失败区分展示。
- 种子数据中的创建时间、首次回复时间使用相对当前时刻的固定偏移（例如创建于 2 小时前、首次回复于 1.5 小时前），平均响应时间可按偏移直接推导；工单量、取消数、满意度与热点分类由固定种子唯一确定（AC-14）。
- 业务代码不使用定时任务、随机结果或动画推进状态；工单号按序列单调递增，可断言格式与唯一性。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 分层与职责

| 模块 | 位置 | 职责 | 独占数据 | 对外能力 |
| --- | --- | --- | --- | --- |
| 身份与授权 | `src/server/platform/auth.ts`、`src/server/services/identity.ts` | 绑定 authkit 中间件；解析当前用户（账号、公司、部门、角色、可见业务组）；提供公司管理员、业务组成员、提交人归属等守卫 | `users`（只读视图）、`user_profiles` | `getCurrentUser`、`requireCompanyAdmin`、`requireAgentOf`、`requireSubmitterOf` |
| 组织与配置 | `src/server/services/org.ts` | 公司、问题分类、业务组、组成员、按分类的自动分配规则 | `companies`、`ticket_categories`、`business_groups`、`business_group_members`、`assignment_rules` | 分类/业务组/成员/规则的增删改查、按公司+分类解析目标业务组 |
| 工单 | `src/server/services/tickets.ts` | 工单创建、生命周期流转、回复、指派、转派、完成、取消、评价，并写操作日志 | `tickets`、`counters`、`ticket_replies`、`ticket_logs`、`ticket_ratings` | 工单读写、工作台查询、提交人历史工单、操作日志读取 |
| 通知 | `src/server/services/notifications.ts` | 完成通知的组装、发送、结果记录与手动重试 | `ticket_notifications` | 完成时发送、通知查询、重试 |
| 统计 | `src/server/services/stats.ts` | 只读聚合：工单量、取消数、平均响应时间、满意度、热点分类、公司/部门分布 | 无自有表 | 概览与分布查询 |
| 前端 | `src/client` | 应用壳、导航、页面与表单；唯一请求边界 `platform/api-client.ts` | 浏览器会话令牌 | 页面与交互 |

数据归属原则：工单状态与归属只能由工单服务写入；其他模块通过其公开函数读取。组成员关系以 `business_group_members` 为唯一来源，`agent` 角色随成员关系同步授予与回收，避免出现两套成员名单。操作日志只追加，不提供更新或删除路径。

### 2.2 接口摘要

| 接口组 | 端点 | 调用方向 | 主要能力 |
| --- | --- | --- | --- |
| 认证与身份 | `POST /api/auth/login`、`GET /api/me` | 浏览器 → 服务端 | 登录换取令牌；返回当前用户、公司与部门、角色、所属业务组 |
| 参考数据 | `GET /api/reference` | 浏览器 → 服务端 | 本公司可用分类与业务组（用于提交、筛选、指派选择） |
| 工单 | `POST /api/tickets`、`GET /api/tickets`、`GET /api/tickets/:id` | 浏览器 → 服务端 | 提交工单；工作台/我的工单列表（筛选、搜索、排序、分页）；详情（含提交人信息、历史工单、回复、评价、通知、可执行动作） |
| 协作 | `POST /api/tickets/:id/replies`、`:assign`、`:transfer`、`:complete`、`:cancel`、`:rating` | 浏览器 → 服务端 | 多轮回复、指派、转派、完成、取消、满意度评价 |
| 通知 | `POST /api/tickets/:id/notifications/:notificationId/retry` | 浏览器 → 服务端 | 重试失败的完成通知 |
| 日志 | `GET /api/tickets/:id/logs` | 浏览器 → 服务端 | 只读操作日志 |
| 配置 | `/api/business-groups*`、`/api/ticket-categories*`、`/api/assignment-rules*` | 浏览器 → 服务端 | 公司管理员维护业务组与成员、分类、自动分配规则 |
| 用户 | `GET /api/company-users`、`PATCH /api/company-users/:id` | 浏览器 → 服务端 | 本公司成员列表（含部门、角色、所属业务组）；调整部门与启用状态 |
| 统计 | `GET /api/stats/overview`、`GET /api/stats/distribution` | 浏览器 → 服务端 | 运营指标与公司/部门维度分布 |

字段级定义、错误码、枚举与权限矩阵以 `docs/wi-t1000009/technical-contract.md` 为唯一来源；本基线只保留调用方向与职责。

### 2.3 页面职责

| 页面 | 使用者 | 内容 |
| --- | --- | --- |
| 登录 | 全部 | 邮箱 + 密码登录，错误提示与限流反馈 |
| 我的工单 | 提交人 | 本人提交的工单列表（状态/优先级/分类筛选、按工单ID或主题搜索）、提交新工单、进入详情 |
| 工单工作台 | 处理人、公司管理员 | 待处理/待分配队列；按状态、优先级、分类、业务组、公司、创建时间筛选，按工单ID或主题搜索，按创建时间/优先级/最近更新排序；左列表右详情的分栏工作区 |
| 工单详情 | 全部可见者 | 工单主信息、提交人信息卡（姓名、公司、部门、邮箱、历史工单）、回复流、操作区（指派/转派/完成/取消）、通知记录、操作日志、评价区 |
| 业务组与成员 | 公司管理员 | 业务组增改、成员添加与移除（仅本公司用户） |
| 分类与分配规则 | 公司管理员 | 问题分类维护；按分类指定目标业务组、启停规则 |
| 用户管理 | 公司管理员 | 本公司成员列表，维护部门与启用状态（限制在本公司范围） |
| 统计分析与仪表盘 | 公司管理员、平台统计只读范围 | 时间范围选择、工单量与取消数、平均响应时间、满意度、热点分类、按公司/部门分布 |

## 3. 数据模型与迁移

迁移文件位于应用包 `src/server/migrations/sqlite`，平台迁移（`0001_platform_users.sql`、`0002_platform_permissions.sql`）由所选模块安装，项目迁移从 `0101` 起在其后执行。

| 表 | 关键列与约束 | 说明 |
| --- | --- | --- |
| `companies` | `id` TEXT PK、`code` TEXT UNIQUE、`name`、`created_at` | 公司主数据；接入方式为种子数据维护 |
| `user_profiles` | `user_id` TEXT PK → `users.id`、`company_id` TEXT NOT NULL → `companies.id`、`department` TEXT NOT NULL、`created_at`、`updated_at` | 账号的业务属性扩展；姓名与邮箱沿用 `users` |
| `ticket_categories` | `id` TEXT PK、`company_id`、`name`、`enabled` INTEGER、`sort_order` INTEGER、`created_at`、`updated_at`，UNIQUE(`company_id`,`name`) | 公司隔离的问题分类清单 |
| `business_groups` | `id` TEXT PK、`company_id`、`name`、`description`、`enabled` INTEGER、`created_at`、`updated_at`，UNIQUE(`company_id`,`name`) | 同一公司多个业务组 |
| `business_group_members` | `group_id`、`user_id`、`company_id`、`created_at`，PK(`group_id`,`user_id`) | 业务组成员，唯一来源；写入时同步授予/回收 `agent` 角色 |
| `assignment_rules` | `id` TEXT PK、`company_id`、`category_id`、`group_id`、`enabled` INTEGER、`created_at`、`updated_at`，UNIQUE(`company_id`,`category_id`) | 公司 + 分类 → 业务组，至多一条生效规则 |
| `counters` | `name` TEXT PK、`value` INTEGER NOT NULL | 工单号序列，`name = 'ticket_code'` |
| `tickets` | `id` TEXT PK、`code` TEXT NOT NULL UNIQUE、`company_id`、`subject`、`description`、`category_id`、`priority`（`P0`–`P4`）、`status`、`submitter_id`、`group_id`（可空）、`assignee_id`（可空）、`first_reply_at`（可空）、`completed_by`/`completed_at`（可空）、`cancelled_by`/`cancelled_at`（可空）、`created_at`、`updated_at` | 工单主体；状态只登记 `pending_assignment`/`pending`/`completed`/`cancelled`，“创建”是提交过程中的瞬时初态 |
| `ticket_replies` | `id` TEXT PK、`ticket_id`、`author_id`、`content`、`created_at` | 多轮回复，按时间正序读取 |
| `ticket_logs` | `id` TEXT PK、`ticket_id`、`company_id`、`actor_id`、`action`、`summary`、`detail_json`、`created_at` | 只追加的操作日志；`detail_json` 保存状态、归属前后值等变更摘要 |
| `ticket_ratings` | `id` TEXT PK、`ticket_id` UNIQUE、`company_id`、`submitter_id`、`score` INTEGER CHECK 1–5、`comment`、`created_at` | 每单一条，不可修改 |
| `ticket_notifications` | `id` TEXT PK、`ticket_id`、`company_id`、`recipient_email`、`subject`、`status`（`sent`/`failed`/`skipped`）、`error_message`、`attempt` INTEGER、`created_at`、`sent_at` | 通知结果与重试记录 |

索引：`tickets(company_id,status,created_at)`、`tickets(company_id,group_id,status)`、`tickets(company_id,submitter_id,created_at)`、`ticket_replies(ticket_id,created_at)`、`ticket_logs(ticket_id,created_at)`、`ticket_notifications(ticket_id,created_at)`、`ticket_categories(company_id,enabled)`、`business_groups(company_id,enabled)`。

一致性与事务：

- 提交工单在同一事务内完成“分配规则匹配 → 序列取号 → 插入工单 → 写入创建日志”，保证工单号与状态一致。
- 指派、转派、完成、取消、评价分别为单事务：更新工单 + 写入日志；评价依赖 `ticket_ratings.ticket_id` 唯一约束拒绝重复评价。
- 完成通知不在事务内发送：先提交完成状态与日志，再调用邮件；发送结果单独写入通知表，失败不回滚完成。
- 引用完整性以 SQLite 外键声明配合业务校验（同一公司、业务组与成员存在且启用）。

## 4. 外部集成：完成通知邮件

- 配置项：`SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASSWORD`、`MAIL_FROM`；未配置时通知服务以 `skipped` 记录，不影响工单完成。
- 触发：完成工单事务提交后，向提交人邮箱（`users.email`）发送一次完成通知，内容含工单ID、主题、完成人与完成时间。
- 结果映射：emailkit 的 `sent` → `sent`；`failed` → `failed` 并保存错误摘要；`skipped(not_configured)` → `skipped`。连接、握手与套接字超时限制在 5 秒内，避免完成请求长时间挂起。
- 可见性与重试：详情页展示通知时间、收件地址与结果；失败或未配置的记录可手动重试，重试追加一条记录并递增 `attempt`；自动流程不重复发送。
- 无其他外部系统集成；不依赖云邮件服务与队列。

## 5. 架构决策

- **D1 全栈单体 + SQLite**：需求要求多用户共享同一批工单、按公司隔离、跨用户协作与聚合统计，单浏览器前端无法承担，故选 `fullstack-complex`；新建项目用 Hono + React/Vite + SQLite，不引入额外中间件。
- **D2 复用 authkit + userkit + permissionkit**：密码登录、用户表与角色授予均为已发布就绪模块，复用后只需扩展业务属性表。已知限制：初始化器生成的用户管理页面/API 只做登录校验、不区分角色，实现阶段必须在其路由前加公司管理员守卫并把读写限制在本公司用户，否则会成为越权入口。
- **D3 工单操作日志用项目表而非 auditkit**：AC-15 需要按工单与公司范围读取带业务变更摘要的日志，而 auditkit 的查询接口只能按操作人与事件类型过滤；强行复用需直接查询其内部表，故由 `ticket_logs` 承担并保持只追加语义。
- **D4 统计可见范围**：公司与部门分布默认按当前可见范围聚合（公司管理员为本公司）。为让“按公司维度分布”具备可观察的多公司结果（AC-13），增设只读聚合范围 `platform_stats`（仅聚合数值，不含工单明细、回复、提交人个人信息），不改变 R-01 对工单明细、工作台、业务组、日志与配置的公司隔离。
- **D5 通知同步发送 + 结果留痕 + 手动重试**：本期不引入队列或后台任务；完成请求在有限超时内发送并记录结果，失败不阻塞完成且可重试，满足失败可见与可恢复。
- **D6 标识策略**：所有实体主键为 TEXT（UUID 或模块生成的字符串），API JSON 与前端类型统一为 `string`；工单对外展示编号 `TK-000001` 由 `counters` 在事务内递增生成，不使用自增整数主键，避免 ID 类型在数据库、接口与前端之间转换。