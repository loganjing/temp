# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 总体形态

本工单系统是一个单仓库全栈应用：Hono API 服务承载全部业务规则与权威数据，React/Vite 单页应用（SPA）承载界面，SQLite 作为唯一持久化存储，公司隔离在服务端按数据行过滤实现，完成通知通过 SMTP 邮件外部服务发出，工单关键操作全程留痕到审计事件。全部写操作经 API 服务进入，前端不直接接触数据库。

```
┌────────────────────────────────────────────────────┐
│  React + Vite SPA（浏览器）                          │
│  登录 / 工单工作台 / 工单详情 / 分配配置 / 统计分析   │
└───────────────┬────────────────────────────────────┘
                │  JSON over HTTP（Bearer 会话令牌）
┌───────────────▼────────────────────────────────────┐
│  Hono API 服务（Node ≥ 20，ESM）                     │
│  identity │ ticket │ assignment │ processing        │
│  rating   │ stats  │ audit       │ notification     │
└──┬────────────────────┬──────────────────┬─────────┘
   │                    │                  │
┌──▼─────────┐   ┌──────▼───────┐   ┌──────▼────────┐
│ SQLite     │   │ auditkit     │   │ emailkit      │
│ (经 dbkit： │   │ 审计事件写入  │   │ SMTP 邮件发送  │
│ 查询/事务/  │   │ 与查询        │   │ （nodemailer） │
│ 迁移)      │   └──────────────┘   └───────────────┘
└────────────┘
```

调用方向固定为：前端 → API 服务 → 数据库/外部邮件。模块之间只通过服务层内部调用协作，前端不感知数据库表结构。

### 1.2 技术栈（冻结）

| 层 | 选择 | 说明 |
| --- | --- | --- |
| 服务端框架 | Hono 4（Node ≥ 20，ESM） | 新建且需要服务端权威数据的应用的标准栈 |
| 前端 | React 18 + Vite SPA | 单页应用，路由在前端 |
| UI 样式 | Tailwind CSS | 承载 Modern SaaS 视觉基线（见第 5 节） |
| 数据库 | SQLite（better-sqlite3 驱动，经 dbkit） | 权威数据、跨用户共享、结构化查询与事务 |
| 认证 | authkit + userkit（本地密码模式） | Hono 密码登录、Bearer 会话令牌、密码凭证存储 |
| 审计日志 | auditkit | 持久化审计事件，敏感字段脱敏 |
| 邮件 | emailkit（nodemailer SMTP） | 工单完成通知提交人邮箱 |
| 包管理 | npm（package-lock.json） | 冷启动检查支持 Node/npm + package-lock.json |

### 1.3 运行约定

