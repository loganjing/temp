# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 技术栈

| 层 | 技术选型 | 说明 |
|----|----------|------|
| 后端框架 | Hono (Node.js ≥ 20) | 新建全栈应用默认选型 |
| 前端框架 | React + Vite | SPA 单页应用 |
| 数据库 | SQLite (better-sqlite3) | 通过 dbkit 管理，支持持久化、跨用户共享、结构化查询和事务 |
| UI 框架 | Tailwind CSS | 通用业务应用视觉 |
| 包管理器 | npm | 使用 package-lock.json |

### 1.2 CommonApp 模块选择

| 模块 ID | 包/版本 | Manifest SHA-256 | 需求匹配 | 集成边界 |
|---------|---------|------------------|----------|----------|
| dbkit | @commonapp/dbkit@0.2.0 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | SQLite 持久化、查询、事务、版本化迁移 | 数据库连接、迁移目录管理 |
| authkit | @commonapp/authkit@0.1.2 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | 用户认证、Bearer token | Hono 中间件，登录/登出 API |
| userkit | @commonapp/userkit@0.1.0 | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 本地用户、密码凭证 | 用户身份表，AuthKit 解析器 |
| permissionkit | @commonapp/permissionkit@0.1.0 | 09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 | RBAC 权限注册表 | 工单按公司隔离的授权检查 |
| auditkit | @commonapp/auditkit@0.1.0 | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 持久化审计事件 | 工单操作日志记录（AC-13） |
| emailkit | @commonapp/emailkit@0.1.0 | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | SMTP 邮件发送 | 工单完成通知邮件（AC-08） |

模块安装标记：`commonapp install: dbkit, authkit, userkit, permissionkit, auditkit, emailkit`

依赖闭包说明：
- dbkit 无模块依赖，是 userkit、permissionkit、auditkit 的基础依赖
- userkit 依赖 dbkit + authkit，提供本地密码登录、用户凭证和 AuthKit 解析器
- authkit + userkit 组合启用 `identityMode: local-password`，workspace-init 将生成登录、首个账户初始化和用户管理页面/API
- permissionkit 不随身份模块自动安装，单独选择用于公司级 RBAC 授权
- auditkit 不随身份模块自动安装，单独选择用于操作日志
- emailkit 无模块依赖，提供 SMTP 邮件发送能力

不选择 attachment 模块：需求未提及工单附件功能，当前基线不引入文件上传能力。不选择 i18n 模块：需求未提及多语言要求。

### 1.3 UI 全局基线

| 维度 | 决策 | 依据 |
|------|------|------|
| 应用/业务模板 | helpdesk | 工单系统属于客服/帮助台业务域 |
| 展示模板 | `split-master-detail` | 核心动作为高频逐条处理工单记录，列表/队列与当前工单详情协同 |
| 视觉预设 | Modern SaaS | 通用业务应用默认值：柔和中性色、细边界、少阴影、一个主色与状态色 |
| 应用壳 | 左侧导航 + 顶部上下文栏 + 主工作区 | 业务后台标准布局 |
| 目标设备 | 桌面 Web | 需求未明确要求移动端/窄屏 |
| 状态覆盖 | 加载态、空数据、错误、无权限、成功反馈 | 工单列表、详情、仪表盘均需覆盖 |

主工作流布局：
- **工单工作台**：左侧工单列表（筛选/搜索/排序），右侧选中工单详情面板，支持回复、转派、处理等操作
- **统计仪表盘**：顶部筛选条件，KPI 卡片行，下方图表区和明细表
- **管理页面**：业务组管理、分类分配规则配置采用表格+表单布局

关键全局状态：
- 加载态：列表骨架屏，详情区 spinner
- 空数据：列表空提示，引导创建工单
- 错误：表单内联错误 + 全局 toast
- 无权限：403 页面，说明权限不足
- 成功：操作后 toast 反馈 + 列表刷新

### 1.4 系统边界

