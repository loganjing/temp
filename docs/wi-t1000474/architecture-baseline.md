# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 后端框架 | Hono (Node.js, ESM) | 轻量 HTTP 服务，REST API |
| 前端框架 | React + Vite | SPA，单页应用 |
| UI 框架 | Tailwind CSS | Modern SaaS 视觉风格 |
| 数据库 | SQLite (via dbkit) | 文件数据库，持久化 |
| 包管理器 | npm | package-lock.json |
| CommonApp 模块 | dbkit v0.2.0 | SQLite 配置、查询、事务、迁移 |

**dbkit 选择依据**：新项目需要服务端权威数据、跨用户共享和结构化查询；dbkit 提供 SQLite 配置、查询、事务和版本化迁移，无模块依赖，状态 ready。manifest SHA-256: `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6`。

**未选择其他模块**：需求未要求认证/登录（authkit/userkit）、权限控制（permissionkit）、文件上传（attachment）、邮件发送（emailkit）、审计日志（auditkit）或国际化（i18n）。提交人和处理人通过工单中的用户信息标识，不依赖认证模块。

### 应用身份

- 应用名称：`jlg-ticket`
- 常规启动命令：`npm start`
- 开发命令：`npm run dev`
- 服务端口：`PORT` 环境变量（默认 3000）
- 数据库路径：`DB_PATH` 环境变量（默认 `./data/ticket.db`）
- 隔离测试数据库：`DB_PATH=./data/test.db`
- 迁移目录：`migrations/sqlite/`

### 架构总览

```
┌──────────────────────────────────────────┐
│            React + Vite SPA              │
│  (Tailwind / split-master-detail 布局)    │
└──────────────┬───────────────────────────┘
               │ REST API (fetch)
┌──────────────▼───────────────────────────┐
│            Hono HTTP Server              │
│  (src/server.ts → API routes)            │
├──────────────────────────────────────────┤
│            Service Layer                  │
│  (工单/业务组/分类/分配/转派/评价)         │
├──────────────────────────────────────────┤
│         dbkit (SQLite 数据层)             │
│  (查询/事务/迁移)                         │
└──────────────────────────────────────────┘
```

### UI 全局基线

- **应用/业务模板**：helpdesk（工单系统）
- **展示模板**：`split-master-detail` — 列表/队列与当前记录详情协同，适合高频逐条处理
- **视觉风格**：Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色与状态色、短动效
- **应用壳**：左侧导航栏 + 顶部上下文栏 + 主工作区
- **导航结构**：
  - 工单列表（主工作区，split-master-detail）
  - 创建工单
  - 业务组管理
  - 分类与规则管理
- **目标设备**：桌面 Web（默认）
- **全局状态**：加载（骨架/spinner）、空数据（空态提示+引导操作）、错误（内联错误消息+重试）、成功（toast 提示）
- **选择依据**：需求为高频工单处理场景，核心动作为逐条查看和处理工单，符合 `split-master-detail` 模板的"列表/队列与当前记录详情协同"选择依据

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 模块职责

| 模块 | 职责 | 数据归属 |
|---|---|---|
| 工单管理 | 工单 CRUD、生命周期状态流转、详情查询 | tickets 表 |
| 工单回复 | 多轮回复记录与查询 | ticket_replies 表 |
| 工单转派 | 工单转派操作与历史记录 | ticket_transfers 表 |
| 工单评价 | 满意度评价提交与查询 | ticket_evaluations 表 |
| 业务组管理 | 公司下业务组 CRUD 与成员管理 | companies, business_groups, business_group_members 表 |
| 分类与规则 | 问题分类管理、分类→业务组映射规则 | categories, category_group_rules 表 |
| 用户信息 | 用户详情查询（含历史工单） | users 表（只读聚合） |

### 接口摘要

