# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 后端框架 | Hono | 已由 workspace-init 脚手架生成 |
| 前端框架 | React 18 + Vite | SPA 单页应用 |
| UI 框架 | Tailwind CSS | Utility-first 样式 |
| 数据库 | SQLite (better-sqlite3) | 通过 dbkit 管理，版本化迁移 |
| 认证 | AuthKit + UserKit | 本地密码模式 (local-password)，Bearer token 认证 |
| 权限 | PermissionKit | RBAC 角色权限模型 |
| 审计 | AuditKit | 持久化操作日志 |
| 邮件 | EmailKit | SMTP 邮件发送 (nodemailer) |
| 包管理器 | npm | package-lock.json |
| 应用包根 | `app/ticket-system` | `packageRoot: app/ticket-system` |

### 1.2 CommonApp 模块

| 模块 ID | 包名 | 版本 | manifest SHA-256 | 需求匹配 | 状态 |
|---|---|---|---|---|---|
| dbkit | @commonapp/dbkit | 0.2.0 | `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6` | SQLite 持久化、迁移、事务 | wired |
| authkit | @commonapp/authkit | 0.1.2 | `a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02` | 密码登录、Bearer 认证 | wired |
| userkit | @commonapp/userkit | 0.1.0 | `40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4` | 本地用户、密码凭证存储 | wired |
| permissionkit | @commonapp/permissionkit | 0.1.0 | `09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228` | RBAC 角色权限注册表 | installed |
| auditkit | @commonapp/auditkit | 0.1.0 | `27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1` | 持久化审计事件（操作日志） | installed |
| emailkit | @commonapp/emailkit | 0.1.0 | `a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c` | SMTP 邮件发送（工单完成通知） | installed |

模块依赖闭包：dbkit（无依赖）、authkit（无依赖）、userkit → dbkit + authkit、permissionkit → dbkit、auditkit → dbkit、emailkit（无依赖）。所有模块状态为 ready，manifest 校验通过，发行文件存在。

**`commonapp install: dbkit authkit userkit permissionkit auditkit emailkit`**

### 1.3 架构拓扑

