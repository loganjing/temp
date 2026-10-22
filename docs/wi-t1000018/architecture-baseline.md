# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

工单系统采用 Hono + React/Vite 全栈架构，使用 SQLite 作为持久化数据库。项目通过 CommonApp 模块获得平台能力，应用包根目录为 `app/ticket-system/`。

| 层 | 技术选型 | 说明 |
|---|---|---|
| 后端框架 | Hono 4 | API 服务，Node 运行时 |
| 前端框架 | React 18 + Vite 5 | SPA，Tailwind CSS |
| 数据库 | SQLite (better-sqlite3) | 文件数据库，通过 dbkit 管理 |
| 身份认证 | authkit + userkit | 本地密码模式，Bearer Token 认证 |
| 权限控制 | permissionkit | RBAC 角色权限注册表 |
| 审计日志 | auditkit | 持久化审计事件 |
| 邮件通知 | emailkit | SMTP 邮件发送 |
| 包管理 | npm | package-lock.json |

### CommonApp 模块

| 模块 | 包名 | 版本 | 状态 | manifest SHA-256 | 需求匹配 |
|---|---|---|---|---|---|
| dbkit | @commonapp/dbkit | 0.2.0 | wired | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | 工单、业务组、成员等持久化数据存储与迁移 |
| authkit | @commonapp/authkit | 0.1.2 | wired | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | 登录认证、Bearer Token、请求级身份解析 |
| userkit | @commonapp/userkit | 0.1.0 | wired | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 本地用户、密码凭证、与公司关联 |
| permissionkit | @commonapp/permissionkit | 0.1.0 | installed | 09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 | 工单角色（提交人/处理人/管理员）权限控制 |
| auditkit | @commonapp/auditkit | 0.1.0 | installed | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 工单生命周期操作日志 |
| emailkit | @commonapp/emailkit | 0.1.0 | installed | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | 工单完成邮件通知 |

permissionkit 和 auditkit 当前状态为 `installed`（迁移已就位但未接线），实现阶段需在 `src/server/platform/` 中完成接线。emailkit 同为 `installed`，需在服务端初始化 SMTP 客户端。

### 架构边界图

```
┌─────────────────────────────────────────────┐
│                 浏览器 (React SPA)             │
│  工单工作台 │ 工单详情 │ 统计仪表盘 │ 管理后台  │
└────────────────────┬────────────────────────┘
                     │ HTTPS (Bearer Token)
┌────────────────────▼────────────────────────┐
│              Hono API Server                 │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ authkit │ │ ticket   │ │ stats        │  │
│  │ 路由    │ │ 路由    │ │ 路由         │  │
│  └─────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────────────────────────────────┐   │
│  │  平台绑定层 (src/server/platform/)   │   │
│  │  bootstrap.ts → db + auth + email     │   │
│  │  auth.ts → userStore + userResolver   │   │
│  └──────────────────────────────────────┘   │
└──────┬──────────────────────────┬───────────┘
       │                          │
┌──────▼──────┐          ┌───────▼───────┐
│   SQLite     │          │   SMTP Server  │
│ (dbkit)      │          │ (emailkit)     │
└─────────────┘          └───────────────┘
```

### UI 基线

- **应用/业务模板**：helpdesk（工单系统）
- **展示模板 ID**：`split-master-detail`（列表/队列与当前记录详情协同）
- **视觉风格**：Modern SaaS（柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色与状态色、短且有反馈作用的动效）
- **应用壳**：左侧导航栏 + 顶部上下文栏 + 主工作区
- **目标设备**：桌面 Web（默认）
- **导航结构**：
  - 工单工作台（待处理工单列表 + 详情）
  - 工单管理（全部工单列表 + 详情，含生命周期操作）
  - 统计分析（仪表盘）
  - 管理后台（业务组、分类、分配规则管理）
  - 用户管理（已有 starter 页面）
- **关键全局状态**：加载（骨架屏/spinner）、空数据（引导提示）、错误（内联错误信息）、无权限（403 提示）、成功（操作反馈 toast）
- **选择依据**：需求明确为高频逐条处理记录的工单系统（AC-01~AC-09），核心动作是工单列表浏览与详情处理，`split-master-detail` 模板最匹配。

### 运行约定

