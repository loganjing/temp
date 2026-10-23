# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 后端框架 | Hono (Node.js ≥ 20) | REST API 服务，ESM |
| 前端框架 | React + Vite | SPA，开发态 Vite dev server 代理 API |
| UI 框架 | Tailwind CSS | 实用类优先，配合组件级组合 |
| 数据库 | SQLite (via dbkit) | 文件数据库，版本化迁移 |
| 包管理 | npm | package-lock.json 锁定 |
| 认证 | authkit + userkit (local-password) | Bearer token 认证，本地用户凭证 |
| 权限 | permissionkit | RBAC 角色权限注册表 |
| 审计 | auditkit | 持久化操作日志 |
| 邮件 | emailkit (nodemailer) | SMTP 邮件发送 |

### 1.2 CommonApp 模块选择

| 模块 | 版本 | manifest SHA-256 | 需求匹配 | 集成边界 |
|---|---|---|---|---|
| dbkit | 0.2.0 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | 工单、回复、业务组等持久化存储与迁移 | 项目数据层基础，提供 createDb/query/transaction/migrations |
| authkit | 0.1.2 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | 用户登录认证，Bearer token | Hono 中间件，保护所有 API 路由 |
| userkit | 0.1.0 | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 本地用户、密码凭证管理 | 依赖 dbkit + authkit，提供用户 CRUD 与凭证存储 |
| permissionkit | 0.1.0 | 09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 | 角色 RBAC 权限控制 | 依赖 dbkit，项目定义角色注册表 |
| auditkit | 0.1.0 | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 工单操作日志记录 | 依赖 dbkit，记录工单生命周期操作事件 |
| emailkit | 0.1.0 | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | 工单完成后邮件通知提交人 | 依赖 nodemailer，SMTP 配置驱动 |

**模块安装标记**：`commonapp install: dbkit`、`commonapp install: authkit`、`commonapp install: userkit`、`commonapp install: permissionkit`、`commonapp install: auditkit`、`commonapp install: emailkit`

identityMode 为 `local-password`，workspace-init 生成登录页面、首个账户初始化和用户管理 API。permissionkit 和 auditkit 需在实现阶段按项目需求集成角色注册表和审计事件写入逻辑。emailkit 需在实现阶段配置 SMTP 连接并编写工单完成通知模板。

### 1.3 UI 基线

- **应用/业务模板**：helpdesk（工单系统）
- **展示模板**：`split-master-detail` — 列表/队列与当前工单详情协同
- **视觉风格**：Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色与状态色、短而有反馈的动效
- **应用壳**：左侧导航栏 + 顶部上下文栏 + 主工作区
- **目标设备**：桌面 Web（默认）
- **导航结构**：
  - 工单工作台（待处理列表 + 工单详情 split-master-detail）
  - 统计分析（运营仪表盘，command-center-dashboard 布局）
  - 管理配置（业务组管理、分配规则配置）
- **主工作流**：工单列表 → 选中工单 → 详情面板展示工单信息、回复流、提交人信息、操作按钮
- **全局状态**：
  - 加载态：列表骨架屏，详情面板 loading 指示
  - 空态：无工单时展示空状态引导
  - 错误态：操作失败时 toast 错误提示
  - 成功态：操作成功时 toast 反馈
  - 无权限：公司隔离导致无数据时展示无权限或空列表
- **选择依据**：需求明确为高频逐条处理工单场景（AC-12 工单工作台），列表与详情协同是最优布局；统计分析需独立仪表盘视图（AC-11）

### 1.4 运行约定

- **常规启动**：`npm start`（生产模式，Hono 服务 + 静态前端）
- **开发启动**：`npm run dev`（Vite dev server + Hono API 并发）
- **端口**：`PORT` 环境变量，默认 3000
- **数据库路径**：`DB_PATH` 环境变量，默认 `./data/application.db`；打开前自动创建 `data/` 目录
- **迁移**：SQL 文件位于 `migrations/sqlite/`，启动时自动执行
- **隔离测试数据库**：设置 `DB_PATH` 为测试专用路径，使用空闲端口等待真实监听就绪

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────┐
│                  React SPA (Vite)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ 工单工作台 │ │ 统计仪表盘 │ │ 管理配置          │ │
│  └─────┬────┘ └─────┬────┘ └────────┬─────────┘ │
│        └────────────┼───────────────┘           │
│                     fetch (Bearer token)         │
└─────────────────────┼───────────────────────────┘
                      │
