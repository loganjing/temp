# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 项目概述

工单系统（ticket-system）是一个多租户工单管理平台，支持工单全生命周期管理（创建→待分配→待处理→完成/取消）、多轮回复、按公司隔离的业务组分配与自动路由、工单转派协作、邮件通知、用户满意度评价、统计分析仪表盘和工单工作台。

### 1.2 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 后端框架 | Hono (Node.js, ESM) | RESTful API 服务 |
| 前端框架 | React + Vite (SPA) | 单页应用 |
| UI 框架 | Tailwind CSS | 原子化 CSS |
| 数据库 | SQLite (via dbkit) | 文件数据库，支持迁移 |
| 认证 | 项目内实现（Hono 中间件 + dbkit） | 本地密码模式，Bearer token 认证 |
| 权限 | permissionkit | RBAC 角色控制 |
| 审计日志 | auditkit | 持久化审计事件 |
| 邮件 | emailkit | SMTP 邮件发送 |

### 1.3 CommonApp 模块选型

| 模块 ID | 包名 | 版本 | SHA-256 | 需求匹配 |
|---|---|---|---|---|
| dbkit | @commonapp/dbkit | 0.2.0 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | 工单、回复、业务组等核心数据持久化，支持事务与版本化迁移 |
| permissionkit | @commonapp/permissionkit | 0.1.0 | 09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 | 提交人/处理人/管理员三种角色的 RBAC 授权 |

> **降级说明**：authkit 和 userkit 的 workspace-init 脚手架测试中存在模板占位符 `__APP_NAME__` 未被替换的缺陷，导致初始化验证失败。认证与用户管理改为项目内实现：使用 Hono 中间件实现 Bearer token 认证和本地密码登录，用户表（含 company_id、department、email、role）通过 dbkit 管理。permissionkit 仍提供 RBAC 授权能力。
| auditkit | @commonapp/auditkit | 0.1.0 | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 工单关键操作审计日志（操作人、时间、类型、工单ID） |
| emailkit | @commonapp/emailkit | 0.1.0 | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | 工单完成后向提交人发送 SMTP 邮件通知 |

模块依赖闭包：permissionkit → {dbkit}；auditkit → {dbkit}。认证与用户管理在项目内实现，不依赖 authkit/userkit 公共模块。

### 1.4 架构总览

