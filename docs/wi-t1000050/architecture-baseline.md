# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 选型 | 说明 |
|---|------|------|
| 后端框架 | Hono (Node.js ≥20) | REST API 服务端，与 authkit 中间件集成 |
| 前端框架 | React + Vite | SPA 单页应用，桌面 Web |
| UI 框架 | Tailwind CSS | 原子化样式，与 React 组件配合 |
| 数据库 | SQLite（通过 dbkit） | 文件数据库，支持迁移、查询、事务 |
| 认证 | authkit + userkit（本地密码模式） | Hono 密码登录 + Bearer Token |
| 授权 | permissionkit | RBAC 权限注册表，覆盖提交人/管理员/处理人三种角色 |
| 审计 | auditkit | 持久化操作日志，记录工单生命周期关键操作 |
| 邮件 | emailkit | SMTP 邮件发送，工单完成通知 |
| 包管理 | npm | package-lock.json |

### CommonApp 模块选择

| 模块 ID | 包/版本 | 需求匹配 | manifest SHA-256 |
|---------|---------|----------|-----------------|
| dbkit | @commonapp/dbkit@0.2.0 | SQLite 持久化、查询、事务与迁移，支撑全部业务数据 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 |
| authkit | @commonapp/authkit@0.1.2 | Hono 密码登录与 Bearer 认证中间件 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 |
| userkit | @commonapp/userkit@0.1.0 | 本地用户与密码凭证存储，含 AuthKit 解析器 | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 |
| permissionkit | @commonapp/permissionkit@0.1.0 | RBAC 权限注册表与授权检查 | 09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 |
| auditkit | @commonapp/auditkit@0.1.0 | 持久化审计事件，工单操作日志 | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 |
| emailkit | @commonapp/emailkit@0.1.0 | SMTP 邮件发送，工单完成通知 | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c |

**依赖闭包**：dbkit（无依赖）、authkit（依赖 hono 运行时）、userkit（依赖 dbkit + authkit）、permissionkit（依赖 dbkit）、auditkit（依赖 dbkit）、emailkit（依赖 nodemailer 运行时）。所有模块状态 `ready`，manifest 校验通过。

**身份模式**：`local-password`（authkit + userkit 组合，生成登录、账户初始化和用户管理 API）。

### 架构总览

```
┌─────────────────────────────────────────────────────┐
│                  React + Vite SPA                    │
│  (工单工作台 / 工单详情 / 统计仪表盘 / 管理配置)      │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP / Bearer Token
┌──────────────────────┴──────────────────────────────┐
│                   Hono API Server                     │
│  ┌─────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │ authkit │ │permissionkit │ │    auditkit      │  │
│  │  中间件  │ │  授权中间件   │ │  操作日志记录    │  │
│  └────┬────┘ └──────┬───────┘ └────────┬─────────┘  │
│       │             │                   │            │
│  ┌────┴─────────────┴───────────────────┴─────────┐ │
│  │              业务路由层                           │ │
│  │  工单CRUD / 回复 / 分配 / 转派 / 统计 / 评价     │ │
│  └───────────────────────┬─────────────────────────┘ │
│                          │                            │
│  ┌──────────┐  ┌────────┴───────┐  ┌────────────┐  │
│  │ userkit  │  │     dbkit       │  │  emailkit  │  │
│  │ 用户管理  │  │  SQLite 查询/   │  │ SMTP 邮件  │  │
│  │          │  │  事务/迁移      │  │            │  │
│  └──────────┘  └────────────────┘  └────────────┘  │
└──────────────────────────────────────────────────────┘
                       │
                ┌──────┴──────┐
                │  SQLite DB  │  ./data/application.db
                └─────────────┘
```

### 运行约定

- 启动命令：`npm start`（入口 `src/server.js`，在 writableScopes 范围内）
- 监听端口：`PORT` 环境变量，默认 3000
- 数据库默认路径：`./data/application.db`（启动前自动创建父目录）
- 测试数据库覆盖：`DB_PATH` 环境变量指向隔离测试路径
- 邮件配置：通过环境变量配置 SMTP（`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`）

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 模块职责与数据归属

