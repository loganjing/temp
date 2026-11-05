# 工单系统架构基线

> Work Item: wi-t1000087 · 应用名称: ticket-system · 项目: JLGSpace-88

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

- **后端**：Hono（Node.js ≥ 20），提供 RESTful API 与静态前端文件服务
- **前端**：React + Vite SPA，使用 Ant Design（`antd` + `@ant-design/icons`）组件体系
- **数据库**：SQLite，通过 dbkit 管理连接、查询、事务与版本化迁移
- **认证**：authkit + userkit，本地密码模式（Bearer Token）
- **权限**：permissionkit，RBAC 角色控制（submitter / handler / admin）
- **审计**：auditkit，持久化操作日志
- **邮件**：emailkit，SMTP 邮件发送

### 数据权威边界

- 所有工单、业务组、分配规则、评价等领域数据由服务端 SQLite 数据库权威持有
- 工单数据按公司隔离：每个 API 查询均以 `company_id` 过滤，用户只能访问所属公司的数据
- 认证凭证由 userkit 管理；业务属性（公司、部门、姓名、邮箱）由应用扩展表 `user_profiles` 持有
- 操作日志由 auditkit 持久化记录
- 邮件通知由服务端在工单完成时触发，前端不直接发送邮件

### 架构关系

```
┌─────────────────────────────────────────────────────┐
│                 浏览器 (React SPA)                    │
│  Ant Design · Vite · 工单工作台 · 仪表盘 · 管理后台    │
└───────────────────┬─────────────────────────────────┘
                    │ HTTP / JSON (Bearer Token)
┌───────────────────┴─────────────────────────────────┐
│               Hono 后端 (Node.js)                     │
│  ┌──────────┐ ┌───────────┐ ┌────────────────────┐  │
│  │ authkit  │ │ userkit   │ │ permissionkit      │  │
│  │ 认证/会话 │ │ 用户管理   │ │ RBAC 权限           │  │
│  └──────────┘ └───────────┘ └────────────────────┘  │
│  ┌──────────┐ ┌───────────┐ ┌────────────────────┐  │
│  │ auditkit │ │ emailkit  │ │ 应用领域服务         │  │
│  │ 审计日志  │ │ 邮件发送   │ │ 工单·分配·协作·统计  │  │
│  └──────────┘ └───────────┘ └────────────────────┘  │
└───────────────────┬─────────────────────────────────┘
                    │
┌───────────────────┴─────────────────────────────────┐
│              SQLite (dbkit)                           │
│  tickets · user_profiles · business_groups · ...     │
└─────────────────────────────────────────────────────┘
```

### 运行约定

