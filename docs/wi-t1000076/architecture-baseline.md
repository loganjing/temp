# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 选型 | 说明 |
|---|------|------|
| 后端框架 | Hono (Node.js ≥20) | REST API，中间件实现公司隔离与认证 |
| 前端框架 | React + Vite (SPA) | 单页应用，客户端路由 |
| UI 框架 | Tailwind CSS | 原子化样式，配合 Lucide 图标 |
| 数据库 | SQLite (via @commonapp/dbkit) | 文件数据库，支持迁移 |
| 认证 | @commonapp/authkit | Bearer token，本地密码模式 |
| 用户管理 | @commonapp/userkit | 本地用户与凭证存储 |
| 邮件 | @commonapp/emailkit | SMTP 邮件发送 |
| 审计日志 | @commonapp/auditkit | 持久化审计事件 |

### CommonApp 模块选择

| 模块 | 版本 | SHA-256 | 需求匹配 | 集成边界 |
|------|------|---------|----------|----------|
| dbkit | 0.2.0 | sha256:f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | 工单按公司隔离、跨用户共享、结构化查询、事务 | SQLite 持久层，提供 query/run/transaction/migrations |
| authkit | 0.1.2 | sha256:a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | 多用户工单系统必需的用户身份识别 | Hono 中间件，Bearer token 认证 |
| userkit | 0.1.0 | sha256:40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 提交人/处理人/业务组成员的身份与基础信息 | 依赖 dbkit + authkit，提供本地用户 CRUD |
| emailkit | 0.1.0 | sha256:a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | 工单完成发送邮件通知提交人 | SMTP 客户端，无数据库依赖 |
| auditkit | 0.1.0 | sha256:27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 记录工单生命周期操作日志 | 依赖 dbkit，持久化审计事件 |

**identityMode**: `local-password`（authkit + userkit 本地密码模式）。工单系统是多用户协作系统，提交人、处理人、业务组成员需要可识别的身份才能实现工单归属、公司隔离和操作追溯。此为系统运转的最小必要身份基础设施，不推断具体权限矩阵。

### 架构总览

```
┌─────────────────────────────────────────────┐
│  React SPA (Vite)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 工单工作台 │ │ 统计仪表盘 │ │ 业务组管理 │    │
│  └─────┬────┘ └─────┬────┘ └─────┬────┘    │
│        └────────────┼────────────┘          │
│                fetch / Bearer token         │
└────────────────────┬────────────────────────┘
                     │ HTTP REST API
┌────────────────────┴────────────────────────┐
│  Hono Server                                │
│  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │
│  │ Auth MW │ │ Company  │ │ Route       │  │
│  │ (authkit)│ │ Isolate  │ │ Handlers    │  │
│  │         │ │ MW       │ │             │  │
│  └─────────┘ └──────────┘ └──────┬──────┘  │
│  ┌──────────────────────────────┐│          │
│  │ Domain Services              ││          │
│  │ Ticket │ Assignment │ Stats  ││          │
│  │ Reply  │ Evaluation │ Notify ││          │
│  └───────────────┬──────────────┘│          │
│  ┌───────────────┴──────────────┐│          │
│  │ @commonapp modules           ││          │
│  │ dbkit │ userkit │ emailkit   ││          │
│  │ authkit │ auditkit           ││          │
│  └───────────────┬──────────────┘│          │
└──────────────────┼───────────────┴──────────┘
                   │
            SQLite (file DB)
```

### 公司隔离策略

所有工单相关查询和操作以公司为边界执行：

- 认证中间件从用户会话提取 `userId`，通过 `user_profiles` 表关联得到 `companyId`
- 公司隔离中间件将 `companyId` 注入请求上下文，所有后续查询自动附加 `WHERE company_id = ?`
- 业务组、分类分配规则均以公司为边界独立配置，查询时自动过滤
- 统计分析和工作台筛选遵守公司维度隔离

### 工单生命周期

```
创建 → 待分配 → 待处理 → 完成
  ↓       ↓       ↓
  └───────┴───────┴──→ 取消
```

- **创建**：提交后的初始状态
- **待分配**：等待分配到业务组或处理人（无匹配自动分配规则时进入此状态）
- **待处理**：已分配到业务组或处理人，等待处理（有匹配自动分配规则时从"创建"直接跳到此状态）
- **完成**：处理完毕，记录处理人与处理时间，发送邮件通知提交人
- **取消**：完成前任意状态可取消

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 工单管理模块 (Ticket)

