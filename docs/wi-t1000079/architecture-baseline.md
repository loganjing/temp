# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 技术栈

新建全栈应用，后端使用 Hono（Node.js ≥ 20），前端使用 React + Vite SPA，数据库使用 SQLite（better-sqlite3），UI 框架使用 Tailwind CSS，包管理器为 npm。服务端入口为 `src/server.js`。

### 1.2 CommonApp 模块选择

复用 6 个 CommonApp 模块，覆盖认证、用户管理、权限、审计、数据库和邮件能力：

| 模块 | 版本 | 用途 | manifest SHA-256 |
|------|------|------|------------------|
| dbkit | 0.2.0 | SQLite 配置、查询、事务与版本化迁移 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 |
| authkit | 0.1.2 | Hono 密码登录、Bearer token 认证、JWT 签发 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 |
| userkit | 0.1.0 | 本地用户存储与凭证管理（依赖 dbkit + authkit） | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 |
| permissionkit | 0.1.0 | RBAC 权限注册表与范围化授权（依赖 dbkit） | 09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 |
| auditkit | 0.1.0 | 持久化审计事件记录（依赖 dbkit） | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 |
| emailkit | 0.1.0 | 可配置 SMTP 邮件发送 | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c |

依赖闭包：dbkit 无模块依赖；authkit 无模块依赖；userkit 依赖 dbkit + authkit；permissionkit 依赖 dbkit；auditkit 依赖 dbkit；emailkit 无模块依赖。全部模块状态为 `ready`，发行文件完整。

本地密码模式同时选择 authkit 和 userkit，workspace-init 生成登录页、首个账户初始化和用户管理 API。身份模式为 `local-password`。

### 1.3 数据库

使用 SQLite 文件数据库，通过 dbkit 管理。默认数据库路径 `./data/application.db`（`DB_PATH` 环境变量可覆盖）。数据库变更通过版本化 SQL 迁移文件管理，位于 `migrations/sqlite/` 目录。

CommonApp 模块自带的迁移文件：
- `0001_platform_users.sql` — users 表（userkit）
- `0002_platform_permissions.sql` — roles/permissions/role_permissions/user_role_assignments 表（permissionkit）
- `0003_platform_audit_events.sql` — audit_events 表（auditkit）

项目自有迁移文件从 `0004` 起编号。

### 1.4 运行约定

- 常规启动：`npm start`（启动 Hono 服务端 + Vite 开发服务器）
- 可配置端口：`PORT` 环境变量（默认 3000）
- 持久化数据库路径：`DB_PATH`（默认 `./data/application.db`）
- 测试数据库路径：`DB_PATH` 覆盖为隔离路径（如 `./data/test.db`）
- 邮件 SMTP 配置：通过环境变量设置（`SMTP_HOST`、`SMTP_PORT`、`SMTP_USERNAME`、`SMTP_PASSWORD`、`SMTP_FROM`）；未配置时 emailkit 返回 `skipped`，工单完成流程不受阻塞

### 1.5 工单状态机

```
created → pending_assignment → pending_processing → completed
                              ↓
                          cancelled
```

| 状态 | DB 值 | 说明 |
|------|-------|------|
| 创建 | `created` | 工单刚创建 |
| 待分配 | `pending_assignment` | 等待分类规则匹配分配 |
| 待处理 | `pending_processing` | 已分配到业务组/处理人 |
| 完成 | `completed` | 处理完成，触发邮件通知 |
| 取消 | `cancelled` | 终止处理流程 |

### 1.6 验收可重复性

- AC-07（邮件通知）：emailkit 在 SMTP 未配置时返回 `{status:'skipped', reason:'not_configured'}`，验收时检查 API 返回的邮件发送结果字段即可确认通知逻辑被触发，无需真实 SMTP。配置 SMTP 后可验证实际发送。
- 其余 AC 均为确定状态的请求/响应流程，通过 API 或 UI 直接验证。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 系统分层

