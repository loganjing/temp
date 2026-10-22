# 系统设计

> 工作项：wi-t1000002 ｜ 业务任务：140-ticket ｜ 阶段：design ｜ 版本：v1.0

<!-- system-design: scope -->

## 1. 整体方案与设计基线

### 1.1 技术栈

| 层 | 技术选型 | 依据 |
|---|---|---|
| 后端框架 | Hono (Node.js, ESM) | 需要服务端权威数据、跨用户共享、公司隔离授权与邮件发送 |
| 前端框架 | React + Vite (SPA) | 标准全栈前端，支持复杂列表/详情交互 |
| UI 框架 | Tailwind CSS | 通用业务后台默认，快速构建紧凑可扫读布局 |
| 数据库 | SQLite (via dbkit) | 新项目需持久化、结构化查询与事务，SQLite 轻量零配置 |
| 包管理器 | npm | 新项目标准选择 |

### 1.2 架构总览

```
┌─────────────────────────────────────────────┐
│              React + Vite SPA               │
│  (工单工作台 / 详情 / 统计仪表盘 / 管理页)      │
└──────────────────┬──────────────────────────┘
                   │ REST API (JSON)
┌──────────────────▼──────────────────────────┐
│              Hono Server (src/server.js)     │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ Auth MW  │ │ Ticket   │ │ Statistics │  │
│  │(authkit) │ │ Module   │ │ Module     │  │
│  └──────────┘ └──────────┘ └────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ Assign   │ │ Rating   │ │ Audit MW   │  │
│  │ Module   │ │ Module   │ │ (auditkit) │  │
│  └──────────┘ └──────────┘ └────────────┘  │
│  ┌──────────┐ ┌──────────┐                  │
│  │ Email   │ │ User/    │                  │
│  │(emailkit)│ │ Profile  │                  │
│  └──────────┘ └──────────┘                  │
└──────────────────┬──────────────────────────┘
                   │ dbkit (SQLite)
┌──────────────────▼──────────────────────────┐
│         SQLite (./data/ticket-system.db)     │
│  tickets / replies / transfers / ratings     │
│  companies / departments / categories        │
│  business_groups / members / assignment_rules│
│  user_profiles / (userkit tables)             │
│  (auditkit tables)                            │
└─────────────────────────────────────────────┘
```

### 1.3 数据归属

- **SQLite 文件数据库**是所有工单业务数据的唯一权威来源，通过 dbkit 访问。
- 认证凭证与用户基础表由 userkit 管理；项目通过 `user_profiles` 扩展业务属性（公司、部门、显示名）。
- 审计日志由 auditkit 管理其表结构，项目通过 auditkit API 写入操作记录。
- 邮件发送为无状态外部调用，不持久化邮件内容；发送结果记录在审计日志中。

<!-- system-design: architecture-boundaries -->

## 2. 领域责任、模块边界与接口摘要

### 2.1 认证与用户模块（authkit + userkit + 项目扩展）

**职责**：用户登录、会话管理、用户 CRUD、用户业务属性（公司、部门、显示名）扩展。

- authkit 提供 Hono 中间件：密码登录、Bearer 认证、会话管理。
- userkit 提供本地用户与密码凭证存储。
- 项目 `user_profiles` 表扩展用户业务属性，在用户创建/更新时同步写入。
- **接口摘要**（详细契约见 technical-contract.md）：
  - `POST /api/auth/login` — 登录，返回 token
  - `POST /api/auth/logout` — 登出
  - `GET /api/auth/me` — 当前用户信息含 profile
  - `GET /api/users` — 用户列表（含 profile）
  - `POST /api/users` — 创建用户并初始化 profile
  - `PUT /api/users/:id` — 更新用户 profile

### 2.2 工单模块（项目实现）

**职责**：工单 CRUD、生命周期流转、多轮回复、转派、完成处理与提交人信息查看。

