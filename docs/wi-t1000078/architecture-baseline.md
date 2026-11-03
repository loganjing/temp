# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 后端框架 | Hono (Node.js >=20, ESM) | 轻量 HTTP 服务，与 authkit 运行依赖一致 |
| 前端框架 | React 18 + Vite | SPA，构建产物由 Hono 静态托管 |
| UI 框架 | Tailwind CSS | 组件样式与布局 |
| 数据库 | SQLite (better-sqlite3) | 通过 @commonapp/dbkit 管理，文件数据库 |
| 认证 | @commonapp/authkit + @commonapp/userkit | 本地密码模式 (local-password) |
| 授权 | @commonapp/permissionkit | RBAC，定义提交人/处理人/管理员三角色 |
| 审计 | @commonapp/auditkit | 持久化工单操作日志 |
| 邮件 | @commonapp/emailkit | SMTP 邮件发送 (nodemailer)，工单完成通知 |
| 包管理器 | npm | package-lock.json 管理依赖 |

### 1.2 架构总览

```
┌───────────────────────────────────────────────────┐
│                 React + Vite SPA                   │
│  ┌───────────┐ ┌───────────┐ ┌─────────────────┐  │
│  │ 工单工作台 │ │ 统计仪表盘 │ │ 管理后台        │  │
│  │ (列表+详情) │ │ (KPI+图表) │ │ (业务组/规则)  │  │
│  └───────────┘ └───────────┘ └─────────────────┘  │
└──────────────────────┬────────────────────────────┘
                       │ REST API (JSON, Bearer Token)
┌──────────────────────┴────────────────────────────┐
│                   Hono Server                      │
│  ┌─────────┐ ┌───────────┐ ┌─────────┐ ┌────────┐│
│  │Auth MW  │ │Ticket Svc│ │Stats Svc│ │Admin   ││
│  │(authkit)│ │           │ │         │ │Svc     ││
│  └─────────┘ └─────┬─────┘ └────┬────┘ └───┬────┘│
│  ┌─────────────────┴────────────┴───────────┘    │
│  │  CommonApp: dbkit / authkit / userkit /        │
│  │  permissionkit / auditkit / emailkit           │
│  └──────────────────────┬────────────────────────┘
└─────────────────────────┬─────────────────────────┘
                          │
                ┌─────────┴─────────┐
                │  SQLite (.db file) │
                └───────────────────┘
```

### 1.3 运行约定

- 常规启动: `npm start`（启动 Hono 服务并静态托管前端构建产物）
- 开发模式: `npm run dev`（Vite 开发服务器代理 API 到 Hono）
- 监听端口: `PORT` 环境变量，默认 3000
- 数据库路径: `DB_PATH` 环境变量，默认 `./data/application.db`（相对于应用包根 `app/ticket-system/`）；服务启动前自动创建 `./data/` 目录
- 隔离测试数据库: 验证脚本通过 `DB_PATH` 指向独立路径或 `:memory:`，使用空闲端口，等待真实监听就绪后运行
- 数据库迁移: `src/server/migrations/sqlite/` 目录下版本化 SQL 文件，通过 dbkit `runMigrations` 执行；禁止 ORM 自动同步或手工改 schema
- 应用包根: `app/ticket-system/`（`packageRoot`，见 `platform-baseline.json`）
- 邮件 SMTP 配置: `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` 环境变量

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 工单管理

- 职责: 工单 CRUD、生命周期状态流转（创建→待分配→待处理→完成/取消）、多轮回复
- 数据归属: `tickets`、`ticket_replies` 表为唯一事实来源
- 接口摘要:
  - `GET /api/tickets` — 工单列表，支持 status/category/company/keyword 筛选与排序
  - `POST /api/tickets` — 创建工单，触发自动分配逻辑
  - `GET /api/tickets/:id` — 工单详情，含提交人信息、回复列表、评价、操作日志
  - `PATCH /api/tickets/:id/status` — 状态流转（待分配→待处理→完成/取消）
  - `POST /api/tickets/:id/replies` — 添加回复

### 2.2 工单分配

- 职责: 业务组管理（创建/成员）、分配规则配置、按分类自动分配
- 数据归属: `business_groups`、`business_group_members`、`assignment_rules` 表
- 接口摘要:
  - `GET /api/business-groups` — 列出当前公司业务组
  - `POST /api/business-groups` — 创建业务组
  - `POST /api/business-groups/:id/members` — 添加成员
  - `DELETE /api/business-groups/:id/members/:userId` — 移除成员
  - `GET /api/assignment-rules` — 列出分配规则
  - `POST /api/assignment-rules` — 创建分配规则（公司+分类→目标业务组）
  - `DELETE /api/assignment-rules/:id` — 删除分配规则