┌─────────────────────┼───────────────────────────┐
│              Hono API Server                     │
│  ┌──────────────────┴────────────────────────┐  │
│  │         Auth Middleware (authkit)          │  │
│  │    Company Isolation Middleware            │  │
│  └──────────────────┬────────────────────────┘  │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌────────┐│
│  │Ticket   │ │Assignment│ │Collab. │ │Process.││
│  │Module   │ │Module    │ │Module  │ │Module  ││
│  └────┬────┘ └────┬─────┘ └───┬────┘ └───┬────┘│
│  ┌────┴────┐ ┌────┴─────┐ ┌───┴────┐ ┌───┴────┐│
│  │Evaluate │ │Statistics│ │Workbench│ │Audit   ││
│  │Module   │ │Module    │ │Module   │ │(auditkit)│
│  └─────────┘ └──────────┘ └────────┘ └────────┘│
└──────┬──────────────┬───────────────────────────┘
       │              │
  ┌────┴────┐   ┌────┴────┐
  │ SQLite  │   │  SMTP    │
  │ (dbkit) │   │(emailkit)│
  └─────────┘   └─────────┘
```

### 2.2 模块职责与接口摘要

#### 工单管理模块 (Ticket Module)

- **职责**：工单 CRUD、生命周期状态流转、多轮回复管理
- **数据归属**：tickets 表、ticket_replies 表（唯一写入方）
- **接口摘要**：

| 方向 | 接口 | 用途 |
|---|---|---|
| 前端→后端 | POST /api/tickets | 创建工单，触发自动分配 |
| 前端→后端 | GET /api/tickets | 查询工单列表（带筛选/分页） |
| 前端→后端 | GET /api/tickets/:id | 查询工单详情（含回复列表） |
| 前端→后端 | PATCH /api/tickets/:id | 更新工单（状态流转） |
| 前端→后端 | POST /api/tickets/:id/replies | 添加工单回复 |
| 内部 | 工单创建钩子 | 触发自动分配模块匹配规则 |

#### 工单分配模块 (Assignment Module)

- **职责**：业务组管理、业务组成员管理、分类自动分配规则配置与匹配
- **数据归属**：business_groups 表、business_group_members 表、assignment_rules 表（唯一写入方）
- **接口摘要**：

| 方向 | 接口 | 用途 |
|---|---|---|
| 前端→后端 | POST /api/business-groups | 创建业务组 |
| 前端→后端 | GET /api/business-groups | 查询公司下业务组列表 |
| 前端→后端 | PUT /api/business-groups/:id/members | 设置业务组成员 |
| 前端→后端 | POST /api/assignment-rules | 创建分类分配规则 |
| 前端→后端 | GET /api/assignment-rules | 查询公司分配规则列表 |
| 内部 | 自动分配匹配 | 工单创建后按公司+分类匹配规则，分配到业务组 |

#### 工单协作模块 (Collaboration Module)

- **职责**：工单转派操作
- **数据归属**：ticket_transfers 表（记录转派历史）；tickets 表 handler_id 字段更新
- **接口摘要**：

| 方向 | 接口 | 用途 |
|---|---|---|
| 前端→后端 | POST /api/tickets/:id/transfer | 转派工单到新处理人 |

#### 工单处理模块 (Processing Module)

- **职责**：处理工单时查看提交人完整信息（姓名、公司、部门、历史工单）；记录处理人与处理时间；工单完成后触发邮件通知
- **数据归属**：tickets 表的 handler_id、handled_at、completed_at 字段；读取 users 表和 tickets 表组装提交人信息
- **接口摘要**：

| 方向 | 接口 | 用途 |
|---|---|---|
| 前端→后端 | GET /api/tickets/:id/submitter | 获取提交人完整信息（含历史工单） |
| 前端→后端 | POST /api/tickets/:id/complete | 标记工单完成，记录处理人/时间，触发邮件 |
| 内部→外部 | emailkit send | 工单完成后调用 emailkit 发送通知邮件 |

#### 用户评价模块 (Evaluation Module)

- **职责**：工单完成后满意度评价
- **数据归属**：ticket_evaluations 表（唯一写入方）
- **接口摘要**：

| 方向 | 接口 | 用途 |
|---|---|---|
| 前端→后端 | POST /api/tickets/:id/evaluation | 提交满意度评价 |
| 前端→后端 | GET /api/tickets/:id/evaluation | 查看工单评价 |

#### 统计分析模块 (Statistics Module)

- **职责**：按公司/部门维度统计工单分布；运营指标仪表盘（工单量、平均响应时间、满意度、热点问题）
- **数据归属**：只读 tickets 表、ticket_evaluations 表、users 表，聚合计算
- **接口摘要**：

| 方向 | 接口 | 用途 |
|---|---|---|
| 前端→后端 | GET /api/statistics/distribution | 按公司/部门维度工单分布 |
| 前端→后端 | GET /api/statistics/dashboard | 运营指标仪表盘数据 |

#### 工单工作台模块 (Workbench Module)

- **职责**：待处理工单列表展示，支持筛选、搜索、排序、按公司维度筛选
- **数据归属**：只读 tickets 表，查询组装
- **接口摘要**：

| 方向 | 接口 | 用途 |
|---|---|---|
| 前端→后端 | GET /api/workbench/tickets | 待处理工单列表（筛选/搜索/排序/公司筛选） |

#### 认证与用户模块 (Auth & User Module)

- **职责**：用户登录认证、用户信息管理、角色权限
- **数据归属**：users 表（通过 userkit）、权限注册表（通过 permissionkit）
- **接口摘要**：

| 方向 | 接口 | 用途 |
|---|---|---|
| 前端→后端 | POST /api/auth/login | 用户登录，返回 Bearer token |
| 前端→后端 | GET /api/auth/me | 获取当前登录用户信息 |
| 前端→后端 | GET /api/users/:id | 获取用户详情（含公司、部门） |

#### 审计日志模块 (Audit Module)

- **职责**：记录工单相关操作日志（创建、分配、转派、完成等）
- **数据归属**：audit_events 表（通过 auditkit）
- **接口摘要**：

| 方向 | 接口 | 用途 |
|---|---|---|
| 前端→后端 | GET /api/tickets/:id/logs | 查看工单操作日志 |
| 内部 | auditkit record | 各业务操作后写入审计事件 |

### 2.3 公司隔离

公司隔离在服务层统一实现：
- 所有工单查询自动附加 `company_id` 过滤条件，基于当前登录用户的 company_id
- 业务组、分配规则查询同样按 company_id 隔离
- 统计分析按公司维度聚合，管理员可跨公司查看（需管理员角色）
- 工作台默认只展示当前用户所属公司的工单

### 2.4 数据模型

#### 核心表

| 表名 | 唯一归属模块 | 说明 |
|---|---|---|
| companies | 系统初始化 | 公司信息 |
| users | userkit | 用户信息（含 company_id、department、email） |
| business_groups | Assignment Module | 业务组，归属公司 |
| business_group_members | Assignment Module | 业务组成员关联 |
| assignment_rules | Assignment Module | 分类→业务组分配规则 |
| tickets | Ticket Module | 工单主表 |
| ticket_replies | Ticket Module | 工单多轮回复 |
| ticket_transfers | Collaboration Module | 转派历史记录 |
| ticket_evaluations | Evaluation Module | 满意度评价 |
| audit_events | auditkit | 操作审计日志 |

#### tickets 表核心字段

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT (UUID) | 主键 |
| company_id | TEXT | 外键→companies.id，隔离字段 |
| subject | TEXT | 工单主题 |
| description | TEXT | 工单描述 |
| category | TEXT | 问题分类 |
| priority | TEXT | SLA 优先级 P0-P4 |
| status | TEXT | 生命周期状态：created/pending_assign/pending_handle/completed/cancelled |
| submitter_id | TEXT | 外键→users.id，提交人 |
| business_group_id | TEXT NULL | 外键→business_groups.id，分配的业务组 |
| handler_id | TEXT NULL | 外键→users.id，当前处理人 |
| created_at | TEXT (ISO) | 创建时间 |
| updated_at | TEXT (ISO) | 更新时间 |
| handled_at | TEXT NULL (ISO) | 处理时间 |
| completed_at | TEXT NULL (ISO) | 完成时间 |

### 2.5 外部集成

- **邮件通知 (emailkit)**：工单完成时调用 emailkit 发送 SMTP 邮件到提交人邮箱。SMTP 配置通过环境变量提供。发送失败记录错误日志但不阻塞工单完成流程（降级处理）。

### 2.6 架构决策

- **文件数据库 SQLite vs 其他数据库**：工单系统为多公司 B2B 应用，数据规模可控，SQLite 文件数据库满足需求且部署简单。dbkit 已封装 SQLite 操作与迁移。
- **公司隔离在服务层 vs 数据库层**：选择服务层（中间件 + 查询过滤）而非数据库行级安全，因 SQLite 不原生支持 RLS，服务层方案可维护性更好且测试隔离方便。
- **邮件发送降级策略**：邮件发送失败不阻塞工单完成，记录错误日志并保留重试可能，优先保证工单流程正常流转。
