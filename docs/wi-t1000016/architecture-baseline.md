# 工单系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | React 18 + Vite SPA | 新建业务后台默认方案，组件化开发 |
| 后端 | Hono (Node.js ≥20) | 轻量 HTTP 框架，与 authkit/runtime 依赖一致 |
| 数据库 | SQLite (better-sqlite3) | 单文件持久化，满足多公司数据隔离与结构化查询需求 |
| 认证 | authkit + userkit | 密码登录 + Bearer 令牌，本地用户凭证存储 |
| 权限 | permissionkit | RBAC 注册表，实现角色与公司隔离 |
| 审计 | auditkit | 持久化操作日志，记录工单生命周期事件 |
| 邮件 | emailkit (nodemailer) | 工单完成 SMTP 通知 |

### 1.2 CommonApp 模块选择

| 模块 | 版本 | 包名 | manifest SHA-256 | 需求匹配 | 集成边界 |
|---|---|---|---|---|---|
| dbkit | 0.2.0 | @commonapp/dbkit | `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6` | SQLite 持久化、迁移 | 提供 `createDb`/`runMigrations`，项目负责 schema 迁移文件 |
| authkit | 0.1.2 | @commonapp/authkit | `a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02` | 密码登录、Bearer 认证 | Hono 中间件注入认证上下文 |
| userkit | 0.1.0 | @commonapp/userkit | `40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4` | 本地用户、密码凭证 | 依赖 dbkit+authkit；项目在 users 表扩展公司/部门字段 |
| permissionkit | 0.1.0 | @commonapp/permissionkit | `09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228` | RBAC 授权 | 依赖 dbkit；项目注册 submitter/handler/admin 角色 |
| auditkit | 0.1.0 | @commonapp/auditkit | `27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1` | 工单操作日志 | 依赖 dbkit；项目记录创建/分配/转派/处理/完成/取消事件 |
| emailkit | 0.1.0 | @commonapp/emailkit | `a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c` | SMTP 邮件发送 | 工单完成时调用，无模块依赖 |

依赖闭包：dbkit 无模块依赖；authkit 无模块依赖；userkit → [dbkit, authkit]；permissionkit → [dbkit]；auditkit → [dbkit]；emailkit 无模块依赖。所有模块状态为 `ready`，运行时依赖分别为 better-sqlite3、hono、nodemailer。

模块安装标记：`commonapp install: dbkit`、`commonapp install: authkit`、`commonapp install: userkit`、`commonapp install: permissionkit`、`commonapp install: auditkit`、`commonapp install: emailkit`。

### 1.3 架构总览

```
┌──────────────────────────────────────────────┐
│            React/Vite SPA (前端)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ 工单工作台 │ │ 工单详情  │ │ 统计仪表盘    │ │
│  ├──────────┤ ├──────────┤ ├──────────────┤ │
│  │ 业务组管理 │ │ 分配规则  │ │ 用户评价      │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
└───────────────────┬──────────────────────────┘
              HTTP/JSON (Bearer Token)
┌───────────────────┴──────────────────────────┐
│           Hono API Server (后端)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ 工单服务   │ │ 分配服务  │ │ 协作服务(转派) │ │
│  ├──────────┤ ├──────────┤ ├──────────────┤ │
│  │ 统计服务   │ │ 评价服务  │ │ 邮件服务      │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
│  ┌──────────────────────────────────────────┐ │
│  │  authkit │ userkit │ permissionkit      │ │
│  │  auditkit │ emailkit                    │ │
│  └──────────────────────────────────────────┘ │
└───────────────────┬──────────────────────────┘
                    │
              SQLite (dbkit)
```

### 1.4 公司隔离策略

所有业务表包含 `company_id` 列。后端在每个查询中通过认证上下文提取当前用户所属 `company_id`，自动附加 `WHERE company_id = ?` 条件。权限中间件在路由入口校验用户角色与公司归属，确保跨公司数据不可见。

## 2. UI 全局基线

### 2.1 应用/业务模板

**helpdesk** — 工单为核心业务对象，围绕工单创建、分配、处理、评价展开。

### 2.2 展示模板

**split-master-detail** — 工单工作台以左侧列表 + 右侧详情的拆分布局为主，支持高频逐条处理工单。统计仪表盘单独使用 dashboard 布局（顶部筛选 + KPI 卡片 + 趋势/明细区域）。

### 2.3 视觉风格

**Modern SaaS** — 柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色与状态色、短而有反馈的动效。状态色映射：P0 红、P1 橙、P2 黄、P3 蓝、P4 灰。

### 2.4 布局与设备策略

- 应用壳：左侧固定导航栏（工单工作台、统计仪表盘、业务组管理、分配规则、个人设置），顶部上下文栏显示当前用户与公司，右侧主工作区。
- 目标设备：桌面 Web（最小宽度 1024px）。
- 导航项按角色显示：提交人可见工单工作台与个人设置；处理人可见工单工作台与统计仪表盘；管理员可见全部。

