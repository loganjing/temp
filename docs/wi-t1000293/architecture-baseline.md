# 工单系统（121-full）架构基线

> 本文档为 WorkItem `wi-t1000293` design 阶段的主产物。产品范围、业务对象、状态集合与验收语义以已批准的 `docs/wi-t1000293/requirements.md` 为唯一来源；本文档只定义必要的技术承载方式。字段级 API 契约见 `docs/wi-t1000293/technical-contract.md`。

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 技术栈（冻结）

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 后端 | Hono（Node.js ≥ 20，ESM） | REST JSON API；常规服务入口 `src/server.js` |
| 前端 | React + Vite SPA（`client/`） | 单页应用；构建产物 `dist/` 由后端静态托管 |
| 数据库 | SQLite（`better-sqlite3` 同步驱动） | 服务端唯一数据权威；文件数据库，支持 `DB_PATH` 覆盖 |
| 包管理器 | npm | 以 `package-lock.json` 锁定依赖 |

新建应用且需要服务端权威数据与跨用户共享，采用新建全栈默认选型（Hono + React/Vite），不引入其他基础设施。

### 1.2 架构与调用方向

```
┌─────────────────────────┐        HTTP JSON (/api/*)        ┌──────────────────────────┐
│  React/Vite SPA (client) │ ─────────────────────────────▶ │  Hono 服务 (src/server.js) │
│  工单工作台 / 公司管理     │ ◀───────────────────────────── │  路由层 → 领域服务 → 数据层  │
│  顶栏“当前用户”切换器      │      静态资源 (dist/) 托管       │            │               │
└─────────────────────────┘                                  │            ▼               │
                                                             │  SQLite (data/*.db)        │
                                                             │  启动时执行 migrations/sqlite/│
                                                             └────────────────────────────┘
```

- 调用方向单一：前端只通过 `/api/*` 访问服务端；服务端持有全部权威数据与状态机；不暴露数据库给前端。
- `src/server.js` 同时承担 API 服务与静态资源托管（生产/验收形态）；开发形态由 Vite dev server 代理 `/api`。

### 1.3 数据权威与身份模型

- **数据权威**：服务端 SQLite 是唯一权威数据源。前端仅保存会话内 UI 状态（当前选中用户、筛选条件），不持久化任何业务数据。
- **身份**：需求未要求认证/登录，不引入认证组件。前端提供顶栏“当前用户”切换器（数据来自 `GET /api/users`），所有请求携带 `X-User-Id` 头标识操作者；服务端校验该用户存在。角色判断（提交人、当前处理人、公司管理员、业务组成员）由服务端按数据关系推导，规则见技术契约。
- 满足验收场景中“以提交人身份”“处理人打开”等身份切换需求，同时避免为未规定的权限模型引入额外基础设施。

### 1.4 CommonApp 模块评估结论

按新建 SQLite 项目的规则将 `dbkit` 纳入候选评估，已通过 catalog 与 manifest 核查：

| 项 | 结果 |
| --- | --- |
| 候选模块 | `dbkit`（`@commonapp/dbkit` 0.2.0，status: ready） |
| manifest SHA-256 | `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6` |
| 需求匹配 | 持久化/SQLite/迁移能力与需求吻合 |
| 采用结论 | **不采用，项目内实现** |

不采用理由：采用 `dbkit` 要求在 design 阶段执行 workspace 初始化（在仓库根目录创建 `package.json`、`app/` 脚手架并安装依赖、构建、测试），而本次执行的源码写范围仅限 `docs/wi-t1000293` 与 `.expert-team/work-items/wi-t1000293`，源码脚手架由后续执行代理负责，本阶段无权写入仓库根目录。项目内实现边界：`better-sqlite3` 直连 + `migrations/sqlite/` 编号 SQL 迁移文件 + 启动时迁移执行器（等价覆盖 dbkit 的配置/查询/事务/迁移能力）。后续 WorkItem 如需统一 CommonApp 基线，可在实现落地后再评估替换。

