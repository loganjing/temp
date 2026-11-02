# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 选型 | 依据 |
|----|------|------|
| 后端框架 | Hono | 新建全栈应用默认选型；需服务端权威数据、API 路由、中间件 |
| 前端框架 | React + Vite SPA | 新建全栈应用默认选型；单页应用承载工单工作台、仪表盘等界面 |
| UI 框架 | Tailwind CSS | 业务后台默认视觉承载，配合组件库实现紧凑可扫读布局 |
| 数据库 | SQLite（dbkit） | 工单、回复、业务组、日志等多实体关系数据，需持久化、事务、结构化查询与迁移 |
| 包管理器 | npm | 新建 Node 应用默认 |

### CommonApp 模块选择

| 模块 | 包名 | 版本 | SHA-256 | 需求匹配 |
|------|------|------|---------|----------|
| dbkit | @commonapp/dbkit | 0.2.0 | sha256:f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | 工单/回复/业务组/评价等多实体持久化、事务、版本化迁移 |
| authkit | @commonapp/authkit | 0.1.2 | sha256:a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | 提交人/处理人/管理员登录认证，Bearer token 会话 |
| userkit | @commonapp/userkit | 0.1.0 | sha256:40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 本地用户与密码凭证存储，关联公司/部门信息 |
| permissionkit | @commonapp/permissionkit | 0.1.0 | sha256:09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 | RBAC 权限注册表，实现公司隔离与角色授权（提交人/处理人/管理员） |
| auditkit | @commonapp/auditkit | 0.1.0 | sha256:27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 工单操作日志持久化，记录操作人、操作类型、操作时间 |
| emailkit | @commonapp/emailkit | 0.1.0 | sha256:a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | 工单完成后向提交人邮箱发送通知邮件 |

**依赖闭包：** userkit → dbkit + authkit；permissionkit → dbkit；auditkit → dbkit。dbkit 为核心持久化层，authkit 和 emailkit 无模块间依赖。

**identityMode：** `local-password`。使用 authkit + userkit 的本地密码模式，workspace-init 生成登录页、首个账户初始化和用户管理 API。项目内扩展用户模型以承载公司、部门和角色信息。

**安装标记：**
- commonapp install: dbkit
- commonapp install: authkit
- commonapp install: userkit
- commonapp install: permissionkit
- commonapp install: auditkit
- commonapp install: emailkit

### 应用结构

```
app/ticket-system/
├── server.js                # Hono 服务入口
├── package.json
├── migrations/
│   └── sqlite/              # 版本化数据库迁移
├── src/
│   ├── server/
│   │   ├── routes/          # API 路由模块
│   │   ├── services/        # 业务逻辑
│   │   ├── middleware/       # 公司隔离、权限中间件
│   │   └── db.ts            # dbkit 数据库实例
│   └── client/
│       ├── App.tsx          # 应用根组件
│       ├── pages/           # 页面组件
│       ├── components/      # 通用组件
│       └── api/             # API 调用层
└── data/                    # SQLite 数据文件目录
```

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 认证与用户模块

**职责：** 用户登录/登出、会话管理、用户信息管理。基于 authkit + userkit 扩展，在用户表上增加公司、部门和角色字段。

| 接口 | 方法 | 路径 | 用途 | 调用方向 |
|------|------|------|------|----------|
| 登录 | POST | /api/auth/login | 用户名密码登录，返回 Bearer token | 前端 → 后端 |
| 登出 | POST | /api/auth/logout | 注销当前会话 | 前端 → 后端 |
| 当前用户 | GET | /api/auth/me | 获取当前登录用户信息（含公司、部门、角色） | 前端 → 后端 |
| 用户列表 | GET | /api/users | 按公司筛选用户列表 | 前端 → 后端 |
| 创建用户 | POST | /api/users | 管理员创建用户（含公司、部门、角色） | 前端 → 后端 |

**数据归属：** 用户表为权威源，存储用户名、邮箱、姓名、公司 ID、部门 ID、角色。

### 工单模块

**职责：** 工单 CRUD、多轮回复、生命周期状态流转。工单创建时触发自动分配规则匹配。

| 接口 | 方法 | 路径 | 用途 | 调用方向 |
|------|------|------|------|----------|
| 创建工单 | POST | /api/tickets | 提交人创建工单，触发自动分配 | 前端 → 后端 |
| 工单列表 | GET | /api/tickets | 分页查询，支持筛选/搜索/排序 | 前端 → 后端 |
| 工单详情 | GET | /api/tickets/:id | 含工单字段、回复列表 | 前端 → 后端 |
| 更新工单 | PUT | /api/tickets/:id | 修改工单基本信息 | 前端 → 后端 |
| 添加回复 | POST | /api/tickets/:id/replies | 在工单中添加回复 | 前端 → 后端 |
| 回复列表 | GET | /api/tickets/:id/replies | 按时间排列的回复列表 | 前端 → 后端 |
| 完成工单 | POST | /api/tickets/:id/complete | 处理人标记完成，记录处理人/时间，触发邮件 | 前端 → 后端 |
| 取消工单 | POST | /api/tickets/:id/cancel | 取消工单 | 前端 → 后端 |
| 提交人信息 | GET | /api/tickets/:id/submitter-info | 含姓名、公司、部门、历史工单 | 前端 → 后端 |
| 工单日志 | GET | /api/tickets/:id/logs | 工单操作日志列表 | 前端 → 后端 |