- **常规启动**：`npm start`（即 `node --import tsx src/server/index.ts`），监听端口通过 `PORT` 环境变量配置（默认 3000）。
- **开发模式**：`npm run dev:server`（服务端热重载）+ `npm run dev:web`（Vite 前端开发服务器），Vite 代理 API 到后端。
- **数据库路径**：默认 `./data/application.db`，通过 `DB_PATH` 环境变量覆盖。打开前自动创建父目录。验证时使用 `DB_PATH=:memory:` 或临时文件路径。
- **构建**：`npm run build` 执行 TypeScript 类型检查 + Vite 前端构建，产物输出到 `dist/`。
- **测试**：`npm test` 运行 `test/*.test.mjs`。
- **邮件配置**：emailkit 需要 SMTP 环境变量（`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`）。未配置时邮件发送降级为日志记录，不阻塞工单完成流程。
- **JWT 密钥**：authkit 使用 `JWT_SECRET` 环境变量，未配置时使用默认值（仅开发环境）。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 领域模块

工单系统在 `src/server/routes.ts` 中注册业务路由，各模块的职责和唯一数据归属如下。字段级 API 契约详见 `technical-contract.md`。

| 模块 | 职责 | 唯一数据归属 | 接口摘要 |
|---|---|---|---|
| Auth | 登录、注销、当前用户、密码管理、首个账户初始化 | users 表（与 userkit 共享） | 已由 starter 实现：`POST /api/auth/login`、`GET /api/auth/me` 等 |
| Company | 公司 CRUD | companies 表 | `GET/POST/PATCH /api/companies` |
| Department | 部门 CRUD（按公司隔离） | departments 表 | `GET/POST/PATCH /api/companies/:companyId/departments` |
| BusinessGroup | 业务组 CRUD 及成员管理 | business_groups、business_group_members 表 | `GET/POST/PATCH/DELETE /api/companies/:companyId/groups`、`POST/DELETE /api/groups/:groupId/members` |
| Category | 问题分类 CRUD（按公司隔离） | categories 表 | `GET/POST/PATCH/DELETE /api/companies/:companyId/categories` |
| AssignmentRule | 分类→业务组自动分配规则 | assignment_rules 表 | `GET/POST/DELETE /api/companies/:companyId/assignment-rules` |
| Ticket | 工单创建、列表、详情、状态流转（分配、转派、完成、取消） | tickets 表 | `POST /api/tickets`、`GET /api/tickets`、`GET /api/tickets/:id`、`POST /api/tickets/:id/assign`、`POST /api/tickets/:id/transfer`、`POST /api/tickets/:id/complete`、`POST /api/tickets/:id/cancel` |
| TicketReply | 工单多轮回复 | ticket_replies 表 | `GET /api/tickets/:id/replies`、`POST /api/tickets/:id/replies` |
| SubmitterInfo | 查看提交人完整信息（姓名、公司、部门、历史工单） | 聚合查询（users + tickets） | `GET /api/tickets/:id/submitter-info` |
| Evaluation | 用户满意度评价 | ticket_evaluations 表 | `POST /api/tickets/:id/evaluation`、`GET /api/tickets/:id/evaluation` |
| Statistics | 工单分布统计与运营仪表盘 | 聚合查询（只读） | `GET /api/stats/distribution`、`GET /api/stats/dashboard` |
| Workbench | 待处理工单列表（筛选、搜索、排序） | 聚合查询（只读） | `GET /api/workbench/tickets` |
| AuditLog | 工单操作日志查询 | audit_events 表（与 auditkit 共享） | `GET /api/tickets/:id/logs` |

### 角色与权限

通过 permissionkit 注册三类角色，分配给用户后用于 API 授权：

| 角色 | role_key | 权限范围 |
|---|---|---|
| 提交人 | `submitter` | 创建工单、查看自己的工单、回复工单、评价工单 |
| 处理人 | `handler` | 查看分配到本组的工单、处理工单、回复工单、转派工单、查看提交人信息 |
| 管理员 | `admin` | 管理公司/部门/业务组/分类/分配规则、查看全部工单、查看统计、管理用户 |

