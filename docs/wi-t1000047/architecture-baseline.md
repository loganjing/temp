# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 技术栈

新建全栈应用，技术栈如下：

| 层 | 技术 | 说明 |
|---|---|---|
| 后端框架 | Hono | Node.js 运行时，提供 REST API |
| 前端框架 | React + Vite | SPA 单页应用 |
| UI 框架 | Tailwind CSS | 原子化 CSS，Modern SaaS 视觉风格 |
| 数据库 | SQLite | 文件数据库，经 dbkit 管理 |
| 包管理器 | npm | — |
| 运行时 | Node.js >= 20 | — |

### 1.2 CommonApp 模块

| 模块 ID | 包名/版本 | 需求匹配 | manifest SHA-256 |
|---|---|---|---|
| dbkit | @commonapp/dbkit@0.2.0 | SQLite 持久化、查询、事务、版本化迁移 | sha256:f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 |
| authkit | @commonapp/authkit@0.1.2 | Hono 密码登录、Bearer 认证中间件 | sha256:a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 |
| userkit | @commonapp/userkit@0.1.0 | 本地用户、密码凭证存储，配合 AuthKit | sha256:40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 |
| permissionkit | @commonapp/permissionkit@0.1.0 | RBAC 权限注册表与授权，支持三角色权限控制 | sha256:09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 |

模块安装标记：`commonapp install: dbkit, authkit, userkit, permissionkit`

模块依赖闭包：userkit 依赖 dbkit + authkit；permissionkit 依赖 dbkit。authkit 运行时依赖 hono；dbkit 运行时依赖 better-sqlite3。所有模块状态为 ready，发行文件完整。

集成边界：
- dbkit 提供数据库连接、查询、事务和迁移能力，项目通过 `createDb` / `runMigrations` 接入。
- authkit 提供认证中间件（密码登录、Bearer token 校验），项目在 Hono 路由中挂载。
- userkit 提供用户存储与解析器，项目通过 `createUserStore` / `createUserResolver` 管理用户。
- permissionkit 提供 RBAC 权限注册表，项目通过 `createPermissionKit` 注册角色与权限并做授权检查。
- 身份模式：`local-password`（本地密码登录），authkit + userkit 组合生成登录与用户管理 API。

### 1.3 UI 基线

- **应用/业务模板**：`helpdesk`
- **展示模板 ID**：`split-master-detail` — 列表/队列与当前记录详情协同，左侧工单列表，右侧工单详情与回复区域。
- **视觉风格**：Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、一个主色与状态色。
- **设备策略**：桌面 Web（默认），最小宽度 1024px；表格等可能截断内容提供悬停 tooltip 或展开查看全文。
- **应用壳**：左侧导航栏（按角色显示不同菜单）、顶部上下文栏（当前用户信息与操作）、主工作区采用列表-详情分栏。
- **导航结构**：
  - 提交人：工单列表、创建工单、我的评价
  - 处理人：待处理工单队列、工单详情（含提交人信息面板与历史工单）
  - 管理员：工单管理、业务组管理、分配规则配置
- **全局状态**：
  - 加载：骨架屏或 spinner
  - 空数据：空态提示与引导操作
  - 错误：错误信息提示，可重试
  - 成功：操作成功 toast 提示
  - 无权限：无权限提示

### 1.4 运行约定

- 常规启动：`npm start`（启动 Hono 服务端，前端由 Vite dev server 或 build 产物提供）
- 端口：`PORT` 环境变量，默认 3000
- 数据库路径：`DB_PATH` 环境变量，默认 `./data/ticket-system.db`；启动前自动创建 `data/` 目录
- 隔离测试：验证脚本通过 `DB_PATH` 指定测试数据库路径，选择空闲端口，等待真实监听就绪后运行测试，仅清理本次启动的进程

### 1.5 系统架构图

