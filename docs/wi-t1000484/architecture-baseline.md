# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 应用类型

全栈复杂应用（fullstack-complex）。工单系统涉及多角色（提交人、处理人、管理员）跨用户共享数据、服务端权威数据持久化、分类自动分配规则、历史工单查询等，需要服务端权威数据和数据库支持。

### 1.2 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 后端框架 | Hono | Node.js Web 框架，提供 API 路由 |
| 前端框架 | React + Vite | SPA 单页应用 |
| UI 框架 | Tailwind CSS | 原子化 CSS，构建紧凑业务界面 |
| 数据库 | SQLite (dbkit) | 文件数据库，通过 @commonapp/dbkit 管理 |
| 包管理器 | npm | |
| 运行时 | Node.js >= 20 | |

### 1.3 CommonApp 模块选择

| 模块 ID | 包名 | 版本 | 状态 | 用途 |
|---|---|---|---|---|
| dbkit | @commonapp/dbkit | 0.2.0 | ready | SQLite 配置、查询、事务与版本化迁移 |

- manifest SHA-256: `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6`
- 模块依赖闭包：无其他模块依赖
- 运行时依赖：`better-sqlite3 ^11.0.0 || ^12.0.0`
- 集成边界：后端通过 `createDb` / `createDbConfig` 初始化数据库连接，使用 `runMigrations` 执行版本化迁移，`db.queryAll` / `db.queryOne` / `db.run` / `db.transaction` 执行查询和事务
- 不选择 authkit/userkit/permissionkit：需求中角色仅用于描述职责边界，不指定权限模型或实现方式；工单系统在设计层面通过 API 路由区分操作入口，不引入独立认证/授权基础设施
- `commonapp install: dbkit`

### 1.4 项目结构

packageRoot: `app/jlg-ticket`（由 platform-baseline.json 定义）

```
jlg-ticket/
├── package.json                    # 应用脚本、依赖与运行命令
├── platform-baseline.json          # 初始化结构、模块状态与源码入口地图
├── vite.config.ts                  # Vite 插件、开发端口与 API 代理
├── tsconfig.json / tsconfig.client.json / tsconfig.server.json
├── tailwind.config.js / postcss.config.js
├── app/jlg-ticket/
│   ├── AGENTS.md                   # 包级 server/client/shared 职责与边界
│   ├── src/
│   │   ├── server/
│   │   │   ├── index.ts            # Hono 服务入口：初始化资源、组装 app、启动 HTTP
│   │   │   ├── app.ts              # 全局中间件、API 错误、路由注册与 SPA 回退
│   │   │   ├── routes.ts           # 公开与业务路由注册点
│   │   │   ├── platform/
│   │   │   │   ├── bootstrap.ts    # dbkit 资源初始化
│   │   │   │   ├── auth.ts         # 身份解析与认证边界绑定点
│   │   │   │   └── locale.ts       # 请求级 locale 中间件
│   │   │   ├── migrations/
│   │   │   │   └── sqlite/         # SQL 迁移文件
│   │   │   └── (services/repositories)  # 工单、分配、转派等业务逻辑
│   │   ├── client/
│   │   │   ├── main.tsx            # React 挂载与全局 provider
│   │   │   ├── App.tsx             # 顶层应用与导航
│   │   │   ├── platform/
│   │   │   │   ├── api-client.ts   # 浏览器请求边界与错误解码
│   │   │   │   └── i18n.tsx        # 客户端 locale provider
│   │   │   ├── index.css           # 全局样式（Tailwind）
│   │   │   └── (pages/components)  # 工单列表详情、创建、业务组管理等页面
│   │   └── shared/                 # 平台中立的契约、schema、常量
│   └── test/
│       ├── with-http-server.mjs    # 隔离 HTTP 测试服务器
│       ├── platform.test.mjs       # 平台基线测试
│       ├── fixtures/
│       │   ├── qa-environment.mjs  # 隔离 QA 数据库与测试身份
│       │   └── README.md           # QA 种子数据契约
│       └── dbkit.test.mjs          # dbkit 启动与迁移验证
└── docs/
    └── wi-t1000484/
        ├── architecture-baseline.md
        └── technical-contract.md
```