- **常规启动**：`npm start`（执行 `src/server.js`），监听端口由 `PORT` 环境变量控制（默认 3000）
- **前端开发**：`npm run dev`（Vite 开发服务器，默认 5173），生产构建由 Hono 静态服务
- **数据库路径**：`DB_PATH` 环境变量覆盖（默认 `./data/ticket-system.db`），首次启动自动创建父目录
- **隔离测试**：`DB_PATH=./data/test.db`，使用空闲端口
- **邮件配置**：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM` 环境变量；测试环境未配置 SMTP 时记录日志而非阻塞完成流程

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 认证与用户模块（authkit + userkit + permissionkit + user_profiles）

**职责**：用户登录、会话管理、用户档案（公司/部门/邮箱）、RBAC 角色控制。

- authkit 提供 Bearer Token 认证中间件；userkit 提供本地用户与密码凭证管理
- userkit 生成的用户管理 API 经 AuthKit 登录认证但不检查角色；permissionkit 负责角色与权限校验
- 应用扩展表 `user_profiles` 将 userkit 用户 ID 关联到公司、部门、姓名、邮箱

**接口摘要**：

| 接口 | 方法 | 用途 | 调用方 |
|------|------|------|--------|
| `/api/auth/login` | POST | 用户登录，返回 Bearer Token | 前端 |
| `/api/auth/logout` | POST | 注销会话 | 前端 |
| `/api/auth/me` | GET | 获取当前用户信息与角色 | 前端 |
| `/api/users` | GET | 列出公司内用户 | 处理人/管理员 |
| `/api/users/:id` | GET | 获取用户档案（含公司、部门） | 处理人/管理员 |
| `/api/users/:id/tickets` | GET | 获取用户历史工单 | 处理人 |
| `/api/users` | POST | 创建用户并绑定公司档案 | 管理员 |

### 2.2 公司与组织模块

**职责**：公司管理、业务组管理、问题分类管理、分类自动分配规则配置。数据按公司隔离。

**接口摘要**：

| 接口 | 方法 | 用途 | 调用方 |
|------|------|------|--------|
| `/api/companies` | GET | 列出公司 | 管理员 |
| `/api/companies` | POST | 创建公司 | 管理员 |
| `/api/companies/:companyId/groups` | GET | 列出公司业务组 | 管理员/处理人 |
| `/api/companies/:companyId/groups` | POST | 创建业务组 | 管理员 |
| `/api/groups/:groupId/members` | POST | 添加业务组成员 | 管理员 |
| `/api/groups/:groupId/members/:userId` | DELETE | 移除业务组成员 | 管理员 |
| `/api/companies/:companyId/categories` | GET | 列出分类 | 提交人/管理员 |
| `/api/companies/:companyId/categories` | POST | 创建分类 | 管理员 |
| `/api/companies/:companyId/assignment-rules` | GET | 列出分配规则 | 管理员 |
| `/api/companies/:companyId/assignment-rules` | POST | 创建分配规则 | 管理员 |

### 2.3 工单管理模块

**职责**：工单创建、详情查看、多轮回复、生命周期状态流转、工单工作台（列表/筛选/搜索/排序）。

- 工单创建时自动应用分类分配规则，将工单分配到对应业务组
- 状态机：created → pending_assignment → pending_processing → completed；created/pending_assignment/pending_processing → cancelled
- 工单工作台支持按公司、分类、优先级筛选，按主题/工单 ID 搜索，按创建时间/优先级排序

**接口摘要**：

| 接口 | 方法 | 用途 | 调用方 |
|------|------|------|--------|
| `/api/tickets` | POST | 创建工单（自动应用分配规则） | 提交人 |
| `/api/tickets` | GET | 工单列表（工作台，支持筛选/搜索/排序） | 处理人/管理员 |
| `/api/tickets/:id` | GET | 获取工单详情（含回复、提交人信息） | 处理人/提交人 |
| `/api/tickets/:id/replies` | POST | 添加回复 | 提交人/处理人 |
| `/api/tickets/:id/assign` | POST | 分配处理人 | 管理员/处理人接单 |
| `/api/tickets/:id/complete` | POST | 完成工单（记录处理人/时间，触发邮件） | 处理人 |
| `/api/tickets/:id/cancel` | POST | 取消工单 | 提交人/管理员 |
| `/api/tickets/:id/evaluation` | POST | 提交满意度评价 | 提交人 |
| `/api/tickets/:id/logs` | GET | 查看工单操作日志 | 处理人/管理员 |

### 2.4 工单协作模块

**职责**：工单转派操作。转派仅限同一公司内（遵循公司隔离规则）。

**接口摘要**：

| 接口 | 方法 | 用途 | 调用方 |
|------|------|------|--------|
| `/api/tickets/:id/transfer` | POST | 转派工单到新处理人 | 处理人 |

### 2.5 工单处理模块

**职责**：处理工单时查看提交人完整信息（姓名、公司、部门、历史工单）；完成后记录处理人、处理时间并触发邮件通知。

- 提交人完整信息通过 `/api/users/:id`（档案）和 `/api/users/:id/tickets`（历史工单）组合提供
- 完成操作在同一个事务中更新工单状态、记录处理人/时间、写入审计日志
- 邮件通知异步发送：完成事务后调用 emailkit 发送邮件，发送失败记录日志但不回滚工单完成

### 2.6 统计分析模块

**职责**：按公司/部门维度统计工单分布；运营仪表盘展示工单量、平均响应时间、满意度、热点问题。

**接口摘要**：

| 接口 | 方法 | 用途 | 调用方 |
|------|------|------|--------|
| `/api/statistics/distribution` | GET | 工单分布（按公司/部门） | 管理员 |
| `/api/statistics/dashboard` | GET | 仪表盘运营指标 | 管理员 |

- 平均响应时间 = avg(completed_at - created_at)，单位小时，仅统计已完工单
- 满意度 = avg(satisfaction_score)，1-5 分制
- 热点问题 = 按分类聚合工单量，取 Top 5

### 2.7 日志模块（auditkit）

**职责**：记录工单相关操作审计事件。覆盖创建、分配、转派、回复、完成、取消、评价等操作。审计事件由 auditkit 持久化，支持按工单 ID 关联查询。

### 2.8 邮件通知模块（emailkit）

**职责**：工单完成时向提交人邮箱发送通知邮件。使用 SMTP 协议，配置通过环境变量。发送失败时记录日志，不影响工单完成事务。

## 3. 数据模型

所有领域表使用 TEXT 类型 UUID 作为主键。数据库 schema 通过 dbkit 版本化迁移管理，迁移文件位于 `migrations/sqlite/`。

### 领域表

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `companies` | 公司 | id PK, name, created_at |
| `user_profiles` | 用户业务档案 | id PK, user_id UNIQUE (ref userkit users), company_id (ref companies), name, email, department, created_at |
| `business_groups` | 业务组 | id PK, company_id (ref companies), name, created_at |
| `business_group_members` | 业务组成员 | id PK, group_id (ref business_groups), user_id (ref user_profiles), created_at, UNIQUE(group_id, user_id) |
| `categories` | 问题分类 | id PK, company_id (ref companies), name, created_at |
| `assignment_rules` | 分类分配规则 | id PK, company_id, category_id (ref categories), group_id (ref business_groups), created_at, UNIQUE(company_id, category_id) |
| `tickets` | 工单 | id PK, company_id, subject, description, category_id, sla_priority (P0-P4), status (created/pending_assignment/pending_processing/completed/cancelled), submitter_id (ref user_profiles), assigned_group_id (ref business_groups), assigned_handler_id (ref user_profiles), created_at, completed_at, handler_id (ref user_profiles), handler_completed_at |
| `ticket_replies` | 工单回复 | id PK, ticket_id (ref tickets), replier_id (ref user_profiles), content, created_at |
| `ticket_transfers` | 转派记录 | id PK, ticket_id (ref tickets), from_handler_id (ref user_profiles), to_handler_id (ref user_profiles), reason, created_at |
| `ticket_evaluations` | 满意度评价 | id PK, ticket_id UNIQUE (ref tickets), submitter_id (ref user_profiles), satisfaction_score (1-5), comment, created_at |

### 公司隔离规则

- 所有领域查询以当前用户的 `company_id` 过滤
- 业务组、分类、分配规则均按公司隔离
- 工单转派仅限同一公司内的处理人

### 状态机

```
created → pending_assignment → pending_processing → completed
              ↘                    ↘
            cancelled            cancelled
              ↑
           created → cancelled
