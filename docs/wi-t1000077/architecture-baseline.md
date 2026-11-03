# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 选型 | 说明 |
|---|------|------|
| 后端框架 | Hono (Node.js ≥ 20) | REST API 服务 |
| 前端框架 | React + Vite | SPA 单页应用 |
| UI 框架 | Tailwind CSS | 实用优先的 CSS 框架 |
| 包管理器 | npm | |
| 数据库 | SQLite (via dbkit) | 文件数据库，支持迁移 |
| 运行时 | Node.js ≥ 20 | ESM 模块 |

### CommonApp 模块选择

| 模块 | 版本 | 包名 | SHA-256 | 需求匹配 | 集成边界 |
|------|------|------|---------|----------|----------|
| dbkit | 0.2.0 | @commonapp/dbkit | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | SQLite 持久化、查询、事务、迁移 | 全量数据库操作入口 |
| authkit | 0.1.2 | @commonapp/authkit | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | 用户认证、Bearer 会话 | Hono 中间件，保护全部业务路由 |
| userkit | 0.1.0 | @commonapp/userkit | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 本地用户、密码凭证 | 管理用户表（id TEXT, name, email, company_id TEXT）与密码；项目不创建独立 user_profiles 表 |
| permissionkit | 0.1.0 | @commonapp/permissionkit | 09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 | RBAC 角色授权 | 定义 submitter/handler/admin 角色与权限检查 |
| auditkit | 0.1.0 | @commonapp/auditkit | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 操作日志审计 | 记录工单生命周期关键操作 |
| emailkit | 0.1.0 | @commonapp/emailkit | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | SMTP 邮件发送 | 工单完成时通知提交人 |

- `identityMode`: `local-password`（authkit + userkit 本地密码模式）
- 模块依赖闭包：dbkit ← {permissionkit, auditkit, userkit}；authkit ← userkit；emailkit 独立。全部通过 manifest 校验，状态 ready。
- `commonapp install: dbkit authkit userkit permissionkit auditkit emailkit`

### 架构概览

```
┌─────────────────────────────────────────────┐
│              React + Vite SPA               │
│  (工单工作台 / 详情 / 管理 / 仪表盘 / 日志)    │
└──────────────────┬──────────────────────────┘
                   │ REST API (JSON)
┌──────────────────┴──────────────────────────┐
│              Hono API Server                │
│  ┌─────────┐ ┌──────────┐ ┌────────────┐    │
│  │  Auth   │ │ Company  │ │ Permission │    │
│  │   MW    │ │ Scope MW │ │     MW     │    │
│  └─────────┘ └──────────┘ └────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │         Route Handlers              │    │
│  │  tickets│workbench│stats│org│users  │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │         Services                    │    │
│  │  ticket│assignment│email│statistics │    │
│  └─────────────────────────────────────┘    │
└───┬──────┬──────┬──────┬──────┬──────┬─────┘
    │      │      │      │      │      │
 dbkit  authkit userkit perm  audit  email
    │      │      │      │      │      │
    ▼      │      │      │      │      ▼
 SQLite   ◄──────┴──────┴──────┘     SMTP
```

### 数据权威与公司隔离

- SQLite 是唯一权威数据存储，通过 dbkit 管理连接、查询、事务和迁移。
- **公司隔离**在应用层强制：每个请求经 Company Scope 中间件注入当前用户所属 `company_id`，所有业务查询自动按 `company_id` 过滤。管理员（admin 角色）可跨公司查询，通过显式 `company_id` 查询参数控制范围。
- 用户认证由 authkit 管理，用户凭证由 userkit 管理，用户业务属性（name、email、company_id）已包含在 userkit 的 `users` 表中（id TEXT PK）。角色通过 permissionkit 的 `user_role_assignments` 管理。项目不创建独立 user_profiles 表。所有项目表的主键和外键均使用 TEXT 类型，与平台一致。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 认证与用户模块

**职责**：用户登录、会话管理、用户凭证存储。

**数据归属**：
- `users` 表（userkit 管理）：id TEXT PK, name TEXT, email TEXT UNIQUE, phone TEXT, company_id TEXT, password_hash TEXT, enabled INTEGER, password_change_required INTEGER, created_at TEXT, updated_at TEXT
- 角色通过 permissionkit 的 `user_role_assignments` 表管理（user_id TEXT, role_key TEXT）
- 项目不创建独立 user_profiles 表——userkit 的 users 表已包含 name、email、company_id 业务字段；department 关联通过项目 departments 表间接查询

**接口摘要**：
- `POST /api/auth/login` — 用户登录（email + password），返回 Bearer Token 和扁平用户对象
- `POST /api/auth/logout` — 注销会话
- `GET /api/auth/me` — 获取当前用户信息（扁平结构：id, name, email, companyId, roles, passwordChangeRequired）
- `GET /api/users/:userId` — 获取指定用户档案（处理人查看提交人信息）
- `GET /api/users/:userId/tickets` — 获取用户历史工单列表