### 2.5 关键全局状态

- **加载**：列表区域骨架屏，详情区域 spinner。
- **空数据**：列表无数据时显示引导创建工单的空态插画与按钮。
- **错误**：API 失败显示行内错误提示，不阻塞其他区域。
- **成功**：创建、分配、转派、完成等操作后显示 toast 反馈。
- **无权限**：跨公司访问或角色不足时显示 403 提示页面。

### 2.6 主要页面

| 页面 | 展示模板 | 核心内容 |
|---|---|---|
| 工单工作台 | split-master-detail | 左侧：工单列表（筛选/搜索/排序）；右侧：选中工单详情与回复区 |
| 工单详情 | split-master-detail 右侧 | 工单信息、多轮回复、提交人完整信息（含历史工单）、转派操作、完成/取消操作、评价 |
| 统计仪表盘 | dashboard | KPI 卡片（工单量/平均响应时间/满意度）、工单分布（公司/部门维度）、热点问题排名 |
| 业务组管理 | saas-ops-console | 公司业务组列表、成员管理 |
| 分配规则管理 | saas-ops-console | 分类→业务组映射规则列表与配置 |

## 3. 数据模型

### 3.1 数据库表设计

以下为项目自有业务表，由 dbkit 迁移管理。userkit/users 表扩展 `company_id` 和 `department` 列。

| 表名 | 说明 | 核心列 |
|---|---|---|
| companies | 公司 | id (TEXT PK), name, created_at |
| users | 用户（扩展 userkit） | id (TEXT PK), company_id (FK), name, email, department, role, created_at |
| business_groups | 业务组 | id (TEXT PK), company_id (FK), name, created_at |
| business_group_members | 业务组成员 | id (TEXT PK), group_id (FK), user_id (FK), created_at |
| categories | 问题分类 | id (TEXT PK), company_id (FK), name, created_at |
| assignment_rules | 分配规则 | id (TEXT PK), company_id (FK), category_id (FK), group_id (FK), created_at |
| tickets | 工单 | id (TEXT PK), company_id (FK), subject, description, category_id (FK), priority (TEXT: P0-P4), status (TEXT), submitter_id (FK), handler_id (FK NULLABLE), group_id (FK NULLABLE), created_at, completed_at (NULLABLE) |
| ticket_replies | 工单回复 | id (TEXT PK), ticket_id (FK), replier_id (FK), content, created_at |
| ticket_transfers | 转派记录 | id (TEXT PK), ticket_id (FK), from_user_id (FK), to_user_id (FK NULLABLE), to_group_id (FK NULLABLE), created_at |
| ticket_evaluations | 用户评价 | id (TEXT PK), ticket_id (FK), rating (INTEGER 1-5), comment (TEXT NULLABLE), created_at |

工单操作日志通过 auditkit 持久化，不单独建表。auditkit 存储 event_type、entity_id、entity_type、operator_id、payload (JSON)、created_at。

### 3.2 ID 策略

所有主键使用 TEXT 类型，值为 UUID v4 字符串（`crypto.randomUUID()`）。同一 ID 在数据库主键、外键引用和 API JSON 中保持一致，无需类型转换。

### 3.3 索引策略

- tickets: idx_tickets_company_status (company_id, status) — 工作台按公司筛选待处理工单
- tickets: idx_tickets_submitter (submitter_id) — 查询提交人历史工单
- tickets: idx_tickets_company_created (company_id, created_at DESC) — 按时间排序
- ticket_replies: idx_replies_ticket (ticket_id, created_at) — 回复按时间排序
- assignment_rules: idx_rules_company_category (company_id, category_id) — 自动分配匹配
- business_group_members: idx_members_group_user (group_id, user_id) — 成员查询

### 3.4 迁移管理

数据库 schema 通过 dbkit `runMigrations` 管理，SQL 迁移文件存放于 `migrations/sqlite/` 目录。版本递增，不通过 ORM 自动同步。

<!-- system-design: architecture-boundaries -->
## 4. 领域责任与接口摘要

### 4.1 后端服务模块

| 模块 | 唯一数据归属 | 核心接口（方向：前端 → 后端） |
|---|---|---|
| 工单服务 | tickets, ticket_replies, ticket_evaluations 表 | POST /api/tickets（创建）、GET /api/tickets（列表）、GET /api/tickets/:id（详情）、PATCH /api/tickets/:id/status（状态流转）、POST /api/tickets/:id/replies（回复）、POST /api/tickets/:id/evaluation（评价） |
| 分配服务 | business_groups, business_group_members, assignment_rules, categories 表 | POST /api/business-groups（创建业务组）、GET /api/business-groups（列表）、POST /api/business-groups/:id/members（添加成员）、POST /api/categories（创建分类）、POST /api/assignment-rules（配置规则）、GET /api/assignment-rules（规则列表） |
| 协作服务 | ticket_transfers 表 | POST /api/tickets/:id/transfer（转派） |
| 提交人信息服务 | 读取 users + tickets 表 | GET /api/tickets/:id/submitter-info（提交人完整信息含历史工单） |
| 统计服务 | 聚合查询 tickets, ticket_evaluations 表 | GET /api/dashboard/stats（运营指标）、GET /api/dashboard/distribution（工单分布） |
| 认证服务 | authkit + userkit 管理 | POST /api/auth/login（登录）、GET /api/auth/me（当前用户） |