```
┌──────────────────────────────────────────────┐
│  Browser (React/Vite SPA)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ 工单工作台│ │ 工单详情  │ │ 统计仪表盘   │  │
│  │ (split-  │ │ (回复、转 │ │ (KPI、分布   │  │
│  │  master- │ │ 派、评价) │ │  、热点)     │  │
│  │  detail) │ │           │ │              │  │
│  └──────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────┐ ┌──────────┐                    │
│  │ 管理配置  │ │ 登录/认证 │                    │
│  │ (业务组、 │ │          │                    │
│  │  规则)   │ │          │                    │
│  └──────────┘ └──────────┘                    │
└───────────────────┬──────────────────────────┘
                    │ HTTP API (JSON)
┌───────────────────▼──────────────────────────┐
│  Hono Server (app/ticket-system/src/server)  │
│  ┌────────────────────────────────────────┐  │
│  │  Middleware: AuthKit Bearer 验证        │  │
│  │  Locale / Error / SPA Fallback         │  │
│  └────────────────────────────────────────┘  │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐   │
│  │工单路由  │ │管理路由  │ │统计路由      │   │
│  │(CRUD、  │ │(业务组、 │ │(分布、仪表盘)│   │
│  │ 回复、  │ │ 规则、   │ │              │   │
│  │ 转派、  │ │ 用户)   │ │              │   │
│  │ 评价)  │ │          │ │              │   │
│  └─────────┘ └──────────┘ └──────────────┘   │
│  ┌────────────────────────────────────────┐  │
│  │  Services (工单状态机、自动分配、转派)   │  │
│  └────────────────────────────────────────┘  │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐   │
│  │UserKit  │ │Permission│ │AuditKit      │   │
│  │(用户存储)│ │Kit(RBAC) │ │(操作日志)    │   │
│  └─────────┘ └──────────┘ └──────────────┘   │
│  ┌────────────────────────────────────────┐  │
│  │  EmailKit (SMTP → 提交人邮箱)           │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │  dbkit (SQLite)                        │  │
│  │  data/application.db                   │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

### 1.4 运行约定

| 项 | 值 |
|---|---|
| 常规启动 | `npm start` (在工作区根目录执行 `npm start -w ticket-system`) |
| 开发模式 | `npm run dev:server` + `npm run dev:web` |
| 构建检查 | `npm run build` (typecheck + vite build) |
| 测试 | `npm run test -w ticket-system` |
| 监听端口 | `PORT` 环境变量，默认 3000 |
| 数据库路径 | `DB_PATH` 环境变量，默认 `./data/application.db` |
| 测试数据库 | 设置 `DB_PATH=:memory:` 或指向临时路径 |
| JWT 密钥 | `JWT_SECRET` 环境变量（开发时使用默认值，生产环境必须设置） |
| SMTP 配置 | `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS` 等环境变量 |

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 模块职责

| 模块 | 职责 | 数据归属 | 依赖 |
|---|---|---|---|
| **工单管理 (Ticket)** | 工单 CRUD、多轮回复、状态机流转（创建→待分配→待处理→完成/取消）、公司隔离 | tickets, ticket_replies | dbkit, auditkit |
| **工单分配 (Assignment)** | 业务组管理、成员管理、按分类自动分配规则匹配 | business_groups, business_group_members, assignment_rules | dbkit |
| **工单协作 (Collaboration)** | 工单转派操作、转派记录 | tickets (assigned 字段更新), audit_events | dbkit, auditkit |
| **工单处理 (Processing)** | 提交人完整信息查看、处理记录、完成邮件通知 | tickets (processed_by/processed_at), emailkit | dbkit, emailkit |
| **用户评价 (Rating)** | 满意度评价记录与查询 | satisfaction_ratings | dbkit |
| **统计分析 (Analytics)** | 按公司/部门维度统计工单分布、运营仪表盘指标 | 聚合查询 tickets + users + departments | dbkit |
| **工作台 (Workbench)** | 待处理工单列表、筛选/搜索/排序 | 聚合查询 tickets | dbkit |
| **操作日志 (Audit)** | 工单生命周期关键操作日志 | audit_events | auditkit |
| **认证 (Auth)** | 登录、密码管理、用户身份解析 | users (via userkit) | authkit, userkit |
| **用户管理 (User Admin)** | 用户 CRUD、状态管理 | users (via userkit) | userkit |
| **公司组织 (Organization)** | 公司与部门管理 | companies, departments | dbkit |
| **分类管理 (Category)** | 工单分类管理 | ticket_categories | dbkit |
| **权限 (Permission)** | RBAC 角色权限校验 | roles, permissions, role_permissions, user_role_assignments | permissionkit |

### 2.2 角色与权限

| 角色 | 权限 | 对应需求角色 |
|---|---|---|
| submitter | 创建工单、回复工单、评价工单、查看自己的工单 | 提交人 |
| handler | 处理待处理工单、回复工单、转派工单、查看提交人信息、完成工单 | 处理人 |
| admin | 管理业务组/成员/分配规则、管理用户、管理公司/部门/分类、查看统计分析 | 管理员 |

角色通过 PermissionKit 的 `user_role_assignments` 表分配，支持 scope 维度（公司级别隔离）。登录时从 UserKit 解析用户角色，在路由层通过 PermissionKit 校验权限。

### 2.3 工单状态机

```
created → pending_assignment → pending_processing → completed
                 ↓                    ↓
             cancelled            cancelled