其余目录模块无需求信号，不引入：`attachment`（无附件需求）、`authkit`/`userkit`（无认证需求）、`permissionkit`（权限模型未规定，按数据关系做极简角色判断，项目内实现）、`auditkit`（业务事件时间线由工单事件表承载，非系统审计）、`i18n`（中文单语）。

### 1.5 UI 全局基线（冻结）

- **应用/业务模板**：`helpdesk`（工单处理后台）。
- **展示模板**：`split-master-detail`——左侧/主区为工单列表（或待分配队列），右侧为当前工单详情；列表与详情协同，支持在详情内完成回复、分配、转派、完成、取消、评价全部操作。
- **视觉预设**：Modern SaaS——柔和中性色、细边界、少阴影、中等圆角、清晰字体，一个主色与状态色（状态色：创建/待分配/待处理/完成/取消 各有可区分徽章色），短而有反馈的动效。
- **布局与设备**：桌面 Web。左侧导航（工单、待分配队列、公司管理）+ 顶部上下文栏（当前用户切换器、面包屑）+ 主工作区（master 列表 + detail 详情）。默认不设计窄屏/移动端验收范围。
- **全局状态**：加载（列表骨架屏、按钮 pending）、空数据（列表与详情空态引导文案、创建入口）、错误（可重试的错误条与表单字段级错误）、无权限（不适用的操作按角色隐藏或禁用并提示原因）、成功（操作后轻量 toast + 数据刷新）。
- **信息密度**：工单列表为可扫读表格（工单号、主题、分类、优先级、状态、提交人、业务组、创建时间）；长文本（描述、回复）提供展开/收起，截断字段提供悬停完整内容。
- 依据需求事实：全部验收场景以“逐条处理单个工单”为中心（创建、回复、分配、转派、完成、评价），公司配置（业务组、成员、分配规则、分类）为次级管理流，属操作密集型业务后台，无营销/沉浸内容诉求。

### 1.6 运行与可靠性约定

- **常规启动**：`npm start` → `node src/server.js`（托管 `dist/` 静态资源与 `/api`）。首次运行前需 `npm run build` 构建前端；干净目录按“安装依赖 → 构建 → 启动”顺序即可运行，无需手工准备数据目录。
- **开发启动**：`npm run dev`（Vite dev server + Hono 开发服务并行，`/api` 由 Vite 代理转发）。
- **端口**：环境变量 `PORT`，默认 `3000`。
- **数据库**：环境变量 `DB_PATH`，默认 `./data/application.db`；打开前自动创建父目录。隔离验证时将 `DB_PATH` 指向独立临时文件。
- **迁移**：`migrations/sqlite/<序号>_<名称>.sql` 编号文件，服务启动时按 `schema_migrations` 登记表顺序执行未应用迁移；数据库变更一律走版本化迁移，禁止 ORM 自动同步或手工改 schema。
- **验收约定**：验收命令与常规启动命令分开记录；验证脚本自行负责启动（空闲端口 + 等待真实监听就绪）与清理（仅清理本次启动的进程与临时数据库），不额外后台常驻服务。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 模块与职责

| 模块 | 位置 | 职责 | 唯一数据/事实归属 |
| --- | --- | --- | --- |
| 前端工作台 | `client/` | 工单列表/详情/创建、回复、分配、转派、完成、取消、评价的 UI；公司管理（业务组、成员、分配规则、分类）；当前用户切换 | 无（只消费 API） |
| API 路由层 | `src/server.js` 及路由模块 | 请求参数校验、`X-User-Id` 解析、角色判断、调用领域服务、统一 JSON/错误响应 | 无（转发领域结果） |
| 领域服务层 | `src/domain/` | 工单状态机（创建/分配/转派/完成/取消/评价）、回复、自动分配规则匹配、组织配置校验；事务边界 | 业务规则唯一执行者 |
| 数据访问层 | `src/db/` | `better-sqlite3` 连接管理、迁移执行、SQL 封装 | SQLite 文件（唯一持久化权威） |

### 2.2 工单状态机（服务端唯一执行）

状态集合与验收语义来自已批准需求；流转触发时机在需求中标注为推荐基线自由度，本设计冻结如下：