```
┌─────────────────────────────────────────────┐
│                 浏览器 (React SPA)            │
│  ┌───────────┐  ┌──────────────┐            │
│  │ 工单管理   │  │ 业务组/规则   │            │
│  │ 列表-详情  │  │ 配置管理     │            │
│  └───────────┘  └──────────────┘            │
└──────────────────┬──────────────────────────┘
                   │ HTTP/JSON
┌──────────────────▼──────────────────────────┐
│              Hono 后端 (REST API)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ AuthKit  │ │ 工单模块  │ │ 分配/协作模块 │ │
│  │ 认证中间件│ │ CRUD+回复 │ │ 转派/规则    │ │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
│       │            │              │          │
│  ┌────▼─────┐ ┌────▼──────────────▼──────┐  │
│  │ UserKit  │ │      PermissionKit       │  │
│  │ 用户管理  │ │      RBAC 授权           │  │
│  └────┬─────┘ └──────────────┬───────────┘  │
│       │                      │              │
│  ┌────▼──────────────────────▼──────────┐   │
│  │           dbkit (SQLite)             │   │
│  │  tickets / groups / rules / evals... │   │
│  └──────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 认证模块 (AuthKit + UserKit)

**职责**：用户注册、密码登录、Bearer token 签发与校验、用户信息管理。

**数据归属**：用户表（由 userkit 管理，含 id, name, email, password_hash, company, department 等）。

**接口摘要**：

| 接口 | 方法 | 用途 | 调用方 |
|---|---|---|---|
| `/api/auth/login` | POST | 密码登录，返回 Bearer token | 前端登录页 |
| `/api/auth/logout` | POST | 登出，使 token 失效 | 前端退出 |
| `/api/auth/me` | GET | 获取当前登录用户信息 | 前端初始化 |
| `/api/users` | POST | 创建用户（管理员） | 管理员用户管理 |
| `/api/users/:id` | GET | 获取用户详情 | 管理员 |

### 2.2 工单管理模块

**职责**：工单创建、查询、详情查看、回复、状态变更、完成处理。

**数据归属**：工单表（tickets）、工单回复表（ticket_replies）。

**接口摘要**：

| 接口 | 方法 | 用途 | 调用方 |
|---|---|---|---|
| `/api/tickets` | POST | 提交人创建工单 | 提交人创建页 |
| `/api/tickets` | GET | 查询工单列表（按角色过滤） | 工单列表页 |
| `/api/tickets/:id` | GET | 查看工单详情（含回复、处理记录） | 工单详情页 |
| `/api/tickets/:id/replies` | POST | 添加回复（提交人/处理人） | 工单详情页 |
| `/api/tickets/:id/status` | PATCH | 变更状态（取消等） | 工单详情页 |
| `/api/tickets/:id/complete` | POST | 处理人完成处理 | 工单详情页 |
| `/api/tickets/:id/evaluation` | POST | 提交人满意度评价 | 工单详情页 |
| `/api/tickets/:id/submitter-info` | GET | 查看提交人完整信息+历史工单 | 处理人工单详情 |

### 2.3 工单分配模块

**职责**：公司管理、业务组管理、业务组成员管理、分类分配规则配置、工单自动分配。

**数据归属**：公司表（companies）、业务组表（business_groups）、业务组成员表（business_group_members）、分类分配规则表（category_assignment_rules）。

**接口摘要**：

| 接口 | 方法 | 用途 | 调用方 |
|---|---|---|---|
| `/api/companies` | GET/POST | 查询/创建公司 | 管理员 |
| `/api/companies/:id/business-groups` | GET/POST | 查询/创建业务组 | 管理员 |
| `/api/business-groups/:id/members` | GET/POST | 查询/添加业务组成员 | 管理员 |
| `/api/assignment-rules` | GET/POST | 查询/创建分类分配规则 | 管理员 |
| `/api/companies/:id/assignment-rules` | GET | 查询公司下分配规则 | 管理员 |

### 2.4 工单协作模块

**职责**：工单转派操作，记录转派历史。

**数据归属**：工单转派记录表（ticket_transfers）。

**接口摘要**：

| 接口 | 方法 | 用途 | 调用方 |
|---|---|---|---|
| `/api/tickets/:id/transfer` | POST | 处理人转派工单到其他业务组/处理人 | 处理人工单详情 |

### 2.5 权限模块 (PermissionKit)

**职责**：RBAC 权限控制，注册三角色（submitter/handler/admin）及其权限。

**数据归属**：权限注册表（由 permissionkit 管理）。

角色权限矩阵：

| 操作 | submitter | handler | admin |
|---|---|---|---|
| 创建工单 | ✓ | ✗ | ✓ |
| 回复工单 | ✓（自己的） | ✓（分配的） | ✗ |
| 取消工单 | ✓（自己的） | ✗ | ✓ |
| 完成处理 | ✗ | ✓（分配的） | ✗ |
| 转派工单 | ✗ | ✓（分配的） | ✗ |
| 评价工单 | ✓（自己的） | ✗ | ✗ |
| 管理业务组 | ✗ | ✗ | ✓ |
| 管理分配规则 | ✗ | ✗ | ✓ |
| 查看提交人信息 | ✗ | ✓ | ✓ |

## 3. 数据模型

使用 SQLite 数据库，经 dbkit 管理。主键类型为 TEXT（UUID），由应用层生成。

### 3.1 实体关系

```
users (userkit)
  ├── tickets (submitter_id → users.id)
  │    ├── ticket_replies (ticket_id → tickets.id, user_id → users.id)
  │    ├── ticket_transfers (ticket_id → tickets.id)
  │    └── ticket_evaluations (ticket_id → tickets.id)
  │
  ├── business_group_members (user_id → users.id, group_id → business_groups.id)
  │
  └── companies (created_by → users.id)
       ├── business_groups (company_id → companies.id)
       │    └── business_group_members (group_id → business_groups.id)
       └── category_assignment_rules (company_id → companies.id, group_id → business_groups.id)
