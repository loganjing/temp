# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 路线与设计目标

已批准需求的路由结论为 `fullstack-complex`（`applicationProfileHash: sha256:49dc89fa8a9f41aff2fba97d12be5ce5964a901f36adc396789d0a08cc685bdf`），本设计按完整系统设计路线执行。

设计目标是为一家面向多公司（多租户）的服务团队交付可运行的工单处理系统：公司内用户提交工单，工单与配置按公司隔离，按分类自动落到对应业务组，由处理人协作处理并记录处理与回复过程，完成后通知提交人并由提交人评价，同时提供分布统计、运营指标仪表盘、工单工作台与操作日志。设计只承载已批准需求中的业务对象与语义，不新增领域概念。

### 1.2 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 运行时 | Node.js >= 20（ESM） | 与所选模块的运行要求一致 |
| 服务端 | Hono | REST/JSON API，与 `authkit` 的 Hono 集成一致 |
| 数据库 | SQLite 文件库，经 `@commonapp/dbkit` 0.2.0（`better-sqlite3`） | 服务端权威数据、结构化查询与关联、事务、版本化迁移 |
| 身份 | `@commonapp/authkit` 0.1.2 + `@commonapp/userkit` 0.1.0，本地密码模式 | 登录会话、Bearer 认证、本地账号与密码凭证 |
| 授权 | `@commonapp/permissionkit` 0.1.0 | 项目定义的权限注册表与授权判定 |
| 审计 | `@commonapp/auditkit` 0.1.0 | 持久化操作/审计事件 |
| 邮件 | `@commonapp/emailkit` 0.1.0（`nodemailer`） | 工单完成通知邮件 |
| 前端 | React + Vite（SPA），Tailwind | 工单工作台、配置、仪表盘与评价界面 |
| 包管理 | npm | 与工作区初始化生成物一致 |

单仓库结构由工作区初始化生成（npm workspaces，根目录 `package.json` 声明 `workspaces: ["app/*"]`）：根目录地图为 `platform-baseline.json`，其 `packageRoot` 为 `app/ticket-system`，应用包内含 `AGENTS.md`。应用包内目录职责固定为：`src/server/`（Hono 入口、中间件、路由、平台绑定、服务、仓储与迁移）、`src/client/`（React 入口、页面、组件、浏览器 API 客户端与样式）、`src/shared/`（平台中立的契约、常量与纯逻辑）。业务代码按此职责落位，服务端不引用客户端代码，客户端不引用服务端代码。

### 1.3 运行与数据位置约定

- 常规启动：根目录 `npm start`（转发到应用包 `npm run start`，即 `node --import tsx src/server/index.ts`）；服务入口为应用包 `src/server/index.ts`，Hono 组装见 `src/server/app.ts`，路由注册见 `src/server/routes.ts`，Hono 监听 `PORT`。
- 开发与构建：根目录 `npm run dev`（同时启动 Vite 与服务端）；应用包 `npm run build` 先做服务端与客户端类型检查再执行 `vite build`。
- 持久化数据库：SQLite 文件库，路径由 `DB_PATH` 决定，默认 `./data/application.db`（相对进程工作目录，即应用包根目录）；打开数据库前自动递归创建其父目录，干净目录无需人工准备即可启动。
- 测试数据库隔离：以 `DB_PATH` 指向独立文件（或 `:memory:`）实现；验证使用空闲端口、等待真实监听就绪，并且只清理本次启动的进程。
- 迁移：SQLite 迁移文件位于应用包 `src/server/migrations/sqlite/`，服务启动时由 `src/server/platform/bootstrap.ts` 调用 `runMigrations(db, { directory: src/server/migrations/ })` 按文件名顺序版本化执行。已有平台迁移为 `0001_platform_users.sql`、`0002_platform_permissions.sql`、`0003_platform_audit_events.sql`；本设计的业务结构从 `0004_` 起新增，后续结构变更一律新增迁移文件，不通过 ORM 自动同步或手工改 schema 绕过迁移。
- 平台绑定落位：数据库与迁移在 `src/server/platform/bootstrap.ts`；身份解析与认证边界在 `src/server/platform/auth.ts`（`userkit`/`authkit` 已绑定）；业务端点注册在 `src/server/routes.ts`。`permissionkit`、`auditkit`、`emailkit` 已安装，需按第 3 节与第 5 节约定在服务端接入业务绑定。
- 错误响应形状沿用根目录地图的 `{ error: { code, message } }`；本设计在其上增加可选 `details` 字段（仅在字段级校验失败时出现），见技术契约第 0 节。
- 常规启动命令与验收命令分开记录：验收脚本自行启动并清理服务，不额外后台启动服务或插入等待。