```
created（创建）
   │ 创建时命中公司“分类→业务组”规则：同请求内自动流转（瞬时段见事件时间线）
   ▼
pending_assignment（待分配）──── 人工指派业务组+处理人 ────▶ processing（待处理）
   ▲                                                        │      │
   │ 创建后未命中规则：由人工分配流程进入                       │ 转派（保持状态）│ 完成
   └─────────────────────────────────────────────────────────┘      ▼
                                              取消（非终态任意时刻，提交人或当前处理方）
                                                                     completed（完成）→ 提交人满意度评价
```

| 流转 | 触发 | 说明 |
| --- | --- | --- |
| `created → pending_assignment → processing`（自动） | 创建工单请求内同步执行 | 公司配置了该分类的分配规则时，命中即自动指派业务组（assignee 默认取组内第一位成员），状态直达“待处理”；事件时间线完整记录 `created/dispatched/assigned` 轨迹 |
| `created`（停留） | 创建时未命中规则 | 工单保持“创建”状态（需求 3.3：提交成功后初始状态为“创建”） |
| `created → pending_assignment` | 人工分配流程进入分配阶段（分配面板打开时调用 dispatch） | 工单进入“待分配”队列，状态可观察 |
| `pending_assignment → processing` | 人工指派业务组与处理人 | 公司管理员或本公司业务组成员执行 |
| `processing → processing` | 转派 | 变更当前处理方（业务组+成员），记录转派人/对象/时间事件 |
| `processing → completed` | 完成处理 | 当前处理人（assignee）或公司管理员执行；记录处理人、处理时间 |
| 非终态 → `cancelled` | 取消 | 提交人或当前处理方执行；取消后不再进入处理流程（终态） |
| `completed` + 评价 | 提交人提交满意度评分 | 每工单一次；独立于回复 |

状态、优先级（P0–P4）等枚举值的校验与流转合法性均由领域服务层在同一事务内执行并写入事件表，保证时间线可追溯。

### 2.3 接口摘要（字段级契约见 technical-contract.md）

| 端点 | 用途 | 调用方向 |
| --- | --- | --- |
| `GET /api/users` | 当前用户切换器数据源（含公司/部门/管理员标记） | 前端 → API |
| `GET /api/companies/{companyId}/business-groups`、`POST`（同路径） | 业务组及成员列表 / 新增业务组 | 前端 → API |
| `PUT /api/business-groups/{groupId}/members` | 设置业务组成员 | 前端 → API |
| `GET/POST /api/companies/{companyId}/assignment-rules` | 公司“分类→业务组”分配规则管理 | 前端 → API |
| `GET/POST /api/categories` | 问题分类列表维护 | 前端 → API |
| `POST /api/tickets` | 创建工单（含规则命中时的自动分配） | 前端 → API |
| `GET /api/tickets` | 工单列表（按状态/分类/公司/提交人筛选） | 前端 → API |
| `GET /api/tickets/{ticketId}` | 工单详情（提交人完整信息、回复、事件时间线、评价） | 前端 → API |
| `POST /api/tickets/{ticketId}/dispatch` | 进入分配流程（待分配） | 前端 → API |
| `POST /api/tickets/{ticketId}/assign` | 人工指派业务组与处理人 | 前端 → API |
| `POST /api/tickets/{ticketId}/replies` | 多轮回复 | 前端 → API |
| `POST /api/tickets/{ticketId}/reassign` | 转派 | 前端 → API |
| `POST /api/tickets/{ticketId}/complete` | 完成处理 | 前端 → API |
| `POST /api/tickets/{ticketId}/cancel` | 取消 | 前端 → API |
| `POST /api/tickets/{ticketId}/rating` | 满意度评价 | 前端 → API |
| `GET /api/users/{userId}/tickets` | 提交人历史工单 | 前端 → API |

## 3. 数据模型与迁移

### 3.1 表结构（`migrations/sqlite/0001_init.sql`）