| 模块 | 职责 | 唯一数据归属 |
|------|------|-------------|
| 认证模块 (authkit) | 密码登录、Bearer Token 签发与校验 | 会话/Token 生命周期 |
| 用户模块 (userkit) | 本地用户 CRUD、密码凭证、用户资料 | 用户基本信息（姓名、邮箱、密码凭证） |
| 授权模块 (permissionkit) | RBAC 角色与权限注册、请求级授权检查 | 角色定义与用户-角色映射 |
| 公司与部门模块 | 公司隔离边界、部门结构 | 公司、部门数据 |
| 业务组模块 | 公司下业务组与成员管理、分类自动分配规则 | 业务组、成员关联、分配规则 |
| 工单模块 | 工单 CRUD、生命周期流转、多轮回复、转派 | 工单、工单回复、满意度评价 |
| 统计模块 | 工单分布统计、运营指标仪表盘 | 聚合查询（无独立数据，只读其他模块数据） |
| 邮件模块 (emailkit) | 工单完成邮件通知 | 无（无状态调用 emailkit） |
| 审计模块 (auditkit) | 工单生命周期操作日志持久化 | 审计事件记录 |

### 接口摘要

> 字段级细节（method/path、请求/响应字段、类型、可空性、错误、授权、幂等性）见 `technical-contract.md`。

| 接口 | 方向 | 用途 |
|------|------|------|
| `POST /api/auth/login` | 前端 → authkit | 密码登录，返回 Bearer Token |
| `POST /api/auth/logout` | 前端 → authkit | 注销当前会话 |
| `GET /api/users/me` | 前端 → 用户模块 | 获取当前登录用户完整信息（含公司、部门） |
| `GET/POST /api/tickets` | 前端 → 工单模块 | 工单列表查询 / 创建工单 |
| `GET /api/tickets/:id` | 前端 → 工单模块 | 工单详情（含回复列表） |
| `PUT /api/tickets/:id` | 前端 → 工单模块 | 更新工单（状态流转） |
| `POST /api/tickets/:id/replies` | 前端 → 工单模块 | 添加工单回复 |
| `POST /api/tickets/:id/transfer` | 前端 → 工单模块 | 工单转派 |
| `POST /api/tickets/:id/complete` | 前端 → 工单模块 | 工单完成（触发邮件通知） |
| `POST /api/tickets/:id/cancel` | 前端 → 工单模块 | 工单取消 |
| `POST /api/tickets/:id/rating` | 前端 → 工单模块 | 满意度评价 |
| `GET /api/tickets/:id/submitter-info` | 前端 → 工单模块 | 提交人完整信息（含历史工单） |
| `GET/POST /api/business-groups` | 前端 → 业务组模块 | 业务组列表 / 创建业务组 |
| `PUT/DELETE /api/business-groups/:id` | 前端 → 业务组模块 | 修改 / 删除业务组 |
| `POST /api/business-groups/:id/members` | 前端 → 业务组模块 | 添加业务组成员 |
| `DELETE /api/business-groups/:id/members/:userId` | 前端 → 业务组模块 | 移除业务组成员 |
| `GET/POST /api/assignment-rules` | 前端 → 业务组模块 | 分类自动分配规则列表 / 创建规则 |
| `DELETE /api/assignment-rules/:id` | 前端 → 业务组模块 | 删除分配规则 |
| `GET /api/statistics/dashboard` | 前端 → 统计模块 | 仪表盘指标（工单量、平均响应时间、满意度、热点问题） |
| `GET /api/statistics/distribution` | 前端 → 统计模块 | 按公司/部门维度工单分布 |
| `GET /api/audit-logs` | 前端 → 审计模块 | 操作日志查询（按工单 ID 或操作类型筛选） |

### 公司隔离边界

- 所有工单查询、统计查询、业务组查询均以当前登录用户的 `companyId` 为隔离条件
- 工单创建时自动绑定提交人的 `companyId`
- 转派目标限定为同公司业务组或处理人
- 管理员配置（业务组、分配规则）限定在公司范围内操作

### 权限模型

| 角色 | 权限范围 |
|------|---------|
| 提交人 | 创建工单、回复工单、查看本公司工单、完成后评价 |
| 管理员 | 配置公司业务组与成员、配置分类自动分配规则、手动分配工单、查看全公司工单与统计 |
| 处理人 | 查看分配给自己的待处理工单、回复工单、转派工单、完成工单、查看提交人信息 |

> RBAC 细粒度（如具体路由级权限矩阵）未规定，保持未规定；permissionkit 注册三种角色及其基础权限集，后续可扩展。

## 3. 数据模型

### 数据库表（SQLite via dbkit 迁移）