**目录边界约定（来自 platform-baseline.json 与 app/jlg-ticket/AGENTS.md）：**
- `src/server/`：仅导入 src/shared/ 和服务端依赖，禁止导入 React 或 DOM API
- `src/client/`：仅导入 src/shared/ 和浏览器依赖，禁止导入 Node 内建或 Hono 服务端
- `src/shared/`：平台中立，禁止导入 Node API、Hono、React 或数据库驱动

### 1.5 运行约定

- 常规启动：`npm start`（启动 Hono 服务入口 `app/jlg-ticket/src/server/index.ts`，同时托管前端静态资源）
- 可配置端口：`PORT` 环境变量（默认 3000）
- 持久化数据库路径：`DB_PATH` 环境变量（默认 `./data/jlg-ticket.db`）
- 数据库文件父目录在打开前自动创建
- 隔离测试：使用空闲端口和独立 `DB_PATH` 路径，验证脚本负责启动和清理
- 干净目录无需手动创建 data 目录即可启动

### 1.6 全局 UI 基线

- **应用/业务模板**：helpdesk（工单系统）
- **展示模板 ID**：`split-master-detail`（左侧工单列表/队列，右侧当前工单详情，支持筛选和状态切换）
- **视觉风格**：Modern SaaS（柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色与状态色、短且有反馈作用的动效）
- **应用壳**：左侧导航栏（工单列表、业务组管理、分类规则配置），顶部上下文栏（当前视图标题与全局操作），主工作区为列表-详情分栏布局
- **目标设备**：桌面 Web（默认最小宽度 1024px）
- **全局状态**：
  - 加载状态：列表和详情区显示骨架屏或加载指示器
  - 空数据状态：工单列表为空时显示空态提示与创建入口
  - 错误状态：API 失败时显示错误提示，可重试
  - 成功状态：操作（创建、回复、转派、评价等）完成后显示简短成功反馈
- **选择依据**：工单系统核心动作是高频逐条处理记录（创建、查看、回复、转派、完成），列表与详情协同是最佳布局；业务后台使用 Modern SaaS 视觉风格保持可扫读性

### 1.7 页面规划

| 页面 | 对应需求 | 说明 |
|---|---|---|
| 工单列表+详情（split-master-detail） | AC-01~AC-03, AC-06~AC-09 | 左侧工单队列（按状态/优先级筛选），右侧工单详情（含回复、转派、完成、取消、评价操作） |
| 工单创建 | AC-01 | 表单：主题、描述、分类、SLA 优先级，提交人信息自动填充 |
| 业务组管理 | AC-04 | 管理员页面：公司→业务组列表→成员管理 |
| 分类分配规则配置 | AC-05 | 管理员页面：配置分类到业务组的映射规则 |
| 提交人信息查看（嵌入工单详情） | AC-07 | 在工单详情侧边面板显示提交人姓名、公司、部门、历史工单列表 |

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 领域对象与数据归属

| 领域对象 | 数据归属 | 唯一事实来源 |
|---|---|---|
| 公司 (Company) | companies 表 | 服务端 SQLite |
| 业务组 (BusinessGroup) | business_groups 表 | 服务端 SQLite |
| 业务组成员 (BusinessGroupMember) | business_group_members 表 | 服务端 SQLite |
| 问题分类 (Category) | categories 表 | 服务端 SQLite |
| 分类分配规则 (CategoryAssignmentRule) | category_assignment_rules 表 | 服务端 SQLite |
| 工单 (Ticket) | tickets 表 | 服务端 SQLite |
| 工单回复 (TicketReply) | ticket_replies 表 | 服务端 SQLite |
| 转派记录 (TicketTransfer) | ticket_transfers 表 | 服务端 SQLite |
| 工单评价 (TicketEvaluation) | ticket_evaluations 表 | 服务端 SQLite |
| 用户 (User) | users 表 | 服务端 SQLite |

### 2.2 模块边界与接口摘要

#### 2.2.1 工单模块 (Ticket Module)