### 2.2 组织管理模块

**职责**：公司、部门、业务组、工单分类、分类分配规则的管理。

**数据归属**：
- `companies`（项目拥有）：id TEXT PK, name TEXT, created_at TEXT
- `departments`（项目拥有）：id TEXT PK, company_id TEXT FK, name TEXT, created_at TEXT
- `business_groups`（项目拥有）：id TEXT PK, company_id TEXT FK, name TEXT, created_at TEXT
- `business_group_members`（项目拥有）：id TEXT PK, business_group_id TEXT FK, user_id TEXT FK, created_at TEXT
- `ticket_categories`（项目拥有）：id TEXT PK, company_id TEXT FK, name TEXT, created_at TEXT
- `category_assignment_rules`（项目拥有）：id TEXT PK, company_id TEXT FK, category_id TEXT FK, business_group_id TEXT FK, created_at TEXT

**接口摘要**：
- `GET /api/business-groups` — 按公司查询业务组列表（含成员）
- `POST /api/business-groups` — 创建业务组（admin）
- `POST /api/business-groups/:groupId/members` — 添加业务组成员（admin）
- `DELETE /api/business-groups/:groupId/members/:userId` — 移除业务组成员（admin）
- `GET /api/categories` — 按公司查询工单分类
- `POST /api/categories` — 创建工单分类（admin）
- `GET /api/assignment-rules` — 按公司查询分类分配规则
- `POST /api/assignment-rules` — 创建分类→业务组映射规则（admin）

### 2.3 工单模块

**职责**：工单创建（含自动分配）、查询、详情、回复、转派、处理、完成（含邮件通知）、取消。

**数据归属**：
- `tickets`（项目拥有）：id TEXT PK, title TEXT, description TEXT, category_id TEXT FK, company_id TEXT FK, submitter_id TEXT FK, sla_priority TEXT, status TEXT, business_group_id TEXT FK, handler_id TEXT FK, created_at TEXT, assigned_at TEXT, processed_at TEXT, completed_at TEXT, cancelled_at TEXT
- `ticket_replies`（项目拥有）：id TEXT PK, ticket_id TEXT FK, replier_id TEXT FK, content TEXT, created_at TEXT
- `ticket_transfers`（项目拥有）：id TEXT PK, ticket_id TEXT FK, from_business_group_id TEXT FK, to_business_group_id TEXT FK, transferred_by TEXT FK, reason TEXT, created_at TEXT
- `ticket_satisfactions`（项目拥有）：id TEXT PK, ticket_id TEXT FK, rating INTEGER, comment TEXT, created_at TEXT

**接口摘要**：
- `POST /api/tickets` — 创建工单（自动按分类规则分配业务组）
- `GET /api/tickets` — 工单列表（支持筛选/搜索/排序）
- `GET /api/tickets/:ticketId` — 工单详情（含回复列表、提交人信息、处理记录）
- `POST /api/tickets/:ticketId/replies` — 添加回复
- `POST /api/tickets/:ticketId/transfer` — 转派工单到其他业务组
- `POST /api/tickets/:ticketId/complete` — 标记完成（触发邮件通知）
- `POST /api/tickets/:ticketId/cancel` — 取消工单
- `POST /api/tickets/:ticketId/satisfaction` — 提交满意度评价

### 2.4 工单工作台模块

**职责**：待处理工单列表的筛选、搜索、排序展示。

**接口摘要**：
- `GET /api/workbench/tickets` — 待处理工单列表，支持 company/status/priority/category 筛选、关键词搜索、字段排序

### 2.5 统计分析模块

**职责**：按公司/部门维度统计工单分布，计算运营指标。

**接口摘要**：
- `GET /api/statistics/distribution` — 按公司/部门维度的工单分布统计
- `GET /api/statistics/dashboard` — 运营仪表盘指标（工单量、平均响应时间、满意度、热点问题）

### 2.6 操作日志模块

**职责**：记录和查询工单生命周期操作日志。

**数据归属**：
- audit_event 表（auditkit 管理）：持久化审计事件

**接口摘要**：
- `GET /api/logs` — 查询操作日志（支持按工单、操作类型、时间范围筛选）

### 2.7 邮件通知模块

**职责**：工单完成时发送邮件通知提交人。

**集成方式**：通过 emailkit 的 `createEmailClient` 创建 SMTP 客户端，在工单完成服务中调用发送。邮件内容模板为基本通知格式（工单标题、完成时间、处理人），模板细节未在需求中规定，保持可配置。

## 3. 数据模型

### 实体关系