### 1.4 系统分层与调用方向

```text
React SPA (web-app)
   │  JSON over HTTP, Bearer 会话
   ▼
Hono API 进程
 ├── identity-access ── authkit / userkit（凭证、登录会话、Bearer 解析）
 ├── org-config（业务组、成员、分类→业务组规则）
 ├── ticket-workflow ──> org-config（规则查询，创建事务内自动分配）
 │        ├──> notification ──> emailkit（SMTP 发送完成通知）
 │        └──> audit-trail ──> auditkit（操作日志）
 ├── analytics（对 ticket-workflow 公开只读查询做聚合）
 └── 授权横切：permissionkit 权限判定 + 公司范围强制
        ▼
   dbkit / SQLite（版本化迁移、事务）
```

### 1.5 未规定事项的处理口径（保守、可逆）

需求将这些事项标为未规定，本设计不擅自确定业务语义，只取最小可逆的承载方式：

- SLA 优先级只保存 `P0`–`P4` 标记，不内置时限数值、不实现超时升级或超时处理。
- 未命中自动分配规则时，工单停留在“待分配”状态，由有分配权限的处理人手工指定业务组/处理人；不新增自动兜底组。
- 转派保留转派轨迹（来源处理方、目标处理方、时间），不做转派次数限制。
- 满意度评价采用 1–5 的有序整数刻度，每张工单只允许一次评价且不可修改。
- 完成通知邮件使用纯文本模板、不做自动重试；发送结果与失败原因写入通知记录供查看。
- 登录与授权机制的技术实现按“本地密码登录 + 项目定义角色”承载，角色定义与授权方式属推荐基线，可由用户修正。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 模块职责、事实归属与公开接口

| 模块 | 职责 | 唯一事实归属 | 公开接口（摘要） |
| --- | --- | --- | --- |
| identity-access | 登录会话解析、账号与公司/部门归属、角色判定、公司范围上下文 | `companies`、`departments`、`company_members`、`company_member_roles`（账号凭证与登录会话由 `userkit`/`authkit` 持有，本项目不读写其私有表） | authkit 提供的登录/登出/当前会话端点；`GET /api/me/context` |
| org-config | 维护本公司业务组、业务组成员，以及“分类→业务组”自动分配规则 | `business_groups`、`business_group_members`、`assignment_rules` | `/api/org/groups`、`/api/org/groups/:id/members`、`/api/org/assignment-rules`、`/api/org/members` |
| ticket-workflow | 工单主数据与生命周期、多轮回复、分配与转派、处理记录、取消、满意度评价 | `tickets`、`ticket_replies`、`ticket_assignments`、`ticket_ratings`、`ticket_no_sequences` | `/api/tickets`、`/api/tickets/:id`、`/api/tickets/:id/replies`、`/api/tickets/:id/assign`、`/api/tickets/:id/transfer`、`/api/tickets/:id/complete`、`/api/tickets/:id/cancel`、`/api/tickets/:id/rating` |
| notification | 完成通知的组装、SMTP 发送与结果记录（成功/失败可见） | `notifications` | 由 ticket-workflow 的完成操作触发；`GET /api/tickets/:id/notifications` |
| audit-trail | 记录工单相关关键操作事件（含系统触发），含对象、操作人、时间、类型 | auditkit 事件存储 | `GET /api/audit-events` |
| analytics | 只读聚合：公司与部门维度分布、工单量、平均响应时间、满意度、热点问题 | 无自有表；经 ticket-workflow 的公开只读查询聚合，不直接读取其表 | `/api/analytics/distribution`、`/api/analytics/overview` |
| web-app | 工单工作台、工单详情与回复、我的工单与评价、业务组与规则配置、统计仪表盘、日志查看 | 无自有数据；只调用上述 REST 接口 | 浏览器界面（见第 3 节 UI 基线） |

