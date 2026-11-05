# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 后端框架 | Hono (Node.js ≥20, ESM) | REST API，Bearer 认证 |
| 前端框架 | React 18 + Vite 5 SPA | 单页应用，Ant Design 组件库 |
| 数据库 | SQLite (better-sqlite3) | 通过 dbkit 管理查询、事务与版本化迁移 |
| 认证 | AuthKit + UserKit | 本地密码认证，JWT Bearer Token |
| 授权 | PermissionKit | RBAC 角色权限，公司维度隔离 |
| 审计日志 | AuditKit | 操作日志持久化 |
| 邮件通知 | EmailKit | SMTP 邮件发送 |

### CommonApp 模块选型

| 模块 ID | 包名/版本 | manifest SHA-256 | 需求匹配 | 集成边界 |
|---|---|---|---|---|
| dbkit | @commonapp/dbkit@0.2.0 | sha256:f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | 工单、公司、业务组等核心数据持久化、事务、迁移 | 服务端 bootstrap 初始化，迁移目录 `src/server/migrations/sqlite/` |
| authkit | @commonapp/authkit@0.1.2 | sha256:a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | 用户认证（登录、Token 签发与校验） | `src/server/platform/auth.ts` 绑定认证中间件 |
| userkit | @commonapp/userkit@0.1.0 | sha256:40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 本地用户管理、密码凭证 | 依赖 dbkit + authkit，`users` 表由迁移 0001 创建 |
| permissionkit | @commonapp/permissionkit@0.1.0 | sha256:09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 | RBAC 角色权限，支撑公司隔离 | 依赖 dbkit，迁移 0002 创建权限表 |
| auditkit | @commonapp/auditkit@0.1.0 | sha256:27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 工单操作日志（创建、分配、转派、完成、取消） | 依赖 dbkit，迁移 0003 创建 `audit_events` 表 |
| emailkit | @commonapp/emailkit@0.1.0 | sha256:a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | 工单完成邮件通知提交人 | 无数据库依赖，SMTP 配置通过环境变量 |

> 未选模块：attachment（需求无附件上传）、i18n（需求无国际化要求）。

### 角色与权限

使用 PermissionKit 定义以下角色和权限：

| 角色 | 权限 | 说明 |
|---|---|---|
| ticket_submitter | ticket.create, ticket.reply, ticket.evaluate, ticket.cancel | 工单提交人 |
| ticket_handler | ticket.reply, ticket.assign, ticket.transfer, ticket.complete, ticket.cancel, ticket.view_workbench | 工单处理人 |
| ticket_admin | ticket.manage_groups, ticket.manage_rules, ticket.view_statistics, ticket.view_workbench, 上述处理权限 | 业务组/规则管理员 |

权限通过 `user_role_assignments` 表的 `scope_type='company'` + `scope_id=<company_id>` 实现公司维度隔离。一个用户在某公司的角色决定其可访问该公司范围内的工单数据。

### 工单生命周期状态机

```
created → pending_assignment → pending_processing → completed
                                    ↘ cancelled
```

- `created`：工单创建瞬间状态，立即转入 `pending_assignment`。
- `pending_assignment`：等待分类自动分配或手动分配。
- `pending_processing`：已分配到业务组/处理人，待处理。
- `completed`：处理人标记完成，终态不可逆。
- `cancelled`：从 `pending_assignment` 或 `pending_processing` 取消，终态不可逆。

### UI 全局基线

- **应用/业务模板**：helpdesk
- **展示模板**：`split-master-detail` — 工单列表（master）与当前工单详情（detail）并列协同
- **视觉风格**：Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、一个主色与状态色
- **组件体系**：Ant Design（`antd` + `@ant-design/icons`），实现阶段作为 npm 依赖安装；脚手架 `uiFramework` 为 `none`，Ant Design 自带样式系统
- **布局策略**：深色左侧导航栏 + 浅色工作区 + 顶部上下文栏（标题与主操作）；主工作区为列表/详情分栏；工单详情采用独立页（含回复时间线、提交人信息、操作日志）
- **目标设备**：桌面 Web
- **全局状态**：加载（Skeleton/Spin）、空数据（Empty + 引导文案）、错误（Result 错误态 + 重试）、无权限（403 提示）、成功（message 提示）
- **需求依据**：工单工作台为高频逐条处理场景（AC-09），匹配 `split-master-detail`；统计仪表盘使用 Dashboard 页面（AC-10）

### 运行约定