```
┌─────────────────────────────────────┐
│  React/Vite SPA (Tailwind CSS)      │
│  ─ 工单工作台 / 详情 / 创建          │
│  ─ 业务组管理 / 路由规则             │
│  ─ 统计仪表盘 / 用户管理 / 登录      │
├─────────────────────────────────────┤
│  Hono API Layer (src/server.js)     │
│  ─ 工单 / 业务组 / 统计 / 用户路由   │
│  ─ 认证中间件 (authkit)             │
│  ─ 权限校验 (permissionkit)         │
├─────────────────────────────────────┤
│  CommonApp Modules                  │
│  dbkit / authkit / userkit          │
│  permissionkit / auditkit / emailkit│
├─────────────────────────────────────┤
│  SQLite (data/application.db)       │
└─────────────────────────────────────┘
```

### 2.2 模块职责

#### 认证模块（authkit + userkit）

- 提供密码登录路由 `POST /api/auth/login`（登录字段为 `email`）
- Bearer token 认证中间件，所有业务 API 经过 `requireAnyAuth`
- userkit 管理 `users` 表：id (TEXT)、name、email (UNIQUE)、phone、enabled、company_id、password_hash、created_at、updated_at
- UserStore 提供 findById / findByField / findByCredential / create / list / update / setEnabled / updatePassword

#### 权限模块（permissionkit）

- 管理 roles / permissions / role_permissions / user_role_assignments 表
- 支持范围化角色分配（scope_type + scope_id），用于公司级角色隔离
- 角色：`ticket_submitter`（工单提交人）、`ticket_handler`（工单处理人）、`business_group_admin`（业务组管理员）、`admin`（系统管理员）
- 提供 `requirePermission(userId, permissionKey)` 校验

#### 审计模块（auditkit）

- 管理 `audit_events` 表：id、occurred_at、event_type、actor_user_id、method、route、status_code、metadata_json
- 工单生命周期关键操作（创建、分配、转派、处理、完成、取消）通过 `record(event)` 记录审计事件
- 通过 `list({actorUserId, eventType})` 查询工单操作日志

#### 邮件模块（emailkit）

- `createEmailClient(config)` 创建邮件客户端
- 工单完成时调用 `send({to, subject, text/html})` 向提交人邮箱发送通知
- SMTP 未配置时返回 `{status:'skipped', reason:'not_configured'}`，不阻塞工单完成流程

#### 工单模块（项目实现）

- 工单 CRUD、状态流转、回复、分配、转派、完成、取消、评价
- 业务组管理与分类路由规则
- 工单工作台（筛选、搜索、排序）
- 统计分析（分布统计、运营仪表盘）

### 2.3 数据模型（项目自有表）

以下为项目自有迁移创建的表，与 CommonApp 模块表共存于同一 SQLite 数据库：

**companies** — 公司
| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | 公司 ID |
| name | TEXT NOT NULL | 公司名称 |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

**departments** — 部门（属于公司）
| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | 部门 ID |
| company_id | TEXT NOT NULL FK→companies(id) | 所属公司 |
| name | TEXT NOT NULL | 部门名称 |
| created_at | TEXT NOT NULL | |

**user_departments** — 用户-部门关联
| 列 | 类型 | 说明 |
|----|------|------|
| user_id | TEXT NOT NULL FK→users(id) | |
| department_id | TEXT NOT NULL FK→departments(id) | |
| PK | (user_id, department_id) | |

**tickets** — 工单
| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | 工单 ID |
| subject | TEXT NOT NULL | 主题 |
| description | TEXT | 描述 |
| category | TEXT NOT NULL | 问题分类 |
| priority | TEXT NOT NULL CHECK IN ('P0','P1','P2','P3','P4') | SLA 优先级 |
| status | TEXT NOT NULL CHECK IN ('created','pending_assignment','pending_processing','completed','cancelled') | 状态 |
| company_id | TEXT NOT NULL FK→companies(id) | 所属公司（隔离边界） |
| submitter_id | TEXT NOT NULL FK→users(id) | 提交人 |
| business_group_id | TEXT FK→business_groups(id) | 分配业务组 |
| assignee_id | TEXT FK→users(id) | 当前处理人 |
| handler_id | TEXT FK→users(id) | 完成处理人 |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | |
| handled_at | TEXT | 处理完成时间 |

