# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 应用定位

工单管理系统（ticket-1）：面向多公司客户的服务支持场景，覆盖工单提交、自动/手动分配、处理、协作转派、完成与满意度评价的完整闭环。批准的需求基线（docs/wi-t1000058/requirements.md）是产品范围、业务对象、状态、业务规则与验收语义的唯一来源；本文只给出必要的技术承载方式。

### 1.2 技术栈

| 层 | 选择 | 说明 |
| --- | --- | --- |
| 后端 | Hono（Node >= 20，ESM） | REST API 与前端静态资源托管，单进程入口 `src/server.js` |
| 前端 | React + Vite SPA | 桌面 Web，Tailwind CSS |
| 数据库 | SQLite（better-sqlite3） | 经 CommonApp `dbkit` 访问，文件型单机数据库 |
| 包管理 | npm | `package-lock.json` 锁定依赖 |

新建项目，无既有代码需沿用。

### 1.3 CommonApp 模块决策

已通过 catalog 与 manifest 核查（resolver 校验通过）：

| 项 | 值 |
| --- | --- |
| 已选模块 | dbkit（`@commonapp/dbkit` 0.2.0，status: ready） |
| manifest SHA-256 | sha256:f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 |
| 模块依赖闭包 | 无（moduleDependencies 为空；运行时依赖 better-sqlite3 ^11/^12，由包管理器安装） |
| 需求匹配 | 工单、公司、业务组、成员、分配规则、回复、转派、评价均需服务端权威持久化、关联查询与状态流转，SQLite 单文件库满足单机演示规模 |

未选用候选及理由（不影响本次决策，仅记录边界）：

- `authkit` / `userkit` / `permissionkit`：需求未规定认证方式与操作者角色/权限模型（需求第 6 节开放项），无明确认证证据；按证据支持的最小设计采用请求声明身份模型（见 1.4），不引入登录/授权基础设施。
- `attachment`：回复附件为需求第 6 节未规定事项，不构成当前基线，不做附件上传。
- `auditkit` / `i18n`：无对应需求证据，不引入。

模块安装标记：`commonapp install: dbkit`

### 1.4 身份与操作者模型（最小模型）

- `users` 表承载全部自然人资料（提交人与处理人共用同一用户表），字段含姓名、邮箱、公司、部门。
- 业务组成员关系由 `group_members` 表达；业务组成员即处理人候选。
- 每个写操作请求携带 `operatorId`（当前操作者，前端身份选择器选定）；创建工单携带提交人信息，服务端按邮箱归并/新建 `users` 记录并建立 `tickets.submitter_id`。
- 服务端信任请求声明的身份，不实现登录、令牌或角色鉴权。这是需求开放项（操作者角色与权限模型未规定）下的最小闭合；部署边界应为受控内网/演示环境，对外暴露前需补充认证与权限设计（见第 5 节架构决策 AD-1）。

### 1.5 运行约定

| 项 | 约定 |
| --- | --- |
| 常规启动 | `npm start`（`node src/server.js`：API + 托管 `dist/` 静态产物）；开发用 `npm run dev` |
| 端口 | `PORT`，默认 3000 |
| 数据库路径 | `DB_PATH`，默认 `./data/application.db`；打开数据库前创建父目录 |
| 测试隔离 | 验证/测试通过 `DB_PATH` 指向隔离文件路径，不使用默认库 |
| 迁移 | `migrations/sqlite/*.sql`，服务启动时 `runMigrations(db, { directory: './migrations' })` 执行；schema 变更只走版本化迁移，不用 ORM 自动同步或手工改库 |

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 系统组成

```
+-----------------------------+   HTTPS/JSON    +-------------------------------+
|  React/Vite SPA（浏览器）    | --------------> |  Hono 服务（Node, ESM）        |
|  - 工单工作台（列表+详情）    | <-------------- |  - /api/* REST 接口            |
|  - 新建工单 / 业务组管理      |                |  - dist/ 静态资源托管           |
|  - 自动分配规则 / 用户目录    |                |  - 启动时执行 SQLite 迁移       |
+-----------------------------+                +---------------+---------------+
                                                              | dbkit
                                                              v
                                                +------------------------------+
                                                |  SQLite 文件数据库            |
                                                |  默认 ./data/application.db   |
                                                +------------------------------+
```

### 2.2 模块职责与唯一数据/事实归属

| 模块（服务端路由分组） | 职责 | 唯一数据/事实归属 |
| --- | --- | --- |
| organizations | 公司、业务组、成员、用户资料的维护与查询 | companies、business_groups、group_members、users 表 |
| ticketing | 工单创建、查询、详情、多轮回复 | tickets、ticket_replies 表 |
| assignment | 自动分配规则维护；创建工单时的规则匹配与分配执行 | assignment_rules 表；`tickets.assigned_group_id`、`tickets.status` 的分配结果 |
| collaboration | 待处理工单的转派 | ticket_transfers 表；转派后 `tickets.assigned_group_id` 的归属变更 |
| resolution | 工单完成（记录处理人、处理时间）与取消 | `tickets.handler_id`、`tickets.handled_at`、`tickets.status`、`tickets.cancelled_at` |
| evaluation | 工单完成后的满意度评价 | ticket_evaluations 表 |

