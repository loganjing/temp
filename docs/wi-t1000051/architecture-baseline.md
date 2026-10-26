# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 技术栈

新建全栈工单管理系统，技术栈如下：

| 层 | 选型 | 说明 |
|---|---|---|
| 后端框架 | Hono (Node.js ≥ 20) | 轻量 Web 框架，路由与中间件 |
| 前端框架 | React + Vite | SPA 单页应用 |
| UI 框架 | Tailwind CSS | 原子化样式 |
| 数据库 | SQLite (better-sqlite3) | 通过 dbkit 管理 |
| 包管理器 | npm | |

### 1.2 CommonApp 模块选择

选用 6 个 CommonApp 模块，覆盖持久化、认证、用户管理、权限、审计和邮件能力：

| 模块 ID | 包名 | 版本 | 用途 | manifest SHA-256 |
|---|---|---|---|---|
| dbkit | @commonapp/dbkit | 0.2.0 | SQLite 配置、查询、事务与迁移 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 |
| authkit | @commonapp/authkit | 0.1.2 | 密码登录、Bearer 认证 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 |
| userkit | @commonapp/userkit | 0.1.0 | 本地用户与密码凭证管理 | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 |
| permissionkit | @commonapp/permissionkit | 0.1.0 | RBAC 权限注册表与授权 | 09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 |
| auditkit | @commonapp/auditkit | 0.1.0 | 持久化审计事件 | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 |
| emailkit | @commonapp/emailkit | 0.1.0 | SMTP 邮件发送 | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c |

模块依赖闭包：userkit → dbkit + authkit；permissionkit → dbkit；auditkit → dbkit。所有模块状态为 ready，依赖闭包一致，发行文件完整。

选择依据：工单系统需要多用户认证（authkit + userkit）、公司级数据隔离与角色权限控制（permissionkit）、操作审计日志（auditkit，对应 AC-14）、工单完成邮件通知（emailkit，对应 AC-10）、持久化存储（dbkit）。本地密码模式（identityMode: local-password）同时选择 authkit 和 userkit，workspace-init 将生成登录、首个账户初始化和用户管理页面/API。

### 1.3 运行与启动约定

- 常规启动：`npm start`（生产模式，Hono 服务端 + 静态前端）
- 开发模式：`npm run dev`（Vite dev server + Hono API）
- 监听端口：`PORT` 环境变量，默认 3000
- 数据库路径：`DB_PATH` 环境变量，默认 `./data/ticket-system.db`；启动前自动创建父目录
- 隔离测试：使用独立 `DB_PATH` 和空闲端口，等待真实监听就绪后运行
- 数据库迁移：`migrations/sqlite/` 目录下 SQL 文件，通过 `runMigrations(db, {directory: './migrations'})` 执行
- 服务入口：`src/server.js`（在授权写入范围内）

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 模块概览

```
┌──────────────────────────────────────────────────────────┐
│                 React + Vite 前端 (SPA)                   │
│  工单工作台 │ 工单详情 │ 业务组管理 │ 统计仪表盘 │ 操作日志  │
└─────────────────────────┬────────────────────────────────┘
                          │ HTTP API (Bearer 认证)
┌─────────────────────────┴────────────────────────────────┐
│                    Hono 后端                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │工单核心  │ │工单分配  │ │工单协作  │ │工单处理  │        │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                      │
│  │用户评价  │ │统计分析  │ │工单工作台│                     │
│  └─────────┘ └─────────┘ └─────────┘                      │
└──┬───────┬────────┬──────────┬──────────┬──────────┬─────┘
   │       │        │          │          │          │
 dbkit  authkit  userkit  permissionkit  auditkit  emailkit
```

### 2.2 工单核心模块

**职责**：工单 CRUD、生命周期状态流转、多轮回复管理、提交人完整信息查询。

**数据归属**：tickets 表（工单唯一事实来源）、ticket_replies 表。

**接口摘要**：