- 职责：工单 CRUD、生命周期状态流转、多轮回复、评价管理
- 数据归属：tickets、ticket_replies、ticket_evaluations、ticket_transfers
- 接口摘要：
  - `GET /api/tickets` — 工单列表（支持状态/优先级/分类筛选）
  - `POST /api/tickets` — 创建工单（触发自动分配）
  - `GET /api/tickets/:id` — 工单详情（含回复列表、转派记录、评价）
  - `POST /api/tickets/:id/replies` — 添加回复
  - `POST /api/tickets/:id/transfer` — 转派工单
  - `POST /api/tickets/:id/complete` — 完成工单
  - `POST /api/tickets/:id/cancel` — 取消工单
  - `POST /api/tickets/:id/evaluation` — 提交满意度评价
  - `GET /api/tickets/:id/evaluation` — 查看评价

#### 2.2.2 分配模块 (Assignment Module)

- 职责：工单自动分配与手动分配，分类规则匹配
- 数据归属：category_assignment_rules
- 接口摘要：
  - `POST /api/tickets/:id/assign` — 手动分配工单到业务组或处理人
  - 自动分配在工单创建时由 `assignment-service` 内部触发，不暴露独立 API

#### 2.2.3 组织管理模块 (Organization Module)

- 职责：公司、业务组及成员管理
- 数据归属：companies、business_groups、business_group_members
- 接口摘要：
  - `GET /api/companies` — 公司列表
  - `POST /api/companies` — 创建公司
  - `GET /api/companies/:id/business-groups` — 公司下业务组列表
  - `POST /api/companies/:id/business-groups` — 创建业务组
  - `GET /api/business-groups/:id/members` — 业务组成员列表
  - `POST /api/business-groups/:id/members` — 添加成员
  - `DELETE /api/business-groups/:id/members/:userId` — 移除成员

#### 2.2.4 分类与规则模块 (Category Module)

- 职责：问题分类管理与分类分配规则配置
- 数据归属：categories、category_assignment_rules
- 接口摘要：
  - `GET /api/categories` — 分类列表
  - `POST /api/categories` — 创建分类
  - `GET /api/companies/:id/assignment-rules` — 公司分配规则列表
  - `POST /api/companies/:id/assignment-rules` — 创建分配规则

#### 2.2.5 用户信息模块 (User Module)

- 职责：提交人信息查询，历史工单查询
- 数据归属：users
- 接口摘要：
  - `GET /api/users/:id` — 用户详情（姓名、邮箱、公司、部门）
  - `GET /api/users/:id/tickets` — 用户历史工单列表

### 2.3 核心业务规则

#### 2.3.1 工单状态流转

```
创建(created) → 待分配(pending_assign) → 待处理(pending_process) → 完成(completed)
                          ↘ 取消(cancelled) ← ↗
```

- 创建后立即进入 `pending_assign`
- 自动分配匹配到业务组时，状态变为 `pending_process`
- 手动分配后状态变为 `pending_process`
- 处理人标记完成后状态变为 `completed`
- 从 `pending_assign` 或 `pending_process` 可取消为 `cancelled`
- `completed` 和 `cancelled` 为终态，不可再变更

#### 2.3.2 自动分配逻辑

工单创建时，`assignment-service` 执行以下逻辑：
1. 查找工单分类 + 提交人所属公司的分类分配规则
2. 若匹配到规则，将工单分配到规则指定的业务组，状态变为 `pending_process`
3. 若无匹配规则，工单保持 `pending_assign` 状态，等待手动分配

#### 2.3.3 转派逻辑

- 转派操作从当前处理人/业务组转至目标业务组或处理人
- 转派后工单状态保持 `pending_process`
- 记录转派来源和目标信息到 `ticket_transfers` 表

## 3. 数据模型

### 3.1 表结构

#### companies
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | 公司名称 |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

#### users
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | 姓名 |
| email | TEXT | NOT NULL | 邮箱 |
| company_id | TEXT | NOT NULL, FK → companies.id | 所属公司 |
| department | TEXT | | 部门名称 |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