- 常规启动：工作区根目录 `npm start`（启动 `app/ticket-system` 的 Hono 服务，入口 `src/server/index.ts`，同时托管前端构建产物）；开发期使用 `npm run dev`（Vite 前端 + tsx watch 后端并行调试）。
- 监听端口：环境变量 `PORT` 可配置，默认 `3000`。
- 数据库路径：环境变量 `DB_PATH` 可覆盖；默认 `./data/application.db`，打开前自动创建父目录。干净目录无需手工准备即可启动。
- 邮件配置：环境变量 `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `SMTP_FROM_NAME`（emailkit 约定）；`SMTP_HOST` 留空即禁用外发邮件；验收环境将 SMTP 指向本地测试邮件服务，不依赖外部真实邮箱服务。
- 常规启动命令与验收命令分开记录；若验收脚本负责启动和清理服务，只运行该脚本，不额外后台启动服务。

### 1.4 设计基线结论

- 权威数据边界：SQLite 是唯一权威数据源；前端状态只是展示缓存；邮件发送是尽力而为的外部通知，不作为业务状态的一部分。
- 公司隔离是安全边界：所有工单读写都经服务端按公司过滤，前端不承担隔离责任。
- 统计是查询视图：分布、仪表盘指标全部由 SQL 聚合实时计算，不落独立的汇总表。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 后端模块与数据归属

代码位置：后端模块实现位于 `app/ticket-system/src/server/`（数据库迁移在 `src/server/migrations/sqlite/`），前端页面位于 `app/ticket-system/src/client/`，前后端共享的枚举与分类字典位于 `app/ticket-system/src/shared/`；目录依赖边界以 `platform-baseline.json` 的 `sourceLayout` 为准。

| 模块 | 职责 | 唯一数据归属 | 对外能力接口摘要（调用方向：前端 → API） |
| --- | --- | --- | --- |
| identity（身份与用户档案） | 登录、会话、当前用户上下文；把平台用户映射为带公司/部门/姓名/邮箱的业务档案；跨公司视角标记 | `user_profiles`；平台用户表由 userkit 迁移建立 | `POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me`、`GET /api/users`（转派目标与成员选择） |
| ticket（工单核心） | 工单创建（含创建事务内的分类规则自动分配）、状态流转、多轮回复、列表/详情查询 | `tickets`、`ticket_replies` | `POST /api/tickets`、`GET /api/tickets`、`GET /api/tickets/:id`、`POST /api/tickets/:id/replies`、`POST /api/tickets/:id/cancel`、`GET /api/tickets/:id/submitter` |
| assignment（分配配置） | 业务组与成员维护、"分类 → 业务组"自动分配规则维护、人工分配动作 | `groups`、`group_members`、`assignment_rules` | `GET/POST /api/groups`、`PUT/DELETE /api/groups/:id`、`GET/POST /api/assignment-rules`、`DELETE /api/assignment-rules/:id`、`POST /api/tickets/:id/assign` |
| processing（处理协作） | 接单（确立处理责任）、转派、完成处理 | 处理责任与完成信息落在 `tickets`（`current_assignee_id`、`completed_by`、`completed_at` 等字段） | `POST /api/tickets/:id/claim`、`POST /api/tickets/:id/transfer`、`POST /api/tickets/:id/complete` |
| rating（用户评价） | 提交人对已完成工单的满意度评分 | `ticket_ratings` | `POST /api/tickets/:id/rating` |
| stats（统计分析） | 按公司/部门的工单分布、运营仪表盘指标（工单量、平均响应时间、满意度、热点问题） | 无自有表，对 `tickets`/`ticket_replies`/`ticket_ratings` 聚合查询 | `GET /api/stats/distribution`、`GET /api/stats/dashboard` |
| audit（操作日志） | 工单关键操作事件写入与查询 | 审计事件表由 auditkit 迁移建立 | `GET /api/tickets/:id/logs`、`GET /api/logs` |
| notification（邮件通知） | 工单完成时向提交人邮箱发送通知；发送失败可见 | 无自有表；复用审计事件记录发送失败 | 无独立 HTTP 接口，由 processing 模块在完成事务后内部调用 |

模块间依赖：processing/assignment/rating 调用 ticket 的状态流转能力；ticket 的创建调用 assignment 的规则匹配能力；完成流转调用 notification；所有模块的关键动作为 audit 记录事件。

### 2.2 前端模块

| 页面/模块 | 主要内容与工作流 |
| --- | --- |
| 登录页 | 用户名密码登录（authkit 起点扩展） |
| 工单工作台 | split-master-detail 布局：左侧待处理工单列表（筛选、搜索、排序，含公司维度筛选），右侧当前工单详情；处理操作入口 |
| 我的工单 | 提交人视角的工单列表（全状态），进入详情查看回复、接收完成反馈并评价 |
| 工单详情/处理视图 | 回复流（多轮、按时间）、提交人完整信息区（姓名、公司、部门、历史工单）、操作栏（接单、回复、转派、完成、取消、评价）、该工单操作日志 |
| 分配配置 | 业务组与成员管理、"分类 → 业务组"自动分配规则管理 |
| 统计分析 | 仪表盘：工单量、平均响应时间、满意度、热点问题；工单分布（公司/部门维度切换） |
| 操作日志 | 全局日志查询视图（按工单、操作类型过滤） |

### 2.3 CommonApp 复用决策

已选模块（依赖闭包含 dbkit，新项目通过工作区初始化安装到 `vendor/@commonapp/<id>`，包清单与锁文件由 npm 管理）：

| 模块 | 包/版本 | manifest SHA-256 | 需求匹配 | 模块安装标记 |
| --- | --- | --- | --- | --- |
| dbkit | @commonapp/dbkit 0.2.0 | sha256:f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | 权威持久化、参数化查询、事务、版本化迁移（数据库变更全部走迁移） | commonapp install: dbkit |
| authkit | @commonapp/authkit 0.1.2 | sha256:a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | Hono 密码登录与 Bearer 会话认证，公司隔离的前提（识别当前用户） | commonapp install: authkit |
| userkit | @commonapp/userkit 0.1.0 | sha256:40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 本地用户与密码凭证存储，登录与用户管理页面/API 由初始化脚手架生成 | commonapp install: userkit |
| auditkit | @commonapp/auditkit 0.1.0 | sha256:27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 工单关键操作留痕（创建、分配、回复、转派、完成、取消、评价）并可查询 | commonapp install: auditkit |
| emailkit | @commonapp/emailkit 0.1.0 | sha256:a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | 工单完成时 SMTP 邮件通知提交人 | commonapp install: emailkit |

集成边界与限制：

- identityMode 为 `local-password`：authkit + userkit 组合由工作区初始化生成登录、首个账户初始化和用户管理页面/API。该用户管理 API 只要求 AuthKit 登录态，不区分角色，任何已登录用户都能操作——本系统在业务档案层不额外收紧用户管理，属于已记录的边界而非缺陷；公司隔离由业务层过滤承担。
- 平台用户表只承载登录身份与凭证；姓名、邮箱、公司、部门、跨公司视角标记等业务档案由项目内 `user_profiles` 表一对一扩展承载（薄项目适配层）。
- 审计事件写入时在载荷中携带工单 ID 与操作摘要，查询按工单聚合；若 auditkit 查询接口不支持按实体过滤，由项目内查询层补充过滤实现。
- 邮件发送为同步调用 + 失败记录（见第 4 节），不引入后台队列或重试框架。

不选模块与理由：

- permissionkit（RBAC）：需求的权限语义只有"公司行级隔离 + 跨公司数据视角标记"，没有角色注册、权限继承等 RBAC 需求，项目内过滤实现更小。
- attachment、i18n：需求无附件、无国际化要求，不引入。

## 3. 数据模型与迁移

### 3.1 表结构（项目内表）

| 表 | 字段要点 | 说明 |
| --- | --- | --- |
| `companies` | id、name、created_at | 公司（隔离维度） |
| `departments` | id、company_id、name | 部门，隶属公司；统计维度取提交人所属部门 |
| `user_profiles` | id、platform_user_id（唯一，关联平台用户）、display_name、email、company_id、department_id（可空）、cross_company_view（布尔，默认否）、created_at | 业务用户档案；处理上下文与隔离判断的依据 |
| `tickets` | id（即工单ID）、company_id、subject、description、category、priority（P0-P4）、status、submitter_user_id、assigned_group_id（可空）、current_assignee_id（可空）、first_reply_at（可空）、completed_by（可空）、completed_at（可空）、cancelled_at（可空）、created_at、updated_at | 工单主表；工单ID 即自增主键，页面显示为 `#<id>` |
| `ticket_replies` | id、ticket_id、replier_user_id、content、created_at | 多轮回复，按时间升序呈现 |
| `groups` | id、company_id、name、created_at | 业务组，按公司管理 |
| `group_members` | id、group_id、user_id | 业务组成员（成员即该组工单的处理人） |
| `assignment_rules` | id、company_id、category、target_group_id、created_at；公司+分类唯一 | "分类 → 业务组"自动分配规则；唯一约束使同一分类至多一条规则，规避未规定的规则冲突 |
| `ticket_ratings` | id、ticket_id（唯一）、rater_user_id、score（1-5）、created_at | 满意度评价，一单一条 |
| 审计事件表 | 由 auditkit 迁移建立 | 事件类型、操作人、时间、载荷（含工单 ID） |
| 平台用户表 | 由 userkit 迁移建立 | 登录身份与密码凭证 |