```
┌─────────────────────────────────────────────┐
│              React + Vite SPA               │
│  ┌──────────┬──────────┬──────────────────┐  │
│  │ 工单工作台 │ 管理后台  │  统计仪表盘     │  │
│  │(master-  │(业务组+  │(分布+运营指标)  │  │
│  │ detail)  │ 分配规则) │                 │  │
│  └──────────┴──────────┴──────────────────┘  │
└──────────────────┬──────────────────────────┘
                   │ HTTP (Bearer token)
┌──────────────────▼──────────────────────────┐
│              Hono API Server                │
│  ┌────────┐ ┌────────┐ ┌────────────────┐ │
│  │认证中间件│ │RBAC中间件│ │ 审计日志中间件  │ │
│  │(项目内)  │ │(permkit)│ │  (auditkit)    │ │
│  └────────┘ └────────┘ └────────────────┘ │
│  ┌──────────────────────────────────────┐  │
│  │           业务路由层                  │  │
│  │  工单核心 │ 分配协作 │ 处理评价 │ 统计 │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │           数据访问层                  │  │
│  │  dbkit (SQLite) │ emailkit (SMTP)   │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 1.5 运行约定

- **启动命令**：`npm start`（生产）或 `npm run dev`（开发，Hono + Vite 并行）
- **端口**：`PORT` 环境变量，默认 3000（API）；Vite dev server 默认 5173 并代理 API
- **数据库路径**：`DB_PATH` 环境变量，默认 `./data/ticket-system.db`；启动前自动创建父目录
- **测试数据库**：验证时通过 `DB_PATH` 覆盖为隔离路径
- **迁移**：`migrations/sqlite/` 目录下版本化 SQL 文件，通过 `dbkit` 的 `runMigrations` 执行

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 模块职责与数据归属

#### 工单核心模块（ticket-core）

owns: tickets, ticket_replies 表

- 工单 CRUD 与生命周期状态机（created → pending_assignment → pending_processing → completed / cancelled）
- 工单多轮回复
- 所有工单查询按 company_id 隔离

接口摘要：
- POST /api/tickets — 创建工单（提交人），创建后触发自动分配
- GET /api/tickets — 工单列表（工作台），支持筛选/搜索/排序
- GET /api/tickets/:id — 工单详情含回复列表
- PATCH /api/tickets/:id/status — 状态流转
- POST /api/tickets/:id/replies — 添加回复

#### 分配与协作模块（assignment-collaboration）

owns: business_groups, business_group_members, auto_assignment_rules, ticket_transfers 表

- 业务组与成员管理（管理员操作）
- 分类自动分配规则配置
- 工单转派操作（处理人→其他业务组或成员）

接口摘要：
- POST /api/business-groups — 创建业务组
- GET /api/business-groups — 列表（含成员）
- POST /api/business-groups/:id/members — 添加成员
- DELETE /api/business-groups/:id/members/:userId — 移除成员
- POST /api/assignment-rules — 创建自动分配规则
- GET /api/assignment-rules — 规则列表
- POST /api/tickets/:id/transfer — 工单转派

#### 处理与通知模块（processing-notification）

owns: ticket_evaluations 表；uses: emailkit

- 处理工单时查看提交人完整信息（姓名、公司、部门、历史工单）
- 工单完成时记录处理人/处理时间，触发邮件通知
- 用户满意度评价

接口摘要：
- GET /api/tickets/:id/submitter-info — 提交人完整信息含历史工单
- POST /api/tickets/:id/complete — 完成工单（触发邮件）
- POST /api/tickets/:id/evaluation — 提交满意度评价
- GET /api/tickets/:id/evaluation — 查看评价

#### 统计分析模块（statistics）

reads: tickets, ticket_evaluations, users, business_groups

- 按公司、部门维度统计工单分布
- 运营仪表盘：工单量、平均响应时间、满意度、热点问题

接口摘要：
- GET /api/stats/distribution — 工单分布统计
- GET /api/stats/dashboard — 运营指标仪表盘

#### 审计日志模块（audit-log）

uses: auditkit

- 记录工单关键操作：创建、状态变更、分配/转派、完成、评价、业务组管理
- 每条日志含操作人、操作时间、操作类型、工单ID

接口摘要：
- GET /api/audit-logs — 日志查询（可按工单ID过滤）

### 2.2 数据模型概要

#### 工单核心数据（ticket-core owns）

| 表 | 关键字段 | 归属模块 |
|---|---|---|
| tickets | id, title, description, category, sla_priority(P0-P4), company_id, submitter_id, status, handler_id, created_at, handled_at | ticket-core |
| ticket_replies | id, ticket_id, replier_id, content, created_at | ticket-core |

#### 分配与协作数据（assignment-collaboration owns）

| 表 | 关键字段 | 归属模块 |
|---|---|---|
| business_groups | id, company_id, name, created_at | assignment-collaboration |
| business_group_members | id, group_id, user_id | assignment-collaboration |
| auto_assignment_rules | id, company_id, category, group_id | assignment-collaboration |
| ticket_transfers | id, ticket_id, from_user_id, to_group_id, to_user_id, reason, created_at | assignment-collaboration |

#### 评价数据（processing-notification owns）

| 表 | 关键字段 | 归属模块 |
|---|---|---|
| ticket_evaluations | id, ticket_id, rating(1-5), comment, created_at | processing-notification |

#### 用户与权限数据（项目内 + permissionkit owns）

| 表 | 说明 | 归属 |
|---|---|---|
| users | id, name, email, password_hash, company_id, department, role | 项目内（dbkit） |
| companies | id, name | 项目内（dbkit） |
| permissions / roles | RBAC 注册表 | permissionkit |

> users 表由项目内迁移创建，包含工单系统所需的 company_id、department、email、role 字段。密码使用 bcrypt 哈希存储。登录签发 JWT Bearer token。

#### 审计数据（auditkit owns）

| 表 | 说明 | 归属 |
|---|---|---|
| audit_events | id, actor_id, action, entity_type, entity_id, metadata, created_at | auditkit |

### 2.3 公司隔离机制

- 每个 user 关联 company_id，登录后从认证上下文获取。
- 所有工单、业务组、分配规则查询均以 company_id 过滤。
- 任何跨公司数据访问返回 403 或空结果。
- 管理员只能管理本公司的业务组和分配规则。

### 2.4 角色与权限（permissionkit RBAC）

| 角色 | 权限 |
|---|---|
| submitter | 创建工单、查看/回复自己的工单、评价已完成工单 |
| handler | 查看/处理本组工单、回复工单、转派工单 |
| admin | 管理业务组与成员、配置自动分配规则、查看公司全部工单与统计 |

> 一个用户可同时拥有多个角色。角色分配通过 permissionkit RBAC 注册表管理。

### 2.5 工单状态机

```
created ──→ pending_assignment ──→ pending_processing ──→ completed
                │                        │
                └──→ cancelled  ←────────┘