```

- **created**：工单提交后初始状态
- **pending_assignment**：等待分配到业务组或处理人
- **pending_processing**：已分配，等待处理人处理
- **completed**：处理完成，触发邮件通知
- **cancelled**：终态，待分配/待处理状态下可取消

### 2.4 接口摘要

| 模块 | 接口 | 方法 | 说明 |
|---|---|---|---|
| Auth | `/api/auth/login` | POST | 密码登录，返回 Bearer token |
| Auth | `/api/auth/me` | GET | 当前用户信息 |
| Auth | `/api/auth/password` | POST | 修改密码 |
| User Admin | `/api/admin/users` | GET/POST | 用户列表/创建 |
| User Admin | `/api/admin/users/:id` | PATCH | 更新用户 |
| User Admin | `/api/admin/users/:id/status` | PATCH | 启用/禁用 |
| User Admin | `/api/admin/users/:id/password` | POST | 重置密码 |
| Organization | `/api/companies` | GET/POST | 公司列表/创建 |
| Organization | `/api/companies/:id/departments` | GET/POST | 部门列表/创建 |
| Category | `/api/companies/:companyId/categories` | GET/POST | 分类列表/创建 |
| Business Group | `/api/companies/:companyId/groups` | GET/POST | 业务组列表/创建 |
| Business Group | `/api/groups/:id/members` | GET/POST | 成员列表/添加 |
| Business Group | `/api/groups/:id/members/:userId` | DELETE | 移除成员 |
| Assignment | `/api/companies/:companyId/assignment-rules` | GET/POST | 分配规则列表/创建 |
| Ticket | `/api/tickets` | GET/POST | 工单列表/创建 |
| Ticket | `/api/tickets/:id` | GET | 工单详情 |
| Ticket | `/api/tickets/:id/replies` | GET/POST | 回复列表/添加 |
| Ticket | `/api/tickets/:id/assign` | POST | 分配工单 |
| Ticket | `/api/tickets/:id/transfer` | POST | 转派工单 |
| Ticket | `/api/tickets/:id/complete` | POST | 完成工单（触发邮件） |
| Ticket | `/api/tickets/:id/cancel` | POST | 取消工单 |
| Ticket | `/api/tickets/:id/submitter-info` | GET | 提交人完整信息 |
| Rating | `/api/tickets/:id/rating` | GET/POST | 评价查询/提交 |
| Workbench | `/api/workbench/tickets` | GET | 工作台待处理列表 |
| Analytics | `/api/stats/distribution` | GET | 工单分布统计 |
| Analytics | `/api/stats/dashboard` | GET | 运营仪表盘 |

详细请求/响应字段、类型、错误码见 `technical-contract.md`。

### 2.5 数据模型

#### 平台表（已由 CommonApp 迁移创建）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `users` | 用户 | id(TEXT PK), name, email(UNIQUE), phone, enabled, company_id, password_hash |
| `roles` | 角色定义 | role_key(TEXT PK), name |
| `permissions` | 权限定义 | permission_key(TEXT PK), description |
| `role_permissions` | 角色权限映射 | role_key, permission_key |
| `user_role_assignments` | 用户角色分配 | user_id, role_key, scope_type, scope_id |
| `audit_events` | 审计日志 | id, occurred_at, event_type, actor_user_id, metadata_json |

#### 业务表（需新增迁移）

**companies** — 公司

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | 公司名 |
| created_at | TEXT | NOT NULL | ISO 时间 |
| updated_at | TEXT | NOT NULL | ISO 时间 |

**departments** — 部门

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| company_id | TEXT | NOT NULL REFERENCES companies(id) | 所属公司 |
| name | TEXT | NOT NULL | 部门名 |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |
| | | UNIQUE(company_id, name) | |

**ticket_categories** — 工单分类

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| company_id | TEXT | NOT NULL REFERENCES companies(id) | 所属公司 |
| name | TEXT | NOT NULL | 分类名 |
| created_at | TEXT | NOT NULL | |
| | | UNIQUE(company_id, name) | |

**business_groups** — 业务组

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| company_id | TEXT | NOT NULL REFERENCES companies(id) | 所属公司 |
| name | TEXT | NOT NULL | 组名 |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |
| | | UNIQUE(company_id, name) | |

**business_group_members** — 业务组成员

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| group_id | TEXT | NOT NULL REFERENCES business_groups(id) | |
| user_id | TEXT | NOT NULL REFERENCES users(id) | |
| created_at | TEXT | NOT NULL | |
| | | PRIMARY KEY (group_id, user_id) | |

**assignment_rules** — 自动分配规则

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| company_id | TEXT | NOT NULL REFERENCES companies(id) | |
| category_id | TEXT | NOT NULL REFERENCES ticket_categories(id) | |
| target_group_id | TEXT | NOT NULL REFERENCES business_groups(id) | |
| created_at | TEXT | NOT NULL | |
| | | UNIQUE(company_id, category_id) | |

**tickets** — 工单

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| company_id | TEXT | NOT NULL REFERENCES companies(id) | 公司隔离 |
| title | TEXT | NOT NULL | 主题 |
| description | TEXT | NOT NULL | 描述 |
| category_id | TEXT | REFERENCES ticket_categories(id) | 分类 |
| status | TEXT | NOT NULL DEFAULT 'pending_assignment' | CHECK IN (5 states) |
| priority | TEXT | NOT NULL DEFAULT 'P2' | CHECK IN (P0-P4) |
| submitter_id | TEXT | NOT NULL REFERENCES users(id) | 提交人 |
| submitter_email | TEXT | NOT NULL | 提交人邮箱（冗余，用于通知） |
| assigned_group_id | TEXT | REFERENCES business_groups(id) | 分配的业务组 |
| assigned_user_id | TEXT | REFERENCES users(id) | 当前处理人 |
| processed_by | TEXT | REFERENCES users(id) | 完成处理人 |
| processed_at | TEXT | | 完成时间 |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |

**ticket_replies** — 工单回复

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| ticket_id | TEXT | NOT NULL REFERENCES tickets(id) | |
| author_id | TEXT | NOT NULL REFERENCES users(id) | 回复人 |
| content | TEXT | NOT NULL | 回复内容 |
| created_at | TEXT | NOT NULL | 回复时间 |

**satisfaction_ratings** — 满意度评价

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| ticket_id | TEXT | NOT NULL REFERENCES tickets(id) | |
| submitter_id | TEXT | NOT NULL REFERENCES users(id) | |
| rating | INTEGER | NOT NULL | CHECK (1-5) |
| comment | TEXT | | 评价备注 |
| created_at | TEXT | NOT NULL | |
| | | UNIQUE(ticket_id) | 每单仅一次评价 |

### 2.6 数据隔离策略

- 工单按 `company_id` 隔离：查询工单时，根据当前用户所属 `company_id` 过滤，不同公司工单不可见。
- 业务组、分类、分配规则均归属 `company_id`，跨公司不可见。
- 用户表 `users.company_id` 关联所属公司，登录后从用户记录中获取公司上下文。
- 统计分析按 `company_id` 和用户 `department` 维度聚合。

## 3. UI 基线

### 3.1 展示模板

- **应用/业务模板**：`helpdesk`（工单系统）
- **展示模板 ID**：`split-master-detail`
- **选择依据**：高频逐条处理记录（工单），列表/队列与当前记录详情协同，符合工单工作台和工单详情的核心工作流。

### 3.2 视觉风格

- **视觉预设名称**：Modern SaaS
- **方向**：柔和中性色、细边界、少阴影、中等圆角、清晰字体；一个主色（靛蓝 #4F46E5）与状态色（成功绿、警告橙、危险红、中性灰）；短而有反馈作用的动效。

### 3.3 应用壳与导航

- 左侧导航栏：工单工作台、工单详情、统计分析、管理配置（业务组/规则/用户）
- 顶部上下文栏：当前用户、公司信息、登出
- 主工作区：根据页面类型呈现 split-master-detail 或仪表盘布局
- 目标设备：桌面 Web（默认 1280px+ 宽度）

### 3.4 主要页面

| 页面 | 布局 | 核心功能 |
|---|---|---|
| 工单工作台 | 左侧列表 + 右侧详情 (split-master-detail) | 待处理工单列表、筛选（公司/分类/优先级）、搜索、排序 |
| 工单详情 | 主区详情 + 侧边提交人信息 | 多轮回复、转派、完成、取消、满意度评价 |
| 统计仪表盘 | KPI 卡片 + 图表 + 明细表 | 工单量、平均响应时间、满意度、热点问题；公司/部门分布 |
| 管理配置 | 表格 + 表单 | 业务组管理、成员管理、分配规则、分类管理 |
| 登录 | 居中表单 | 邮箱密码登录 |

### 3.5 全局状态

| 状态 | 说明 |
|---|---|
| Loading | 列表和详情加载时显示骨架屏或加载指示器 |
| Empty | 空列表时显示空状态插图和引导文案 |
| Error | API 错误时显示错误提示，支持重试 |
| Success | 操作成功后显示短暂 Toast 提示 |

## 4. 外部集成

### 4.1 邮件通知

- 使用 EmailKit (nodemailer) 通过 SMTP 发送邮件。
- 触发时机：工单状态变为 `completed` 时，向 `submitter_email` 发送工单完成通知。
- SMTP 配置通过环境变量：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`。
- 邮件发送失败不阻塞工单完成流程，但记录审计日志中的失败信息。

### 4.2 审计日志

- 使用 AuditKit 记录工单生命周期关键操作。
- 记录的操作类型：`ticket.created`、`ticket.assigned`、`ticket.transferred`、`ticket.replied`、`ticket.processed`、`ticket.completed`、`ticket.cancelled`、`ticket.rated`。
- 每条记录包含 `actor_user_id`、`event_type`、`occurred_at` 和 `metadata_json`（操作上下文）。

## 5. 运行与可靠性

- 数据库迁移使用版本化 SQL 文件，通过 dbkit `runMigrations` 执行，不使用 ORM 自动同步。
- 文件数据库默认路径 `./data/application.db`，启动前自动创建父目录。
- 测试使用 `:memory:` SQLite，通过 `DB_PATH` 环境变量覆盖。
- 服务入口 `src/server/index.ts` 在 `app/ticket-system/` 范围内，无需扩大可写范围。
- 常规启动：`npm start`（或 `npm start -w ticket-system` 从根目录）；验收测试：`npm run test -w ticket-system`。