### 3.2 状态机

```
created ──> pending_assignment ──> pending_processing ──> completed
   │              │                       │
   └──────────────┴───────────────────────┴──> cancelled（完成前任意活跃状态可取消）
```

- 提交动作在一个数据库事务内完成：写入 `created` 后立即执行本公司"分类 → 业务组"规则匹配；命中则设置业务组并流转到 `pending_processing`，未命中则流转到 `pending_assignment` 等待人工分配。外部可见的创建结果是后两者之一。
- 分配（自动或人工）设置 `assigned_group_id` 并流转到 `pending_processing`；工单对组成员在本公司范围内可见。
- 接单（claim）或完成动作确立 `current_assignee`/处理责任；转派将处理责任转移给目标处理人。
- 完成记录 `completed_by`、`completed_at` 并触发邮件通知；取消记录 `cancelled_at`，之后不再进入处理流程。

### 3.3 迁移与种子数据

- 全部 schema 变更使用 dbkit 版本化迁移（`migrations/sqlite/` 下的 SQL 文件），不通过 ORM 自动同步或手工改 schema。
- 项目迁移在 userkit/auditkit 平台迁移之后编号执行；初始化安装的模块迁移由脚手架登记。
- 种子数据：实现阶段提供可重复执行的种子脚本（幂等），插入两家演示公司、若干部门与不同公司的用户档案（含一名跨公司视角使用者）、示例业务组与分配规则，支撑公司隔离与统计验收。

