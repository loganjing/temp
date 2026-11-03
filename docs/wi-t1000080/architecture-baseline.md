# 系统设计

> Work Item: wi-t1000080 | 应用: ticket-system

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 选型 | 说明 |
|---|------|------|
| 后端框架 | Hono (Node.js ESM) | 轻量 HTTP 服务，支持中间件链 |
| 前端框架 | React + Vite SPA | 单页应用，客户端路由 |
| UI 框架 | Tailwind CSS | 原子化样式，适配 SaaS 业务后台 |
| 数据库 | SQLite (better-sqlite3) | 通过 dbkit 管理连接、查询、事务与版本化迁移 |
| 认证 | authkit + userkit (local-password) | 本地密码登录，Bearer Token 认证 |
| 审计日志 | auditkit | 持久化审计事件，敏感字段脱敏 |
| 邮件通知 | emailkit (nodemailer SMTP) | 工单完成时向提交人发送通知邮件 |
| 包管理 | npm | package-lock.json 锁定依赖 |

### CommonApp 模块选择

| 模块 ID | 包/版本 | manifest SHA-256 | 需求匹配 | 集成边界 |
|---------|---------|------------------|----------|----------|
| dbkit | @commonapp/dbkit@0.2.0 | sha256:f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | 工单、用户、业务组等持久化数据存储 | 提供 createDb/createDbConfig/runMigrations，项目通过 migrations/sqlite/ 管理 schema |
| authkit | @commonapp/authkit@0.1.2 | sha256:a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | 登录认证、Bearer Token 校验 | 提供 createAuth，集成到 Hono 中间件链 |
| userkit | @commonapp/userkit@0.1.0 | sha256:40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 本地用户管理、密码凭证存储 | 提供 createUserStore/createUserResolver，依赖 dbkit+authkit |
| auditkit | @commonapp/auditkit@0.1.0 | sha256:27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 工单操作日志记录（AC-14） | 提供 createAuditKit，依赖 dbkit，项目调用 recordEvent 写入审计事件 |
| emailkit | @commonapp/emailkit@0.1.0 | sha256:a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | 工单完成邮件通知（AC-09） | 提供 createEmailClient，依赖 nodemailer，SMTP 配置通过环境变量 |

未选择 permissionkit：需求未规定具体权限模型（RBAC/ACL），三种角色（提交人/处理人/管理员）通过项目级角色字段和路由守卫实现，无需引入额外 RBAC 注册表。

### 运行约定

| 项目 | 值 |
|------|-----|
| 常规启动 | `npm start`（启动 Hono 服务，默认端口 3000） |
| 前端开发 | `npm run dev`（Vite dev server，默认端口 5173，代理 /api 到后端） |
| 构建 | `npm run build`（Vite 构建前端静态资源） |
| 监听端口 | `PORT` 环境变量，默认 3000 |
| 数据库路径 | `DB_PATH` 环境变量，默认 `./data/ticket-system.db`；打开前创建父目录 |
| 测试数据库 | 验证时通过 `DB_PATH=./data/test.db` 覆盖，使用空闲端口 |
| SMTP 配置 | `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`；未配置时记录警告并跳过发送（开发/测试环境降级） |
| 数据库迁移 | `migrations/sqlite/` 目录下版本化 SQL 文件，通过 `runMigrations(db, {directory: './migrations'})` 执行 |

### 工单生命周期状态机

```
created → pending_assignment → pending_processing → completed
                ↓                      ↓
             cancelled             cancelled
```

- `created → pending_assignment`：工单提交后立即进入待分配
- `pending_assignment → pending_processing`：自动分类规则匹配或手动分配到业务组后进入待处理
- `pending_processing → completed`：处理人完成处理，记录处理人和处理时间，触发邮件通知
- `pending_assignment / pending_processing → cancelled`：工单可被取消
- 转派（transfer）：`pending_processing → pending_processing`，更换处理人或业务组，状态不变
- 不可从 `completed` 或 `cancelled` 状态再流转

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 系统架构

