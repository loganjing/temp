# 系统设计 — 132-ticket 工单系统

<!-- system-design: scope -->
## 1. 整体方案与设计基线

**应用形态**：单体全栈 Web 应用。公司用户（提交人）提交工单并跟踪、回复、评价；运营侧处理团队（业务组成员）在工作台承接、处理、转派并完成工单，完成后向提交人邮箱发送通知邮件；配置管理员维护公司、业务组、成员与分类自动分配规则；统计查看者查看工单分布与运营仪表盘。

**技术栈**（冻结）：

| 层 | 选型 | 说明 |
|---|---|---|
| 后端 | Hono（Node ≥ 20，ESM） | REST API，单进程承载路由与授权 |
| 前端 | React + Vite SPA | 单页应用，登录后按角色渲染导航与页面 |
| UI | Tailwind CSS + Lucide 图标 | split-master-detail 布局，Modern SaaS 视觉 |
| 数据库 | SQLite，经 `@commonapp/dbkit` | 文件数据库，版本化 SQL 迁移，查询/事务统一走 dbkit |
| 认证 | `@commonapp/authkit` + `@commonapp/userkit` | 本地密码登录 + Bearer token；用户业务档案由项目扩展 |
| 邮件 | `@commonapp/emailkit` | 工单完成通知 SMTP 外发，发送结果持久化 |

**整体结构**：

```
浏览器 ── React SPA（登录 / 我的工单 / 工作台 / 分配配置 / 统计分析）
   │  HTTP + Bearer token
   ▼
Hono API 服务（路由 → 授权中间件 → 领域服务）
   │                        │
   ▼                        ▼
SQLite（dbkit）          emailkit → SMTP（完成通知邮件）
   ▲
   └── authkit / userkit（登录、用户凭证、用户档案桥接）
```

**CommonApp 模块选择**（catalog 与 manifest 均已核查，状态 ready，发行文件完整）：

| 模块 | 包 / 版本 | 需求匹配 | 集成边界与限制 | manifest SHA-256 | 模块安装标记 |
|---|---|---|---|---|---|
| dbkit | @commonapp/dbkit 0.2.0 | SQLite 配置、参数化查询、事务与版本化迁移，覆盖工单系统全部持久化与状态流转事务 | 数据库入口唯一：`createDb(createDbConfig({driver:'sqlite', sqlitePath: process.env.DB_PATH ?? './data/application.db'}))`，初始化已在 `src/server/platform/bootstrap.ts` 接线；SQL 迁移文件置于 `app/ticket-system/src/server/migrations/sqlite/` | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | commonapp install: dbkit |
| authkit | @commonapp/authkit 0.1.2 | Hono 密码登录与 Bearer 认证，覆盖多角色登录需求 | 依赖 hono ^4.6.0；仅做认证，不含用户存储与角色判断 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | commonapp install: authkit |
| userkit | @commonapp/userkit 0.1.0 | 本地用户与密码凭证存储、AuthKit 用户解析器，提供 platform_users 表迁移 | 用户业务字段（姓名、邮箱、公司、部门、角色）不在其表内，由项目 `user_profiles` 表扩展；starter 生成的用户管理 API 仅要求登录、不校验角色，见第 6 节限制 | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | commonapp install: userkit |
| emailkit | @commonapp/emailkit 0.1.0 | 可配置 SMTP 邮件发送，覆盖工单完成通知 | 依赖 nodemailer ^9.0.5；SMTP 未配置或发送失败不阻塞工单完成，结果写入 `email_logs` | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | commonapp install: emailkit |

模块源路径均为 `modules/<moduleId>/install-manifest.json`（CommonApp 分发目录），vendor 边界、包清单与锁文件由 npm 按 `file:./vendor/@commonapp/<id>` 依赖负责管理，详见第 6 节。

**未选用模块及理由**：

- `permissionkit`（RBAC 注册表）：本需求的授权语义是"角色粗检查 + 公司数据行级隔离 + 业务组成员关系"，均为工单域内已有数据的过滤规则，项目内以授权中间件与查询条件直接实现更贴合业务语义，引入通用 RBAC 注册表不降低复杂度。
- `auditkit`（审计事件）：工单操作日志是面向业务展示的工单时间线（按工单查看、展示操作人与类型，见 AC-13），字段与展示语义由项目 `ticket_logs` 表直接承载；其安全审计与脱敏能力非本需求所需。
- `attachment`、`i18n`：需求不含附件上传与国际化。

**运行与启动约定**（依据本阶段完成的授权初始化，工作区为 npm workspaces 布局，包根 `app/ticket-system`，命令在工作区根目录执行）：