```
┌─────────────────────────────────────────────────┐
│                   浏览器 (SPA)                    │
│  React + Vite + Tailwind CSS                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ 工单工作台│ │ 统计仪表盘│ │ 管理（业务组/规则）│  │
│  └────┬─────┘ └────┬─────┘ └────────┬─────────┘  │
└───────┼────────────┼────────────────┼────────────┘
        │            │                │
        ▼            ▼                ▼
┌─────────────────────────────────────────────────┐
│              Hono 后端 (Node.js)                  │
│  ┌──────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │Auth  │ │工单管理   │ │分配/协作  │ │统计/工作台│ │
│  │API   │ │API       │ │API       │ │API      │ │
│  └──┬───┘ └────┬─────┘ └────┬─────┘ └────┬────┘ │
│     │          │            │            │       │
│  ┌──┴──┐ ┌────┴─────┐ ┌────┴─────┐ ┌────┴────┐  │
│  │auth │ │userkit   │ │permission│ │auditkit │  │
│  │kit  │ │          │ │kit       │ │         │  │
│  └─────┘ └──────────┘ └──────────┘ └─────────┘  │
│         ┌──────────────────────────┐             │
│         │       dbkit (SQLite)     │             │
│         └──────────────────────────┘             │
│                   ┌──────────┐                    │
│                   │ emailkit │──→ SMTP Server     │
│                   └──────────┘                    │
└─────────────────────────────────────────────────┘
```

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 模块职责与数据归属

| 模块 | 职责 | 唯一数据归属 | 接口方向 |
|------|------|-------------|----------|
| 认证模块 (authkit + userkit) | 用户登录、登出、会话管理、用户凭证存储 | users 表（凭证） | 浏览器 → 后端 |
| 工单管理模块 | 工单 CRUD、回复管理、状态流转 | tickets、ticket_replies 表 | 浏览器 → 后端 |
| 工单分配模块 | 业务组管理、成员管理、分类分配规则、自动分配 | business_groups、business_group_members、category_assignment_rules 表 | 浏览器 → 后端；工单管理模块 → 分配模块（创建时触发自动分配） |
| 工单协作模块 | 工单转派操作 | ticket_transfers 表 | 浏览器 → 后端；转派写入 auditkit 日志 |
| 工单处理模块 | 处理记录、完成通知、提交人信息查询 | processing_records 表 | 浏览器 → 后端；完成时调用 emailkit 发送邮件 |
| 用户评价模块 | 满意度评价 | satisfaction_ratings 表 | 浏览器 → 后端 |
| 统计分析模块 | 工单分布统计、运营指标仪表盘 | 无独立数据，聚合查询 tickets 等表 | 浏览器 → 后端（只读） |
| 工单工作台模块 | 待处理工单列表、筛选/搜索/排序 | 无独立数据，查询 tickets 表 | 浏览器 → 后端（只读） |
| 操作日志模块 (auditkit) | 审计事件持久化、日志查询 | audit_events 表 | 后端各模块 → auditkit（写入）；浏览器 → 后端（查询） |
| 权限模块 (permissionkit) | RBAC 角色权限、公司隔离授权 | roles、role_permissions、user_roles 表 | 后端各模块 → permissionkit（授权检查） |
| 组织数据模块 | 公司、部门管理 | companies、departments、user_profiles 表 | 浏览器 → 后端 |

### 2.2 接口摘要

认证接口（authkit + userkit 提供）：
- `POST /api/auth/login` — 用户登录
- `POST /api/auth/logout` — 用户登出
- `GET /api/auth/me` — 获取当前用户信息

工单管理接口：
- `POST /api/tickets` — 创建工单（创建后触发自动分配规则匹配）
- `GET /api/tickets` — 工单列表（支持筛选、搜索、排序）
- `GET /api/tickets/:id` — 工单详情（含回复列表）
- `PATCH /api/tickets/:id` — 更新工单
- `POST /api/tickets/:id/replies` — 添加工单回复
- `POST /api/tickets/:id/transfer` — 转派工单
- `POST /api/tickets/:id/complete` — 完成工单（触发邮件通知）

工单处理接口：
- `GET /api/tickets/:id/submitter` — 查看提交人完整信息（含历史工单）
- `POST /api/tickets/:id/processing-records` — 记录处理信息

用户评价接口：
- `POST /api/tickets/:id/rating` — 提交满意度评价

分配管理接口：
- `GET /api/business-groups` — 业务组列表
- `POST /api/business-groups` — 创建业务组
- `PATCH /api/business-groups/:id/members` — 更新业务组成员
- `GET /api/category-rules` — 分类分配规则列表
- `POST /api/category-rules` — 创建分类分配规则

统计与工作台接口：
- `GET /api/statistics/distribution` — 工单分布统计（按公司/部门）
- `GET /api/statistics/dashboard` — 运营指标仪表盘数据
- `GET /api/workbench/tickets` — 工作台待处理工单列表

操作日志接口：
- `GET /api/audit-logs` — 操作日志列表（auditkit 提供）