| 接口 | 方向 | 用途 |
|---|---|---|
| createTicket | 前端→后端 | 创建工单，触发自动分配 |
| listTickets | 前端→后端 | 工单列表（筛选/搜索/排序） |
| getTicket | 前端→后端 | 工单详情 |
| updateTicket | 前端→后端 | 编辑工单字段 |
| changeTicketStatus | 前端→后端 | 状态流转 |
| addReply | 前端→后端 | 添加回复 |
| listReplies | 前端→后端 | 回复列表 |
| getSubmitterInfo | 前端→后端 | 提交人完整信息（含历史工单） |

### 2.3 工单分配模块

**职责**：业务组与成员管理、分类自动分配规则配置与执行。

**数据归属**：business_groups、business_group_members、assignment_rules 表。

**接口摘要**：

| 接口 | 方向 | 用途 |
|---|---|---|
| createBusinessGroup | 前端→后端 | 创建业务组 |
| listBusinessGroups | 前端→后端 | 业务组列表 |
| addGroupMember / removeGroupMember | 前端→后端 | 成员管理 |
| listGroupMembers | 前端→后端 | 成员列表 |
| createAssignmentRule / deleteAssignmentRule | 前端→后端 | 分配规则管理 |
| listAssignmentRules | 前端→后端 | 分配规则列表 |

**自动分配逻辑**：工单创建时，根据工单 company_id + category 匹配 assignment_rules；若命中则将工单分配到对应 business_group，状态直接进入 pending_processing 并记录 first_assigned_at；未命中则保持 pending_assignment。

### 2.4 工单协作模块

**职责**：工单转派操作，记录转派历史。

**数据归属**：ticket_transfers 表（转派记录），tickets 表（更新分配信息）。

**接口摘要**：

| 接口 | 方向 | 用途 |
|---|---|---|
| transferTicket | 前端→后端 | 转派工单到其他处理人或业务组 |

### 2.5 工单处理模块

**职责**：工单完成处理、记录处理人与处理时间、触发邮件通知；工单取消。

**数据归属**：tickets 表（completed_at、completed_by）。

**接口摘要**：

| 接口 | 方向 | 用途 |
|---|---|---|
| completeTicket | 前端→后端 | 标记完成，记录处理人/时间，通过 emailkit 发送通知邮件 |
| cancelTicket | 前端→后端 | 取消工单 |

### 2.6 用户评价模块

**职责**：工单完成后提交人满意度评价。

**数据归属**：ticket_evaluations 表。

**接口摘要**：

| 接口 | 方向 | 用途 |
|---|---|---|
| submitEvaluation | 前端→后端 | 提交满意度评价 |
| getEvaluation | 前端→后端 | 查看评价 |

### 2.7 统计分析模块

**职责**：按公司/部门维度统计工单分布，提供仪表盘运营指标。

**数据归属**：从 tickets、ticket_evaluations 表聚合查询（只读）。

**接口摘要**：

| 接口 | 方向 | 用途 |
|---|---|---|
| getDashboard | 前端→后端 | 仪表盘指标（工单量、平均响应时间、满意度、热点问题） |
| getDistribution | 前端→后端 | 工单分布（按公司/部门维度） |

**响应时间口径**：从工单创建时间到 first_assigned_at（首次分配时间）的时间差。未分配工单不计入。热点问题为按分类聚合的工单数量 Top N。

### 2.8 工单工作台模块

**职责**：待处理工单列表，支持筛选、搜索、排序，按公司维度筛选。

**数据归属**：从 tickets 表查询，按当前用户角色和公司范围过滤（只读）。

**接口摘要**：

| 接口 | 方向 | 用途 |
|---|---|---|
| getWorkbenchTickets | 前端→后端 | 待处理工单队列（筛选/搜索/排序/公司维度） |

### 2.9 审计与日志能力

**职责**：通过 auditkit 记录工单关键操作审计事件。

**数据归属**：auditkit 管理的审计事件表（项目通过 API 写入事件，不直接操作表结构）。

**接口摘要**：

