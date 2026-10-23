# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 选型 |
|---|---|
| 后端框架 | Hono (Node.js ≥ 20) |
| 前端框架 | React + Vite |
| UI 框架 | Tailwind CSS |
| 数据库 | SQLite (via dbkit) |
| 包管理器 | npm |

新建 Hono + React/Vite 全栈应用。后端通过 Hono 提供 REST API，前端使用 React/Vite SPA，开发期 Vite dev server 代理 API 请求到 Hono 服务端。SQLite 文件数据库持久化全部业务数据。

### CommonApp 模块

| 模块 ID | 包名 | 版本 | 用途 | Manifest SHA-256 |
|---|---|---|---|---|
| dbkit | @commonapp/dbkit | 0.2.0 | SQLite 配置、查询、事务与迁移 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 |
| authkit | @commonapp/authkit | 0.1.2 | Hono 密码登录与 Bearer 认证 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 |
| userkit | @commonapp/userkit | 0.1.0 | 本地用户与密码凭证存储 | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 |
| permissionkit | @commonapp/permissionkit | 0.1.0 | RBAC 权限注册表与授权 | 09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 |
| auditkit | @commonapp/auditkit | 0.1.0 | 持久化审计事件与敏感字段脱敏 | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 |
| emailkit | @commonapp/emailkit | 0.1.0 | 可配置 SMTP 邮件发送 | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c |

依赖闭包：userkit → dbkit + authkit；permissionkit → dbkit；auditkit → dbkit。dbkit 是所有数据库操作模块的基础。模块安装标记：`commonapp install: dbkit, authkit, userkit, permissionkit, auditkit, emailkit`。

### 系统边界

- 多公司工单管理平台，所有工单数据按公司隔离，不同公司互不可见。
- 认证采用本地密码模式（authkit + userkit），Bearer token 认证。
- 权限采用 permissionkit RBAC 模型，三种角色：提交人、处理人、管理员。
- 工单操作日志通过 auditkit 持久化审计事件。
- 工单完成时通过 emailkit 发送 SMTP 邮件通知提交人。
- SQLite 文件数据库，默认路径 `./data/ticket-system.db`，测试通过 `DB_PATH` 覆盖。

### 架构总览

```
┌──────────────────────────────────────┐
│          React/Vite Frontend          │
│  (Workbench, Dashboard, Admin Pages)  │
└────────────────┬─────────────────────┘
                 │ HTTP/JSON (Bearer Auth)
┌────────────────▼─────────────────────┐
│            Hono API Server            │
│  ┌──────────┬───────────┬──────────┐ │
│  │ Ticket   │ Assignment│ Statistics│ │
│  │ Module   │ Module    │ Module    │ │
│  ├──────────┼───────────┼──────────┤ │
│  │Collab    │ Evaluation│ Workbench │ │
│  │Module    │ Module    │ Module    │ │
│  └──────────┴───────────┴──────────┘ │
│  Auth(authkit) RBAC(permissionkit)    │
│  Audit(auditkit)  Email(emailkit)    │
└────────────────┬─────────────────────┘
                 │
┌────────────────▼─────────────────────┐
│         SQLite (dbkit)               │
└──────────────────────────────────────┘
```

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 工单管理模块 (Ticket Module)

**职责**：工单创建、查询、状态流转、多轮回复、公司数据隔离。

**数据归属**：tickets、ticket_replies 表。

**接口摘要**：
- `POST /api/tickets` — 创建工单，触发自动分配规则匹配
- `GET /api/tickets` — 查询工单列表（支持筛选/搜索/排序/公司筛选）
- `GET /api/tickets/:id` — 获取工单详情（含回复列表）
- `PATCH /api/tickets/:id/status` — 更新工单状态（如取消）
- `POST /api/tickets/:id/replies` — 添加工单回复
- `POST /api/tickets/:id/complete` — 完成工单处理

### 工单分配模块 (Assignment Module)

**职责**：公司业务组与成员管理、问题分类管理、分类→业务组自动分配规则配置与执行。

**数据归属**：business_groups、business_group_members、ticket_categories、assignment_rules 表。

**接口摘要**：
- `POST /api/business-groups` — 创建业务组
- `GET /api/business-groups` — 查询业务组列表（含成员）
- `POST /api/business-groups/:id/members` — 添加业务组成员
- `DELETE /api/business-groups/:id/members/:userId` — 移除业务组成员
- `POST /api/ticket-categories` — 创建问题分类
- `GET /api/ticket-categories` — 查询问题分类列表
- `POST /api/assignment-rules` — 配置分类→业务组自动分配规则
- `GET /api/assignment-rules` — 查询分配规则列表

### 工单协作模块 (Collaboration Module)

