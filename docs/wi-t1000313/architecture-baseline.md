# 系统设计

> 工作项：wi-t1000313（127-ticket 工单系统）｜ 设计路线：fullstack-complex ｜ 需求基线：`docs/wi-t1000313/requirements.md`（已批准快照）

<!-- system-design: scope -->

## 1. 整体方案与设计基线

### 1.1 系统定位与形态

面向多公司的工单服务系统：公司用户提交工单并多轮回复沟通；工单按公司隔离，按"分类→业务组"规则自动分配；处理人处理、转派工单，完成时记录处理人/处理时间并向提交人发送邮件通知；提交人完成满意度评价；运营侧通过工作台跟进待处理工单，通过统计与仪表盘分析公司/部门分布及运营指标。

形态：单仓全栈 Web 应用（新项目，应用名 `ticket-system`）。Hono 提供 REST API 并托管前端构建产物；React/Vite SPA 为唯一前端；SQLite 文件数据库为服务端唯一权威数据源；关键操作统一落审计日志。

### 1.2 技术栈（冻结）

| 层 | 选型 | 说明 |
|---|---|---|
| 运行时 | Node.js ≥ 20（ESM） | dbkit/authkit 运行要求 |
| 后端框架 | Hono | REST `/api`，Bearer 认证中间件 |
| 前端 | React + Vite SPA | Tailwind CSS |
| 数据库 | SQLite（better-sqlite3，经 @commonapp/dbkit） | 文件库，版本化迁移，事务 |
| 认证 | @commonapp/authkit + @commonapp/userkit | 本地密码登录（identityMode: local-password） |
| 审计 | @commonapp/auditkit | `platform_audit_events` 持久化操作日志 |
| 邮件 | @commonapp/emailkit | SMTP 发送完成通知 |
| 包管理 | npm | CommonApp 依赖以 `file:./vendor/@commonapp/*` 安装 |

### 1.3 CommonApp 模块选择

| 模块 | 包/版本 | 模块安装标记 | manifest SHA-256 | 需求匹配 | 集成边界 |
|---|---|---|---|---|---|
| dbkit | @commonapp/dbkit 0.2.0 | `commonapp install: dbkit` | `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6` | 服务端权威数据、事务、结构化查询与统计聚合 | 服务端唯一数据访问层；版本化迁移目录 `migrations/sqlite/` |
| authkit | @commonapp/authkit 0.1.2 | `commonapp install: authkit` | `a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02` | 公司隔离所需的身份识别与登录 | Hono 登录端点与 Bearer 认证 |
| userkit | @commonapp/userkit 0.1.0 | `commonapp install: userkit` | `40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4` | 本地用户与登录凭证 | 拥有 `platform_users`；公司/部门/角色由项目表 `user_profiles` 扩展承载 |
| auditkit | @commonapp/auditkit 0.1.0 | `commonapp install: auditkit` | `27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1` | 关键操作日志（创建/分配/转派/回复/处理/完成/取消/评价） | 拥有 `platform_audit_events`；业务操作经统一审计服务写入与检索 |
| emailkit | @commonapp/emailkit 0.1.0 | `commonapp install: emailkit` | `a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c` | 工单完成邮件通知 | 完成事务提交后 best-effort 发送，结果回写审计 |

未选候选：`permissionkit`（RBAC 注册表）。理由：需求授权模型未规定，实际需要的是固定三角色（提交人/处理人/运营）加公司数据域隔离，无动态权限注册与管理要求；角色与数据域校验由项目服务层承担，不引入未被要求的基础设施。

已知限制：本地密码 starter 生成的用户管理 API 仅做登录校验、不校验角色，任何已登录用户均可操作。本应用全部管理类端点（公司/用户档案/业务组/分配规则）在业务层强制 ops 角色与数据域校验，不依赖 starter 管理页面的默认授权行为。

### 1.4 运行与环境基线

- 常规启动：先 `npm run build`（构建前端产物），再 `npm start`（packageRoot 下 `node --import tsx src/server/index.ts`，同时服务 `/api` 与已构建前端静态资源）；开发模式：根目录 `npm run dev`（同时启动 Vite 开发服务器与 API 服务，`/api` 由 5173 代理至 3000）。命令以初始化脚手架 `package.json` 为准（已核对）。
- 服务入口：`app/ticket-system/src/server/index.ts`（packageRoot 为 `app/ticket-system`，以根目录 `platform-baseline.json` 为唯一权威）。
- 端口：`PORT` 环境变量可配置，默认 3000。
- 数据库：SQLite 文件，默认 `./data/application.db`（相对 packageRoot 运行目录），`DB_PATH` 环境变量覆盖（测试隔离用，亦可设 `:memory:` 供临时检查）；打开前自动创建父目录，干净目录无需手工准备。
- 迁移：dbkit `runMigrations` 执行 `src/server/migrations/sqlite/` 版本化 SQL 迁移（含模块迁移 `0001_platform_users.sql`、`0003_platform_audit_events.sql`），禁止 ORM 自动同步或手改 schema。
- 认证平台变量：`JWT_SECRET`（authkit；初始化已在根目录 `.env` 生成随机值，部署时保持私密）。
- 邮件：SMTP 环境变量（`SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM`，按 emailkit 配置约定）；未配置时发送失败并被如实记录。
- 验收：验收/验证脚本自行负责启动（空闲端口 + `DB_PATH` 指向隔离库）与清理，仅清理本次启动的进程；不额外后台起服务或 sleep。