```
┌─────────────────────────────────────────────┐
│              React + Vite SPA               │
│  ┌──────┬──────┬──────┬──────┬──────┬─────┐ │
│  │工作台│工单详情│创建工单│业务组 │路由规则│统计 │ │
│  └──┬───┴──┬───┴──┬───┴──┬───┴──┬───┴──┬──┘ │
│     │      │      │      │      │      │    │
│     └──────┴───┬──┴──────┴──────┴──────┘    │
│                │ fetch /api/*                │
└────────────────┼────────────────────────────┘
                 │
┌────────────────┼────────────────────────────┐
│           Hono Server (Node.js)             │
│  ┌─────────────┴──────────────────────────┐ │
│  │          Auth Middleware (authkit)      │ │
│  │    Bearer Token → 当前用户上下文        │ │
│  └─────────────┬──────────────────────────┘ │
│  ┌──────┬──────┼──────┬──────┬──────┬─────┐ │
│  │ Auth │Ticket│Assign │Stats │Audit │Email│ │
│  │Module│Module│Module │Module│Module│Svc  │ │
│  └──┬───┴──┬───┴──┬───┴──┬───┴──┬───┴──┬──┘ │
│     │      │      │      │      │      │    │
│  ┌──┴──────┴──────┴──────┴──────┴──────┴──┐ │
│  │           dbkit (SQLite)               │ │
│  │  tickets · users · companies · groups  │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 模块职责与接口摘要

#### 2.1 Auth 模块（authkit + userkit）

**职责**：用户注册、登录认证、Bearer Token 校验、当前用户上下文注入。

**接口摘要**：
- `POST /api/auth/login` — 密码登录，返回 Bearer Token
- `POST /api/auth/register` — 注册用户（首个用户免认证，后续需登录）
- `GET /api/auth/me` — 返回当前用户信息及关联的公司/部门/角色
- `POST /api/auth/logout` — 登出

**数据归属**：userkit 管理 users 表（id, username, password_hash 等）；项目扩展 user_profiles 表存储公司/部门/角色关联。

#### 2.2 Ticket 模块

**职责**：工单 CRUD、生命周期状态流转、多轮回复、提交人信息查看、满意度评价。

**接口摘要**：
- `POST /api/tickets` — 创建工单（触发自动分配规则匹配）
- `GET /api/tickets` — 工单列表（支持筛选/搜索/排序）
- `GET /api/tickets/:id` — 工单详情（含提交人完整信息、历史工单、回复列表、操作日志）
- `POST /api/tickets/:id/replies` — 添加回复
- `POST /api/tickets/:id/complete` — 完成工单（记录处理人/时间，触发邮件通知）
- `POST /api/tickets/:id/cancel` — 取消工单
- `POST /api/tickets/:id/evaluation` — 提交满意度评价
- `GET /api/tickets/:id/evaluation` — 查看评价

**数据归属**：tickets 表（工单主表）、ticket_replies 表（回复）、ticket_evaluations 表（评价）。所有查询按 company_id 隔离。

#### 2.3 Assignment 模块

**职责**：业务组管理、成员管理、分类分配规则配置、工单自动分配与手动分配、工单转派。

**接口摘要**：
- `GET /api/business-groups` — 查询公司下业务组列表
- `POST /api/business-groups` — 创建业务组
- `POST /api/business-groups/:id/members` — 添加成员
- `DELETE /api/business-groups/:id/members/:profileId` — 移除成员
- `GET /api/routing-rules` — 查询分类分配规则
- `POST /api/routing-rules` — 创建分类分配规则
- `POST /api/tickets/:id/assign` — 手动分配工单到业务组
- `POST /api/tickets/:id/transfer` — 转派工单

**数据归属**：business_groups 表、business_group_members 表、category_routing_rules 表、ticket_transfers 表。自动分配在工单创建时同步执行：查询匹配 company_id + category 的路由规则，命中则分配到目标业务组并转入 pending_processing。

#### 2.4 Statistics 模块

**职责**：按公司/部门维度统计工单分布，运营仪表盘指标聚合。

**接口摘要**：
- `GET /api/statistics/distribution` — 工单分布统计（按公司/部门维度）
- `GET /api/statistics/dashboard` — 仪表盘指标（工单量、平均响应时间、满意度、热点问题分类）

**数据归属**：通过 SQL 聚合查询 tickets、ticket_evaluations 表计算，不持久化中间结果。

#### 2.5 Audit 模块（auditkit）

**职责**：记录和查询工单全生命周期操作日志。

**接口摘要**：
- `GET /api/tickets/:id/logs` — 查询工单操作日志

**数据归属**：audit_events 表（由 auditkit 管理）。在工单创建、分配、转派、完成、取消等关键操作后调用 `auditKit.recordEvent()` 写入审计事件，记录操作人、操作类型、操作时间和上下文。

#### 2.6 Email 通知服务（emailkit）

**职责**：工单完成时向提交人邮箱发送完成通知邮件。

**接口摘要**：内部服务，无独立 HTTP 端点。在 Ticket 模块完成操作中调用 `emailClient.send()`。

**失败可见性**：SMTP 未配置或发送失败时，记录错误日志但不阻塞工单完成流程（降级策略）。审计日志中记录邮件发送结果。

### 公司隔离机制

- 用户登录后，Auth 中间件解析 Bearer Token 并注入当前用户上下文（含 company_id 和 role）。
- 所有涉及公司范围数据的查询（工单、业务组、路由规则、统计）均在 WHERE 条件中附加 `company_id = currentUser.companyId`。
- 管理员仅能管理本公司的业务组和路由规则。
- 工单创建时自动绑定提交人的 company_id。

## 3. UI 基线

### 应用/业务模板

`helpdesk` — 工单管理后台，核心动作为高频逐条处理工单记录。

### 展示模板

`split-master-detail` — 左侧工单列表与右侧当前工单详情协同，列表/队列与详情面板并置。工单工作台和工单详情页共用此布局。

### 视觉风格

Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色（蓝）与状态色（绿/黄/红/灰）、短且有反馈作用的动效。

### 应用壳与导航

- 左侧固定导航栏：工作台、创建工单、业务组管理、路由规则、统计分析
- 顶部上下文栏：当前用户信息、公司名称、登出
- 主工作区：根据路由渲染对应页面

### 主要页面工作流

| 页面 | 路由 | 说明 |
|------|------|------|
| 登录 | /login | 用户名密码登录 |
| 工单工作台 | / | 待处理工单列表，支持公司筛选、关键词搜索、字段排序；点击工单进入详情 |
| 工单详情 | /tickets/:id | 左侧工单信息+提交人完整信息+历史工单；右侧回复列表+操作区（分配/转派/完成/取消/评价） |
| 创建工单 | /tickets/new | 表单：主题、描述、分类、SLA优先级 |
| 业务组管理 | /admin/groups | 业务组列表+成员管理 |
| 路由规则管理 | /admin/routing-rules | 分类→业务组映射规则配置 |
| 统计分析 | /statistics | 工单分布图表+运营仪表盘指标卡片 |

### 全局状态

- **加载中**：列表和详情页显示骨架屏或加载指示器
- **空数据**：列表无数据时显示空状态提示和引导操作
- **错误**：API 失败时显示错误提示，支持重试
- **无权限**：非授权角色访问管理页面时显示无权限提示
- **成功**：操作成功后显示短暂成功提示并刷新数据

### 目标设备

桌面 Web（最小宽度 1024px），不专门适配窄屏。

## 4. 数据模型

### 项目表结构

以下为项目自有表（userkit 管理的 users 表除外）：

**companies**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID v4 |
| name | TEXT NOT NULL | 公司名称 |
| created_at | TEXT NOT NULL | ISO 时间戳 |

**departments**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID v4 |
| company_id | TEXT NOT NULL FK→companies.id | 所属公司 |
| name | TEXT NOT NULL | 部门名称 |
| created_at | TEXT NOT NULL | ISO 时间戳 |

**user_profiles**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID v4，profile 主键 |
| user_id | TEXT NOT NULL FK→users.id | 关联 userkit 用户 |
| company_id | TEXT NOT NULL FK→companies.id | 所属公司 |
| department_id | TEXT FK→departments.id | 所属部门（可空） |
| display_name | TEXT NOT NULL | 姓名 |
| email | TEXT NOT NULL | 邮箱 |
| role | TEXT NOT NULL | 角色：submitter / handler / admin |
| created_at | TEXT NOT NULL | ISO 时间戳 |

**tickets**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID v4，工单ID |
| company_id | TEXT NOT NULL FK→companies.id | 所属公司（隔离） |
| submitter_profile_id | TEXT NOT NULL FK→user_profiles.id | 提交人 |
| subject | TEXT NOT NULL | 主题 |
| description | TEXT | 描述 |
| category | TEXT NOT NULL | 问题分类 |
| sla_priority | TEXT NOT NULL | SLA优先级 P0-P4 |
| status | TEXT NOT NULL DEFAULT 'pending_assignment' | 生命周期状态 |
| assigned_group_id | TEXT FK→business_groups.id | 分配到的业务组 |
| assigned_handler_id | TEXT FK→user_profiles.id | 当前处理人 |
| created_at | TEXT NOT NULL | 创建时间 |
| completed_at | TEXT | 完成时间 |
| completed_by | TEXT FK→user_profiles.id | 完成处理人 |

**ticket_replies**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID v4 |
| ticket_id | TEXT NOT NULL FK→tickets.id | 关联工单 |
| replier_profile_id | TEXT NOT NULL FK→user_profiles.id | 回复人 |
| content | TEXT NOT NULL | 回复内容 |
| created_at | TEXT NOT NULL | 回复时间 |

**business_groups**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID v4 |
| company_id | TEXT NOT NULL FK→companies.id | 所属公司 |
| name | TEXT NOT NULL | 业务组名称 |
| created_at | TEXT NOT NULL | 创建时间 |

**business_group_members**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID v4 |
| group_id | TEXT NOT NULL FK→business_groups.id | 所属业务组 |
| profile_id | TEXT NOT NULL FK→user_profiles.id | 成员 |
| created_at | TEXT NOT NULL | 加入时间 |

**category_routing_rules**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID v4 |
| company_id | TEXT NOT NULL FK→companies.id | 所属公司 |
| category | TEXT NOT NULL | 问题分类 |
| target_group_id | TEXT NOT NULL FK→business_groups.id | 目标业务组 |
| created_at | TEXT NOT NULL | 创建时间 |

**ticket_transfers**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID v4 |
| ticket_id | TEXT NOT NULL FK→tickets.id | 关联工单 |
| from_profile_id | TEXT NOT NULL FK→user_profiles.id | 转派人 |
| to_group_id | TEXT FK→business_groups.id | 目标业务组（可空，二选一） |
| to_profile_id | TEXT FK→user_profiles.id | 目标处理人（可空，二选一） |
| created_at | TEXT NOT NULL | 转派时间 |

**ticket_evaluations**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID v4 |
| ticket_id | TEXT NOT NULL FK→tickets.id | 关联工单（唯一约束） |
| evaluator_profile_id | TEXT NOT NULL FK→user_profiles.id | 评价人 |
| satisfaction_score | INTEGER NOT NULL | 满意度评分 1-5 |
| comment | TEXT | 评价备注 |
| created_at | TEXT NOT NULL | 评价时间 |

**audit_events**（auditkit 管理）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 审计事件ID |
| actor_id | TEXT | 操作人 profile_id |
| action | TEXT | 操作类型（ticket.created, ticket.assigned, ticket.transferred, ticket.completed, ticket.cancelled） |
| target_id | TEXT | 目标工单ID |
| target_type | TEXT | 固定 'ticket' |
| metadata | TEXT (JSON) | 操作上下文（转派目标、分配组等） |
| created_at | TEXT | 操作时间 |

### 事务边界

- **工单创建**：INSERT ticket → 匹配路由规则 → UPDATE assigned_group_id/status → INSERT audit_event（单事务）
- **工单完成**：UPDATE status/completed_at/completed_by → INSERT audit_event → 发送邮件（邮件在事务外异步执行，失败不回滚）
- **工单转派**：INSERT transfer record → UPDATE assigned_group_id/assigned_handler_id → INSERT audit_event（单事务）

## 5. 外部集成

### 邮件通知（emailkit）

- 触发时机：工单状态变更为 `completed` 时
- 收件人：工单提交人邮箱（user_profiles.email）
- SMTP 配置通过环境变量：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`
- 未配置 SMTP 时：记录警告日志，跳过发送，不阻塞工单完成
- 发送失败时：记录错误日志，审计日志中记录邮件发送失败，工单仍保持完成状态
- 验证环境降级：测试时可通过环境变量配置本地 SMTP 模拟器或验证发送日志

## 6. 验证可重复性

| AC | 验证方式 |
|----|----------|
| AC-06（自动分配） | 预置分类路由规则，创建该分类工单后直接检查工单 status 和 assigned_group_id |
| AC-09（邮件通知） | 配置测试 SMTP 或检查邮件发送日志；工单完成后验证邮件发送动作被调用 |
| AC-04（状态流转） | 按状态机依次操作，每步检查 status 值；验证不可从 completed/cancelled 流转 |

## 7. 模块安装标记

| 模块 | 安装命令 |
|------|----------|
| dbkit | commonapp install: dbkit |
| authkit | commonapp install: authkit |
| userkit | commonapp install: userkit |
| auditkit | commonapp install: auditkit |
| emailkit | commonapp install: emailkit |