关键协作点：工单创建时，ticket-workflow 在自己的创建事务内调用 org-config 的公开规则查询 `findAssignmentGroup(companyId, category)`，命中即写入目标业务组，未命中则工单保持“待分配”（自动分配入口类型为后台任务，创建即完成落组，无需人工指定）。工单完成后由 ticket-workflow 触发 notification 发送通知，并向 audit-trail 写入事件；notification 与 audit-trail 的失败不回滚已完成的工单状态，但结果必须可读回。

### 2.2 接口摘要

以下仅列出接口用途与调用方向；method/path 的字段、类型、可空性、错误码、授权与幂等语义以 `docs/wi-t1000006/technical-contract.md` 为唯一来源。

- 身份上下文：`GET /api/me/context` — 返回当前登录用户的公司、部门、成员标识、显示名、邮箱、角色与权限集合；前端据此渲染公司范围与可用操作。
- 工单读写与生命周期：`POST /api/tickets`（创建，含自动分配）、`GET /api/tickets`（工作台列表：状态、分类、优先级、业务组、处理人、关键字、排序、分页）、`GET /api/tickets/:id`（详情：工单、提交人完整信息、历史工单、回复流、转派轨迹、评价、通知结果）、`POST /api/tickets/:id/replies`、`POST /api/tickets/:id/assign`、`POST /api/tickets/:id/transfer`、`POST /api/tickets/:id/complete`、`POST /api/tickets/:id/cancel`、`POST /api/tickets/:id/rating`。
- 组织配置：`GET|POST /api/org/groups`、`PATCH /api/org/groups/:id`、`PUT /api/org/groups/:id/members`、`GET|POST /api/org/assignment-rules`、`PATCH|DELETE /api/org/assignment-rules/:id`、`GET /api/org/members`。
- 统计与分析：`GET /api/analytics/distribution?by=company|department`、`GET /api/analytics/overview`。
- 日志：`GET /api/audit-events`（按对象类型、对象 ID、操作人、时间范围与分页过滤）。

### 2.3 CommonApp 模块选型

已按 `commonAppResolver` 的 `catalog --summary` 与 `manifests --summary` 一次性核查下列候选模块，全部状态为 `ready`、依赖闭包可解析且分发文件存在。依赖闭包含 `dbkit`，因此本阶段已提交工作区初始化输入 `docs/wi-t1000006/workspace-bootstrap.json` 并执行一次批准初始化。

| 模块 | 包 / 版本 | 需求匹配 | 集成边界 | manifest SHA-256 | 模块安装标记 |
| --- | --- | --- | --- | --- | --- |
| dbkit | `@commonapp/dbkit` / 0.2.0 | SQLite 服务端权威数据、事务、版本化迁移；支撑公司隔离查询与统计聚合 | 由本项目提供连接配置、迁移目录与所有 DDL；`better-sqlite3` 为运行时依赖 | `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6` | `commonapp install: dbkit` |
| authkit | `@commonapp/authkit` / 0.1.2 | 登录会话与 Bearer 认证；需求要求按公司隔离与角色差异化可见性，必须先有可信身份 | 只负责认证与身份解析；本项目在公司范围内做授权判定，不修改其会话存储 | `a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02` | `commonapp install: authkit` |
| userkit | `@commonapp/userkit` / 0.1.0 | 本地账号与密码凭证，为 authkit 提供解析器；需求未规定登录机制，取最小可逆默认 | 凭证与账号由其持有；本项目另建 `company_members` 承载公司/部门/角色与通知邮箱等业务归属 | `40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4` | `commonapp install: userkit` |
| permissionkit | `@commonapp/permissionkit` / 0.1.0 | 角色差异化操作范围（提交人/处理人/配置人/管理者）与公司范围授权 | 本项目注册权限键并在每个端点显式判定；权限不替代公司范围与对象归属校验 | `09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228` | `commonapp install: permissionkit` |
| auditkit | `@commonapp/auditkit` / 0.1.0 | 持久化操作日志：创建、分配/自动分配、转派、回复、状态变更、评价、完成通知、配置变更 | 本项目定义事件类型与对象引用；日志为追加写，不参与业务事务回滚 | `27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1` | `commonapp install: auditkit` |
| emailkit | `@commonapp/emailkit` / 0.1.0 | 工单完成时向提交人邮箱发送完成通知 | 只做 SMTP 发送；发送结果与失败原因由本项目 `notifications` 记录，不做自动重试 | `a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c` | `commonapp install: emailkit` |