<!-- system-design: architecture-boundaries -->

## 2. 领域责任、模块边界与接口摘要

### 2.1 架构总览

```
React/Vite SPA（ticket-system 前端）
    │  REST /api（Bearer Token）
    ▼
Hono API 服务（app/ticket-system/src/server/index.ts）
    ├─ auth（authkit+userkit）   登录 / 当前用户
    ├─ identity-profile          公司 / 用户档案（公司、部门、角色）
    ├─ assignment                业务组 / 成员 / 分类规则 / 自动分配
    ├─ ticket                    工单 / 回复 / 生命周期 / 转派 / 评价
    ├─ processing                完成处理记录 / 提交人完整视图
    ├─ stats                     分布统计 / 仪表盘指标（只读聚合）
    ├─ audit（auditkit）         操作日志写入与检索
    └─ notification（emailkit）  完成邮件通知
    │
    ▼
SQLite 文件库（dbkit，./data/application.db）
```

### 2.2 模块职责与数据归属

| 模块 | 职责 | 唯一数据/事实归属 | 对外能力（摘要与方向） |
|---|---|---|---|
| auth | 登录、Token 发放/校验、当前用户（含项目档案） | `platform_users`（userkit） | `/api/auth/login`、`/api/auth/logout`、`/api/auth/me`（前端→服务端） |
| identity-profile | 公司与用户档案（公司/部门/角色）维护 | `companies`、`user_profiles` | `/api/admin/companies`、`/api/admin/users`（前端→服务端；仅 ops 写） |
| assignment | 业务组与成员管理、分类分配规则、自动分配决策 | `business_groups`、`business_group_members`、`assignment_rules` | `/api/business-groups*`、`/api/assignment-rules*`；分配决策供 ticket 模块调用（服务内部） |
| ticket | 工单创建/详情/列表（工作台）、多轮回复、生命周期转移、转派、取消、评价 | `tickets`、`ticket_replies`、`ticket_ratings` | `/api/tickets*`（前端→服务端） |
| processing | 完成时记录处理人/处理时间；提交人完整信息与历史工单视图 | 复用 ticket 模块数据（只读） | `/api/tickets/{id}/submitter`、complete 流程；邮件触发经 notification（服务内部） |
| notification | 完成通知邮件发送与结果记录 | 无自有表（结果写入审计事件） | 内部能力，由 complete 流程调用；不直接暴露端点 |
| stats | 公司/部门分布、仪表盘指标（工单量/平均响应时间/满意度/热点分类） | 无自有表（经 ticket 模块查询能力只读聚合） | `/api/statistics/distribution`、`/api/statistics/dashboard`（前端→服务端） |
| audit | 关键操作日志统一写入与检索 | `platform_audit_events`（auditkit） | `/api/audit-events`（前端→服务端）；写入侧供各业务模块调用（服务内部） |

字段级接口定义（method/path、请求/响应字段、类型、可空性、错误、授权、幂等）以 `docs/wi-t1000313/technical-contract.md` 为唯一来源，本文不重复。

### 2.3 公司隔离与授权基线

- 角色基线（需求授权模型未规定，按最小闭环落地）：`submitter`（提交人）、`handler`（处理人，业务组成员，亦可提交工单）、`ops`（运营管理：跨公司视图、公司/用户档案/业务组/规则管理、审计与统计）。
- 数据域：submitter 仅本人工单；handler 本公司工单与业务组；ops 全部公司数据。所有列表查询由服务端按身份强制注入数据域条件，前端筛选不能越域。
- 越域访问语义：对不在数据域内的资源返回 404（不泄露存在性与内容）；域内但角色不允许的动作返回 403。
- ops 的跨公司访问（工作台公司筛选、跨公司统计）由 ops 角色显式授权。

### 2.4 工单生命周期状态机（摘要）

状态枚举：`created`（创建）、`pending_assignment`（待分配）、`in_progress`（待处理）、`completed`（完成，终态）、`cancelled`（取消，终态）。

| 当前状态 | 动作 | 下一状态 | 附加效果 |
|---|---|---|---|
| created | 创建时规则命中 → 自动分配 | in_progress | 记录 assigned_group_id |
| created | 创建时无匹配规则 | pending_assignment | — |
| pending_assignment | 手动分配（assign） | in_progress | 记录业务组/处理人 |
| in_progress | 转派（transfer） | in_progress | 归属变更，审计可追溯 |
| in_progress | 完成（complete） | completed（终态） | 记录处理人/处理时间，触发邮件通知 |
| created / pending_assignment / in_progress | 取消（cancel） | cancelled（终态） | 记录取消时间与原因 |