#### business_groups
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| company_id | TEXT | NOT NULL, FK → companies.id | 所属公司 |
| name | TEXT | NOT NULL | 业务组名称 |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

#### business_group_members
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| group_id | TEXT | NOT NULL, FK → business_groups.id | 所属业务组 |
| user_id | TEXT | NOT NULL, FK → users.id | 成员用户 |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

#### categories
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | 分类名称 |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

#### category_assignment_rules
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| company_id | TEXT | NOT NULL, FK → companies.id | 所属公司 |
| category_id | TEXT | NOT NULL, FK → categories.id | 问题分类 |
| group_id | TEXT | NOT NULL, FK → business_groups.id | 目标业务组 |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

#### tickets
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| title | TEXT | NOT NULL | 工单主题 |
| description | TEXT | NOT NULL | 工单描述 |
| category_id | TEXT | NOT NULL, FK → categories.id | 问题分类 |
| submitter_id | TEXT | NOT NULL, FK → users.id | 提交人 |
| priority | TEXT | NOT NULL | SLA 优先级 P0-P4 |
| status | TEXT | NOT NULL | 状态：created/pending_assign/pending_process/completed/cancelled |
| assigned_group_id | TEXT | FK → business_groups.id | 分配的业务组（可空） |
| assigned_handler_id | TEXT | FK → users.id | 分配的处理人（可空） |
| processed_by | TEXT | FK → users.id | 处理人（可空） |
| processed_at | TEXT | | 处理完成时间（可空） |
| created_at | TEXT | NOT NULL | 创建时间 |

#### ticket_replies
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| ticket_id | TEXT | NOT NULL, FK → tickets.id | 所属工单 |
| replier_id | TEXT | NOT NULL, FK → users.id | 回复人 |
| content | TEXT | NOT NULL | 回复内容 |
| created_at | TEXT | NOT NULL | 回复时间 |

#### ticket_transfers
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| ticket_id | TEXT | NOT NULL, FK → tickets.id | 所属工单 |
| from_group_id | TEXT | FK → business_groups.id | 来源业务组（可空） |
| from_handler_id | TEXT | FK → users.id | 来源处理人（可空） |
| to_group_id | TEXT | FK → business_groups.id | 目标业务组（可空） |
| to_handler_id | TEXT | FK → users.id | 目标处理人（可空） |
| transferred_by | TEXT | NOT NULL, FK → users.id | 操作人 |
| created_at | TEXT | NOT NULL | 转派时间 |

#### ticket_evaluations
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| ticket_id | TEXT | NOT NULL, FK → tickets.id | 所属工单 |
| submitter_id | TEXT | NOT NULL, FK → users.id | 评价人（提交人） |
| rating | INTEGER | NOT NULL | 满意度评分 1-5 |
| comment | TEXT | | 评价备注（可空） |
| created_at | TEXT | NOT NULL | 评价时间 |

### 3.2 迁移约定

- 迁移文件位于 `migrations/sqlite/` 目录
- 使用 `runMigrations(db, {directory: './migrations'})` 执行
- 每个迁移为独立 SQL 文件，按版本号排序
- 主键统一使用 TEXT 类型（UUID v4），由应用层生成
- 时间戳统一使用 TEXT 类型（ISO 8601）
- 外键约束在迁移中通过 `FOREIGN KEY` 声明

### 3.3 种子数据

初始化时预置基础数据：
- 预置公司、用户、部门用于演示
- 预置问题分类（如：技术问题、功能咨询、故障报告、需求建议）
- 预置业务组和分配规则用于验证自动分配流程

## 4. 验收可重复性约定

本工单系统的验收场景均为确定性请求-响应流程，无需自动推进、随机结果或定时任务：
- 工单状态流转通过 API 操作触发，验证时按 AC 描述顺序执行创建→分配→处理→完成/取消
- 自动分配在创建工单时同步执行，可通过配置规则后在同一请求中验证结果
- 多轮回复按时间顺序排列，验证时按顺序添加回复后检查展示顺序
- 评价在工单完成后提交，验证时先完成工单再提交评价