工作区初始化执行记录（已执行一次批准初始化）：输入 `docs/wi-t1000006/workspace-bootstrap.json`（`schemaVersion: 1`、`projectType: new`、`appName: ticket-system`、`framework: hono`、`frontendFramework: react-vite`、`uiFramework: tailwind`、`packageManager: npm`、`identityMode: local-password`）；初始化器返回 `decision: initialized`，`packageRoot: app/ticket-system`，`planDigest: sha256:1adc0c42a5db3b11a2d0941d41625228bc93fd2882afbccdc2d6d7a8478bef17`，`scaffoldDigest: sha256:7c069ea345349a384d754b0e4ee5f86f8988c519419be8af2b51ad2e361fe746`，`planSha256: sha256:32ff963792212c7a7dce85d468a23fcb939714ffaee85f6857eccbbb31ff98fd`；通过的校验包括 bootstrap schema、模块分发文件、脚手架资源、源码目录地图、生成脚手架契约、依赖安装、构建、测试与工作区合并（已有 `docs/` 保持不变）。初始化后根目录 `platform-baseline.json` 可读，其 `packageRoot`（`app/ticket-system`）与模块清单（`dbkit`、`authkit`、`userkit`、`permissionkit`、`auditkit`、`emailkit`，全部 `wired`/`installed`）与本设计选择一致，`app/ticket-system/AGENTS.md` 存在。

未选用的候选模块与理由：`attachment`（需求未要求附件上传/存储/下载，工单描述与回复以文本承载）；`i18n`（需求未要求多语言）。两者不构成阻塞，若后续需求引入可按同样边界补充。

## 3. UI 全局基线

- 应用/业务模板：`helpdesk`（工单受理与处理流程是核心业务能力）。
- 展示模板：`split-master-detail` — 列表/队列与当前工单详情并列协同，这是本应用的主要工作流布局；该 ID 同时供实现阶段读取对应实现资源。
- 视觉风格：Modern SaaS（柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色加状态色、短而有反馈作用的动效）。
- 依据的需求事实：核心动作是高频逐条处理工单（工作台查看/筛选/搜索/排序、回复、转派、完成）；同时存在配置管理（业务组、成员、分类→业务组规则）与指标查看（分布统计、运营指标）两类差异化页面。

应用壳与导航：默认桌面 Web，左侧导航（工单工作台、我的工单、业务组与分配规则、统计与分析、操作日志），顶部上下文栏显示当前公司与当前用户（含角色），主工作区承载当前任务。首页即工单工作台，不使用营销式首屏或纯卡片总览。

主要工作流布局：