| 接口 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 创建工单 | POST | `/api/tickets` | 创建工单，若有匹配规则自动分配 |
| 工单列表 | GET | `/api/tickets` | 按状态/分类/优先级筛选 |
| 工单详情 | GET | `/api/tickets/:id` | 含提交人信息、回复、转派、评价 |
| 更新状态 | PATCH | `/api/tickets/:id/status` | 分配/处理/完成/取消 |
| 添加回复 | POST | `/api/tickets/:id/replies` | 记录回复人和回复时间 |
| 回复列表 | GET | `/api/tickets/:id/replies` | 按时间排序 |
| 转派工单 | POST | `/api/tickets/:id/transfer` | 转派给处理人或业务组 |
| 转派历史 | GET | `/api/tickets/:id/transfers` | 查看转派记录 |
| 提交评价 | POST | `/api/tickets/:id/evaluation` | 满意度评价（1-5 分） |
| 查看评价 | GET | `/api/tickets/:id/evaluation` | 查看评价结果 |
| 公司列表 | GET | `/api/companies` | 列出公司 |
| 创建公司 | POST | `/api/companies` | 新增公司 |
| 业务组列表 | GET | `/api/companies/:companyId/business-groups` | 公司下业务组 |
| 创建业务组 | POST | `/api/companies/:companyId/business-groups` | 新增业务组 |
| 成员列表 | GET | `/api/business-groups/:id/members` | 业务组成员 |
| 添加成员 | POST | `/api/business-groups/:id/members` | 添加成员 |
| 移除成员 | DELETE | `/api/business-groups/:id/members/:userId` | 移除成员 |
| 分类列表 | GET | `/api/categories` | 问题分类 |
| 创建分类 | POST | `/api/categories` | 新增分类 |
| 规则列表 | GET | `/api/category-group-rules` | 按公司筛选映射规则 |
| 创建规则 | POST | `/api/category-group-rules` | 配置分类→业务组映射 |
| 删除规则 | DELETE | `/api/category-group-rules/:id` | 删除映射规则 |
| 用户详情 | GET | `/api/users/:id` | 含公司、部门、历史工单 |

> 字段级定义、类型、可空性、错误码和 ID 对照表见 `technical-contract.md`。

## 3. 数据模型

### 数据库：SQLite（dbkit）

默认路径 `./data/ticket.db`，测试路径通过 `DB_PATH` 覆盖。启动前创建父目录。迁移文件位于 `migrations/sqlite/`，版本化 SQL 迁移，不使用 ORM 自动同步。

### 核心表

**companies** — 公司

| 字段 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| created_at | TEXT | NOT NULL DEFAULT now |

**users** — 用户（提交人和处理人）

| 字段 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| email | TEXT | NOT NULL UNIQUE |
| company_id | INTEGER | FK → companies.id |
| department | TEXT | — |
| created_at | TEXT | NOT NULL DEFAULT now |

**business_groups** — 业务组

| 字段 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| company_id | INTEGER | NOT NULL FK → companies.id |
| name | TEXT | NOT NULL |
| created_at | TEXT | NOT NULL DEFAULT now |

**business_group_members** — 业务组成员（多对多）

| 字段 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| group_id | INTEGER | NOT NULL FK → business_groups.id |
| user_id | INTEGER | NOT NULL FK → users.id |
| created_at | TEXT | NOT NULL DEFAULT now |
| | | UNIQUE(group_id, user_id) |

**categories** — 问题分类

| 字段 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL UNIQUE |
| created_at | TEXT | NOT NULL DEFAULT now |

**category_group_rules** — 分类→业务组映射规则（自动分配）

| 字段 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| company_id | INTEGER | NOT NULL FK → companies.id |
| category_id | INTEGER | NOT NULL FK → categories.id |
| group_id | INTEGER | NOT NULL FK → business_groups.id |
| created_at | TEXT | NOT NULL DEFAULT now |
| | | UNIQUE(company_id, category_id) |

**tickets** — 工单

| 字段 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| ticket_no | TEXT | NOT NULL UNIQUE |
| subject | TEXT | NOT NULL |
| description | TEXT | — |
| category_id | INTEGER | NOT NULL FK → categories.id |
| priority | TEXT | NOT NULL DEFAULT 'P3' |
| status | TEXT | NOT NULL DEFAULT 'created' |
| submitter_id | INTEGER | NOT NULL FK → users.id |
| assigned_group_id | INTEGER | FK → business_groups.id |
| assignee_id | INTEGER | FK → users.id |
| handled_by | INTEGER | FK → users.id |
| handled_at | TEXT | — |
| created_at | TEXT | NOT NULL DEFAULT now |
| updated_at | TEXT | NOT NULL DEFAULT now |
| completed_at | TEXT | — |

**ticket_replies** — 工单回复

| 字段 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| ticket_id | INTEGER | NOT NULL FK → tickets.id |
| replier_id | INTEGER | NOT NULL FK → users.id |
| content | TEXT | NOT NULL |
| created_at | TEXT | NOT NULL DEFAULT now |

**ticket_transfers** — 工单转派记录

| 字段 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| ticket_id | INTEGER | NOT NULL FK → tickets.id |
| from_user_id | INTEGER | FK → users.id |
| to_user_id | INTEGER | FK → users.id |
| to_group_id | INTEGER | FK → business_groups.id |
| reason | TEXT | — |
| created_at | TEXT | NOT NULL DEFAULT now |