### 2.3 工单协作（转派）

- 职责: 将工单从当前业务组转派到其他业务组，记录转派历史
- 数据归属: `tickets.assigned_group_id` 更新，`ticket_transfer_records` 记录历史
- 接口摘要:
  - `POST /api/tickets/:id/transfer` — 转派到目标业务组，状态保持待处理

### 2.4 工单处理

- 职责: 工单处理流程、提交人完整信息查看、完成时邮件通知
- 数据归属: `tickets.handler_id`、`tickets.completed_at`；提交人信息聚合自 `user_profiles` 与历史 `tickets`
- 接口摘要:
  - `GET /api/users/:id/profile` — 提交人完整信息（姓名、公司、部门、历史工单列表）
  - `POST /api/tickets/:id/complete` — 完成工单，记录处理人和处理时间，触发邮件通知

### 2.5 用户评价

- 职责: 工单完成后提交人提交满意度评价（1-5 星），评价与工单关联
- 数据归属: `ticket_evaluations` 表，一对一关联工单
- 接口摘要:
  - `POST /api/tickets/:id/evaluation` — 提交评价
  - `GET /api/tickets/:id/evaluation` — 查看评价

### 2.6 统计分析

- 职责: 按公司/部门维度统计工单分布，仪表盘展示运营指标
- 数据归属: 聚合查询 `tickets`、`ticket_evaluations`、`ticket_replies`，无独立写入
- 接口摘要:
  - `GET /api/statistics/overview` — 工单量、平均响应时间、平均满意度、热点问题分类
  - `GET /api/statistics/distribution` — 按公司/部门维度的工单分布

### 2.7 工单工作台

- 职责: 待处理工单列表，支持筛选、搜索、排序，可按公司维度筛选
- 数据归属: 复用工单管理模块数据，无独立存储
- 接口摘要:
  - `GET /api/tickets?status=pending_processing` — 待处理工单列表，支持 `company`、`keyword`、`sort` 参数

### 2.8 操作日志

- 职责: 记录工单操作日志（创建、分配、转派、处理、完成、取消），包含操作人、操作时间和操作类型
- 数据归属: auditkit 管理的审计事件表
- 接口摘要:
  - `GET /api/tickets/:id/logs` — 查看指定工单的操作日志

## 3. 数据模型与数据库

### 3.1 数据库

SQLite 文件数据库，通过 dbkit 初始化和管理。默认路径 `./data/application.db`（相对于应用包根），测试通过 `DB_PATH` 覆盖或使用 `:memory:`。迁移文件存放于 `src/server/migrations/sqlite/`，使用版本化 SQL，通过 `runMigrations` 执行。

平台模块已生成以下迁移（位于 `src/server/migrations/sqlite/`）:
- `0001_platform_users.sql` — userkit 用户表
- `0002_platform_permissions.sql` — permissionkit 权限/角色表
- `0003_platform_audit_events.sql` — auditkit 审计事件表

项目领域迁移从 `0004_` 开始编号，与平台迁移共存于同一目录。

### 3.2 项目领域表

以下为项目拥有的领域表，与 CommonApp 模块管理的表（用户账户、审计事件、权限注册表等）共存于同一 SQLite 数据库。

#### companies

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| name | TEXT | NOT NULL | 公司名称 |
| created_at | TEXT | NOT NULL | 创建时间 (ISO 8601) |

#### departments

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| company_id | TEXT | NOT NULL, FK → companies.id | 所属公司 |
| name | TEXT | NOT NULL | 部门名称 |
| created_at | TEXT | NOT NULL | 创建时间 |

#### user_profiles

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, UNIQUE | 关联 userkit 用户 ID |
| company_id | TEXT | NOT NULL, FK → companies.id | 所属公司（租户隔离键） |
| department_id | TEXT | FK → departments.id | 所属部门，可空 |
| name | TEXT | NOT NULL | 姓名 |
| email | TEXT | NOT NULL | 邮箱 |
| created_at | TEXT | NOT NULL | 创建时间 |