用户与组织接口：
- `GET /api/departments` — 部门列表
- `GET /api/users/:id/profile` — 用户档案（含公司、部门信息）

字段级 API 契约详见 `docs/wi-t1000392/technical-contract.md`。

### 2.3 工单状态流转与自动分配

工单生命周期状态机：

```
创建 ──→ 待分配 ──→ 待处理 ──→ 完成
              │        │
              │        └──→ 取消
              │
              └──(匹配分类规则)──→ 待处理
```

关键流转规则：
- 工单创建后进入"待分配"状态
- 若公司已配置匹配该分类的分配规则，自动分配到对应业务组，状态流转到"待处理"
- 若无匹配规则，保持"待分配"，等待手动分配
- "待处理"状态下可转派（保持"待处理"）或完成（流转到"完成"）
- "待处理"状态下可取消（流转到"取消"）
- "完成"和"取消"为终态
- 工单完成时触发 emailkit 发送邮件通知提交人

## 3. 数据库模型

数据库：SQLite，通过 dbkit 管理，默认路径 `./data/ticket-system.db`，测试路径通过 `DB_PATH` 环境变量覆盖。所有主键使用 TEXT 类型（UUID v4），由应用层生成。

### 3.1 应用管理的表

**companies** — 公司（数据隔离边界）

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PK | UUID |
| name | TEXT | NOT NULL | 公司名称 |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

**departments** — 部门

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PK | UUID |
| company_id | TEXT | NOT NULL, FK → companies.id | 所属公司 |
| name | TEXT | NOT NULL | 部门名称 |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

**user_profiles** — 用户档案（扩展 userkit 用户）

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PK | UUID |
| user_id | TEXT | NOT NULL, FK → users.id | 关联 userkit 用户表 |
| company_id | TEXT | NOT NULL, FK → companies.id | 所属公司 |
| department_id | TEXT | FK → departments.id | 所属部门（可空） |
| display_name | TEXT | NOT NULL | 姓名 |
| email | TEXT | NOT NULL | 邮箱（用于通知） |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

**business_groups** — 业务组

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PK | UUID |
| company_id | TEXT | NOT NULL, FK → companies.id | 所属公司 |
| name | TEXT | NOT NULL | 业务组名称 |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

**business_group_members** — 业务组成员

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PK | UUID |
| group_id | TEXT | NOT NULL, FK → business_groups.id | 所属业务组 |
| user_id | TEXT | NOT NULL, FK → users.id | 成员用户 |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

**categories** — 问题分类（全局）

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PK | UUID |
| name | TEXT | NOT NULL | 分类名称 |
| description | TEXT | 分类描述（可空） |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

**tickets** — 工单

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PK | UUID |
| company_id | TEXT | NOT NULL, FK → companies.id | 所属公司（隔离边界） |
| subject | TEXT | NOT NULL | 主题 |
| description | TEXT | NOT NULL | 描述 |
| category_id | TEXT | NOT NULL, FK → categories.id | 问题分类 |
| sla_priority | TEXT | NOT NULL | SLA 优先级：P0/P1/P2/P3/P4 |
| submitter_id | TEXT | NOT NULL, FK → users.id | 提交人 |
| status | TEXT | NOT NULL | 状态：created/pending_assignment/pending_processing/completed/cancelled |
| assigned_group_id | TEXT | FK → business_groups.id | 分配到的业务组 |
| handler_id | TEXT | FK → users.id | 处理人 |
| created_at | TEXT | NOT NULL | 创建时间 |
| updated_at | TEXT | NOT NULL | 更新时间 |

**ticket_replies** — 工单回复

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PK | UUID |
| ticket_id | TEXT | NOT NULL, FK → tickets.id | 关联工单 |
| replier_id | TEXT | NOT NULL, FK → users.id | 回复人 |
| content | TEXT | NOT NULL | 回复内容 |
| created_at | TEXT | NOT NULL | 回复时间 |

**processing_records** — 工单处理记录

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PK | UUID |
| ticket_id | TEXT | NOT NULL, FK → tickets.id | 关联工单 |
| handler_id | TEXT | NOT NULL, FK → users.id | 处理人 |
| processed_at | TEXT | NOT NULL | 处理时间 |

**satisfaction_ratings** — 用户评价

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PK | UUID |
| ticket_id | TEXT | NOT NULL, UNIQUE, FK → tickets.id | 关联工单（一工单一评价） |
| rating | INTEGER | NOT NULL | 满意度评分：1-5 |
| comment | TEXT | 评价备注（可空） |
| created_at | TEXT | NOT NULL | 评价时间 |