- 唯一数据归属：`tickets`、`ticket_replies`、`ticket_transfers` 表。
- 工单创建后由分配模块自动匹配业务组。
- 完成操作触发邮件模块发送通知，并记录审计日志。
- 公司隔离：所有查询按当前用户 `company_id` 过滤。
- **接口摘要**：
  - `POST /api/tickets` — 创建工单（触发自动分配）
  - `GET /api/tickets` — 工单列表（筛选/搜索/排序/公司隔离）
  - `GET /api/tickets/:id` — 工单详情（含回复、转派记录、评价）
  - `POST /api/tickets/:id/replies` — 追加回复
  - `POST /api/tickets/:id/transfer` — 转派工单
  - `POST /api/tickets/:id/complete` — 完成工单（触发邮件通知）
  - `POST /api/tickets/:id/cancel` — 取消工单
  - `GET /api/tickets/:id/submitter-info` — 提交人完整信息（含历史工单）
  - `GET /api/tickets/:id/logs` — 工单操作日志

### 2.3 分配模块（项目实现）

**职责**：业务组管理、成员管理、分类→业务组自动分配规则维护、工单自动分配执行。

- 唯一数据归属：`business_groups`、`business_group_members`、`assignment_rules` 表。
- 业务组与规则均按公司隔离，跨公司不匹配。
- 工单创建时同步执行自动分配：查找 `(company_id, category_id)` 对应规则，命中则设 `business_group_id` 并流转至「待处理」，未命中则停留「待分配」。
- **接口摘要**：
  - `GET /api/business-groups?companyId=X` — 业务组列表
  - `POST /api/business-groups` — 创建业务组
  - `POST /api/business-groups/:id/members` — 添加成员
  - `DELETE /api/business-groups/:id/members/:userId` — 移除成员
  - `GET /api/assignment-rules?companyId=X` — 分配规则列表
  - `POST /api/assignment-rules` — 创建/更新规则（company+category 唯一）
  - `POST /api/tickets/:id/assign` — 手动分配（无自动匹配规则时）

### 2.4 评价模块（项目实现）

**职责**：工单完成后提交人提交满意度评价，评价结果供统计分析引用。

- 唯一数据归属：`ticket_ratings` 表。
- 每个工单至多一条评价，提交后不可修改。
- 仅「完成」状态工单允许评价。
- **接口摘要**：
  - `POST /api/tickets/:id/rating` — 提交满意度评价（1–5 星 + 可选文字）

### 2.5 统计分析模块（项目实现）

**职责**：按公司/部门维度统计工单分布、运营仪表盘指标计算。

- 无独立数据归属，基于工单、回复与评价表聚合查询。
- 平均响应时间 = 工单创建时间到首条处理方回复时间的平均时长。
- 热点问题按分类工单量降序排列。
- 统计结果遵守公司隔离。
- **接口摘要**：
  - `GET /api/statistics/distribution?dimension=company|department` — 工单分布统计
  - `GET /api/statistics/dashboard` — 仪表盘运营指标

### 2.6 邮件通知模块（emailkit）

**职责**：工单完成时向提交人邮箱发送完成通知。

- 无状态外部调用，通过 `createEmailClient` 发送 SMTP 邮件。
- SMTP 配置通过环境变量提供（`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`）。
- 发送结果（成功/失败）记录到审计日志。
- **调用方**：工单模块的完成操作内部调用，不直接暴露 API。

### 2.7 审计日志模块（auditkit）

**职责**：记录工单关键操作日志，包含操作类型、操作人、操作时间与工单标识。

- auditkit 管理审计事件表，项目通过 `createAuditKit` API 写入事件。
- 记录的操作类型：创建、分配（自动/手动）、转派、回复、完成、取消、评价。
- 日志遵守公司隔离。
- **接口摘要**：
  - `GET /api/tickets/:id/logs` — 查看工单操作日志（由工单模块代理，内部调用 auditkit）

### 2.8 基础数据模块（项目实现）

**职责**：公司、部门、分类基础数据维护。

- 唯一数据归属：`companies`、`departments`、`categories` 表。
- **接口摘要**：
  - `GET /api/companies` — 公司列表（用于筛选）
  - `POST /api/companies` — 创建公司
  - `GET /api/companies/:id/departments` — 部门列表
  - `POST /api/companies/:id/departments` — 创建部门
  - `GET /api/categories` — 分类列表

## 3. UI 全局基线