```

- **created**：工单创建后初始状态
- **pending_assignment**：等待分配到业务组（手动或按分类自动匹配规则）
- **pending_processing**：已分配业务组，处理人开始处理；转派后保持此状态
- **completed**：处理人完成处理，系统记录处理人/处理时间，发送邮件通知提交人
- **cancelled**：工单被取消，终止流程

> 自动分配在工单从 created → pending_assignment 时触发：根据工单分类匹配 auto_assignment_rules，找到对应 business_group 后直接流转到 pending_processing。

### 2.6 邮件通知流程

工单完成（status → completed）时，系统通过 emailkit 向提交人邮箱发送完成通知邮件。邮件发送在完成 API 响应后异步执行，发送失败记录到审计日志但不阻断工单完成操作。

## 3. UI 全局基线

### 3.1 应用模板与展示模板

- **应用/业务模板**：`helpdesk`
- **展示模板 ID**：`split-master-detail`
  - 左侧列表/队列 + 右侧工单详情协同
  - 适用于高频逐条处理场景

### 3.2 视觉预设

- **视觉风格**：Modern SaaS
- 柔和中性色、细边界、少阴影、中等圆角
- 一个主色（蓝色系）与状态色（成功绿/警告橙/错误红/已取消灰）
- 短而有反馈作用的动效

### 3.3 应用壳与导航

```
┌──────────────────────────────────────────────┐
│  顶部上下文栏（公司名/用户/退出）             │
├────────┬─────────────────────────────────────┤
│  侧栏  │           主工作区                    │
│ 导航    │  ┌─────────┬──────────────────────┐ │
│        │  │ 列表/队列  │    工单详情           │ │
│·工作台 │  │ 筛选/搜索 │  回复/提交人信息/操作  │ │
│·管理   │  │ 排序     │                       │ │
│·统计   │  └─────────┴──────────────────────┘ │
│·日志   │                                     │
└────────┴─────────────────────────────────────┘
```

- 左侧固定导航栏：工单工作台、管理后台、统计分析、操作日志
- 顶部上下文栏：当前公司名、用户信息、退出
- 主工作区：master-detail 双栏布局

### 3.4 关键页面

| 页面 | 布局 | 说明 |
|---|---|---|
| 登录 | 居中表单 | 邮箱+密码登录 |
| 工单工作台 | split-master-detail | 左侧待处理工单列表（筛选: 公司/状态/分类/SLA；搜索: 主题/ID；排序: 创建时间/优先级）；右侧工单详情（含回复、提交人信息面板、操作按钮） |
| 工单详情 | 详情面板 | 工单属性、回复列表（时间排序）、提交人信息（姓名/公司/部门/历史工单）、操作：分配/转派/完成/取消；已完成工单显示评价入口 |
| 管理后台-业务组 | 列表+表单 | 业务组列表、成员管理、增删成员 |
| 管理后台-分配规则 | 列表+表单 | 自动分配规则列表（分类→业务组），新建/编辑规则 |
| 统计分析 | command-center-dashboard | 顶部公司/部门筛选；KPI 卡片（工单量/平均响应时间/满意度）；热点问题列表 |
| 操作日志 | 表格列表 | 按工单ID/操作类型/时间筛选 |

### 3.5 全局状态

- **加载中**：列表区骨架屏，详情区加载提示
- **空数据**：列表区空态提示"暂无工单"
- **错误**：顶部红色错误条，可重试
- **无权限**：403 提示页
- **成功**：操作后 toast 提示

### 3.6 设备策略

- 默认桌面 Web，最小宽度 1024px
- 无移动端/窄屏要求

### 3.7 设计依据

- split-master-detail：工单/CRM/审批高频逐条处理场景的标准选择（UI 设计决策参考）
- Modern SaaS：通用业务应用默认视觉方向
- 桌面 Web：需求未提及移动端，工单处理为桌面高频操作场景