- 常规启动（开发）：`npm run dev`（根目录脚本并行启动 `dev:web`（Vite）与 `dev:server`（tsx watch 服务端））。
- 生产：`npm run build`（类型检查 + 前端构建）后 `npm start`（启动 `app/ticket-system/src/server/index.ts`，托管 API 与构建产物）。服务端入口位于授权写入范围内。
- 服务监听端口：环境变量 `PORT`，默认 3000。
- 持久化数据库：环境变量 `DB_PATH`，默认 `./data/application.db`（相对服务进程工作目录，当前为应用包根）；服务启动时自动创建数据目录父目录并执行迁移（`runMigrations`，目录 `app/ticket-system/src/server/migrations/`）。
- 隔离验证数据库：测试用 `DB_PATH` 覆盖（独立测试库文件，`:memory:` 亦可），端口选用空闲端口，验证结束只清理本次启动的进程。验收命令为根目录 `npm test`（等价 `npm run test -w ticket-system --if-present`，运行 `test/*.test.mjs`，其中 `test/with-http-server.mjs` 负责启动并清理隔离服务）；验收时只运行该命令，不额外后台启动服务。
- 数据库变更一律通过 `app/ticket-system/src/server/migrations/sqlite/` 下版本化 SQL 迁移执行（userkit 平台表迁移 `0001_platform_users.sql` 已由初始化安装），禁止运行期改 schema。
- 邮件 SMTP 配置：环境变量 `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `SMTP_FROM_NAME`（随 emailkit vendor 包 `install/config.env.example`）；`SMTP_HOST` 留空即禁用外发邮件，此时邮件降级为仅记录发送日志（见第 5 节）。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

服务端按"路由 → 授权 → 领域服务 → dbkit 数据访问"分层；每个模块拥有唯一数据归属，不读写其他模块的私有表。

| 模块 | 职责 | 唯一数据归属 | 主要接口（用途 / 调用方向） |
|---|---|---|---|
| auth | 登录、登出、会话 token 签发与校验；当前用户上下文 | （无私有表，经 userkit 读写 platform_users） | `POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/me`（浏览器 → 服务） |
| user-profile | 用户业务档案（姓名、邮箱、公司、部门、角色）与用户开户 | `user_profiles` | `GET/POST /api/users`、`PUT /api/users/{id}/profile`（浏览器 → 服务） |
| org-config | 公司、业务组、组成员、分类自动分配规则的配置管理 | `companies`、`business_groups`、`group_members`、`routing_rules`、`categories` | `/api/companies*`、`/api/companies/{id}/groups*`、`/api/groups/*`、`/api/companies/{id}/routing-rules*`、`GET /api/categories`（浏览器 → 服务） |
| ticket | 工单创建与编号、状态机流转、回复、转派、完成、取消、评价；提交人完整信息查询 | `tickets`、`ticket_replies`、`satisfaction_ratings` | `POST/GET /api/tickets`、`GET /api/tickets/{id}`、`POST /api/tickets/{id}/replies|transfer|complete|cancel|satisfaction`（浏览器 → 服务） |
| notify | 工单完成邮件通知与发送记录 | `email_logs` | 由 ticket 完成流程调用（服务内部 → emailkit/SMTP），无独立对外路由 |
| stats | 工单分布统计与运营仪表盘指标计算 | （只读聚合，归属各业务表） | `GET /api/stats/distribution`、`GET /api/stats/dashboard`（浏览器 → 服务） |
| ticket-log | 工单关键操作日志的记录与查询 | `ticket_logs` | `GET /api/tickets/{id}/logs`（浏览器 → 服务）；写入由各领域服务在事务内调用 |

**角色与访问控制边界**（最小角色模型：每用户单一业务角色；需求未规定权限体系，按推荐基线收敛）：

- **submitter（提交人）**：公司用户。创建工单；列表与详情仅可见**自己提交**且归属本公司的工单（公司隔离，见下）；可回复、取消（未终态）、在完成后评价。覆盖 AC-01/02/03/04/09。
- **agent（处理人）**：业务组成员。工作台列出其所属业务组承接的待处理工单，可按公司维度筛选（业务组属于不同公司，成员经授权跨公司承接）；工单详情对其当前分配组开放；可回复、转派（目标限工单所属公司的其他业务组）、完成（完成后仍可回看自己完成的工单）。覆盖 AC-05/06/07/08/12。
- **admin（配置管理员）**：运营侧。管理公司、业务组、成员、分类规则与用户开户；可查看任意工单并执行取消兜底；可查看统计。覆盖 AC-05 的配置侧。
- **viewer（统计查看者）**：运营侧。查看统计分布与仪表盘。覆盖 AC-10/11。

**公司隔离边界**（对应需求 5.1 / AC-03）：每张工单归属提交人所在公司（`tickets.company_id`）。公司用户（submitter）的列表与详情查询在服务端强制 `company_id = 用户公司 AND submitter_id = 用户本人`，直接访问他公司工单返回 404。运营侧（agent/admin/viewer）不按用户公司过滤，而按"业务组成员关系 / 运营职责"授权——这是工单系统处理与统计运营的必要边界，不与公司用户之间的数据隔离冲突。所有查询过滤在服务端完成，前端不承担隔离责任。

**状态机**（枚举与流转同需求第 4 节，服务端在事务内校验流转合法性，终态拒绝变更）：

```
created → pending_assignment（提交后进入分配队列）
pending_assignment → in_progress（分类规则命中 → 分配业务组）
created / pending_assignment / in_progress → cancelled（取消，终态）
in_progress → completed（处理完成，终态；记录处理人与时间，发通知邮件）
completed / cancelled：终态，不再流转
```

无匹配分类规则的工单保持 `pending_assignment`，等待人工处理（配置规则后由待分配工单重新分配或新工单自动命中；本设计不做后台轮询重分配，避免引入计划任务）。

**接口摘要**：登录认证、组织配置、工单全生命周期、统计四组 REST 接口；字段级契约（method/path、请求/响应字段、类型、可空性、错误码、授权、幂等性）以 `docs/wi-t1000329/technical-contract.md` 为唯一来源，本文不重复。

## 3. 数据模型与迁移

SQLite 单库，应用包根 `app/ticket-system`（`src/server` 服务端、`src/client` 前端、`src/shared` 共享契约，目录依赖边界见包级 `AGENTS.md` 与根目录 `platform-baseline.json`）。认证用户表 `platform_users` 由 userkit 迁移创建；以下为项目业务表（迁移目录 `app/ticket-system/src/server/migrations/sqlite/`，实现阶段落地）：

| 表 | 关键字段 | 关系 / 约束 |
|---|---|---|
| `companies` | id, name, created_at | 公司 |
| `user_profiles` | user_id(PK/FK→platform_users), display_name, email, company_id(FK→companies), department, role('submitter'\|'agent'\|'admin'\|'viewer'), created_at | 用户业务档案，一用户一档案 |
| `categories` | id, name, sort_order | 问题分类字典，迁移种子预置（账号问题、登录故障、数据异常、功能咨询、付款与账单、其他） |
| `business_groups` | id, company_id(FK), name, created_at | UNIQUE(company_id, name)；业务组属于公司 |
| `group_members` | id, group_id(FK), user_id(FK→platform_users), created_at | UNIQUE(group_id, user_id)；成员可属多个公司业务组 |
| `routing_rules` | id, company_id(FK), category_id(FK), group_id(FK) | UNIQUE(company_id, category_id)；应用层校验 group 属于同公司 |
| `tickets` | id(自增), ticket_no(唯一, "TK-" + 6位序号), subject, description, category_id(FK), priority('P0'..'P4'), status('created'\|'pending_assignment'\|'in_progress'\|'completed'\|'cancelled'), company_id(FK), submitter_id(FK), assigned_group_id(FK 可空), completed_by(可空), completed_at(可空), cancelled_by(可空), cancelled_at(可空), created_at, updated_at | 索引 (company_id,status)、(assigned_group_id,status)、(submitter_id) |
| `ticket_replies` | id, ticket_id(FK), author_id(FK), author_name, author_side('submitter'\|'agent'), content, created_at | 索引 (ticket_id, created_at)；author_side 由服务端按操作者与工单提交人关系判定 |
| `ticket_logs` | id, ticket_id(FK), action('created'\|'queued'\|'auto_assigned'\|'transferred'\|'replied'\|'completed'\|'cancelled'\|'rated'), operator_id(可空), operator_name, detail, created_at | 索引 (ticket_id, created_at)；系统动作 operator 可空 |
| `satisfaction_ratings` | id, ticket_id(FK, UNIQUE), rating(1-5), comment(可空), rated_by(FK), rated_at | 一工单一评价 |
| `email_logs` | id, ticket_id(FK), to_email, subject, status('sent'\|'failed'\|'skipped'), error(可空), created_at | 完成通知发送记录，AC-08 的可查证据 |

**事务约定**：工单创建（含编号生成与自动分配）、状态流转、转派、完成、取消、评价均为单事务（dbkit `db.transaction`），日志随业务变更同事务写入，保证日志与状态一致。统计查询只读，无事务。

**迁移**：全部 schema 变更经版本化 SQL 迁移（dbkit `runMigrations`，目录 `app/ticket-system/src/server/migrations/sqlite/`；userkit 平台表迁移 `0001_platform_users.sql` 已由初始化安装，项目业务表迁移由实现阶段新增）；禁止 ORM 自动同步或运行期手工改 schema。种子：categories 字典。

## 4. UI 全局基线

- **应用 / 业务模板**：helpdesk（工单处理业务）。
- **展示模板**：`split-master-detail`——列表/队列与当前记录详情协同。主工作流（工作台）：左侧待处理工单队列（筛选、搜索、排序）+ 右侧当前工单详情（提交人信息卡、回复时间线、转派/完成操作）。实现阶段按该 ID 读取对应 UI 资源。
- **视觉风格**：Modern SaaS——柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色（蓝）+ 状态色（P0-P4 优先级与工单状态用语义色标注）、短而有反馈的动效。
- **应用壳与导航**：左侧导航（按角色显示：我的工单 / 工作台 / 分配配置 / 统计分析 / 用户管理 / 退出）+ 顶部上下文栏（当前用户姓名、公司、角色）+ 主工作区。目标设备：桌面 Web（需求未要求移动端/窄屏，不做窄屏验收）。
- **页面地图**：登录页；我的工单（submitter，列表+创建入口）；工单详情（split-master-detail 右区，按角色渲染回复/评价/转派/完成/取消）；工作台（agent，split-master-detail 主布局）；分配配置（admin：公司→业务组→成员→分类规则）；统计分析（viewer/admin：分布统计维度切换 + 仪表盘 KPI/图表/热点榜）；用户管理（admin）。
- **全局状态**：加载（表格骨架屏）、空数据（空态提示与引导动作）、错误（错误提示条）、无权限（403 提示页）、成功（行内成功反馈/轻提示）。主题、描述、日志详情等可能截断的文本提供悬停标题或展开查看全文。
- **选择依据**：核心动作是"高频逐条处理工单记录"（需求 5.7 工作台、旅程A 端到端处理），匹配 split-master-detail；统计分析页作为独立页面遵循同一应用壳，采用"顶部筛选 + KPI 卡 + 图表 + 明细"布局（内部模块沿用全局基线）；普通业务后台无营销/沉浸场景，视觉取 Modern SaaS 默认。

## 5. 外部集成：邮件

工单完成（`POST /api/tickets/{id}/complete`）事务提交后，notify 模块向提交人档案邮箱发送完成通知（主题含工单编号，正文含工单主题、处理人、完成时间与结果链接提示）。

- SMTP 经 emailkit 配置（环境变量，见第 1 节）；emailkit 已安装（vendor 包与 nodemailer 依赖就绪），notify 模块在实现阶段接线调用。
- 发送结果写入 `email_logs`（sent/failed/skipped + 错误信息），作为 AC-08 的可查发送记录。
- **失败可见性**：SMTP 未配置时记录 `skipped`，发送异常记录 `failed` 与错误信息；邮件失败不阻塞、不回滚工单完成状态，失败状态在完成接口响应与工单详情（admin/agent 视角）中可见。需求未规定邮件渠道与模板（未规定事项），本设计将其收敛为可替换的 notify 模块内部实现，后续更换渠道不影响领域层。

## 6. 运行与可靠性

- 启动顺序：服务启动时创建 `DB_PATH` 父目录 → `runMigrations`（幂等） → 监听 `PORT`。干净目录无需人工准备即可启动。
- 验收/测试运行：`DB_PATH` 指向独立测试库文件，`PORT` 选用空闲端口，等待真实监听就绪后执行验证，只清理本次启动的进程。
- vendor 边界：工作区根 `vendor/@commonapp/*` 由初始化器安装，应用包以 `file:../../vendor/@commonapp/<id>` 依赖引用，`package-lock.json` 锁定依赖；模块内文件只读，不在其中安装或构建。
- **已知限制与实现期收紧项**：userkit starter 生成的用户管理 API 仅要求登录、不校验角色（任何登录用户可操作用户管理）。本应用存在公司隔离与角色边界，实现阶段必须为用户管理路由追加 admin 角色检查（授权中间件），该项作为设计约束传递给实现阶段；在收紧前不得将用户管理页面纳入验收范围。
- 冷启动检查：Node/npm 与 `package-lock.json` 由内置冷启动检查覆盖。
- 工作区初始化：本阶段已按 bootstrap 输入 `docs/wi-t1000329/workspace-bootstrap.json` 执行一次批准初始化（新项目 + dbkit 依赖闭包；authkit/dbkit/userkit 已接线，emailkit 已安装待实现阶段接线），依赖安装、构建与基线测试全部通过；根目录 `platform-baseline.json` 与 `app/ticket-system/AGENTS.md` 已生成并核对，`packageRoot` 与模块清单同设计选择一致，见阶段回执 verification。