| 项目 | 值 |
|---|---|
| 常规启动 | `npm start`（即 `node --import tsx src/server/index.ts`） |
| 开发模式 | `npm run dev:server`（后端热重载）+ `npm run dev:web`（Vite 前端开发） |
| 构建 | `npm run build`（typecheck + vite build） |
| 测试 | `npm run test`（`node --import tsx --test test/*.test.mjs`） |
| 监听端口 | `PORT` 环境变量（默认 3000） |
| 数据库路径 | `DB_PATH` 环境变量（默认 `./data/application.db`），测试可用 `:memory:` 或临时路径 |
| JWT 密钥 | `JWT_SECRET` 环境变量（生产必须设置） |
| SMTP 配置 | `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM` 环境变量 |
| packageRoot | `app/ticket-system` |

> 干净目录无需手动创建 `data/` 目录，bootstrap.ts 在打开数据库前自动创建父目录。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 模块架构图

```
┌─────────────────────────────────────────────────┐
│                 React SPA (Vite)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Workbench │ │ Ticket   │ │ Statistics       │ │
│  │ (列表+筛选)│ │ Detail   │ │ Dashboard        │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Group Mgmt│ │Category  │ │ User Mgmt        │ │
│  │           │ │Rules     │ │ (scaffold)       │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└───────────────────┬─────────────────────────────┘
                    │ HTTPS / Bearer Token
┌───────────────────┴─────────────────────────────┐
│              Hono API Server                      │
│  ┌─────────────────────────────────────────────┐ │
│  │  Auth Middleware (AuthKit)                    │ │
│  │  → currentUser {id, companyId, roles}         │ │
│  ├─────────────────────────────────────────────┤ │
│  │  Route Modules                                │ │
│  │  • tickets      • business-groups             │ │
│  │  • replies      • category-rules              │ │
│  │  • transfers    • workbench                   │ │
│  │  • evaluations  • statistics                  │ │
│  │  • submitter-info                             │ │
│  ├─────────────────────────────────────────────┤ │
│  │  Platform Services                            │ │
│  │  • db (dbkit)     • auth (authkit+userkit)    │ │
│  │  • permission     • audit (auditkit)          │ │
│  │  • email (emailkit)                           │ │
│  └─────────────────────────────────────────────┘ │
└───────────────────┬─────────────────────────────┘
                    │
┌───────────────────┴─────────────────────────────┐
│              SQLite Database                      │
│  Platform tables: users, roles, permissions,     │
│  role_permissions, user_role_assignments,        │
│  audit_events                                     │
│  Business tables: companies, departments,         │
│  business_groups, business_group_members,         │
│  category_assignment_rules, tickets,              │
│  ticket_replies, ticket_transfers,                │
│  ticket_evaluations                               │
└─────────────────────────────────────────────────┘
```

### 模块职责与数据归属

| 模块 | 职责 | 唯一数据归属 | 接口摘要 |
|---|---|---|---|
| Auth | 用户认证、Token 签发与校验 | users 表（密码凭证） | POST /api/auth/login, GET /api/auth/me |
| Ticket | 工单 CRUD、状态流转、回复 | tickets, ticket_replies | GET/POST /api/tickets, GET/PATCH /api/tickets/:id |
| Ticket Action | 分配、转派、完成、取消、评价 | ticket_transfers, ticket_evaluations | POST /api/tickets/:id/{assign\|transfer\|complete\|cancel\|evaluation} |
| Submitter Info | 查询提交人完整信息（含历史工单） | 只读聚合（users + tickets） | GET /api/tickets/:id/submitter-info |
| Business Group | 业务组管理与成员设置 | business_groups, business_group_members | GET/POST /api/business-groups, POST /api/business-groups/:id/members |
| Category Rule | 分类自动分配规则配置 | category_assignment_rules | GET/POST /api/category-rules, DELETE /api/category-rules/:id |
| Workbench | 待处理工单列表（筛选、搜索、排序） | 只读查询（tickets） | GET /api/workbench |
| Statistics | 工单分布统计与运营仪表盘 | 只读聚合（tickets + ticket_evaluations） | GET /api/statistics |
| Operation Log | 工单操作日志查询 | audit_events（AuditKit 写入） | GET /api/tickets/:id/logs |
| Email | 工单完成邮件通知 | 无持久化（EmailKit 发送） | 由 Ticket Action 在完成时调用 |
| Permission | 角色权限校验 | roles, permissions, user_role_assignments | 中间件，无独立 API |

### 公司隔离实现