#### tickets

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| company_id | TEXT | NOT NULL, FK → companies.id | 公司隔离键 |
| subject | TEXT | NOT NULL | 主题 |
| description | TEXT | NOT NULL | 描述 |
| category | TEXT | NOT NULL | 问题分类 |
| priority | TEXT | NOT NULL | SLA 优先级: P0/P1/P2/P3/P4 |
| status | TEXT | NOT NULL, DEFAULT 'created' | 状态: created/pending_assignment/pending_processing/completed/cancelled |
| submitter_id | TEXT | NOT NULL, FK → user_profiles.id | 提交人 |
| submitter_name | TEXT | NOT NULL | 提交人姓名（冗余，邮件通知用） |
| submitter_email | TEXT | NOT NULL | 提交人邮箱（冗余，邮件通知用） |
| assigned_group_id | TEXT | FK → business_groups.id | 分配业务组，可空 |
| handler_id | TEXT | FK → user_profiles.id | 处理人，可空 |
| created_at | TEXT | NOT NULL | 创建时间 |
| completed_at | TEXT | | 完成时间，可空 |
| cancelled_at | TEXT | | 取消时间，可空 |

#### ticket_replies

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| ticket_id | TEXT | NOT NULL, FK → tickets.id | 关联工单 |
| replier_id | TEXT | NOT NULL, FK → user_profiles.id | 回复人 |
| content | TEXT | NOT NULL | 回复内容 |
| created_at | TEXT | NOT NULL | 回复时间 |

#### business_groups

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| company_id | TEXT | NOT NULL, FK → companies.id | 所属公司 |
| name | TEXT | NOT NULL | 业务组名称 |
| created_at | TEXT | NOT NULL | 创建时间 |

#### business_group_members

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| group_id | TEXT | NOT NULL, FK → business_groups.id | 业务组 |
| user_id | TEXT | NOT NULL, FK → user_profiles.id | 成员 |
| created_at | TEXT | NOT NULL | 加入时间 |

#### assignment_rules

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| company_id | TEXT | NOT NULL, FK → companies.id | 所属公司 |
| category | TEXT | NOT NULL | 匹配的问题分类 |
| target_group_id | TEXT | NOT NULL, FK → business_groups.id | 自动分配目标业务组 |
| created_at | TEXT | NOT NULL | 创建时间 |

#### ticket_evaluations

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| ticket_id | TEXT | NOT NULL, UNIQUE, FK → tickets.id | 一对一关联工单 |
| evaluator_id | TEXT | NOT NULL, FK → user_profiles.id | 评价人（提交人） |
| rating | INTEGER | NOT NULL | 满意度评分 1-5 |
| comment | TEXT | | 评价备注，可空 |
| created_at | TEXT | NOT NULL | 评价时间 |

#### ticket_transfer_records

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| ticket_id | TEXT | NOT NULL, FK → tickets.id | 工单 |
| from_group_id | TEXT | FK → business_groups.id | 原业务组，可空（首次分配时为空） |
| to_group_id | TEXT | NOT NULL, FK → business_groups.id | 目标业务组 |
| transferred_by | TEXT | NOT NULL, FK → user_profiles.id | 转派人 |
| created_at | TEXT | NOT NULL | 转派时间 |

### 3.3 租户隔离

- 所有领域查询通过 `company_id` 过滤实现公司隔离。
- 认证中间件从 authkit 会话中解析当前用户，通过 `user_profiles` 表映射到 `company_id`，注入请求上下文。
- API 层校验请求资源的 `company_id` 与当前用户的 `company_id` 一致，不一致返回 403。

### 3.4 迁移策略

- 版本化 SQL 迁移文件存放于 `src/server/migrations/sqlite/`，按序号命名（如 `0004_companies.sql`）。平台迁移 `0001`-`0003` 已由 userkit/permissionkit/auditkit 生成，领域迁移从 `0004` 开始。
- 使用 dbkit 的 `runMigrations(db, {directory: '../migrations/'})` 在 `bootstrap.ts` 中执行（路径相对于 `src/server/platform/`）。
- 禁止 ORM 自动同步或手工改 schema 绕过迁移。

## 4. CommonApp 模块集成

| 模块 ID | 包/版本 | SHA-256 | 用途 | 集成方式 |
|---|---|---|---|---|
| dbkit | @commonapp/dbkit@0.2.0 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | SQLite 持久化、查询、事务、迁移 | 项目数据层基础；`createDb` 初始化，`runMigrations` 执行迁移 |
| authkit | @commonapp/authkit@0.1.2 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | 密码登录、Bearer 认证 | Hono 认证中间件，登录/登出 API |
| userkit | @commonapp/userkit@0.1.0 | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 本地用户、密码凭证 | 用户账户管理，与 `user_profiles` 通过 `user_id` 关联 |
| permissionkit | @commonapp/permissionkit@0.1.0 | 09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 | RBAC 权限注册表 | 定义三角色: submitter/handler/admin，API 授权检查 |
| auditkit | @commonapp/auditkit@0.1.0 | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 持久化审计事件 | 工单操作日志记录（创建、分配、转派、处理、完成、取消） |
| emailkit | @commonapp/emailkit@0.1.0 | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | SMTP 邮件发送 | 工单完成时发送通知邮件到提交人邮箱 |