## 4. 外部集成：邮件通知

- 触发点：工单完成（`pending_processing → completed`）事务提交后，向提交人档案邮箱发送通知，主题含工单ID与工单主题。
- 实现：emailkit 的 `createEmailClient`；SMTP 参数来自环境变量（`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`、`SMTP_FROM_NAME`），`SMTP_HOST` 为空时外发邮件禁用（完成响应中 `notification.sent=false` 可见）；验收环境指向本地测试 SMTP。
- 失败可见性：发送失败不回滚工单完成状态（通知是尽力而为的外部动作）；失败信息写入服务错误日志并记录一条审计事件（通知失败），完成接口响应中带 `notification.sent=false` 的可见反馈。除完成外的其他通知触发点需求未规定，本期不实现。

## 5. UI 全局基线

- 应用/业务模板：`helpdesk`（工单/帮助台业务）；展示模板 ID：`split-master-detail`（高频逐条处理记录：列表/队列与当前记录详情协同）。该 ID 同时是下游实现读取实现资源的标识。
- 视觉风格：Modern SaaS（通用业务应用默认）——柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色加状态色（优先级 P0-P4 与状态用状态色标识）、短而有反馈作用的动效。
- 应用壳与导航：左侧导航（工单工作台、我的工单、分配配置、统计分析、操作日志）+ 顶部上下文栏（当前用户姓名与所属公司、退出登录）+ 主工作区。目标设备：桌面 Web（需求未要求窄屏/移动端）。
- 主工作流：工作台左列表右详情；处理视图在详情内集成回复流、提交人信息区与操作栏；仪表盘用顶部筛选 + 指标卡 + 明细表组织。
- 全局状态基线：加载（列表骨架/按钮进行中）、空数据（引导创建或调整筛选）、错误（可重试提示）、无权限（跨公司访问被拒时明确反馈"无权访问其他公司的工单"）、成功（轻量提示 + 数据刷新）。
- 长文本（主题、描述、回复）可能截断：列表用悬停标题显示全文，详情提供完整展开。

## 6. 关键设计决策与残余风险

- 认证复用而非自建：密码凭证与会话是安全敏感的通用能力，复用 authkit + userkit；公司/部门等业务档案留在项目内，避免与平台用户模型耦合。代价：平台用户管理与业务档案分两层，实现需保证一一对应。
- 公司隔离的实现位置：服务端查询与写入统一按当前用户公司过滤，跨公司读视角（公司维度筛选与分布统计）由档案上的 `cross_company_view` 标记放行，写操作一律限定本公司。需求的正式角色权限体系未规定，本设计以最小标记满足 R8 推荐基线。
- 分配配置操作权限：需求未规定该操作者角色，本期允许本公司已登录用户维护本公司业务组、成员与规则（配置只作用于本公司，公司隔离仍然成立）；后续可用权限标记收紧，属已记录边界。
- 规则冲突处理：以"公司 + 分类"唯一约束承载，同一分类至多一条规则（需求未规定冲突处理，取无冲突设计）。
- 自动分配失败兜底：未命中规则停留 `pending_assignment`，人工分配补位（R1）。
- 满意度分值尺度：需求未规定，取 1-5 整数分（R3 量化评分的落地）。
- 平均响应时间 = 工单创建到首次回复的时间间隔（`tickets.first_reply_at` 在首次回复时写入，聚合按已回复工单平均）；热点问题 = 按分类聚合的工单量排行。
- 残余风险：邮件依赖外部 SMTP 可用性（验收用本地测试 SMTP 规避）；auditkit 事件按实体过滤能力需在实现期确认，不足时由项目内查询层补充；平台用户管理 API 不区分角色的边界已在 2.3 记录。