**职责**：工单 CRUD、状态流转、多轮回复管理。

**接口摘要**：

| 接口 | 用途 | 方向 |
|------|------|------|
| POST /api/tickets | 创建工单 | 前端 → 后端 |
| GET /api/tickets | 查询工单列表（含筛选/搜索/排序） | 前端 → 后端 |
| GET /api/tickets/:id | 获取工单详情 | 前端 → 后端 |
| PATCH /api/tickets/:id | 更新工单（分配/转派/处理/完成/取消） | 前端 → 后端 |
| POST /api/tickets/:id/replies | 添加回复 | 前端 → 后端 |
| GET /api/tickets/:id/replies | 获取回复列表 | 前端 → 后端 |
| POST /api/tickets/:id/evaluation | 提交满意度评价 | 前端 → 后端 |
| GET /api/tickets/:id/submitter | 获取提交人完整信息与历史工单 | 前端 → 后端 |

**唯一数据归属**：工单实体、工单回复、工单评价均由本模块持久化和管理。

### 2.2 组织管理模块 (Organization)

**职责**：公司、部门、业务组及成员管理。

**接口摘要**：

| 接口 | 用途 | 方向 |
|------|------|------|
| GET /api/companies | 获取公司列表 | 前端 → 后端 |
| POST /api/companies | 创建公司 | 前端 → 后端 |
| GET /api/companies/:companyId/departments | 获取部门列表 | 前端 → 后端 |
| POST /api/companies/:companyId/departments | 创建部门 | 前端 → 后端 |
| GET /api/companies/:companyId/groups | 获取业务组列表 | 前端 → 后端 |
| POST /api/companies/:companyId/groups | 创建业务组 | 前端 → 后端 |
| POST /api/companies/:companyId/groups/:groupId/members | 添加成员 | 前端 → 后端 |
| DELETE /api/companies/:companyId/groups/:groupId/members/:userId | 移除成员 | 前端 → 后端 |
| GET /api/companies/:companyId/assignment-rules | 获取分类分配规则 | 前端 → 后端 |
| POST /api/companies/:companyId/assignment-rules | 创建分类分配规则 | 前端 → 后端 |

**唯一数据归属**：公司、部门、业务组、业务组成员、分类分配规则。

### 2.3 分配引擎模块 (Assignment)

**职责**：工单创建时根据分类匹配分配规则，自动分配到对应业务组。

**调用关系**：由工单管理模块在创建工单时调用，查询 `category_assignment_rules` 表。匹配成功则工单直接进入"待处理"状态并关联业务组；未匹配则进入"待分配"状态。

### 2.4 协作转派模块 (Transfer)

**职责**：将待处理工单从一个业务组/处理人转派到另一个。

**接口摘要**：

| 接口 | 用途 | 方向 |
|------|------|------|
| POST /api/tickets/:id/transfer | 转派工单 | 前端 → 后端 |

**调用关系**：转派操作保持工单"待处理"状态，更新关联的业务组和/或处理人，并记录审计日志。

### 2.5 统计分析模块 (Statistics)

**职责**：按公司/部门维度统计工单分布，运营仪表盘指标聚合。

**接口摘要**：

| 接口 | 用途 | 方向 |
|------|------|------|
| GET /api/statistics/distribution | 工单分布统计（按公司/部门） | 前端 → 后端 |
| GET /api/statistics/dashboard | 运营仪表盘指标 | 前端 → 后端 |

**指标定义**：
- 工单量：工单总数及各状态分布
- 平均响应时间：工单从 `created_at` 到 `processed_at` 的平均耗时（毫秒）
- 满意度：已完成且有评价的工单满意度汇总
- 热点问题：按分类统计工单频次，降序排列

### 2.6 邮件通知模块 (Notification)

**职责**：工单完成时向提交人邮箱发送完成通知。

**调用关系**：由工单管理模块在执行"完成"操作时调用 emailkit 发送邮件。邮件发送失败时记录错误日志，不影响工单完成状态。

### 2.7 审计日志模块 (Audit)

**职责**：记录工单生命周期关键操作日志（创建、分配、转派、处理、完成、取消）。

**接口摘要**：