- 工单工作台（处理人）：左侧待处理工单队列（默认仅展示状态为“待处理”的工单，支持关键字搜索、按列表字段排序、按分类/优先级/业务组/公司维度筛选与分页），右侧当前工单详情（提交人完整信息与历史工单、回复流、转派轨迹、处理记录、操作区：回复、转派、完成、取消）。
- 我的工单（提交人）：本人工单列表与详情，含回复入口；工单完成后在详情内展示满意度评价表单（1–5 刻度 + 可选说明）。
- 业务组与分配规则（配置人）：业务组列表与成员编辑，以及“分类→业务组”规则表格（新增/修改/删除），冲突与校验结果就地反馈。
- 统计与分析（管理者）：顶部筛选（时间范围/业务组/分类）→ 指标区（工单量、平均响应时间、满意度、热点问题）→ 公司与部门维度分布表格/条形图；指标口径按需求推荐基线计算。
- 操作日志：表格 + 过滤（对象类型、对象 ID、操作人、时间范围），分页展示。

目标设备与窄屏策略：需求未要求移动端或窄屏布局，本设计只承诺桌面 Web，不纳入窄屏验收范围。

全局状态：加载（骨架或占位行）、空态（说明当前范围无数据并给出主行动，如“新建工单/新建业务组”）、错误（可重试并保留已填写内容）、无权限（明确提示且不渲染受限数据）、成功（保存、分配、转派、完成、取消、评价后的即时确认与最新状态）。可能截断的内容（主题、描述、回复、邮件地址）在列表中截断并以悬停标题显示全文，详情内提供展开查看。

## 4. 数据模型与迁移

所有业务表均带 `company_id`（除全局序列表），公司隔离由应用层的公司范围强制与查询条件共同保证，读写均不接受来自客户端的公司覆盖。时间统一以 UTC ISO-8601 文本存储（`created_at`、`completed_at`、`replied_at` 等）。

| 表 | 归属模块 | 关键列与约束 |
| --- | --- | --- |
| `companies` | identity-access | `id` PK、`name`、`code` UNIQUE、`created_at` |
| `departments` | identity-access | `id` PK、`company_id` FK、`name`、`created_at`；UNIQUE(`company_id`, `name`) |
| `company_members` | identity-access | `id` PK、`company_id` FK、`department_id` FK NULL、`user_id`（引用本地账号，UNIQUE）、`display_name`、`email`、`is_active`、`created_at` |
| `company_member_roles` | identity-access | `member_id` FK、`role_code`（`submitter`/`agent`/`configurator`/`manager`）；PK(`member_id`, `role_code`) |
| `business_groups` | org-config | `id` PK、`company_id` FK、`name`、`description` NULL、`created_at`、`updated_at`；UNIQUE(`company_id`, `name`) |
| `business_group_members` | org-config | `group_id` FK、`member_id` FK；PK(`group_id`, `member_id`) |
| `assignment_rules` | org-config | `id` PK、`company_id` FK、`category`、`group_id` FK、`created_at`、`updated_at`；UNIQUE(`company_id`, `category`) |
| `tickets` | ticket-workflow | `id` PK（全局唯一）、`company_id` FK、`ticket_no`、`subject`、`description`、`category`、`priority`（`P0`–`P4`）、`status`（`created`/`pending_assignment`/`pending_processing`/`completed`/`cancelled`）、`group_id` FK NULL、`assignee_member_id` FK NULL、`submitter_member_id` FK、`submitter_name`、`submitter_department` NULL、`submitter_email`、`created_at`、`completed_at` NULL、`completed_by_member_id` FK NULL、`cancelled_at` NULL；UNIQUE(`company_id`, `ticket_no`)；INDEX(`company_id`, `status`) |
| `ticket_replies` | ticket-workflow | `id` PK、`ticket_id` FK、`company_id` FK、`author_member_id` FK、`author_role`、`content`、`created_at`；INDEX(`ticket_id`, `created_at`) |
| `ticket_assignments` | ticket-workflow | `id` PK、`ticket_id` FK、`company_id` FK、`kind`（`assign`/`transfer`/`auto`）、`from_member_id` NULL、`to_member_id` NULL、`to_group_id` NULL、`actor_member_id` NULL（系统自动分配为空）、`created_at` |
| `ticket_ratings` | ticket-workflow | `id` PK、`ticket_id` FK UNIQUE、`company_id` FK、`score`（1–5 整数）、`comment` NULL、`created_at` |
| `ticket_no_sequences` | ticket-workflow | `company_id` PK、`next_value`；公司内可读编号的单调递增来源（不使用全局自增以避免跨公司暴露业务量） |
| `notifications` | notification | `id` PK、`ticket_id` FK、`company_id` FK、`channel`（`email`）、`recipient_email`、`status`（`success`/`failed`）、`error` NULL、`created_at`、`sent_at` NULL；INDEX(`ticket_id`, `created_at`) |