**ticket_evaluations** — 用户评价

| 字段 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| ticket_id | INTEGER | NOT NULL UNIQUE FK → tickets.id |
| rating | INTEGER | NOT NULL CHECK(1-5) |
| comment | TEXT | — |
| created_at | TEXT | NOT NULL DEFAULT now |

### 状态机

工单 `status` 字段枚举值及流转规则：

```
created → pending_assignment → pending_processing → completed
                ↓                    ↓
             cancelled            cancelled
```

| 状态值 | 含义 | 可转入 |
|---|---|---|
| `created` | 提交人创建后的初始状态 | — |
| `pending_assignment` | 等待分配到业务组 | created |
| `pending_processing` | 已分配，等待处理人处理 | pending_assignment |
| `completed` | 处理完成 | pending_processing |
| `cancelled` | 已取消 | pending_assignment, pending_processing |

**自动分配逻辑**：创建工单时，若 `category_group_rules` 中存在提交人所属公司与工单分类匹配的规则，则自动将 `assigned_group_id` 设为规则指向的业务组，状态直接流转为 `pending_processing`；否则工单进入 `pending_assignment` 等待手动分配。

**优先级枚举**：`P0`（最高）、`P1`、`P2`、`P3`（默认）、`P4`（最低）。

**工单编号**：格式 `TKT-YYYYMMDD-NNNN`，按日递增序号。

## 4. UI 布局

### 全局布局

```
┌────────────────────────────────────────────────────┐
│  顶部上下文栏（当前视图标题 + 关键操作按钮）          │
├──────────┬─────────────────────────────────────────┤
│          │                                         │
│  左侧    │  主工作区                                │
│  导航栏  │  (split-master-detail: 列表 + 详情)      │
│          │                                         │
│ ·工单列表│  ┌──────────┬──────────────────────┐   │
│ ·创建工单│  │ 工单列表  │  工单详情             │   │
│ ·业务组  │  │ (筛选+   │  (提交人信息/回复/    │   │
│ ·分类规则│  │  列表)   │   转派/评价/操作)     │   │
│          │  └──────────┴──────────────────────┘   │
│          │                                         │
└──────────┴─────────────────────────────────────────┘
```

### 页面与工作流

| 页面 | 布局 | 核心内容 |
|---|---|---|
| 工单列表 | split-master-detail 左侧 | 筛选栏（状态/分类/优先级）+ 工单卡片列表，点击展开右侧详情 |
| 工单详情 | split-master-detail 右侧 | 工单基本信息 + 提交人完整信息（含历史工单折叠区）+ 回复时间线 + 转派历史 + 评价区 + 操作按钮栏 |
| 创建工单 | 居中表单 | 主题/描述/分类/优先级 + 提交人信息（姓名/邮箱/公司/部门） |
| 业务组管理 | 左侧公司列表 + 右侧业务组与成员 | 公司选择 → 业务组列表 → 成员管理 |
| 分类与规则管理 | 左侧分类列表 + 右侧规则配置 | 分类 CRUD + 分类→业务组映射规则（按公司） |

### 关键交互状态

- **工单列表加载**：骨架占位
- **空工单列表**：空态提示 + "创建工单"引导按钮
- **工单详情加载**：spinner
- **操作成功**：toast 提示 + 列表刷新
- **操作失败**：内联错误消息 + 重试按钮
- **截断文本**：工单描述等长文本提供展开/收起，标题溢出显示完整标题（title 属性）

## 5. 运行与校验约定

### 启动

| 命令 | 用途 |
|---|---|
| `npm start` | 常规启动（生产模式） |
| `npm run dev` | 开发模式（Hono + Vite dev server） |
| `PORT=4000 npm start` | 指定端口 |
| `DB_PATH=./data/test.db npm start` | 指定测试数据库 |

### 数据库

- 默认路径：`./data/ticket.db`，启动前自动创建 `./data/` 目录
- 测试覆盖：通过 `DB_PATH` 环境变量指定隔离路径
- 迁移：SQL 文件位于 `migrations/sqlite/`，通过 `dbkit` 的 `runMigrations` 执行版本化迁移

### 验收验证

- 验收脚本负责启动和清理服务，直接运行验收脚本即可
- 验收使用空闲端口，等待真实监听就绪后执行
- 验收脚本只清理本次启动的进程
- 干净目录和默认数据库路径无需人工准备即可运行