模块间通过服务端内部函数/路由调用，不跨模块直读对方私有表。前端只消费 `/api/*` 公开接口。

### 2.3 接口摘要

字段级细节（请求/响应字段、类型、可空性、错误码、幂等性）以 `technical-contract.md` 为唯一来源。

| 方法与路径 | 用途 | 调用方向 |
| --- | --- | --- |
| GET /api/bootstrap | 公司、用户、业务组初始数据（身份选择器与筛选项） | 前端 → 服务 |
| POST /api/users | 新建用户资料（提交人/处理人） | 前端 → 服务 |
| GET /api/users/:id/tickets | 提交人历史工单 | 前端 → 服务 |
| GET /api/companies/:id/groups | 公司业务组列表（含成员） | 前端 → 服务 |
| POST /api/companies/:id/groups | 新建业务组 | 前端 → 服务 |
| POST /api/groups/:id/members | 设置业务组成员 | 前端 → 服务 |
| GET /api/companies/:id/assignment-rules | 自动分配规则列表 | 前端 → 服务 |
| POST /api/companies/:id/assignment-rules | 新建"分类→业务组"规则 | 前端 → 服务 |
| POST /api/tickets | 创建工单（含自动分配评估） | 前端 → 服务 |
| GET /api/tickets | 工单列表（公司/状态/分类/提交人/业务组筛选） | 前端 → 服务 |
| GET /api/tickets/:id | 工单详情（提交人资料、回复、转派记录、处理记录、评价） | 前端 → 服务 |
| POST /api/tickets/:id/replies | 工单回复 | 前端 → 服务 |
| POST /api/tickets/:id/assign | 分配工单到业务组（待分配→待处理） | 前端 → 服务 |
| POST /api/tickets/:id/transfer | 转派工单（待处理，归属变更，留转派记录） | 前端 → 服务 |
| POST /api/tickets/:id/complete | 完成处理（记录处理人、处理时间，→完成） | 前端 → 服务 |
| POST /api/tickets/:id/cancel | 取消工单（完成前任一状态→取消） | 前端 → 服务 |
| PUT /api/tickets/:id/evaluation | 提交满意度评价（完成后） | 前端 → 服务 |

## 3. UI 基线

- **应用/业务模板**：helpdesk（工单处理台）。
- **展示模板 ID**：`split-master-detail`——左侧工单队列/列表与右侧当前工单详情协同；Builder 按此 ID 读取对应实现资源。
- **视觉方向**：Modern SaaS——柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色加状态色（P0–P4 优先级与工单状态用状态色标识）、短且有反馈作用的动效。
- **应用壳与导航**：桌面 Web；左侧导航（工单工作台、业务组管理、自动分配规则、用户目录），顶部上下文栏含当前身份选择器（选定 operatorId 所对应用户）与公司切换，主工作区按页面展开。
- **主工作流布局**：工单工作台为列表+详情双栏；详情页包含提交人信息面板（姓名、公司、部门、历史工单入口）、回复线程（按时间排列，显示回复人与回复时间）、操作区（分配/转派/完成/取消按当前状态启用）、处理记录与满意度评价区；新建工单为独立表单页。
- **目标设备**：桌面 Web（需求未要求窄屏）。
- **关键全局状态**：加载（列表/详情/操作进行中）、空数据（无工单/无业务组/无规则）、错误（接口失败、非法状态流转提示）、成功（创建/分配/转派/完成/取消/评价后的反馈）；提交人信息区域与长文本提供悬停标题或展开以查看全文，避免截断不可读。

## 4. 数据模型与状态机

### 4.1 表结构（SQLite，TEXT 主键）

| 表 | 字段 | 说明 |
| --- | --- | --- |
| companies | id, name, created_at | 公司 |
| users | id, name, email, company_id, department, created_at | 提交人与处理人共用；email 用于提交人归并 |
| business_groups | id, company_id, name, created_at | 业务组，归属公司 |
| group_members | id, group_id, user_id, created_at，UNIQUE(group_id, user_id) | 业务组成员（处理人候选） |
| assignment_rules | id, company_id, category, group_id, created_at，UNIQUE(company_id, category) | 分类→业务组自动分配规则 |
| tickets | id, subject, description, category, priority, status, submitter_id, company_id, assigned_group_id NULL, handler_id NULL, handled_at NULL, cancelled_at NULL, created_at, updated_at | 工单主记录 |
| ticket_replies | id, ticket_id, author_id, content, created_at | 多轮回复 |
| ticket_transfers | id, ticket_id, from_group_id NULL, to_group_id NULL, to_user_id NULL, operator_id, note NULL, created_at | 转派记录 |
| ticket_evaluations | id, ticket_id UNIQUE, rating, comment NULL, created_at, updated_at | 满意度评价（每工单一条） |