- **应用/业务模板**：`helpdesk` — 工单提交、分配、处理、协作、评价与统计分析。
- **展示模板**：`split-master-detail` — 左侧工单列表/队列与右侧当前工单详情协同，适配高频逐条处理场景。
- **视觉风格**：Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色与状态色、短而有反馈的动效。
- **应用壳**：左侧导航栏（工单工作台、统计分析、业务组管理、分类管理），顶部上下文栏（当前用户、公司切换），主工作区（列表/详情 split 布局或仪表盘）。
- **目标设备**：桌面 Web（需求未要求移动端/窄屏）。
- **全局状态**：
  - 加载中：列表骨架屏、按钮 loading 态
  - 空数据：列表空态提示"暂无工单"
  - 错误：表单内联错误提示、操作失败 toast
  - 无权限：403 提示页
  - 成功：操作成功 toast 通知
- **选择依据**：需求描述高频逐条处理工单（工作台筛选/搜索/排序 + 工单详情多轮回复/转派/完成），对应 `split-master-detail` 模板；业务后台默认 Modern SaaS 视觉。

## 4. 数据库模型与迁移

### 4.1 项目表结构

迁移文件位于 `migrations/sqlite/`，使用版本化 SQL 迁移（dbkit `runMigrations`）。

**companies** — 公司
| 列 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| name | TEXT | NOT NULL |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') |

**departments** — 部门（归属公司）
| 列 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| company_id | INTEGER | NOT NULL REFERENCES companies(id) |
| name | TEXT | NOT NULL |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') |

**categories** — 问题分类
| 列 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| name | TEXT | NOT NULL |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') |

**user_profiles** — 用户业务属性（扩展 userkit 用户）
| 列 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| user_id | INTEGER | NOT NULL UNIQUE |
| display_name | TEXT | NOT NULL |
| email | TEXT | NOT NULL |
| company_id | INTEGER | REFERENCES companies(id) |
| department_id | INTEGER | REFERENCES departments(id) |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') |

**business_groups** — 业务组（归属公司）
| 列 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| company_id | INTEGER | NOT NULL REFERENCES companies(id) |
| name | TEXT | NOT NULL |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') |

**business_group_members** — 业务组成员
| 列 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| group_id | INTEGER | NOT NULL REFERENCES business_groups(id) |
| user_id | INTEGER | NOT NULL |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') |
| | | UNIQUE(group_id, user_id) |

**assignment_rules** — 分类→业务组分配规则
| 列 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| company_id | INTEGER | NOT NULL REFERENCES companies(id) |
| category_id | INTEGER | NOT NULL REFERENCES categories(id) |
| target_group_id | INTEGER | NOT NULL REFERENCES business_groups(id) |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') |
| | | UNIQUE(company_id, category_id) |

**tickets** — 工单
| 列 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| title | TEXT | NOT NULL |
| description | TEXT | NOT NULL |
| category_id | INTEGER | NOT NULL REFERENCES categories(id) |
| sla_priority | TEXT | NOT NULL CHECK IN ('P0','P1','P2','P3','P4') |
| company_id | INTEGER | NOT NULL REFERENCES companies(id) |
| submitter_user_id | INTEGER | NOT NULL |
| submitter_name | TEXT | NOT NULL |
| submitter_email | TEXT | NOT NULL |
| submitter_department | TEXT | |
| business_group_id | INTEGER | REFERENCES business_groups(id) |
| handler_user_id | INTEGER | |
| handler_name | TEXT | |
| status | TEXT | NOT NULL DEFAULT 'created' CHECK IN ('created','pending_assignment','pending_processing','completed','cancelled') |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') |
| first_response_at | TEXT | |
| completed_at | TEXT | |
| cancelled_at | TEXT | |

**ticket_replies** — 工单回复
| 列 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| ticket_id | INTEGER | NOT NULL REFERENCES tickets(id) |
| content | TEXT | NOT NULL |
| replier_user_id | INTEGER | NOT NULL |
| replier_name | TEXT | NOT NULL |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') |