**数据归属：** tickets 表为工单权威源；ticket_replies 表为回复权威源。所有查询按 company_id 隔离。

### 分配与协作模块

**职责：** 业务组管理、成员管理、分类自动分配规则、工单分配与转派。

| 接口 | 方法 | 路径 | 用途 | 调用方向 |
|------|------|------|------|----------|
| 业务组列表 | GET | /api/companies/:companyId/groups | 公司下业务组列表 | 前端 → 后端 |
| 创建业务组 | POST | /api/companies/:companyId/groups | 管理员创建业务组 | 前端 → 后端 |
| 成员列表 | GET | /api/companies/:companyId/groups/:groupId/members | 业务组成员列表 | 前端 → 后端 |
| 添加成员 | POST | /api/companies/:companyId/groups/:groupId/members | 向业务组添加成员 | 前端 → 后端 |
| 移除成员 | DELETE | /api/companies/:companyId/groups/:groupId/members/:userId | 从业务组移除成员 | 前端 → 后端 |
| 分配规则列表 | GET | /api/companies/:companyId/auto-assign-rules | 分类→业务组规则列表 | 前端 → 后端 |
| 创建分配规则 | POST | /api/companies/:companyId/auto-assign-rules | 配置分类自动分配规则 | 前端 → 后端 |
| 分配工单 | POST | /api/tickets/:id/assign | 手动分配到处理人或业务组 | 前端 → 后端 |
| 转派工单 | POST | /api/tickets/:id/transfer | 转派给其他处理人或业务组 | 前端 → 后端 |

**数据归属：** business_groups、business_group_members、auto_assign_rules、ticket_transfers 表为各自权威源。

### 工单分类模块

**职责：** 管理公司级问题分类，分类用于工单标记和自动分配规则匹配。

| 接口 | 方法 | 路径 | 用途 | 调用方向 |
|------|------|------|------|----------|
| 分类列表 | GET | /api/companies/:companyId/categories | 公司下分类列表 | 前端 → 后端 |
| 创建分类 | POST | /api/companies/:companyId/categories | 管理员创建分类 | 前端 → 后端 |

### 评价模块

**职责：** 工单完成后提交人满意度评价，评价与已完成工单关联。

| 接口 | 方法 | 路径 | 用途 | 调用方向 |
|------|------|------|------|----------|
| 获取评价 | GET | /api/tickets/:id/evaluation | 查看工单评价 | 前端 → 后端 |
| 提交评价 | POST | /api/tickets/:id/evaluation | 提交人提交满意度评价 | 前端 → 后端 |

**评分形式：** 采用 1-5 分整数评分（5=非常满意，1=非常不满意），附可选文字评论。需求未规定具体分制，此为实现选型。

### 统计分析模块

**职责：** 按公司/部门维度统计工单分布，仪表盘展示工单量、平均响应时间、满意度、热点问题。

| 接口 | 方法 | 路径 | 用途 | 调用方向 |
|------|------|------|------|----------|
| 工单分布 | GET | /api/statistics/distribution | 按公司/部门维度统计工单分布 | 前端 → 后端 |
| 仪表盘 | GET | /api/statistics/dashboard | 工单量、平均响应时间、满意度、热点问题 | 前端 → 后端 |

**数据归属：** 统计数据由服务端从 tickets、ticket_evaluations 表实时聚合计算，无独立存储。

### 工作台模块

**职责：** 查看待处理工单列表，支持按公司筛选、关键词搜索和字段排序。

| 接口 | 方法 | 路径 | 用途 | 调用方向 |
|------|------|------|------|----------|
| 工作台列表 | GET | /api/workbench/tickets | 待处理工单列表，支持筛选/搜索/排序 | 前端 → 后端 |

### 审计日志模块（auditkit）

**职责：** 基于 auditkit 持久化工单操作日志，记录操作人、操作类型和操作时间。覆盖创建、分配、转派、处理、完成、取消等操作。

**数据归属：** audit_events 表为日志权威源，由 auditkit 管理。工单模块在各操作点写入审计事件。

### 邮件通知模块（emailkit）

**职责：** 基于 emailkit 通过 SMTP 发送邮件。工单状态变为"完成"时，向提交人邮箱发送完成通知。