关系：companies 1─n business_groups 1─n group_members n─1 users；companies 1─n assignment_rules n─1 business_groups；companies 1─n tickets n─1 users(submitter)；business_groups 1─n tickets(assigned_group)；tickets 1─n ticket_replies n─1 users(author)；tickets 1─n ticket_transfers；tickets 1─1 ticket_evaluations。

### 4.2 标识与枚举

- 工单 ID：`TCK-` + base36 时间戳 + 4 位随机后缀（生成规则为需求开放项，取可读唯一的最小方案）；其余表 id 用随机 UUID。
- `priority`：P0、P1、P2、P3、P4（创建时设置；创建后不提供调整入口，需求未规定可调整）。
- `category`：自由文本；自动分配规则按公司内精确文本匹配（预定义值列表为需求开放项）。
- `tickets.status`：created、pending_assignment、pending_handling、completed、cancelled。

### 4.3 状态机（服务端强制，非法流转返回 409）

```
                创建工单（同一请求内评估自动分配）
   [created] ──有匹配规则──> [pending_handling] ──complete──> [completed] ──评价──> ticket_evaluations
      │                          │   │
      └──无匹配规则──> [pending_assignment] ──assign──> [pending_handling]
                              │                          │
                              │                          └──transfer──> [pending_handling]（归属变更，留记录）
                              └──────────── cancel ──────────────────────> [cancelled]
```

- 创建：工单以 `created` 落库，同一事务内评估该公司"分类→业务组"规则：命中则 `assigned_group_id` 置为规则组并转 `pending_handling`；未命中转 `pending_assignment`。因此创建完成后可观察的初始状态为"待分配"或"待处理"，`created` 为状态机中的初始枚举值。
- assign：仅 `pending_assignment` 可执行，设置 `assigned_group_id` 并转 `pending_handling`。
- transfer：仅 `pending_handling` 可执行；目标为其他业务组或其成员（成员目标记录 `to_user_id` 并以其所属组为归属组），状态保持 `pending_handling`，写入 ticket_transfers。
- complete：仅 `pending_handling` 可执行，记录 `handler_id`、`handled_at`，转 `completed`。
- cancel：`created`/`pending_assignment`/`pending_handling` 可执行，记录 `cancelled_at`，转 `cancelled`；取消后不再进入处理流程，不可评价。
- 回复：不触发状态变化，任何未取消/未完成状态之外……回复在工单未取消前均可发起（创建、待分配、待处理、完成后均可读历史回复；新回复限于未取消工单）。

### 4.4 迁移

- `migrations/sqlite/0001_init.sql` 建表；后续 schema 变更新增递增编号迁移文件，只增不改。
- 服务启动时执行 `runMigrations`；禁止 ORM 自动同步或手工改 schema。

## 5. 运行可靠性与架构决策

### 5.1 可靠性与边界

- SQLite 单文件库：单机/单进程写入边界，满足单公司演示规模；不设计多实例并发写。
- 接口错误统一返回 `{ error: { code, message } }`；非法状态流转返回 409，参数错误 422，不存在 404。
- 数据库文件默认 `./data/application.db`，启动前确保父目录存在；验证使用隔离 `DB_PATH` 与空闲端口，只清理本次启动的进程。

### 5.2 架构决策记录（高影响取舍）

- **AD-1 身份模型：请求声明身份，不引入认证/授权。** 需求第 6 节将操作者角色与权限模型列为未规定；证据支持的最小设计不为未规定能力增加基础设施。影响：全部写接口信任 `operatorId`；对外部署前必须补充认证与权限，否则任何调用者可冒充任何身份。替换条件：需求明确登录/角色要求时引入 userkit+authkit 或等价方案。
- **AD-2 持久化：dbkit + SQLite 文件库。** 需要服务端权威数据、跨用户共享、关联查询与事务；单文件库部署简单、迁移由 dbkit 管理。限制：单机写入；不跨设备同步承诺。替换条件：需求明确多实例/高并发时评估服务型数据库。
- **AD-3 提交人资料按邮箱归并。** 创建工单提交姓名+邮箱（+公司/部门），服务端按 email upsert `users` 记录，使"提交人完整信息（姓名、公司、部门）"与"历史工单"可稳定聚合。影响：同名不同邮箱为不同提交人。
- **AD-4 评价量表取 1–5 整数分 + 可选文字评论。** 量表形式为需求开放项；验收按"提交一个满意度评价结果并可读回"的最小语义执行。每工单一条评价（UNIQUE），允许覆盖更新。
- **AD-5 附件不做。** 回复附件为需求第 6 节未规定事项，不构成当前基线；后续如需要，按 attachment 模块评估接入。