```

### 3.2 核心表结构

**tickets**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| subject | TEXT NOT NULL | 主题 |
| description | TEXT | 描述 |
| category | TEXT NOT NULL | 问题分类 |
| sla_priority | TEXT NOT NULL | P0-P4 |
| status | TEXT NOT NULL | created/pending_assign/pending_process/completed/cancelled |
| submitter_id | TEXT NOT NULL | FK → users.id |
| submitter_name | TEXT NOT NULL | 提交人姓名（冗余快照） |
| submitter_email | TEXT NOT NULL | 提交人邮箱（冗余快照） |
| submitter_company | TEXT | 提交人公司 |
| submitter_department | TEXT | 提交人部门 |
| assigned_group_id | TEXT | FK → business_groups.id（分配后） |
| assigned_handler_id | TEXT | FK → users.id（分配后） |
| handler_id | TEXT | FK → users.id（完成时） |
| handler_name | TEXT | 处理人姓名（冗余快照） |
| processed_at | TEXT | 处理完成时间（ISO 8601） |
| created_at | TEXT NOT NULL | 创建时间（ISO 8601） |
| updated_at | TEXT NOT NULL | 更新时间 |

**ticket_replies**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| ticket_id | TEXT NOT NULL | FK → tickets.id |
| user_id | TEXT NOT NULL | FK → users.id |
| user_name | TEXT NOT NULL | 回复人姓名（冗余快照） |
| content | TEXT NOT NULL | 回复内容 |
| created_at | TEXT NOT NULL | 回复时间 |

**ticket_transfers**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| ticket_id | TEXT NOT NULL | FK → tickets.id |
| from_user_id | TEXT NOT NULL | 转出处理人 |
| from_user_name | TEXT NOT NULL | 转出处理人姓名 |
| to_group_id | TEXT | 转入业务组 |
| to_user_id | TEXT | 转入处理人 |
| to_user_name | TEXT | 转入处理人姓名 |
| reason | TEXT | 转派原因 |
| created_at | TEXT NOT NULL | 转派时间 |

**ticket_evaluations**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| ticket_id | TEXT NOT NULL | FK → tickets.id |
| rating | INTEGER NOT NULL | 满意度评分 1-5 |
| comment | TEXT | 文字评价（可选） |
| created_at | TEXT NOT NULL | 评价时间 |

**companies**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL | 公司名称 |
| created_by | TEXT NOT NULL | FK → users.id |
| created_at | TEXT NOT NULL | 创建时间 |

**business_groups**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| company_id | TEXT NOT NULL | FK → companies.id |
| name | TEXT NOT NULL | 业务组名称 |
| created_at | TEXT NOT NULL | 创建时间 |

**business_group_members**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| group_id | TEXT NOT NULL | FK → business_groups.id |
| user_id | TEXT NOT NULL | FK → users.id |
| created_at | TEXT NOT NULL | 加入时间 |

**category_assignment_rules**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| company_id | TEXT NOT NULL | FK → companies.id |
| category | TEXT NOT NULL | 分类名称 |
| group_id | TEXT NOT NULL | FK → business_groups.id |
| created_at | TEXT NOT NULL | 创建时间 |

## 4. 业务流程

### 4.1 工单自动分配流程

1. 提交人创建工单 → 状态为 `created`
2. 系统查询 `category_assignment_rules`，匹配工单分类 + 提交人所属公司
3. 匹配成功 → 设置 `assigned_group_id`，状态变为 `pending_process`
4. 匹配失败 → 状态保持 `pending_assign`，等待手动分配

### 4.2 工单转派流程

1. 处理人在待处理工单中发起转派
2. 记录转派信息到 `ticket_transfers`
3. 更新 `tickets.assigned_group_id` / `assigned_handler_id`
4. 工单状态保持 `pending_process`

### 4.3 工单完成评价流程

1. 处理人执行完成 → 记录 `handler_id` / `handler_name` / `processed_at`，状态变为 `completed`
2. 提交人收到工单完成状态后可评价
3. 提交人提交评价 → 写入 `ticket_evaluations`

## 5. 迁移约定

数据库 schema 变更使用版本化 SQL 迁移文件，存放于 `migrations/sqlite/` 目录下，通过 dbkit 的 `runMigrations` 执行。不使用 ORM 自动同步或手工改 schema。