### 4.2 工单生命周期与自动分配

工单状态流转由工单服务管理：

1. **创建**：提交人创建工单 → 状态 = `created`，写入 auditkit 日志。
2. **自动分配**：查询 assignment_rules 表按 company_id + category_id 匹配。
   - 匹配成功 → 分配到业务组，状态 = `pending`（待处理），handler_id 暂为空。
   - 未匹配 → 状态 = `unassigned`（待分配），等待人工分配。
3. **人工分配**：管理员或组长手动分配到处理人，状态 → `pending`。
4. **转派**：在 `pending` 状态下转派给其他处理人或业务组，状态保持 `pending`，记录 ticket_transfers。
5. **完成**：处理人标记完成，记录 handler_id + completed_at，状态 = `completed`，触发 emailkit 发送邮件。
6. **取消**：在 `unassigned` 或 `pending` 状态下取消，状态 = `cancelled`，终止流程。

### 4.3 前端模块边界

| 模块 | 职责 | 调用接口 |
|---|---|---|
| 工单工作台 | 工单列表筛选/搜索/排序、列表项点击切换详情 | GET /api/tickets |
| 工单详情 | 工单信息展示、多轮回复、提交人信息、转派/完成/取消操作、评价 | GET /api/tickets/:id, GET /api/tickets/:id/submitter-info, POST replies/transfer/evaluation |
| 统计仪表盘 | KPI 指标、分布图表、热点问题 | GET /api/dashboard/stats, GET /api/dashboard/distribution |
| 业务组管理 | 业务组 CRUD、成员管理 | GET/POST /api/business-groups, POST /:id/members |
| 分配规则管理 | 分类与规则配置 | GET/POST /api/categories, GET/POST /api/assignment-rules |

## 5. 外部集成

### 5.1 邮件通知

- 集成方式：emailkit (`createEmailClient`)，通过 SMTP 发送。
- 触发时机：工单状态变为 `completed` 时，后端调用 emailkit 向提交人邮箱发送完成通知邮件。
- 配置：SMTP 连接参数通过环境变量配置（`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`）。
- 失败可见性：邮件发送失败不阻断工单完成流程，记录失败日志到 auditkit，前端显示"邮件发送失败"状态提示。

## 6. 运行约定

### 6.1 启动命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 前端 Vite 开发服务器 + 后端 Hono 开发服务器（concurrently） |
| `npm start` | 生产模式启动后端服务 |
| `npm run build` | 前端构建 |
| `npm run migrate` | 执行数据库迁移 |

### 6.2 端口与路径

- 后端默认端口：`PORT` 环境变量，默认 3000。
- 前端 Vite 开发端口：5173，开发时代理 `/api` 到后端。
- 数据库默认路径：`DB_PATH` 环境变量，默认 `./data/ticket-system.db`。
- 测试数据库路径：`DB_PATH` 覆盖为 `./data/test-ticket-system.db`。
- 启动时自动创建 `./data/` 目录（若不存在）。

### 6.3 入口文件

后端入口：`src/server.js`（在可写范围内）。前端入口：`src/main.jsx` + `index.html`。

### 6.4 隔离测试

验证使用空闲端口，等待真实监听就绪后执行。验证脚本负责启动和清理服务，不额外后台启动。文件数据库测试路径在脚本执行前清理，执行后清理本次启动的进程。

## 7. 架构决策记录

### ADR-01：选择 SQLite 而非 PostgreSQL

工单系统为新建单服务应用，SQLite 单文件部署满足多公司数据隔离与结构化查询需求，无需额外数据库服务进程。dbkit 已封装 better-sqlite3 驱动、迁移和事务支持。后续如需高并发写入可迁移至 PostgreSQL，迁移文件保持版本化。

### ADR-02：操作日志使用 auditkit 而非自建日志表

auditkit 提供持久化审计事件与敏感字段脱敏，满足需求中对工单生命周期关键操作（创建/分配/转派/处理/完成/取消）的日志记录要求。避免重复造轮子，与 dbkit 事务集成。

### ADR-03：满意度评价采用 1-5 分制

需求未规定评价制式，选择 1-5 整数评分（对应非常不满意到非常满意），便于统计仪表盘计算平均满意度分值，前端可展示为星级评分。