**ticket_replies** — 工单回复
| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | |
| ticket_id | TEXT NOT NULL FK→tickets(id) ON DELETE CASCADE | |
| replier_id | TEXT NOT NULL FK→users(id) | 回复人 |
| content | TEXT NOT NULL | 回复内容 |
| replied_at | TEXT NOT NULL | 回复时间 |

**business_groups** — 业务组
| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | |
| company_id | TEXT NOT NULL FK→companies(id) | 所属公司 |
| name | TEXT NOT NULL | 业务组名称 |
| created_at | TEXT NOT NULL | |

**business_group_members** — 业务组成员
| 列 | 类型 | 说明 |
|----|------|------|
| group_id | TEXT NOT NULL FK→business_groups(id) ON DELETE CASCADE | |
| user_id | TEXT NOT NULL FK→users(id) | |
| created_at | TEXT NOT NULL | |
| PK | (group_id, user_id) | |

**category_routing_rules** — 分类路由规则
| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | |
| company_id | TEXT NOT NULL FK→companies(id) | |
| category | TEXT NOT NULL | 问题分类 |
| business_group_id | TEXT NOT NULL FK→business_groups(id) | 目标业务组 |
| created_at | TEXT NOT NULL | |
| UNIQUE | (company_id, category) | 每公司每分类一条规则 |

**ticket_evaluations** — 满意度评价
| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | |
| ticket_id | TEXT NOT NULL FK→tickets(id) | |
| rating | INTEGER NOT NULL CHECK (1–5) | 满意度评分 |
| comment | TEXT | 评价备注 |
| evaluated_at | TEXT NOT NULL | |
| UNIQUE | (ticket_id) | 每工单一条评价 |

### 2.4 ID 对照表

| 实体 ID | 生成方 | DB 主键类型 | 外键类型 | API JSON 类型 | 前端类型 |
|---------|--------|-------------|----------|---------------|----------|
| user.id | userkit (UUID) | TEXT | TEXT | string | string |
| company.id | 项目 (UUID) | TEXT | TEXT | string | string |
| department.id | 项目 (UUID) | TEXT | TEXT | string | string |
| ticket.id | 项目 (UUID) | TEXT | TEXT | string | string |
| business_group.id | 项目 (UUID) | TEXT | TEXT | string | string |
| audit_event.id | auditkit (UUID) | TEXT | — | string | string |

所有 ID 在数据库中统一为 TEXT 类型（UUID 字符串），API JSON 与前端均使用 string，无需类型转换。users.id 由 userkit 的 `createId` 生成，项目自有表 ID 由应用层使用 `crypto.randomUUID()` 生成。

### 2.5 接口摘要