| 表 | 字段（类型，约束） | 说明 |
| --- | --- | --- |
| `companies` | `id INTEGER PK`、`name TEXT NOT NULL` | 公司 |
| `users` | `id INTEGER PK`、`name TEXT NOT NULL`、`email TEXT NOT NULL UNIQUE`、`company_id INTEGER NOT NULL → companies`、`department TEXT NOT NULL DEFAULT ''`、`is_company_admin INTEGER NOT NULL DEFAULT 0` | 用户（提交人/处理人共用）；`is_company_admin` 为公司范围管理员标记（承载需求未规定的管理权限基线） |
| `business_groups` | `id INTEGER PK`、`company_id INTEGER NOT NULL → companies`、`name TEXT NOT NULL`，唯一约束 `(company_id, name)` | 业务组 |
| `group_members` | `group_id INTEGER → business_groups`、`user_id INTEGER → users`，主键 `(group_id, user_id)` | 业务组成员 |
| `categories` | `id INTEGER PK`、`name TEXT NOT NULL UNIQUE` | 问题分类（全局维护，供创建选择与规则引用） |
| `assignment_rules` | `id INTEGER PK`、`company_id INTEGER NOT NULL → companies`、`category_id INTEGER NOT NULL → categories`、`group_id INTEGER NOT NULL → business_groups`，唯一约束 `(company_id, category_id)` | 公司级“分类→业务组”自动分配规则 |
| `tickets` | `id INTEGER PK`、`ticket_no TEXT NOT NULL UNIQUE`（展示工单号 `TK-####`）、`subject TEXT NOT NULL`、`description TEXT NOT NULL DEFAULT ''`、`category_id INTEGER NOT NULL → categories`、`priority TEXT NOT NULL CHECK (priority IN ('P0','P1','P2','P3','P4'))`、`status TEXT NOT NULL CHECK (status IN ('created','pending_assignment','processing','completed','cancelled'))`、`submitter_id INTEGER NOT NULL → users`、`assigned_group_id INTEGER → business_groups NULL`、`assignee_id INTEGER → users NULL`、`created_at TEXT NOT NULL`、`updated_at TEXT NOT NULL`、`completed_at TEXT NULL`、`completed_by INTEGER → users NULL` | 工单主表 |
| `ticket_replies` | `id INTEGER PK`、`ticket_id INTEGER NOT NULL → tickets`、`author_id INTEGER NOT NULL → users`、`content TEXT NOT NULL`、`created_at TEXT NOT NULL` | 多轮回复 |
| `ticket_events` | `id INTEGER PK`、`ticket_id INTEGER NOT NULL → tickets`、`type TEXT NOT NULL CHECK (type IN ('created','dispatched','assigned','reassigned','completed','cancelled','rated'))`、`actor_id INTEGER NOT NULL → users`、`detail TEXT NOT NULL DEFAULT '{}'`（JSON）、`created_at TEXT NOT NULL` | 工单事件时间线（分配/转派/完成/取消/评价全程可追溯） |
| `satisfaction_ratings` | `ticket_id INTEGER PK → tickets`、`score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5)`、`comment TEXT NULL`、`created_at TEXT NOT NULL` | 满意度评价，每工单一次 |

时间字段一律以 ISO 8601 UTC 文本存储（服务端生成），API 原样返回。

### 3.2 关系与事务

- 一个用户属于一个公司；一个公司可有多个业务组；一个业务组可有多名成员；成员可属于多个组。
- 工单提交人固定（`submitter_id`）；`assigned_group_id`/`assignee_id` 随指派与转派变更。
- 领域服务在同一事务内完成“状态变更 + 事件写入 + 关联字段更新”，例如：创建+自动分配、指派、转派、完成；失败即回滚，保证工单状态与时间线一致。

### 3.3 迁移与种子数据

- `migrations/sqlite/0001_init.sql`：全部表与索引。
- `migrations/sqlite/0002_seed.sql`：演示种子（两家公司、若干用户覆盖提交人/处理人/公司管理员、初始分类列表），保证干净目录启动后即可进入验收场景；种子数据通过版本化迁移交付，不使用运行时脚本注入。