| 接口 | 用途 | 方向 |
|------|------|------|
| GET /api/audit-logs | 查询审计日志（支持工单ID筛选） | 前端 → 后端 |

**调用关系**：各业务操作完成后调用 auditkit 记录审计事件，包含操作类型、操作人、操作时间和关联工单ID。

### 2.8 认证与用户模块 (Auth & User)

**职责**：用户认证、用户管理（由 authkit + userkit 提供）。

**接口摘要**：

| 接口 | 用途 | 方向 |
|------|------|------|
| POST /api/auth/login | 登录 | 前端 → 后端 |
| POST /api/auth/logout | 登出 | 前端 → 后端 |
| GET /api/auth/me | 当前用户信息 | 前端 → 后端 |
| GET /api/users | 用户列表 | 前端 → 后端 |
| POST /api/users | 创建用户 | 前端 → 后端 |

## 3. UI 全局基线

### 应用/业务模板

`helpdesk` — 工单管理系统，核心动作是高频逐条处理工单记录。

### 展示模板

`split-master-detail` — 列表/队列与当前记录详情协同。左侧为工单列表，右侧为选中工单的详情面板。

主工作流布局：
- **工单工作台**：split-master-detail，左侧待处理工单列表（筛选/搜索/排序），右侧工单详情与处理操作
- **统计分析**：command-center-dashboard 布局，顶部 KPI 卡片（工单量、平均响应时间、满意度），下方工单分布图表与热点问题排名
- **业务组管理**：saas-ops-console 布局，导航 + 表格 + 操作面板
- **工单创建**：表单页面，填写主题/描述/分类/SLA优先级

### 视觉风格

Modern SaaS — 柔和中性色背景、细边界、少阴影、中等圆角、清晰字体。主色为蓝色（操作按钮、链接），状态色：绿色（完成）、琥珀色（待处理/待分配）、红色（取消/紧急 P0）、灰色（创建）。动效短且有反馈作用。

### 应用壳与导航

- **左侧导航栏**：工单工作台、工单管理（创建/列表）、统计分析、业务组管理、分类分配规则、审计日志
- **顶部上下文栏**：当前公司标识、当前用户信息、登出
- **主工作区**：根据导航选择展示对应页面

### 目标设备

桌面 Web（最小宽度 1024px）。不适用窄屏布局。

### 全局状态

- **加载中**：列表和详情区域显示骨架屏或加载指示器
- **空数据**：列表显示空状态提示，引导用户创建工单或调整筛选
- **错误**：操作失败时显示错误提示（toast 或内联），不阻塞页面
- **成功**：操作成功后显示成功反馈（toast），列表或详情刷新

## 4. 数据模型

### 4.1 userkit 管理表

由 userkit 初始化和管理，项目不直接修改其 schema。

- **users** — id (TEXT, UUID), username (TEXT), email (TEXT), password_hash (TEXT), created_at (INTEGER)

### 4.2 项目业务表

以下表通过 dbkit migrations 创建，均在项目迁移目录中定义。

**companies**
| 列 | 类型 | 说明 |
|---|------|------|
| id | TEXT (UUID) | 主键，由应用生成 |
| name | TEXT | 公司名称 |
| created_at | INTEGER | 创建时间戳（ms） |

**departments**
| 列 | 类型 | 说明 |
|---|------|------|
| id | TEXT (UUID) | 主键 |
| company_id | TEXT | 外键 → companies.id |
| name | TEXT | 部门名称 |
| created_at | INTEGER | 创建时间戳 |

**user_profiles**
| 列 | 类型 | 说明 |
|---|------|------|
| user_id | TEXT | 外键 → users.id（userkit） |
| company_id | TEXT | 外键 → companies.id |
| department_id | TEXT | 外键 → departments.id，可空 |
| full_name | TEXT | 用户姓名 |

> user_profiles 扩展 userkit 管理的 users 表，补充公司、部门和姓名信息。user_id 引用 userkit users.id，类型一致（TEXT/UUID）。