| 接口 | 方向 | 用途 |
|---|---|---|
| getTicketLogs | 前端→后端 | 查看单条工单操作日志 |
| listLogs | 前端→后端 | 全局操作日志列表 |

**审计事件类型**：ticket.created、ticket.assigned、ticket.transferred、ticket.processed、ticket.completed、ticket.cancelled。

## 3. 数据模型

### 3.1 项目拥有的表

所有项目表使用 TEXT (UUID v4) 主键，由应用层生成。时间字段为 ISO 8601 文本。

**companies** — 公司（隔离边界）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| name | TEXT | NOT NULL | 公司名称 |
| created_at | TEXT | NOT NULL | 创建时间 |

**departments** — 部门

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| company_id | TEXT | FK → companies.id | 所属公司 |
| name | TEXT | NOT NULL | 部门名称 |
| created_at | TEXT | NOT NULL | |

**user_profiles** — 用户档案（关联 userkit 用户）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| user_id | TEXT | PK, FK → userkit users | 关联 userkit 用户 ID |
| company_id | TEXT | FK → companies.id | 所属公司 |
| department_id | TEXT | FK → departments.id, NULL | 所属部门（可空） |
| display_name | TEXT | NOT NULL | 显示姓名 |

**business_groups** — 业务组

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| company_id | TEXT | FK → companies.id | 所属公司 |
| name | TEXT | NOT NULL | 业务组名称 |
| created_at | TEXT | NOT NULL | |

**business_group_members** — 业务组成员

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| group_id | TEXT | FK → business_groups.id | 所属业务组 |
| user_id | TEXT | FK → userkit users | 成员用户 |
| created_at | TEXT | NOT NULL | |

**assignment_rules** — 分类自动分配规则

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| company_id | TEXT | FK → companies.id | 所属公司 |
| category | TEXT | NOT NULL | 工单分类名称 |
| business_group_id | TEXT | FK → business_groups.id | 目标业务组 |
| created_at | TEXT | NOT NULL | |

**tickets** — 工单（核心表）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| company_id | TEXT | FK → companies.id | 所属公司（隔离依据） |
| subject | TEXT | NOT NULL | 主题 |
| description | TEXT | | 描述 |
| category | TEXT | NOT NULL | 分类 |
| priority | TEXT | NOT NULL | SLA 优先级 P0-P4 |
| status | TEXT | NOT NULL | created / pending_assignment / pending_processing / completed / cancelled |
| submitter_id | TEXT | FK → userkit users | 提交人 |
| assigned_group_id | TEXT | FK → business_groups.id, NULL | 已分配业务组 |
| assigned_handler_id | TEXT | FK → userkit users, NULL | 已分配处理人 |
| completed_at | TEXT | NULL | 完成时间 |
| completed_by | TEXT | FK → userkit users, NULL | 完成处理人 |
| first_assigned_at | TEXT | NULL | 首次分配时间（响应时间计算依据） |
| created_at | TEXT | NOT NULL | 创建时间 |

**ticket_replies** — 工单回复

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| ticket_id | TEXT | FK → tickets.id | 所属工单 |
| author_id | TEXT | FK → userkit users | 回复人 |
| content | TEXT | NOT NULL | 回复内容 |
| created_at | TEXT | NOT NULL | 回复时间 |

**ticket_transfers** — 转派记录

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| ticket_id | TEXT | FK → tickets.id | 所属工单 |
| from_handler_id | TEXT | FK → userkit users, NULL | 原处理人 |
| from_group_id | TEXT | FK → business_groups.id, NULL | 原业务组 |
| to_handler_id | TEXT | FK → userkit users, NULL | 目标处理人 |
| to_group_id | TEXT | FK → business_groups.id, NULL | 目标业务组 |
| reason | TEXT | | 转派原因 |
| created_at | TEXT | NOT NULL | 转派时间 |