**ticket_transfers** — 工单转派记录
| 列 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| ticket_id | INTEGER | NOT NULL REFERENCES tickets(id) |
| from_group_id | INTEGER | REFERENCES business_groups(id) |
| to_group_id | INTEGER | REFERENCES business_groups(id) |
| from_user_id | INTEGER | |
| to_user_id | INTEGER | |
| transferred_by | INTEGER | NOT NULL |
| transferred_at | TEXT | NOT NULL DEFAULT datetime('now') |

**ticket_ratings** — 满意度评价
| 列 | 类型 | 约束 |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| ticket_id | INTEGER | NOT NULL UNIQUE REFERENCES tickets(id) |
| score | INTEGER | NOT NULL CHECK BETWEEN 1 AND 5 |
| comment | TEXT | |
| rated_by | INTEGER | NOT NULL |
| rated_at | TEXT | NOT NULL DEFAULT datetime('now') |

### 4.2 状态流转

```
created → pending_assignment → pending_processing → completed
    │           │                      │
    └───────────┴──────────────────────┘──→ cancelled
```

- `created` 与 `pending_assignment` 之间为创建后即时流转，对外表现为创建即进入「待分配」。
- `completed` 与 `cancelled` 为终态，不可再变更。
- 转派只变更 `business_group_id` / `handler_user_id`，不改变 `status`。

### 4.3 公司隔离规则

- 所有工单查询附加 `WHERE company_id = :currentUserCompanyId`。
- 业务组、分配规则、部门查询均附加公司过滤。
- 直接访问他公司工单时返回 403 或 404，不暴露内容。

## 5. 外部集成

### 5.1 邮件服务（emailkit / SMTP）

- 通过 `createEmailClient` 创建邮件客户端，SMTP 配置来自环境变量。
- 调用时机：工单完成操作成功后，向 `submitter_email` 发送完成通知邮件。
- 邮件内容：工单标题、工单 ID、完成时间、处理人姓名。
- 发送结果（成功/失败）记录到审计日志，不阻塞工单完成操作本身。
- 邮件服务不可用时：工单仍标记为完成，审计日志记录邮件发送失败，不影响主流程。

## 6. CommonApp 模块选择

| 模块 | 版本 | manifest SHA-256 | 需求匹配 | 集成边界 |
|---|---|---|---|---|
| dbkit | 0.2.0 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | 所有业务数据持久化、查询、事务、版本化迁移 | 提供 `createDb`、`runMigrations`；项目通过 `DB_PATH` 配置路径 |
| authkit | 0.1.2 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | 用户认证与会话管理 | Hono 中间件，提供 `createAuth` |
| userkit | 0.1.0 | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 本地用户与密码凭证 | 依赖 dbkit + authkit；提供 `createUserStore`、`createUserResolver` |
| permissionkit | 0.1.0 | 09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 | RBAC 权限与公司隔离授权 | 依赖 dbkit；提供 `createPermissionKit` |
| auditkit | 0.1.0 | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 工单关键操作审计日志 | 依赖 dbkit；提供 `createAuditKit` |
| emailkit | 0.1.0 | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | 工单完成邮件通知 | 无模块依赖，运行时依赖 nodemailer；提供 `createEmailClient` |

**依赖闭包**：dbkit（无模块依赖）→ authkit（无模块依赖）→ userkit（dbkit + authkit）→ permissionkit（dbkit）→ auditkit（dbkit）→ emailkit（无模块依赖）。闭包完整，无缺失。

**identityMode**：`local-password`（authkit + userkit 同时选择，生成本地密码登录、用户管理与首个账户初始化）。

**未选择模块**：attachment（需求未要求附件）、i18n（需求未要求国际化）。

## 7. 运行约定

- **启动命令**：`npm start`（生产）／ `npm run dev`（开发，前后端热更新）
- **监听端口**：`PORT` 环境变量，默认 `3000`
- **数据库路径**：`DB_PATH` 环境变量，默认 `./data/ticket-system.db`；启动前自动创建父目录
- **测试数据库**：验证脚本通过 `DB_PATH` 覆盖为隔离测试路径
- **SMTP 配置**：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`；缺失时邮件功能降级为记录日志但不阻塞主流程
- **迁移**：启动时自动执行 `runMigrations`，迁移文件位于 `migrations/sqlite/`
- **服务入口**：`src/server.js`（位于 writableScopes 范围内）