**集成边界：** emailkit 提供 SMTP 客户端，邮件发送为异步操作；SMTP 配置通过环境变量提供。发送失败不阻塞工单完成，记录失败日志。

## 3. 数据模型与归属

### 公司隔离策略

所有业务表包含 `company_id` 字段。查询中间件在 API 层强制注入当前用户的 `company_id` 过滤条件，确保用户只能访问本公司数据。管理员操作同样受公司边界约束——管理员只能管理本公司的业务组、分类和规则。

### 核心实体

| 实体 | 表名 | 主键 | 说明 |
|------|------|------|------|
| 公司 | companies | TEXT (UUID) | 工单隔离边界 |
| 部门 | departments | TEXT (UUID) | 公司下部门，用于提交人信息和统计维度 |
| 用户 | users | TEXT (UUID) | userkit 扩展，含 company_id、department_id、role |
| 问题分类 | ticket_categories | TEXT (UUID) | 公司级分类 |
| 工单 | tickets | TEXT (UUID) | 核心实体，含状态、SLA、分配信息 |
| 工单回复 | ticket_replies | TEXT (UUID) | 多轮回复，关联工单和回复人 |
| 业务组 | business_groups | TEXT (UUID) | 公司下处理团队 |
| 业务组成员 | business_group_members | TEXT (UUID) | 关联业务组和用户 |
| 自动分配规则 | auto_assign_rules | TEXT (UUID) | 分类→业务组映射 |
| 转派记录 | ticket_transfers | TEXT (UUID) | 记录转派人、目标、时间 |
| 工单评价 | ticket_evaluations | TEXT (UUID) | 满意度评分与评论 |
| 操作日志 | audit_events | TEXT (PK by auditkit) | auditkit 管理，操作审计 |

### 工单状态流转

```
created → pending_assignment → pending_processing → completed
                ↓                      ↓
              cancelled             cancelled
```

- **created**：工单刚提交，短暂状态
- **pending_assignment**：等待分配（手动或自动规则匹配）
- **pending_processing**：已分配到业务组/处理人，等待处理
- **completed**：处理完成，记录处理人和处理时间，触发邮件通知
- **cancelled**：从 pending_assignment 或 pending_processing 取消

**自动分配流程：** 工单创建后检查该公司是否存在匹配工单分类的 auto_assign_rule，若匹配则自动分配到对应 business_group，状态流转为 pending_processing。

### SLA 优先级

P0（最高）→ P1 → P2 → P3 → P4（最低），存储为 TEXT 枚举值。工作台默认按优先级降序排列。

## 4. UI 全局基线

### 展示模板

`split-master-detail` — 工单系统属于高频逐条处理记录场景，列表/队列与当前工单详情协同工作。

**主工作流布局：** 左侧工单列表（含筛选、搜索、排序），右侧选中工单的详情面板（含回复、操作、提交人信息、日志）。统计分析页面使用全宽仪表盘布局。

### 视觉风格

Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、清晰字体。主色用于操作按钮和状态高亮，状态色用于工单状态和优先级标识。

### 应用壳与导航

- **应用壳：** 左侧固定导航栏（工单工作台、工单管理、统计分析、业务组管理、分类管理），顶部上下文栏（当前用户、公司切换）
- **主工作区：** 根据导航选择展示对应模块
- **目标设备：** 桌面 Web，最小宽度 1280px

### 关键全局状态

| 状态 | 说明 |
|------|------|
| 加载 | 列表和详情加载时显示骨架屏 |
| 空数据 | 无工单时显示空态提示和创建入口 |
| 错误 | API 错误时显示错误提示，支持重试 |
| 无权限 | 跨公司访问或角色不足时显示无权限提示 |

## 5. 运行约定

### 启动命令

- **常规启动：** `npm start`（启动 Hono 后端服务）
- **前端开发：** `npm run dev`（Vite 开发服务器）
- **数据库迁移：** `npm run migrate`（执行 dbkit 版本化迁移）

### 端口配置

- 后端服务端口：`PORT` 环境变量，默认 3000
- 前端开发服务器端口：Vite 默认 5173

### 数据库

- **持久化路径：** `DB_PATH` 环境变量，默认 `./data/application.db`
- **测试覆盖：** 验证时通过 `DB_PATH` 指定独立测试数据库路径
- **迁移管理：** SQL 迁移文件位于 `migrations/sqlite/`，使用版本化迁移，不通过 ORM 自动同步

### 邮件配置

- SMTP 配置通过环境变量提供（`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`）
- 未配置 SMTP 时，邮件发送降级为日志记录，不阻塞工单完成流程

### 验证约定

- 验证脚本负责启动和清理服务，使用空闲端口和独立测试数据库
- 干净目录无需手动创建数据目录即可启动（dbkit 在打开前创建父目录）