**tickets**
| 列 | 类型 | 说明 |
|---|------|------|
| id | TEXT (UUID) | 主键 |
| company_id | TEXT | 外键 → companies.id |
| subject | TEXT | 工单主题 |
| description | TEXT | 工单描述 |
| category | TEXT | 问题分类 |
| sla_priority | TEXT | SLA优先级：P0/P1/P2/P3/P4 |
| status | TEXT | 状态：created/pending_assign/pending_process/completed/cancelled |
| submitter_user_id | TEXT | 外键 → users.id（提交人） |
| assigned_group_id | TEXT | 外键 → business_groups.id，可空 |
| assigned_user_id | TEXT | 外键 → users.id（处理人），可空 |
| handler_user_id | TEXT | 外键 → users.id（实际完成处理人），可空 |
| created_at | INTEGER | 创建时间戳 |
| processed_at | INTEGER | 处理完成时间戳，可空 |

**ticket_replies**
| 列 | 类型 | 说明 |
|---|------|------|
| id | TEXT (UUID) | 主键 |
| ticket_id | TEXT | 外键 → tickets.id |
| user_id | TEXT | 外键 → users.id（回复人） |
| content | TEXT | 回复内容 |
| created_at | INTEGER | 回复时间戳 |

**business_groups**
| 列 | 类型 | 说明 |
|---|------|------|
| id | TEXT (UUID) | 主键 |
| company_id | TEXT | 外键 → companies.id |
| name | TEXT | 业务组名称 |
| created_at | INTEGER | 创建时间戳 |

**business_group_members**
| 列 | 类型 | 说明 |
|---|------|------|
| id | TEXT (UUID) | 主键 |
| group_id | TEXT | 外键 → business_groups.id |
| user_id | TEXT | 外键 → users.id |
| created_at | INTEGER | 加入时间戳 |

**category_assignment_rules**
| 列 | 类型 | 说明 |
|---|------|------|
| id | TEXT (UUID) | 主键 |
| company_id | TEXT | 外键 → companies.id |
| category | TEXT | 工单分类名称 |
| group_id | TEXT | 外键 → business_groups.id（目标业务组） |
| created_at | INTEGER | 创建时间戳 |

**ticket_evaluations**
| 列 | 类型 | 说明 |
|---|------|------|
| id | TEXT (UUID) | 主键 |
| ticket_id | TEXT | 外键 → tickets.id |
| user_id | TEXT | 外键 → users.id（评价人） |
| rating | INTEGER | 满意度评价值（具体量表未规定，使用整数存储） |
| created_at | INTEGER | 评价时间戳 |

### 4.3 auditkit 管理表

由 auditkit 初始化和管理，项目通过 auditkit API 写入审计事件。

- **audit_events** — id, event_type, actor_id, target_type, target_id, metadata (JSON), created_at

### 4.4 迁移约定

所有项目业务表通过版本化 SQL 迁移文件创建，存放在 `migrations/sqlite/` 目录。迁移通过 dbkit `runMigrations` 执行，不使用 ORM 自动同步或手工改 schema。

## 5. 外部集成

### 邮件通知

- **模块**：emailkit (@commonapp/emailkit)
- **触发时机**：工单状态流转到"完成"时
- **收件人**：提交人邮箱（从 user_profiles + users 获取）
- **发送方式**：通过 SMTP 发送（由环境变量配置 SMTP 连接）
- **失败处理**：邮件发送失败时记录错误日志，工单完成状态不受影响
- **开发环境**：无 SMTP 配置时降级为控制台输出邮件内容，确保功能可验证

## 6. 运行约定

### 启动命令

- **常规启动**：`npm start`（启动后端 API 服务）
- **前端开发**：`npm run dev`（Vite 开发服务器 + 后端 API 代理）
- **构建**：`npm run build`（构建前端静态资源）

### 端口

- 后端 API：`PORT` 环境变量，默认 3000
- 前端开发服务器：Vite 默认端口（5173），通过代理转发 API 请求

### 数据库

- **持久化路径**：`DB_PATH` 环境变量，默认 `./data/ticket-system.db`
- **测试覆盖**：验证时设置 `DB_PATH` 指向隔离测试数据库路径
- **目录创建**：打开数据库前自动创建父目录
- **迁移**：服务启动时自动执行待处理迁移

### 验证约定

- 验证脚本负责启动和清理服务，使用空闲端口和隔离数据库路径
- 等待真实监听就绪后执行验证
- 只清理本次启动的进程
- 干净目录无需手动创建数据目录即可启动

### ID 生成

所有业务实体 ID 由应用层生成 UUID v4 字符串，统一使用 TEXT 类型存储。userkit 用户 ID 同样为 TEXT/UUID，与项目表外键类型一致，无需转换。