**category_assignment_rules** — 分类分配规则

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PK | UUID |
| company_id | TEXT | NOT NULL, FK → companies.id | 所属公司 |
| category_id | TEXT | NOT NULL, FK → categories.id | 匹配的分类 |
| target_group_id | TEXT | NOT NULL, FK → business_groups.id | 目标业务组 |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

**ticket_transfers** — 工单转派记录

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PK | UUID |
| ticket_id | TEXT | NOT NULL, FK → tickets.id | 关联工单 |
| from_group_id | TEXT | FK → business_groups.id | 原业务组 |
| to_group_id | TEXT | NOT NULL, FK → business_groups.id | 目标业务组 |
| transferred_by | TEXT | NOT NULL, FK → users.id | 转派人 |
| transferred_at | TEXT | NOT NULL | 转派时间 |
| reason | TEXT | 转派原因（可空） |

### 3.2 CommonApp 管理的表

以下表由 CommonApp 模块管理，应用通过模块 API 访问，不在应用迁移中定义：

- **users** (userkit) — 用户凭证表（id, email, password_hash, created_at）
- **audit_events** (auditkit) — 审计事件表（id, event_type, entity_type, entity_id, actor_id, payload, created_at）
- **roles / role_permissions / user_roles** (permissionkit) — RBAC 权限表

### 3.3 迁移策略

应用管理的表使用 dbkit 版本化迁移，SQL 文件位于 `migrations/sqlite/`。数据库 schema 变更必须通过迁移文件，不得通过 ORM 自动同步或手工改 schema。userkit/permissionkit/auditkit 管理的表由各自模块的迁移负责。

## 4. 外部集成

### 4.1 邮件通知（emailkit）

- **触发时机**：工单状态流转到"完成"时
- **收件人**：工单提交人邮箱（user_profiles.email）
- **发送方式**：通过 emailkit 的 SMTP 客户端发送
- **配置**：SMTP 服务器配置通过环境变量（SMTP_HOST、SMTP_PORT、SMTP_USER、SMTP_PASS）
- **失败处理**：邮件发送失败不阻断工单完成，记录错误到 auditkit 日志；验证环境可使用邮件控制台输出替代真实 SMTP

### 4.2 公司隔离授权

- 所有 API 请求经过 authkit 认证中间件，获取当前用户身份
- 通过 user_profiles 获取用户所属 company_id
- 所有工单、业务组、分配规则、统计查询自动添加 `WHERE company_id = ?` 过滤
- permissionkit 用于角色级权限控制（提交人、处理人、业务组管理员）

## 5. 运行与可靠性

### 5.1 启动与配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | 3000 | 服务监听端口 |
| `DB_PATH` | `./data/ticket-system.db` | SQLite 数据库文件路径 |
| `SMTP_HOST` | — | SMTP 服务器地址 |
| `SMTP_PORT` | 587 | SMTP 端口 |
| `SMTP_USER` | — | SMTP 用户名 |
| `SMTP_PASS` | — | SMTP 密码 |

- 常规启动：`npm start`（生产模式）或 `npm run dev`（开发模式）
- 数据库初始化：启动时自动运行 dbkit 迁移，创建父目录
- 隔离验证：使用 `DB_PATH` 指定测试数据库路径，使用空闲端口
- 干净目录无需手动创建数据目录即可启动

### 5.2 入口约定

- 后端入口：`src/server.js`（在 writableScopes 范围内）
- 前端构建产物由 Hono 静态服务中间件提供
- 验收命令与常规启动命令分开记录

## 6. 验收可重复性

工单系统验收主要依赖确定的状态流转和 API 交互，无随机结果、动画或定时任务。自动分配规则基于分类匹配，结果确定。

需预置状态的验收场景：
- **AC-03（公司隔离）**：预置两个公司、各一个用户和一条工单，验证跨公司不可见
- **AC-05（自动分配）**：预置分类分配规则，创建工单后验证状态自动流转
- **AC-08（邮件通知）**：验证环境使用邮件控制台输出替代真实 SMTP，检查输出内容包含工单完成信息
- **AC-10/AC-11（统计）**：预置多条不同公司/部门的工单，验证聚合结果

恢复初态：每个验收场景使用独立测试数据库（`DB_PATH` 指定），验收后清理测试进程和数据库文件。
