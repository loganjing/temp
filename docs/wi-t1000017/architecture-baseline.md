# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 选型 | 说明 |
|----|------|------|
| 后端框架 | Hono (Node.js, ESM) | 新建需服务端能力的应用，采用 Hono |
| 前端框架 | React + Vite SPA | 新建前端 SPA |
| 数据库 | SQLite (better-sqlite3) | 通过 dbkit 管理，版本化迁移 |
| 认证 | authkit (@commonapp/authkit v0.1.2) | 密码登录 / Bearer Token 认证 |
| 授权 | permissionkit (@commonapp/permissionkit v0.1.0) | RBAC 权限注册表，按公司隔离 |
| 审计日志 | auditkit (@commonapp/auditkit v0.1.0) | 工单生命周期操作日志 |
| 邮件通知 | emailkit (@commonapp/emailkit v0.1.0) | 工单完成时 SMTP 邮件通知 |

### CommonApp 模块选择

| 模块 ID | 包/版本 | 需求匹配 | manifest SHA-256 |
|---------|---------|----------|------------------|
| dbkit | @commonapp/dbkit v0.2.0 | SQLite 持久化、查询、事务、版本化迁移 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 |
| authkit | @commonapp/authkit v0.1.2 | 用户密码登录、Bearer Token 鉴权 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 |
| permissionkit | @commonapp/permissionkit v0.1.0 | RBAC 角色权限，提交人/处理人/管理员三角色 | 09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 |
| auditkit | @commonapp/auditkit v0.1.0 | 工单全生命周期操作日志记录 | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 |
| emailkit | @commonapp/emailkit v0.1.0 | 工单完成后 SMTP 邮件通知提交人 | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c |

模块依赖闭包：dbkit（无模块依赖）、authkit（无模块依赖）、permissionkit（依赖 dbkit）、auditkit（依赖 dbkit）、emailkit（无模块依赖）。闭包包含 dbkit，新项目初始化时需要 workspace-bootstrap。

集成边界：dbkit 提供数据库连接与迁移；authkit 提供 Hono 中间件认证；permissionkit 提供角色注册与授权检查中间件；auditkit 提供审计事件写入；emailkit 提供 SMTP 客户端。所有模块均为 ready 状态，发行文件完整。

### 运行约定

- 启动命令：`npm start`（生产） / `npm run dev`（开发，前后端热重载）
- 监听端口：`PORT` 环境变量，默认 3000
- 数据库路径：`DB_PATH` 环境变量，默认 `./data/application.db`；打开前自动创建 `./data/` 目录
- 迁移目录：`./migrations/sqlite/`
- 验收命令：独立验证脚本负责启动和清理服务，使用空闲端口

### 数据归属

| 数据 | 权威归属 | 说明 |
|------|----------|------|
| 工单、回复、评价 | 工单系统（SQLite） | 核心业务数据，由本系统管理 |
| 业务组、成员、分配规则 | 工单系统（SQLite） | 工单分配配置，由本系统管理 |
| 操作日志 | 工单系统（auditkit → SQLite） | 审计事件由 auditkit 写入 |
| 公司、部门、用户 | 工单系统（SQLite，引用数据） | 需求明确用户/公司/部门管理不在范围内，但工单系统消费这些数据，因此在 SQLite 中建立基础引用表 |

### 安全边界

- **公司隔离**：所有工单查询按当前用户所属 company_id 过滤；permissionkit RBAC 确保提交人只能查看本公司工单，处理人只能处理其业务组接收的工单
- **角色**：提交人（submitter）、处理人（handler）、管理员（admin），通过 permissionkit 注册
- **认证**：authkit 提供密码登录与 Bearer Token，所有 API 需认证

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 模块边界

```
┌─────────────────────────────────────────────────┐
│                  React SPA (Vite)               │
│  工单工作台 · 工单详情 · 统计仪表盘 ·          │
│  业务组管理 · 分配规则管理                       │
└────────────────────┬────────────────────────────┘
                     │ HTTP / JSON
┌────────────────────┴────────────────────────────┐
│              Hono API Server                     │
│  ┌───────────┐ ┌──────────┐ ┌────────────────┐ │
│  │  authkit  │ │permission│ │   auditkit     │ │
│  │  (认证)   │ │ kit(授权)│ │  (操作日志)    │ │
│  └───────────┘ └──────────┘ └────────────────┘ │
│  ┌──────────────────────────────────────────┐    │
│  │           emailkit (邮件通知)            │    │
│  └──────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────┐    │
│  │     dbkit → SQLite (持久化)              │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### 模块职责与接口摘要

| 模块 | 职责 | 接口摘要 |
|------|------|----------|
| 认证模块 | 用户登录、Token 签发与校验 | `POST /api/auth/login`、`GET /api/auth/me` |
| 工单模块 | 工单 CRUD、状态流转、分配、转派、完成、取消 | `POST /api/tickets`、`GET /api/tickets`、`GET /api/tickets/:id`、`PATCH /api/tickets/:id/status`、`POST /api/tickets/:id/transfer`、`POST /api/tickets/:id/complete`、`POST /api/tickets/:id/cancel` |
| 回复模块 | 工单多轮回复 | `POST /api/tickets/:id/replies`、`GET /api/tickets/:id/replies` |
| 评价模块 | 满意度评价 | `POST /api/tickets/:id/evaluation`、`GET /api/tickets/:id/evaluation` |
| 业务组模块 | 业务组与成员管理 | `GET/POST /api/business-groups`、`POST /api/business-groups/:id/members`、`DELETE /api/business-groups/:id/members/:userId` |
| 分配规则模块 | 分类→业务组自动分配规则 | `GET/POST /api/assignment-rules`、`DELETE /api/assignment-rules/:id` |
| 统计模块 | 工单量、响应时间、满意度、热点问题 | `GET /api/statistics/overview`、`GET /api/statistics/distribution` |
| 工作台模块 | 待处理工单列表筛选/搜索/排序 | `GET /api/workbench/tickets`（含 query 参数） |
| 操作日志模块 | 查询工单操作日志 | `GET /api/tickets/:id/logs` |
| 提交人信息模块 | 查看提交人完整信息及历史工单 | `GET /api/tickets/:id/submitter-info` |

### 工单状态流转

```
创建 → 待分配 → 待处理 → 完成
                     ↑         ↑
              转派(处理人变更)  │
                     │         │
              任意状态 ────────→ 取消