授权实现：在 `src/server/platform/auth.ts` 中扩展身份解析，从 `user_role_assignments` 表加载用户角色，在路由中间件中检查角色权限。公司数据隔离通过服务端从当前用户的 `company_id` 强制过滤实现，前端传入的 `companyId` 参数仅用于筛选，不作为权限边界。

### 审计事件

通过 auditkit 记录以下工单生命周期事件，每条记录包含 `actor_user_id`、`event_type`、`occurred_at` 和 `metadata_json`：

| 事件类型 | 触发时机 |
|---|---|
| `ticket.created` | 工单创建 |
| `ticket.assigned` | 工单分配到业务组（手动或自动） |
| `ticket.replied` | 工单回复 |
| `ticket.transferred` | 工单转派 |
| `ticket.completed` | 工单完成 |
| `ticket.cancelled` | 工单取消 |
| `ticket.evaluated` | 用户评价 |

### 自动分配流程

1. 提交人创建工单时指定分类 → 工单状态为 `created`
2. 系统查询 `assignment_rules` 表，按 `(company_id, category_id)` 匹配
3. 匹配成功 → 工单 `group_id` 设为目标业务组，状态变为 `pending_processing`
4. 无匹配规则 → 工单状态变为 `pending_assignment`，等待管理员手动分配
5. 记录 `ticket.assigned` 审计事件

### 工单生命周期状态流转

```
created → pending_assignment → pending_processing → completed
  │                                                        ↑
  └──────→ cancelled                            （转派回到 pending_processing）
```

- `created`：工单提交后初始状态
- `pending_assignment`：等待分配到业务组（无自动匹配规则或手动创建后）
- `pending_processing`：已分配到业务组，等待处理人处理
- `completed`：处理人完成处理，触发邮件通知
- `cancelled`：工单被取消，不再处理
- 转派：处理人可将 `pending_processing` 状态的工单转派给其他业务组或处理人，转派后回到 `pending_processing`（同组换人）或 `pending_assignment`（换组）

## 3. 数据模型与迁移

### 迁移文件

平台迁移（已有）：
- `0001_platform_users.sql`：users 表（含 `company_id` 字段）
- `0002_platform_permissions.sql`：roles、permissions、role_permissions、user_role_assignments 表
- `0003_platform_audit_events.sql`：audit_events 表

业务迁移（实现阶段新增）：
- `0004_business_tables.sql`：工单业务表

### 业务表结构

**companies**
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | 公司名称 |
| created_at | TEXT | NOT NULL | ISO 时间戳 |
| updated_at | TEXT | NOT NULL | ISO 时间戳 |

**departments**
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| company_id | TEXT | NOT NULL REFERENCES companies(id) | 所属公司 |
| name | TEXT | NOT NULL | 部门名称 |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |
| | | UNIQUE(company_id, name) | |

**business_groups**
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| company_id | TEXT | NOT NULL REFERENCES companies(id) | 所属公司 |
| name | TEXT | NOT NULL | 业务组名称 |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |

**business_group_members**
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| group_id | TEXT | NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE | |
| user_id | TEXT | NOT NULL | 关联 users.id |
| created_at | TEXT | NOT NULL | |
| | | PRIMARY KEY (group_id, user_id) | |

**categories**
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| company_id | TEXT | NOT NULL REFERENCES companies(id) | 所属公司 |
| name | TEXT | NOT NULL | 分类名称 |
| created_at | TEXT | NOT NULL | |
| | | UNIQUE(company_id, name) | |

**assignment_rules**
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| company_id | TEXT | NOT NULL REFERENCES companies(id) | |
| category_id | TEXT | NOT NULL REFERENCES categories(id) | |
| group_id | TEXT | NOT NULL REFERENCES business_groups(id) | 目标业务组 |
| created_at | TEXT | NOT NULL | |
| | | UNIQUE(company_id, category_id) | |