| 表 | 说明 | 关键字段 |
|----|------|---------|
| `users` (userkit 管理) | 用户 | id, name, email, password_hash, company_id, department |
| `companies` | 公司 | id, name |
| `departments` | 部门 | id, company_id, name |
| `business_groups` | 业务组 | id, company_id, name |
| `business_group_members` | 业务组成员 | id, group_id, user_id |
| `categories` | 问题分类 | id, name |
| `assignment_rules` | 分类自动分配规则 | id, company_id, category_id, target_group_id |
| `tickets` | 工单 | id, title, description, category_id, priority(P0-P4), status, submitter_id, company_id, assigned_group_id, assignee_id, processor_id, processed_at, created_at |
| `ticket_replies` | 工单回复 | id, ticket_id, replier_id, content, created_at |
| `satisfaction_ratings` | 满意度评价 | id, ticket_id, rating(1-5), submitted_at |
| `audit_events` (auditkit 管理) | 审计事件 | id, event_type, actor_id, ticket_id, detail_json, created_at |

### 迁移策略

- 使用 dbkit 的 `runMigrations(db, {directory: './migrations'})` 执行版本化 SQL 迁移
- 迁移文件位于 `migrations/sqlite/` 目录
- 不得通过 ORM 自动同步或手工改 schema 绕过迁移

### ID 类型对照

| 实体 ID | 数据库主键 | 外键类型 | API JSON 类型 | 前端类型 |
|---------|-----------|---------|--------------|---------|
| ticket id | TEXT (UUID) | TEXT | string | string |
| user id | TEXT (userkit) | TEXT | string | string |
| company id | TEXT (UUID) | TEXT | string | string |
| business_group id | TEXT (UUID) | TEXT | string | string |

> 所有实体 ID 均为 TEXT 类型 UUID，跨层一致，无需转换。

## 4. UI 全局基线

### 应用/业务模板

`helpdesk` — 工单管理系统，以工单列表与详情协同为核心工作流。

### 展示模板

`split-master-detail` — 左侧工单列表（工作台），右侧工单详情与操作区。列表与当前选中工单的详情、回复、操作协同展示。

### 视觉风格

`Modern SaaS` — 柔和中性色、细边界、少阴影、中等圆角、清晰字体；一个主色（蓝灰）与状态色（成功绿、警告橙、危险红、P0-P4 优先级色阶）；短而有反馈作用的动效。

### 应用壳与导航

- 左侧导航栏：工单工作台、统计仪表盘、管理配置（业务组、分配规则、分类）、操作日志
- 顶部上下文栏：当前公司名称、用户头像/角色、登出
- 主工作区：根据导航切换内容
- 目标设备：桌面 Web（最小宽度 1280px）

### 主要工作流

1. **工单工作台**：左侧列表（搜索、筛选、排序），右侧选中工单详情（主题、描述、分类、优先级、状态、提交人信息、回复列表、操作按钮）
2. **工单创建**：模态表单（主题、描述、分类、SLA 优先级），提交后自动分配
3. **统计仪表盘**：顶部公司筛选、KPI 卡片行（工单量、平均响应时间、满意度）、热点问题列表、分布图表
4. **管理配置**：业务组列表与成员管理、分类自动分配规则配置

### 全局状态

- 加载：骨架屏或 spinner
- 空数据：空态插图 + 引导文案
- 错误：错误提示卡片 + 重试按钮
- 无权限：403 提示页面
- 成功：Toast 通知

## 5. 外部集成

### 邮件通知 (emailkit)

- 触发点：工单完成时（`POST /api/tickets/:id/complete`）
- 收件人：工单提交人邮箱
- 邮件内容：工单 ID、主题、处理人姓名、完成时间
- 失败处理：记录审计日志，不阻塞工单完成流程；邮件发送为尽力而为

### SMTP 配置

- 通过环境变量配置：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`
- 测试环境可使用 mailtrap 或控制台日志模式

## 6. 设计决策

### 决策 1：公司隔离实现方式

- 在所有工单、业务组、分配规则表中存储 `company_id` 字段
- 所有查询在数据访问层强制按 `company_id` 过滤
- 用户登录后 `company_id` 从用户记录获取，注入请求上下文

### 决策 2：自动分配实现方式

- 工单创建后，服务端查询 `assignment_rules` 表匹配分类
- 匹配到规则：工单状态直接流转到"待处理"，分配到对应业务组
- 无匹配规则：工单保持"待分配"状态，等待管理员手动分配

### 决策 3：满意度评价一次性约束

- `satisfaction_ratings` 表对 `ticket_id` 加唯一约束
- 已存在评价记录时，再次提交返回错误

### 决策 4：历史工单查询

- 查看提交人信息时，按 `submitter_id` 查询同提交人的历史工单
- 展示字段：工单 ID、主题、状态，按创建时间降序
- 展示数量上限未规定，默认展示最近 20 条