```

- **created**：工单创建瞬间的初始状态
- **pending_assignment**：创建后自动应用分配规则，进入待分配状态（已分配业务组或等待手动分配）
- **pending_processing**：分配处理人后进入待处理状态
- **completed**：处理人完成处理，记录处理人和处理时间，触发邮件通知
- **cancelled**：终态，由提交人或管理员取消

### 未规定事项的设计决策

| 需求未规定事项 | 设计决策 | 依据 |
|---------------|---------|------|
| 评价评分方式 | 1-5 分制（1=非常不满意，5=非常满意） | 通用满意度评价实践 |
| 取消操作权限 | 提交人可取消自己的工单；管理员可取消任何工单 | 需求中公司隔离与角色推导 |
| 转派范围 | 仅限同一公司内 | 公司隔离规则 |
| 分类未配置规则时 | 工单进入 pending_assignment 等待手动分配 | 闭合流程的必要推荐 |
| 日志字段与展示 | 由 auditkit 标准审计事件结构决定，按工单 ID 关联查询 | auditkit 提供持久化审计事件 |

## 4. UI 基线

### 应用/业务模板

`helpdesk` — 工单管理后台，高频逐条处理工单记录。

### 展示模板

`split-master-detail` — 列表/队列与当前工单详情协同。左侧为工单列表，右侧为选中工单的详情面板。

### 视觉方向

Modern SaaS — 深色侧栏、浅色工作区、顶部上下文栏、清晰标题与主操作按钮、组织筛选与表格内容表面。柔和中性色、细边界、少阴影、中等圆角、一个主色与状态色。

### 组件体系

Ant Design（`antd` + `@ant-design/icons`）。实现参考团包内 `experts/general-app-implementation/assets/antd-workbench/example.jsx` 与 `example.css`。

### 应用壳与导航

- 左侧导航栏（深色）：工单工作台、统计分析、组织管理（业务组/分类/规则）、用户管理
- 顶部上下文栏：当前公司切换、用户信息、登出
- 主工作区：根据导航切换页面内容

### 主工作流

| 页面 | 布局 | 核心交互 |
|------|------|---------|
| 工单工作台 | 左侧工单列表 + 右侧详情面板 | 筛选（公司/分类/优先级）、搜索（主题/ID）、排序（创建时间/优先级） |
| 工单详情 | 顶部工单信息 + 中部回复列表 + 底部回复输入 | 查看提交人信息面板、回复、转派、完成、评价 |
| 创建工单 | 表单 | 主题、描述、分类、SLA 优先级 |
| 统计仪表盘 | KPI 卡片行 + 趋势图表 + 热点问题列表 | 工单量、平均响应时间、满意度、热点问题 |
| 业务组管理 | 左侧组列表 + 右侧成员表格 | 创建组、添加/移除成员 |
| 分配规则配置 | 规则表格 + 新建表单 | 分类 → 业务组映射 |

### 目标设备

桌面 Web（最小宽度 1280px）。

### 全局状态

- **加载**：表格和详情使用 Ant Design Skeleton 或 Spin
- **空数据**：表格显示 Ant Design Empty，引导创建
- **错误**：Ant Design message 提示操作错误
- **成功**：Ant Design message 提示操作成功
- **无权限**：API 返回 403 时提示无权限

## 5. CommonApp 模块集成

| 模块 | 包/版本 | SHA-256 | 需求匹配 | 集成边界 |
|------|---------|---------|---------|---------|
| dbkit | @commonapp/dbkit 0.2.0 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | SQLite 持久化、查询、事务、迁移 | 应用通过 `createDb` 管理数据库连接，迁移文件位于 `migrations/sqlite/` |
| authkit | @commonapp/authkit 0.1.2 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | Bearer Token 认证、登录/注销 | Hono 中间件，保护 `/api/*` 路由 |
| userkit | @commonapp/userkit 0.1.0 | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 本地用户与密码凭证 | 生成的用户管理 API 经 AuthKit 认证；应用扩展 `user_profiles` 关联公司/部门 |
| permissionkit | @commonapp/permissionkit 0.1.0 | 09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 | RBAC 角色权限控制 | 定义 submitter/handler/admin 角色与权限规则，Hono 中间件校验 |
| auditkit | @commonapp/auditkit 0.1.0 | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 持久化审计事件 | 工单操作时写入审计事件，按工单 ID 关联查询 |
| emailkit | @commonapp/emailkit 0.1.0 | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | SMTP 邮件发送 | 工单完成时调用 `createEmailClient` 发送通知邮件 |

### 模块安装标记

`commonapp install: dbkit authkit userkit permissionkit auditkit emailkit`

### 角色权限矩阵（permissionkit）

| 操作 | submitter | handler | admin |
|------|-----------|---------|-------|
| 创建工单 | ✓ | — | — |
| 回复工单 | ✓（自己的） | ✓（分配的） | — |
| 查看工单工作台 | — | ✓ | ✓ |
| 分配处理人 | — | ✓（接单） | ✓ |
| 转派工单 | — | ✓ | ✓ |
| 完成工单 | — | ✓ | — |
| 取消工单 | ✓（自己的） | — | ✓ |
| 满意度评价 | ✓（自己的） | — | — |
| 管理业务组 | — | — | ✓ |
| 管理分类/规则 | — | — | ✓ |
| 管理用户 | — | — | ✓ |
| 查看统计分析 | — | — | ✓ |

## 6. 外部集成

### 邮件通知（emailkit）

- **触发时机**：工单状态变为 completed 时
- **收件人**：提交人邮箱（`user_profiles.email`）
- **内容**：工单完成通知，包含工单 ID、主题、处理人、完成时间
- **SMTP 配置**：环境变量 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`
- **失败处理**：邮件发送失败时记录审计日志，不回滚工单完成事务；测试环境未配置 SMTP 时跳过实际发送并记录日志

## 7. 验证控制

### 工单完成与邮件通知验证

- 工单完成流程涉及外部 SMTP 调用，验收时需预置状态：
  - 创建工单 → 分配处理人 → 处理人完成工单
  - 未配置 SMTP 时，验证邮件发送被跳过且审计日志记录了通知意图
  - 配置 SMTP 时，验证邮件发送调用被触发（可通过邮件发送日志或 mock SMTP 验证）
- 不为邮件发送增设产品级控制入口；正常运行按产品要求执行，测试环境通过 `DB_PATH` 和 SMTP 环境变量控制