**tickets**
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| company_id | TEXT | NOT NULL REFERENCES companies(id) | 公司隔离 |
| subject | TEXT | NOT NULL | 工单主题 |
| description | TEXT | NOT NULL | 工单描述 |
| category_id | TEXT | REFERENCES categories(id) | 问题分类 |
| submitter_id | TEXT | NOT NULL | users.id |
| submitter_name | TEXT | NOT NULL | 提交人姓名（快照） |
| submitter_email | TEXT | NOT NULL | 提交人邮箱（快照） |
| submitter_department | TEXT | | 提交人部门（快照） |
| sla_priority | TEXT | NOT NULL DEFAULT 'P3' CHECK IN ('P0','P1','P2','P3','P4') | SLA 优先级 |
| status | TEXT | NOT NULL DEFAULT 'created' CHECK IN ('created','pending_assignment','pending_processing','completed','cancelled') | 生命周期状态 |
| group_id | TEXT | REFERENCES business_groups(id) | 当前分配业务组 |
| handler_id | TEXT | | users.id，当前处理人 |
| assigned_at | TEXT | | 首次分配时间 |
| handled_at | TEXT | | 处理完成时间 |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |

**ticket_replies**
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| ticket_id | TEXT | NOT NULL REFERENCES tickets(id) ON DELETE CASCADE | |
| replier_id | TEXT | NOT NULL | users.id |
| replier_name | TEXT | NOT NULL | 回复人姓名（快照） |
| content | TEXT | NOT NULL | 回复内容 |
| created_at | TEXT | NOT NULL | |

**ticket_transfers**
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| ticket_id | TEXT | NOT NULL REFERENCES tickets(id) ON DELETE CASCADE | |
| from_group_id | TEXT | | 转出业务组 |
| from_handler_id | TEXT | | 转出处理人 |
| to_group_id | TEXT | | 转入业务组 |
| to_handler_id | TEXT | | 转入处理人 |
| transferred_by | TEXT | NOT NULL | users.id，转派人 |
| created_at | TEXT | NOT NULL | |

**ticket_evaluations**
| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| ticket_id | TEXT | NOT NULL REFERENCES tickets(id) ON DELETE CASCADE | |
| submitter_id | TEXT | NOT NULL | users.id |
| rating | INTEGER | NOT NULL CHECK (rating BETWEEN 1 AND 5) | 满意度评分 |
| comment | TEXT | | 评价备注 |
| created_at | TEXT | NOT NULL | |
| | | UNIQUE(ticket_id) | 每个工单仅可评价一次 |

### 用户表扩展

在 `0004_business_tables.sql` 中通过 `ALTER TABLE users ADD COLUMN department_id TEXT` 为已有 users 表增加部门关联字段，不修改平台迁移文件。

## 4. 外部集成

### 邮件通知（emailkit）

- **触发时机**：工单状态变为 `completed` 时
- **收件人**：工单 `submitter_email`
- **发送方**：`SMTP_FROM` 环境变量配置
- **降级策略**：SMTP 未配置或发送失败时，记录错误日志但不阻塞工单完成流程
- **实现位置**：在 `src/server/platform/bootstrap.ts` 中初始化 `createEmailClient`，在工单完成路由中调用

### ID 类型对照

| 实体 | 生成方 | 数据库主键类型 | API JSON 类型 | 前端类型 |
|---|---|---|---|---|
| User | 服务端 `randomUUID()` | TEXT | string | string |
| Company | 服务端 `randomUUID()` | TEXT | string | string |
| Department | 服务端 `randomUUID()` | TEXT | string | string |
| BusinessGroup | 服务端 `randomUUID()` | TEXT | string | string |
| Category | 服务端 `randomUUID()` | TEXT | string | string |
| Ticket | 服务端 `randomUUID()` | TEXT | string | string |
| TicketReply | 服务端 `randomUUID()` | TEXT | string | string |
| TicketTransfer | 服务端 `randomUUID()` | TEXT | string | string |
| TicketEvaluation | 服务端 `randomUUID()` | TEXT | string | string |

所有实体 ID 均为 TEXT 类型 UUID，在服务端通过 `node:crypto.randomUUID()` 生成，数据库、API JSON 和前端 TypeScript 统一为 string，无需转换。

### API 错误格式

所有 API 错误响应统一为 `{ error: { code: string, message: string } }`，HTTP 状态码语义：
- 400：输入校验失败（`INVALID_INPUT`）
- 401：未认证（`UNAUTHORIZED`）
- 403：无权限或密码需修改（`FORBIDDEN`、`PASSWORD_CHANGE_REQUIRED`）
- 404：资源不存在（`NOT_FOUND`）
- 409：状态冲突（`CONFLICT`）
- 500：服务端错误（`INTERNAL_ERROR`）