模块安装标记: `commonapp install: dbkit`、`commonapp install: authkit`、`commonapp install: userkit`、`commonapp install: permissionkit`、`commonapp install: auditkit`、`commonapp install: emailkit`

依赖闭包:
- dbkit: 无模块依赖
- authkit: 无模块依赖
- userkit → dbkit, authkit
- permissionkit → dbkit
- auditkit → dbkit
- emailkit: 无模块依赖

集成边界:
- userkit 管理用户账户和凭证；`user_profiles` 表存储业务扩展信息（公司、部门、姓名、邮箱），通过 `user_id` 外键关联 userkit 用户 ID。userkit 的主键类型为 TEXT (UUID)，`user_profiles.user_id` 与之一致。
- permissionkit 定义三个角色: `submitter`（提交人）、`handler`（处理人）、`admin`（管理员）。角色与 userkit 用户绑定，API 中间件根据角色决定访问权限。
- auditkit 记录工单操作事件，事件类型包括: ticket_created、ticket_assigned、ticket_transferred、ticket_processed、ticket_completed、ticket_cancelled。每条事件记录操作人 ID、操作时间和操作详情。
- emailkit 在工单完成时由后端服务调用 `createEmailClient` 发送通知邮件。SMTP 配置通过环境变量注入。邮件发送失败不回滚工单完成状态，记录错误日志。
- 所有模块共享同一 SQLite 数据库实例，通过 dbkit 统一管理连接。

## 5. 全局 UI 基线

- 应用/业务模板: helpdesk
- 展示模板: `split-master-detail` — 列表/队列与当前记录详情协同
- 视觉风格: Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色与状态色、短且有反馈作用的动效
- 应用壳: 左侧导航栏 + 顶部上下文栏 + 主工作区
- 目标设备: 桌面 Web

导航结构:
- 工单工作台（默认首页）— 待处理工单列表 + 详情并列
- 工单管理 — 创建工单入口、全部工单列表
- 统计分析 — 仪表盘，使用 `command-center-dashboard` 布局（KPI 卡片 + 趋势图表 + 明细列表）
- 管理后台 — 业务组管理、分配规则配置（仅 admin 角色可见）

主工作流布局:
- 工单工作台: 左侧工单列表（支持筛选/搜索/排序），右侧选中工单的详情面板。详情面板包含: 工单基本信息、提交人信息（姓名/公司/部门/历史工单）、回复列表（多轮）、操作按钮（回复/转派/完成/取消）、满意度评价区域。
- 统计仪表盘: 顶部维度切换（公司/部门），KPI 卡片行（工单量/平均响应时间/满意度/热点分类），下方明细图表与列表。

全局状态:
- 加载中: 骨架屏占位
- 空数据: 引导文案 + 创建入口
- 错误: 错误提示 + 重试按钮
- 无权限: 提示无权限并返回

满意度评价形式: 1-5 星评分（设计阶段确定，需求未规定具体形式）。

## 6. 外部集成

### 邮件通知

- 通过 emailkit (nodemailer SMTP) 发送。
- 触发时机: 工单状态从待处理流转到完成时。
- 收件人: 工单 `submitter_email`。
- SMTP 配置: `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` 环境变量。
- 失败处理: 邮件发送失败不回滚工单完成状态，记录错误日志到审计事件，不影响主流程。

## 7. 运行与验证

### 启动命令

- 常规: `npm start` — 启动 Hono 服务，静态托管前端构建产物。
- 开发: `npm run dev` — Vite 开发服务器 + Hono API 代理。

### 端口与数据库

- 服务端口: `PORT` 环境变量，默认 3000。
- 数据库: `DB_PATH` 环境变量，默认 `./data/application.db`（相对于应用包根 `app/ticket-system/`）。启动前自动创建 `./data/` 目录。
- 隔离验证: 验证脚本设置独立的 `DB_PATH` 和空闲 `PORT`，等待真实监听就绪后运行，测试结束清理本次启动进程。

### 自动分配验证

- 创建工单时按分类匹配分配规则，结果确定可验证。无匹配规则时工单保持待分配状态。

### 邮件通知验证

- 测试环境通过 `SMTP_HOST` 配置测试 SMTP（如 Ethereal）或在日志中记录邮件内容。验收时检查邮件发送日志确认通知触发，不要求实际收信。

### 状态流转验证

- 状态流转为确定操作，通过 API 调用后查询工单状态验证。涉及完成状态时同时验证处理人、处理时间和邮件触发。