**ticket_evaluations** — 满意度评价

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| ticket_id | TEXT | FK → tickets.id, UNIQUE | 所属工单（一工单一评价） |
| rating | INTEGER | NOT NULL | 满意度评分 1-5 |
| comment | TEXT | NULL | 评价备注 |
| created_at | TEXT | NOT NULL | 评价时间 |

### 3.2 CommonApp 管理的表与边界

- **userkit**：管理 `users` 和 `credentials` 表，存储用户账号和密码凭证。项目通过 `user_profiles` 表关联 userkit 用户与公司/部门信息。用户邮箱从 userkit 用户记录获取。
- **authkit**：管理认证会话，不涉及业务表。
- **permissionkit**：管理 RBAC 角色与权限注册表。项目定义三个角色：`submitter`（提交人）、`handler`（处理人）、`admin`（管理员）。
- **auditkit**：管理审计事件表，项目通过 API 写入事件，不直接操作其表结构。
- **emailkit**：无持久化，仅提供 SMTP 发送能力。

### 3.3 数据库迁移

迁移 SQL 文件位于 `migrations/sqlite/` 目录，通过 `runMigrations(db, {directory: './migrations'})` 执行。版本化迁移，不使用 ORM 自动同步或手工改 schema。

## 4. 外部集成

### 4.1 邮件通知

工单完成时，通过 emailkit 向提交人邮箱发送完成通知邮件。

- **触发点**：`completeTicket` 接口成功将工单状态改为 completed 后
- **收件人**：工单提交人邮箱（从 userkit 用户信息获取）
- **发送方式**：`createEmailClient()` 配置 SMTP，发送完成通知邮件
- **失败处理**：邮件发送失败不阻断工单完成操作，记录失败日志；工单状态已变更不回滚
- **配置**：SMTP 连接参数通过环境变量配置（SMTP_HOST、SMTP_PORT、SMTP_USER、SMTP_PASS、SMTP_FROM）

## 5. UI 全局基线

### 5.1 应用模板与展示模板

- **应用/业务模板**：helpdesk（工单系统）
- **展示模板**：`split-master-detail`（列表/队列与当前记录详情协同）
- **选择依据**：工单系统核心动作是高频逐条处理记录（工单列表与详情协同），匹配 split-master-detail 模板。AC-01 至 AC-14 均围绕工单列表与详情交互。

### 5.2 视觉方向

- **视觉风格**：Modern SaaS（通用业务应用默认值）
- **设计 Token 方向**：柔和中性色、细边界、少阴影、中等圆角、清晰字体；一个主色与状态色（成功/警告/错误）；短而有反馈作用的动效

### 5.3 布局与设备策略

- **目标设备**：桌面 Web（默认）
- **应用壳**：左侧导航栏 + 顶部上下文栏 + 主工作区
- **导航项**：工单工作台、工单管理、业务组管理、统计分析、操作日志
- **主工作区**：split-master-detail 布局，左侧工单列表（队列），右侧工单详情面板

### 5.4 全局状态

- **加载态**：列表和详情区域显示骨架屏或加载指示
- **空数据**：列表无数据时显示空态提示与创建入口
- **错误态**：API 失败显示错误提示，支持重试
- **无权限**：无权限操作时禁用控件或显示提示
- **成功态**：操作成功后显示短暂成功提示并刷新数据

### 5.5 关键页面

| 页面 | 布局 | 说明 |
|---|---|---|
| 工单工作台 | split-master-detail | 待处理工单列表 + 工单详情，支持筛选/搜索/排序 |
| 工单创建 | 表单 | 主题、描述、分类、SLA 优先级选择 |
| 工单详情 | 详情面板 | 工单信息、多轮回复区、提交人完整信息、操作日志、满意度评价 |
| 业务组管理 | 列表+详情 | 业务组列表、成员管理、分类分配规则配置 |
| 统计仪表盘 | dashboard | KPI 卡片（工单量/响应时间/满意度）、工单分布图表、热点问题列表 |
| 操作日志 | 列表 | 按时间顺序的审计事件列表，支持筛选 |