**职责**：工单转派操作，记录转派历史。

**数据归属**：ticket_transfers 表；更新 tickets.assigned_handler_id。

**接口摘要**：
- `POST /api/tickets/:id/transfer` — 转派工单到同公司其他业务组成员

### 工单处理模块 (Processing Module)

**职责**：处理时查看提交人完整信息（含历史工单）、记录处理人与处理时间、完成时发送邮件。

**数据归属**：复用 tickets、ticket_replies 表；通过 userkit 查询用户；通过 emailkit 发送邮件。

**接口摘要**：
- `GET /api/tickets/:id/submitter` — 获取提交人完整信息（姓名、公司、部门、历史工单列表）
- `POST /api/tickets/:id/complete` — 完成工单处理（记录处理人/时间，发送邮件）

### 用户评价模块 (Evaluation Module)

**职责**：工单完成后满意度评价记录。

**数据归属**：ticket_evaluations 表。

**接口摘要**：
- `POST /api/tickets/:id/evaluation` — 提交满意度评价
- `GET /api/tickets/:id/evaluation` — 获取工单评价

### 统计分析模块 (Statistics Module)

**职责**：按公司/部门维度统计工单分布、仪表盘运营指标聚合。

**数据归属**：只读查询 tickets、ticket_evaluations 表。

**接口摘要**：
- `GET /api/statistics/distribution` — 按公司/部门维度统计工单分布
- `GET /api/statistics/dashboard` — 仪表盘指标（工单量、平均响应时间、满意度、热点问题）

### 工单工作台模块 (Workbench Module)

**职责**：处理人查看待处理工单列表，支持筛选、搜索、排序和公司筛选。

**数据归属**：只读查询 tickets 表。

**接口摘要**：
- `GET /api/workbench/tickets` — 工作台工单列表（筛选/搜索/排序/公司筛选）

### 认证与权限模块

**职责**：本地密码登录、Bearer token 管理、RBAC 权限控制。

**数据归属**：通过 userkit 管理用户凭证，通过 permissionkit 管理权限注册表。

**接口摘要**：
- `POST /api/auth/login` — 登录
- `POST /api/auth/logout` — 登出
- `GET /api/auth/me` — 获取当前用户

**RBAC 角色定义**：

| 角色 | 权限 |
|---|---|
| 提交人 (submitter) | 创建工单、回复自己工单、查看自己工单、评价已完成工单 |
| 处理人 (handler) | 查看分配工单、处理工单、转派工单、回复工单、查看工作台 |
| 管理员 (admin) | 管理业务组与成员、配置分配规则、管理分类、查看统计、查看全部工单 |

### 审计日志模块

**职责**：通过 auditkit 记录工单关键操作日志（创建、分配、转派、完成、取消、评价），日志含操作人、操作时间、操作类型、工单ID。

**接口摘要**：
- `GET /api/audit-logs` — 查询操作日志（支持按工单ID、操作类型筛选）

## 3. 数据库与数据模型

### 数据库配置

SQLite 文件数据库。默认路径 `./data/ticket-system.db`，测试路径通过 `DB_PATH` 环境变量覆盖。启动前创建父目录。迁移文件位于 `migrations/sqlite/`，通过 `runMigrations(db, {directory: './migrations'})` 执行版本化迁移。

### 核心表结构

**companies** — 公司
| 列 | 类型 | 约束 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| name | TEXT | NOT NULL |

**users** — 用户（userkit 管理凭证）
| 列 | 类型 | 约束 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| name | TEXT | NOT NULL |
| email | TEXT | NOT NULL |
| company_id | TEXT | NOT NULL, FK → companies.id |
| department | TEXT | |
| password_hash | TEXT | NOT NULL (via userkit) |

**business_groups** — 业务组
| 列 | 类型 | 约束 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| company_id | TEXT | NOT NULL, FK → companies.id |
| name | TEXT | NOT NULL |

**business_group_members** — 业务组成员
| 列 | 类型 | 约束 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| group_id | TEXT | NOT NULL, FK → business_groups.id |
| user_id | TEXT | NOT NULL, FK → users.id |

**ticket_categories** — 问题分类
| 列 | 类型 | 约束 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| company_id | TEXT | NOT NULL, FK → companies.id |
| name | TEXT | NOT NULL |

**assignment_rules** — 自动分配规则
| 列 | 类型 | 约束 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| company_id | TEXT | NOT NULL, FK → companies.id |
| category_id | TEXT | NOT NULL, FK → ticket_categories.id |
| group_id | TEXT | NOT NULL, FK → business_groups.id |