```
companies 1───* departments
companies 1───* business_groups 1───* business_group_members *───1 users
companies 1───* ticket_categories 1───* category_assignment_rules *───1 business_groups
companies 1───* tickets *───1 ticket_categories
tickets   1───* ticket_replies *───1 users
tickets   1───* ticket_transfers
tickets   1───1 ticket_satisfactions
users     1───* tickets (submitter)
users     1───* tickets (handler)
```

### 关键约束

- `tickets.company_id` 与 `submitter_id` 对应的用户公司一致，隔离边界。
- `tickets.status` 枚举：`created`、`pending_assignment`、`pending_processing`、`completed`、`cancelled`。
- `tickets.sla_priority` 枚举：`P0`、`P1`、`P2`、`P3`、`P4`。
- `ticket_satisfactions.rating` 范围：1-5（1=非常不满意，5=非常满意）。需求未规定评分维度与分值范围，此为设计基线，可调整。
- `category_assignment_rules` 中 `category_id` + `company_id` 唯一，一个分类对应一个业务组。
- 操作日志由 auditkit 持久化，覆盖：创建、分配、转派、处理、完成、取消、评价。

### 迁移策略

- 使用 dbkit 的 `runMigrations(db, {directory: './migrations'})`。
- SQL 迁移文件位于 `src/server/migrations/sqlite/`，编号从 0004 开始（0001-0003 为平台模块迁移），版本化递增（0004_init_business.sql, 0005_*.sql, ...）。
- 不通过 ORM 自动同步 schema，所有 schema 变更通过迁移文件。

## 4. UI 全局基线

| 维度 | 选择 | 依据 |
|------|------|------|
| 应用/业务模板 | helpdesk | 工单系统是典型 helpdesk 场景 |
| 展示模板 | split-master-detail | 高频逐条处理记录（工单），列表/队列与当前记录详情协同 |
| 视觉风格 | Modern SaaS | 通用业务应用默认，柔和中性色、细边界、少阴影、清晰字体、一个主色与状态色 |
| 目标设备 | 桌面 Web | 需求未明确要求移动端 |

### 应用壳与导航

- 左侧固定导航栏：工单工作台、创建工单、统计分析、业务组管理（admin）、分类与规则管理（admin）、操作日志
- 顶部上下文栏：当前用户信息、公司名称、角色标识
- 主工作区：根据路由切换

### 主工作流布局

**工单工作台（split-master-detail）**：
- 左侧：待处理工单列表，支持公司筛选（admin）、状态筛选、优先级筛选、分类筛选、关键词搜索、列头排序
- 右侧：选中工单的详情面板，包含工单基本信息、提交人信息（姓名/公司/部门/历史工单）、回复列表、处理操作区（回复/转派/完成/取消）、满意度评价区

**统计分析仪表盘**：
- 顶部筛选：公司维度、部门维度、时间范围
- KPI 卡片行：工单量、平均响应时间、平均满意度
- 图表区：工单分布（按公司/部门柱状图）、热点问题（按分类聚合 Top N）、满意度趋势

### 全局状态

- **加载中**：列表和详情区域显示骨架屏或加载指示器
- **空数据**：列表无数据时显示空状态文案和创建入口
- **错误**：API 失败时显示错误提示，可重试
- **无权限**：非 admin 角色访问管理页面时显示无权限提示
- **成功**：操作成功后显示轻量 toast 提示

## 5. 外部集成

### 邮件通知（emailkit）

- **触发时机**：工单状态变为 `completed` 时
- **收件人**：提交人邮箱（users.email，通过 userkit 查询）
- **发送方式**：emailkit 的 `createEmailClient` 创建 SMTP 客户端
- **内容模板**：基本通知格式，包含工单标题、工单ID、完成时间、处理人姓名。模板细节未在需求中规定，使用默认模板，后续可配置。
- **失败可见性**：邮件发送失败不阻塞工单完成流程，记录错误日志；审计日志记录通知发送状态。

## 6. 运行与校验

### 启动命令

| 命令 | 用途 |
|------|------|
| `npm start` | 常规启动（生产模式） |
| `npm run dev` | 开发模式（前后端热更新） |
| `npm run migrate` | 执行数据库迁移 |

### 环境配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | API 服务监听端口 |
| `DB_PATH` | `./data/application.db` | SQLite 数据库文件路径 |
| `SMTP_HOST` | — | SMTP 服务器地址 |
| `SMTP_PORT` | 587 | SMTP 端口 |
| `SMTP_USER` | — | SMTP 用户名 |
| `SMTP_PASS` | — | SMTP 密码 |

- 数据库父目录在打开前自动创建。
- 验证时使用空闲端口和独立的 `DB_PATH` 测试数据库路径。
- 干净目录无需手动创建 data 目录即可启动。