```

- **创建 → 待分配**：提交人创建工单后自动进入待分配
- **待分配 → 待处理**：按分类匹配分配规则自动分配到业务组；无匹配规则则停留待分配等待手动分配
- **待处理 → 待处理**：转派操作，处理人变更，状态不变
- **待处理 → 完成**：处理人完成处理，记录处理人和处理时间，发送邮件通知
- **任意 → 取消**：工单可被取消

### 数据模型

#### 引用数据表

| 表 | 主要字段 | 说明 |
|----|----------|------|
| companies | id (INTEGER PK), name (TEXT) | 公司 |
| departments | id (INTEGER PK), company_id (INTEGER FK), name (TEXT) | 部门 |
| users | id (INTEGER PK), name (TEXT), email (TEXT), company_id (INTEGER FK), department_id (INTEGER FK) | 用户（含提交人、处理人） |
| categories | id (INTEGER PK), name (TEXT) | 问题分类 |

#### 业务数据表

| 表 | 主要字段 | 说明 |
|----|----------|------|
| tickets | id (INTEGER PK), title (TEXT), description (TEXT), category_id (INTEGER FK), submitter_id (INTEGER FK), company_id (INTEGER FK), sla_priority (TEXT, P0-P4), status (TEXT), handler_id (INTEGER FK nullable), business_group_id (INTEGER FK nullable), created_at (TEXT ISO), completed_at (TEXT ISO nullable) | 工单主表 |
| ticket_replies | id (INTEGER PK), ticket_id (INTEGER FK), replier_id (INTEGER FK), content (TEXT), created_at (TEXT ISO) | 工单回复 |
| business_groups | id (INTEGER PK), company_id (INTEGER FK), name (TEXT) | 业务组 |
| business_group_members | id (INTEGER PK), group_id (INTEGER FK), user_id (INTEGER FK) | 业务组成员 |
| category_assignment_rules | id (INTEGER PK), company_id (INTEGER FK), category_id (INTEGER FK), target_group_id (INTEGER FK) | 分类→业务组分配规则 |
| satisfaction_evaluations | id (INTEGER PK), ticket_id (INTEGER FK), rating (INTEGER 1-5), created_at (TEXT ISO) | 用户评价 |

操作日志通过 auditkit 写入，不单独建表。

### UI 全局基线

- **应用/业务模板**：helpdesk（工单系统）
- **展示模板**：`split-master-detail`（列表/队列与当前工单详情协同）
- **视觉风格**：Modern SaaS（柔和中性色、细边界、少阴影、中等圆角、一个主色与状态色）
- **应用壳**：左侧导航栏（工单工作台、统计仪表盘、业务组管理、分配规则管理）、顶部上下文栏（当前用户/公司/角色）、主工作区（列表 + 详情分栏）
- **目标设备**：桌面 Web（默认）
- **关键状态**：加载中（骨架屏）、空数据（引导操作）、错误（重试提示）、无权限（提示并返回）
- **主要工作流**：工单工作台查看待处理列表 → 点击工单进入详情分栏 → 查看提交人信息面板 → 回复/转派/完成处理 → 统计仪表盘查看运营指标

### 外部集成

- **SMTP 邮件**（emailkit）：工单完成时向提交人邮箱发送完成通知邮件。SMTP 配置通过环境变量。邮件发送失败时记录错误日志，不影响工单完成状态。

### 运行与可靠性

- SQLite 单文件数据库，默认 `./data/application.db`
- 版本化迁移：SQL 文件置于 `./migrations/sqlite/`，通过 `runMigrations(db, {directory: './migrations'})` 执行
- 邮件发送为尽力而为：失败时记录日志不阻塞工单完成
- 端口可通过 `PORT` 配置，数据库路径可通过 `DB_PATH` 覆盖