`created` 为提交生成后的初始瞬态：创建请求内同步执行自动分配决策，请求返回后可观察状态为 `in_progress`（规则命中）或 `pending_assignment`（未命中）。`completed`/`cancelled` 为终态，不可再变更；完成后的可用动作仅剩读取与满意度评价。转移权威定义与错误语义见技术契约。

## 3. UI 全局基线

- 应用/业务模板：`helpdesk`（工单逐条处理、多轮沟通、分配与转派）。
- 展示模板：`split-master-detail`（高频逐条处理记录：列表/队列与当前记录详情协同）。该 ID 同时是 Builder 读取对应实现资源的标识。
- 视觉预设：Modern SaaS。Tailwind Token 方向：中性色表面、细边框、少阴影、中等圆角、清晰字体、单一主色 + 状态色（优先级/生命周期）、短而有反馈作用的动效。
- 应用壳：左侧导航（工作台、我的工单、统计、审计、管理）+ 顶部上下文栏（当前用户、公司、角色）+ 主工作区；目标设备为桌面 Web（需求未要求窄屏/移动端）。
- 主工作流：工作台为列表（筛选/搜索/排序栏 + 表格）与工单详情并列；工单详情页包含工单字段、提交人信息面板（处理视角含公司与历史工单）、回复时间线、操作区（分配/转派/完成/取消/评价）。
- 统计页在全局壳内使用仪表盘组合：顶部筛选 + KPI 指标卡（工单量/平均响应时间/满意度）+ 热点分类 + 分布明细表；不改变全局展示模板选择。
- 全局状态：加载（列表骨架/按钮忙碌）、空态（引导创建工单或调整筛选）、错误（可重试并给出具体原因）、无权限（403/404 明确文案，不暴露越域内容）、成功（操作反馈与状态即时更新）。
- 长文本（描述、回复）截断显示时提供展开或悬停查看全文。

## 4. 数据模型与迁移

- 模块表（由模块迁移建立，项目不重复定义）：`platform_users`（userkit：登录邮箱与凭证）、`platform_audit_events`（auditkit：审计事件）。
- 项目表（字段级定义见技术契约）：`companies`、`user_profiles`（用户↔公司/部门/角色档案）、`business_groups`、`business_group_members`、`assignment_rules`（公司+分类→业务组，唯一）、`tickets`（含提交人姓名/部门/邮箱快照）、`ticket_replies`、`ticket_ratings`。
- 提交人快照：工单记录提交人快照字段并保留 `submitter_user_id` 关联，保证详情展示与通知邮件取值稳定，历史工单按提交人用户聚合。
- 迁移：全部经 `src/server/migrations/sqlite/` 版本化 SQL 由 dbkit 执行（含推荐基线分类种子）；模块迁移（`0001_platform_users.sql`、`0003_platform_audit_events.sql`）已由 vendor 包安装并随 dbkit 迁移机制运行。
- 事务边界：分配与状态转移、完成与处理记录（及可选 resolution 回复）在同一事务内提交；邮件发送在事务提交后执行，失败不回滚状态。

## 5. 外部集成：邮件通知

- 集成点：工单完成（complete）事务提交后，经 emailkit 向工单上记录的提交人邮箱发送完成通知（主题含工单号与主题，正文含处理人、完成时间与工单摘要）。
- 失败可见性：发送成功/失败（含 SMTP 未配置）分别写入审计事件 `email.notification_sent` / `email.notification_failed`，并输出服务端错误日志；不改变工单完成状态。
- 边界：送达依赖 SMTP 环境配置；无配置时通知失败被如实记录，验收（AC-09）依赖部署方提供可用 SMTP 配置。

## 6. 运行、可靠性与可观测性

- 启动/端口/数据库/测试隔离见 1.4；验收使用空闲端口与 `DB_PATH` 指向的隔离库，等待真实监听就绪后执行，结束仅清理本次启动的进程。
- 可观测性：服务端请求/错误日志 + 审计事件（关键操作与邮件结果）；审计事件可按工单/公司/动作检索（`/api/audit-events`）。
- 可靠性：SQLite 单文件权威库；迁移由版本表控制幂等执行；邮件 best-effort；不引入额外基础设施。

## 7. 关键架构决策（简要）

- D1 复用 CommonApp 五模块：登录/凭证、审计、邮件与需求直接对应，SQLite 经 dbkit 统一访问与迁移；`permissionkit` 不选（无动态权限需求，见 1.3）。
- D2 提交人信息快照 + 用户关联：工单详情与通知邮件取值稳定，历史工单按提交人聚合，公司隔离按 `company_id` 字段域执行。
- D3 邮件发送与状态权威解耦：完成事务先行提交，邮件 best-effort、失败可见不阻塞，外部集成失败不破坏内部状态一致性。
- D4 人类可读工单号 `TKT-NNNNNN`：与内部主键并存，供搜索、列表与邮件识别。