详细字段定义见 `technical-contract.md`。

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 登录 | POST | /api/auth/login | 邮箱密码登录（authkit） |
| 当前用户 | GET | /api/auth/me | 获取当前登录用户 |
| 工单列表 | GET | /api/tickets | 按公司/状态/优先级/分类筛选、搜索、排序 |
| 工单详情 | GET | /api/tickets/:id | 含回复、提交人信息、操作日志 |
| 创建工单 | POST | /api/tickets | 自动匹配路由规则分配业务组 |
| 添加回复 | POST | /api/tickets/:id/replies | 多轮回复 |
| 转派工单 | POST | /api/tickets/:id/transfer | 转派给处理人或业务组 |
| 完成工单 | POST | /api/tickets/:id/complete | 记录处理人/时间，触发邮件 |
| 取消工单 | POST | /api/tickets/:id/cancel | 状态变为 cancelled |
| 评价工单 | POST | /api/tickets/:id/evaluation | 满意度评价（1–5 分） |
| 工单日志 | GET | /api/tickets/:id/logs | 查看工单操作日志 |
| 工作台 | GET | /api/workbench/tickets | 当前用户/公司待处理工单 |
| 公司列表 | GET | /api/companies | |
| 业务组列表 | GET | /api/companies/:companyId/business-groups | |
| 创建业务组 | POST | /api/companies/:companyId/business-groups | |
| 业务组成员 | POST | /api/business-groups/:groupId/members | 添加成员 |
| 路由规则列表 | GET | /api/companies/:companyId/routing-rules | |
| 创建路由规则 | POST | /api/companies/:companyId/routing-rules | 分类→业务组映射 |
| 分布统计 | GET | /api/stats/distribution | 按公司/部门维度统计 |
| 运营仪表盘 | GET | /api/stats/dashboard | 工单量/响应时间/满意度/热点问题 |

### 2.6 公司隔离

所有工单查询以 `tickets.company_id` 为隔离边界。当前用户的 `companyId`（来自 users 表）决定其可见数据范围：
- 提交人只能查看/操作 `company_id = currentUser.companyId` 的工单
- 处理人只能查看/操作分配到自身或所属业务组且同公司的工单
- 业务组管理员只能管理本公司的业务组和路由规则

权限通过 permissionkit 的 scope 化角色分配实现：角色分配时 `scope_type='company'`，`scope_id=companyId`。

## 3. UI 基线

### 3.1 应用模板与展示模板

- 应用/业务模板：`helpdesk`（工单系统）
- 展示模板：`split-master-detail`（列表/队列与当前记录详情协同）
- 视觉预设：Modern SaaS（柔和中性色、细边界、少阴影、中等圆角、一个主色与状态色）

### 3.2 应用壳与导航

桌面 Web 应用，左侧固定导航栏（菜单项：工单工作台、创建工单、业务组管理、统计分析、用户管理），顶部上下文栏显示当前用户与公司，主工作区为列表-详情分栏布局。

### 3.3 页面布局

| 页面 | 布局 | 说明 |
|------|------|------|
| 登录 | 居中卡片 | 邮箱+密码登录 |
| 工单工作台 | 左列表+右详情 | 待处理工单列表，支持公司/状态/优先级/分类筛选、关键词搜索、字段排序；选中工单展示详情、回复、提交人信息 |
| 创建工单 | 表单 | 主题、描述、分类、SLA 优先级选择 |
| 工单详情 | 分栏 | 工单信息+回复列表+操作区（转派/完成/取消/评价）+提交人完整信息+操作日志 |
| 业务组管理 | 左列表+右详情 | 业务组列表+成员管理+路由规则配置 |
| 统计分析 | 仪表盘 | KPI 卡片+分布图表+热点问题列表 |
| 用户管理 | 表格 | 用户列表+创建/编辑（含公司、部门设置） |

### 3.4 全局状态

- 加载中：列表/详情区域显示骨架屏或 spinner
- 空数据：显示空状态提示文案
- 错误：显示错误消息，提供重试操作
- 无权限：403 提示页面
- 成功：操作完成后短暂 toast 提示

### 3.5 设备策略

默认桌面 Web（最小宽度 1024px）。不适用窄屏/移动端。

## 4. 外部集成

### 4.1 邮件通知（emailkit）

- 触发时机：工单状态变更为 `completed` 时
- 收件人：工单提交人邮箱（`users.email`）
- 配置：通过环境变量 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USERNAME`、`SMTP_PASSWORD`、`SMTP_FROM` 配置
- 失败可见性：emailkit 返回 `{status:'sent'|'skipped'|'failed'}`，API 响应中包含邮件发送结果状态；SMTP 未配置时返回 `skipped`，工单完成流程不受阻塞；发送失败时记录审计日志，工单仍标记为完成