**tickets** — 工单
| 列 | 类型 | 约束 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| company_id | TEXT | NOT NULL, FK → companies.id |
| subject | TEXT | NOT NULL |
| description | TEXT | |
| category_id | TEXT | FK → ticket_categories.id |
| priority | TEXT | NOT NULL, CHECK IN ('P0','P1','P2','P3','P4') |
| status | TEXT | NOT NULL, CHECK IN ('created','pending_assignment','pending_processing','completed','cancelled') |
| submitter_id | TEXT | NOT NULL, FK → users.id |
| submitter_name | TEXT | NOT NULL |
| submitter_email | TEXT | NOT NULL |
| submitter_company | TEXT | NOT NULL |
| submitter_department | TEXT | |
| assigned_group_id | TEXT | FK → business_groups.id |
| assigned_handler_id | TEXT | FK → users.id |
| created_at | TEXT | NOT NULL (ISO 8601) |
| processed_at | TEXT | |
| completed_at | TEXT | |
| completed_by | TEXT | FK → users.id |

**ticket_replies** — 工单回复
| 列 | 类型 | 约束 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| ticket_id | TEXT | NOT NULL, FK → tickets.id |
| replier_id | TEXT | NOT NULL, FK → users.id |
| replier_name | TEXT | NOT NULL |
| content | TEXT | NOT NULL |
| created_at | TEXT | NOT NULL (ISO 8601) |

**ticket_transfers** — 转派记录
| 列 | 类型 | 约束 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| ticket_id | TEXT | NOT NULL, FK → tickets.id |
| from_user_id | TEXT | NOT NULL, FK → users.id |
| to_user_id | TEXT | NOT NULL, FK → users.id |
| created_at | TEXT | NOT NULL (ISO 8601) |

**ticket_evaluations** — 满意度评价
| 列 | 类型 | 约束 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| ticket_id | TEXT | NOT NULL, FK → tickets.id |
| evaluator_id | TEXT | NOT NULL, FK → users.id |
| rating | INTEGER | NOT NULL, CHECK BETWEEN 1 AND 5 |
| comment | TEXT | |
| created_at | TEXT | NOT NULL (ISO 8601) |

### 公司隔离策略

所有工单相关表含 `company_id` 字段。查询时在数据层附加 `WHERE company_id = ?` 条件，API 层从 Bearer token 解析当前用户 `companyId` 并强制注入查询参数。非本公司的工单数据对当前用户不可见。

## 4. UI 全局基线

### 应用模板与展示模板

- **应用/业务模板**：helpdesk — 工单系统核心是高频逐条处理记录。
- **展示模板**：`split-master-detail` — 列表/队列与当前记录详情协同，左侧工单列表、右侧工单详情与回复。

### 视觉风格

Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色与状态色、短且有反馈作用的动效。状态色映射：创建（蓝灰）、待分配（琥珀）、待处理（蓝）、完成（绿）、取消（灰）。

### 应用壳与导航

- **左侧导航**：工单工作台、工单管理、统计分析、业务组管理、分配规则、操作日志。
- **顶部上下文栏**：当前公司名称、用户信息、登出按钮。
- **主工作区**：列表/详情分栏布局。统计页面使用全宽仪表盘布局。
- **目标设备**：桌面 Web，最小宽度 1024px。

### 全局状态

- **加载**：列表区域骨架屏，详情区域加载指示器。
- **空数据**：列表区域显示空态提示（如"暂无待处理工单"）。
- **错误**：页面顶部红色错误提示条，支持关闭。
- **无权限**：403 页面提示。
- **成功**：操作后简短绿色 Toast 提示，2 秒后自动消失。

## 5. 外部集成

### SMTP 邮件

emailkit 通过环境变量配置 SMTP 连接：

| 环境变量 | 用途 |
|---|---|
| `SMTP_HOST` | SMTP 服务器地址 |
| `SMTP_PORT` | SMTP 端口 |
| `SMTP_USER` | SMTP 用户名 |
| `SMTP_PASS` | SMTP 密码 |

工单完成时，系统通过 emailkit 向提交人邮箱发送完成通知邮件。邮件发送失败不阻塞工单完成流程，但记录到 auditkit 审计日志中标记发送失败。

## 6. 运行与可靠性

### 启动命令

- 常规启动：`npm start`（启动 Hono 服务端，Vite dev server 代理 API 请求）
- 端口配置：`PORT` 环境变量（默认 3000）
- 数据库路径：`DB_PATH` 环境变量（默认 `./data/ticket-system.db`），启动前自动创建父目录
- 数据库迁移：`runMigrations(db, {directory: './migrations'})` 在服务启动时执行

### 验收约定

验证脚本负责启动和清理服务。使用空闲端口启动测试实例，等待真实监听就绪后执行验收检查，完成后清理本次启动的进程和测试数据库文件。干净目录无需手动创建数据目录即可启动。