认证中间件从 AuthKit 解析 `currentUser`，其中包含 `companyId`。所有工单相关查询均以 `WHERE company_id = currentUser.companyId` 作为过滤条件。PermissionKit 的 `user_role_assignments` 表通过 `scope_type='company'` + `scope_id=<company_id>` 绑定用户在特定公司的角色，实现跨公司隔离。

### 数据库模型

**平台已有表（由 CommonApp 迁移创建）：**

- `users`：id TEXT PK, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at
- `roles` / `permissions` / `role_permissions` / `user_role_assignments`：RBAC 权限体系
- `audit_events`：id TEXT PK, occurred_at, event_type, actor_user_id, method, route, status_code, metadata_json

**业务表（新增迁移 0004+）：**

- `companies`：id TEXT PK, name TEXT NOT NULL, created_at TEXT NOT NULL
- `departments`：id TEXT PK, company_id TEXT NOT NULL REFERENCES companies(id), name TEXT NOT NULL, created_at TEXT NOT NULL
- `business_groups`：id TEXT PK, company_id TEXT NOT NULL REFERENCES companies(id), name TEXT NOT NULL, created_at TEXT NOT NULL
- `business_group_members`：id TEXT PK, group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, UNIQUE(group_id, user_id)
- `category_assignment_rules`：id TEXT PK, company_id TEXT NOT NULL REFERENCES companies(id), category TEXT NOT NULL, business_group_id TEXT NOT NULL REFERENCES business_groups(id), created_at TEXT NOT NULL, UNIQUE(company_id, category)
- `tickets`：id TEXT PK, company_id TEXT NOT NULL REFERENCES companies(id), subject TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, sla_priority TEXT NOT NULL DEFAULT 'P3' CHECK (sla_priority IN ('P0','P1','P2','P3','P4')), status TEXT NOT NULL DEFAULT 'pending_assignment' CHECK (status IN ('created','pending_assignment','pending_processing','completed','cancelled')), submitter_id TEXT NOT NULL REFERENCES users(id), assigned_group_id TEXT REFERENCES business_groups(id), assignee_id TEXT REFERENCES users(id), handler_id TEXT REFERENCES users(id), created_at TEXT NOT NULL, handled_at TEXT, completed_at TEXT, cancelled_at TEXT, cancelled_by TEXT REFERENCES users(id)
- `ticket_replies`：id TEXT PK, ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, replier_id TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL, replied_at TEXT NOT NULL
- `ticket_transfers`：id TEXT PK, ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, from_group_id TEXT, from_assignee_id TEXT REFERENCES users(id), to_group_id TEXT REFERENCES business_groups(id), to_assignee_id TEXT REFERENCES users(id), transferred_by TEXT NOT NULL REFERENCES users(id), transferred_at TEXT NOT NULL, reason TEXT
- `ticket_evaluations`：id TEXT PK, ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, submitter_id TEXT NOT NULL REFERENCES users(id), rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), comment TEXT, evaluated_at TEXT NOT NULL, UNIQUE(ticket_id)

> `users` 表需在迁移 0004 中增加 `department_id TEXT REFERENCES departments(id)` 列，以支持「按部门维度统计工单分布」和「处理时查看提交人部门」需求。

### 邮件通知集成

工单完成时，Ticket Action 模块调用 EmailKit 的 `createEmailClient` 发送邮件到提交人邮箱。SMTP 配置通过环境变量注入。开发环境无 SMTP 时，邮件发送失败记录日志但不阻塞工单完成流程。

### 可重复验证方式

本应用无自动推进、随机结果、动画或定时任务。所有状态流转由用户操作触发，验证时通过 QA fixture 预置公司、用户、业务组和工单数据，直接断言 API 响应和页面渲染。邮件通知验证使用 fixture 拦截或日志确认调用，不依赖真实 SMTP。

### 验收覆盖清单

| AC | 设计覆盖 |
|---|---|
| AC-01 | Ticket 模块创建+状态流转+公司隔离 |
| AC-02 | Ticket 模块回复 + ticket_replies 表 |
| AC-03 | Business Group + Category Rule 模块 |
| AC-04 | Ticket Action transfer 接口 + ticket_transfers |
| AC-05 | Submitter Info 聚合接口 |
| AC-06 | Ticket Action complete + Email 模块 |
| AC-07 | Ticket Action evaluation + ticket_evaluations |
| AC-08 | Ticket Action cancel + 终态约束 |
| AC-09 | Workbench 模块（筛选/搜索/排序） |
| AC-10 | Statistics 模块（分布+仪表盘） |
| AC-11 | AuditKit 记录工单操作日志 + Operation Log 查询 |