工单标识采用双标识：`id` 为全局唯一主键（对外展示与接口寻址），`ticket_no` 为公司在事务内递增的可读编号（如 `TKT-000123`），两者都保证 AC-01 要求的唯一性。

迁移约定：上述业务表与索引由新增迁移文件建立，文件位于应用包 `src/server/migrations/sqlite/`，编号自 `0004_tickets.sql` 起（`0001`–`0003` 已由平台身份、权限与审计模块占用）；后续结构变更一律继续新增迁移文件，由 `runMigrations` 按文件名顺序执行并记录已应用版本。数据库结构不通过 ORM 自动同步或手工修改。

## 5. 外部集成：工单完成通知邮件

- 集成对象：SMTP 邮件服务，经 `emailkit` 的 `createEmailClient` 发送。
- 配置：`SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`（全部从环境变量读取，不写入代码或数据库；需求未规定渠道配置方式）。
- 触发时机：工单状态由“待处理”转为“完成”时（完成操作提交后）。发送在完成事务之外执行，发送失败不回滚工单状态。
- 失败可见性：每次发送都在 `notifications` 写入一条记录，成功记 `status=success` 与 `sent_at`，失败记 `status=failed` 与 `error`（如缺少配置、连接被拒、认证失败）。该记录在工单详情的“通知结果”区域可读回，操作人与管理者可见。
- 未规定项口径：邮件模板为纯文本（主题含工单编号与主题，正文含完成时间与处理人）、不做自动重试、不做多渠道降级。

## 6. 架构决策记录

- **ADR-1 采用完整全栈路线而非纯前端 localStorage**：需求要求跨用户共享的工单与回复、公司隔离授权、后台自动分配、完成通知邮件与基于服务端权威数据的统计聚合，纯前端无法承载。
- **ADR-2 采用 `dbkit` + SQLite 文件库与版本化迁移**：单进程服务端应用，关系与事务需求明确（创建即自动分配、公司内编号递增、评价唯一），文件库足以承载；数据库结构只能通过迁移演进，避免隐式 schema 同步。
- **ADR-3 身份采用 `authkit` + `userkit` 本地密码模式，授权采用 `permissionkit` 注册表加公司范围强制**：需求将登录与授权机制标注为未规定，故取最小可逆默认；公司隔离（AC-03）与对象归属（提交人只能读/回复/评价本人工单）由服务端在每个端点上强制，权限键只表达能力，不替代数据范围校验。
- **ADR-4 操作日志采用 `auditkit` 持久化事件**：AC-15 要求覆盖创建、分配/自动分配、转派、回复、状态变更、评价、完成通知与业务组/规则配置变更，且含对象、操作人（或系统）与时间；日志独立于业务事务写入，不因业务回滚而丢失显式操作记录。
- **ADR-5 工单采用全局唯一 `id` 加公司内可读 `ticket_no`**：满足唯一工单 ID 要求，同时避免运营编号跨公司泄露业务量。
- **ADR-6 SLA 优先级只作为标记存储**：需求将 P0–P4 的时限数值与超时处理标为未规定，设计不内置任何时限策略，保留后续按政策补充迁移的空间。
- **ADR-7 通知发送与业务事务解耦**：完成状态提交后独立发送并记录结果，保证“完成后通知提交人”可验证（成功或明确的失败记录），同时避免邮件不可用阻断工单流转。

设计结论：`decision: ready`。所需证据、模块核查、初始化与校验均按本阶段要求执行并记录。