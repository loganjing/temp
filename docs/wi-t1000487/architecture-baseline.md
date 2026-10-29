# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 技术栈

| 层 | 选型 | 版本/约束 |
|----|------|-----------|
| 后端框架 | Hono | Node.js ≥20，ESM |
| 前端框架 | React + Vite | SPA，开发时代理到后端 API |
| UI 框架 | Tailwind CSS | Modern SaaS 视觉方向 |
| 数据库 | SQLite | 通过 CommonApp `dbkit` 管理连接、查询、事务与迁移 |
| 包管理器 | npm | package-lock.json |
| ID 生成 | UUID v4 (crypto.randomUUID) | 应用层生成，TEXT 类型存储 |

### 1.2 架构概览

```
┌───────────────────────────────────────────────┐
│              浏览器 (Desktop Web)               │
│  React SPA — split-master-detail 工作台        │
│  左: 工单列表队列  │  右: 工单详情/处理面板     │
└───────────────────┬───────────────────────────┘
                    │ HTTP JSON API
┌───────────────────┴───────────────────────────┐
│              Hono 后端服务                      │
│  /api/tickets/*    工单管理与协作              │
│  /api/companies/*  公司与业务组管理            │
│  /api/groups/*     业务组成员管理              │
│  /api/assignment-rules  分配规则管理           │
└───────────────────┬───────────────────────────┘
                    │ dbkit (better-sqlite3)
┌───────────────────┴───────────────────────────┐
│              SQLite 数据库                      │
│  8 张表 — 工单、回复、转派、评价、             │
│  公司、业务组、成员、分配规则                   │
└───────────────────────────────────────────────┘
```

后端为单体 Hono 服务，所有业务逻辑（工单 CRUD、自动分配规则匹配、转派、评价）在同一进程内处理。前端为 Vite 开发的 React SPA，通过代理访问后端 API。数据持久化在本地 SQLite 文件中，由 dbkit 提供连接管理、参数化查询、事务和版本化迁移。

### 1.3 CommonApp 模块选择

| 模块 | 包名 | 版本 | 状态 | manifest SHA-256 |
|------|------|------|------|------------------|
| dbkit | @commonapp/dbkit | 0.2.0 | ready | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 |

**选择理由：** 新建项目需要服务端权威数据、跨用户共享、结构化查询和关联，SQLite 是满足这些需求的最小数据库方案。dbkit 提供 SQLite 连接配置、参数化查询、事务和版本化迁移，覆盖本应用的数据访问需求。

**集成边界：**
- 使用 `createDb(createDbConfig({driver: 'sqlite', sqlitePath: process.env.DB_PATH ?? './data/ticket.db'}))` 初始化连接
- 查询使用 `db.queryOne/queryAll({text, params})` 参数化接口
- 写入使用 `db.run({text, params})` 返回 `{changes}`
- DDL 迁移使用 `db.exec(sql)` 执行，迁移文件位于 `migrations/sqlite/`
- 事务使用 `db.transaction(async tx => {...})`，异常自动回滚
- 运行时依赖：better-sqlite3 ^11 || ^12

**未选用的模块：** 需求未规定用户认证/权限体系，不选用 authkit/userkit/permissionkit/auditkit。需求未规定文件附件、邮件通知、国际化，不选用 attachment/emailkit/i18n。

### 1.4 运行约定

| 配置项 | 说明 |
|--------|------|
| 常规启动 | `npm start` — 同时启动后端 API 服务和前端 Vite 开发服务器 |
| 后端端口 | `PORT` 环境变量，默认 3000 |
| 前端开发 | Vite dev server，代理 `/api` 到后端 |
| 数据库路径 | `DB_PATH` 环境变量，默认 `./data/ticket.db` |
| 数据库目录 | 打开前自动创建父目录 |
| 测试数据库 | 验收时通过 `DB_PATH` 指定隔离路径（如 `./data/test-ticket.db`），使用空闲端口 |
| 迁移 | `migrations/sqlite/` 目录下版本化 SQL 文件，服务启动时自动执行 |
| 服务入口 | `src/server.js`（位于可写范围内） |

## 2. UI 全局基线

| 维度 | 决策 | 依据 |
|------|------|------|
| 应用/业务模板 | helpdesk | 工单系统，高频逐条处理记录 |
| 展示模板 | split-master-detail | 列表/队列与当前记录详情协同，匹配工单高频处理场景 |
| 视觉预设 | Modern SaaS | 通用业务应用默认值：柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色与状态色 |
| 目标设备 | 桌面 Web | 需求未要求移动端或窄屏 |
| 应用壳 | 左侧导航栏 + 顶部上下文栏 + 主工作区 | 业务后台标准布局 |

**主工作流布局：**

- **左侧导航：** 工单工作台、组织管理（公司/业务组/成员）、分配规则
- **工单工作台（split-master-detail）：**
  - 左面板：工单列表队列，支持按状态、优先级、分类筛选和关键字搜索
  - 右面板：选中工单的详情视图，包含工单信息、提交人信息面板（含历史工单）、回复列表、转派记录、操作按钮（分配/转派/完成/取消/评价）
- **工单创建：** 工作台内弹出的表单弹窗
- **组织管理：** 公司列表 → 选中公司展示业务组列表 → 选中业务组展示成员列表，三级联动
- **分配规则：** 规则列表 + 创建表单，按公司筛选

**全局状态设计：**
- 加载中：列表骨架屏，操作按钮 loading 态
- 空数据：列表无数据时展示引导文案和创建入口
- 错误：API 失败时展示错误提示，操作可重试
- 成功：操作成功后刷新当前视图数据

**设计 Token 方向：**
- 主色：靛蓝（#4F46E5 系列）
- 状态色：P0-P4 优先级色阶（红色→橙→黄→蓝→灰），工单状态色（待分配-黄、待处理-蓝、完成-绿、取消-灰）
- 背景：浅灰白（#F9FAFB）
- 表面：白色卡片，细边界（#E5E7EB），圆角 6px

<!-- system-design: architecture-boundaries -->
## 3. 领域责任、模块边界与接口摘要

### 3.1 模块职责

| 模块 | 职责 | 数据归属 |
|------|------|----------|
| 工单管理 | 工单创建、查询、状态流转、自动分配、手动分配、完成处理、取消 | tickets 表 |
| 回复管理 | 工单多轮回复的创建与查询 | ticket_replies 表 |
| 转派管理 | 工单转派操作执行与历史记录查询 | ticket_transfers 表 |
| 评价管理 | 工单完成后满意度评价的创建与查询 | evaluations 表 |
| 组织管理 | 公司、业务组、成员的创建与查询 | companies, business_groups, group_members 表 |
| 分配规则管理 | 自动分配规则的配置与匹配执行 | assignment_rules 表 |

### 3.2 接口摘要

接口详细定义（字段、类型、可空性、错误码）见 `technical-contract.md`。

| # | 方法 | 路径 | 用途 | 方向 |
|---|------|------|------|------|
| 1 | POST | /api/tickets | 创建工单（触发自动分配） | 前端→后端 |
| 2 | GET | /api/tickets | 查询工单列表（支持筛选） | 前端→后端 |
| 3 | GET | /api/tickets/:id | 查询单个工单详情 | 前端→后端 |
| 4 | PATCH | /api/tickets/:id/status | 更新工单状态（取消） | 前端→后端 |
| 5 | POST | /api/tickets/:id/assign | 手动分配工单到业务组 | 前端→后端 |
| 6 | POST | /api/tickets/:id/transfer | 转派工单到其他业务组 | 前端→后端 |
| 7 | POST | /api/tickets/:id/complete | 标记工单完成（记录处理人/时间） | 前端→后端 |
| 8 | GET | /api/tickets/:id/submitter-info | 查询提交人完整信息含历史工单 | 前端→后端 |
| 9 | GET | /api/tickets/:id/replies | 查询工单回复列表 | 前端→后端 |
| 10 | POST | /api/tickets/:id/replies | 添加工单回复 | 前端→后端 |
| 11 | GET | /api/tickets/:id/transfers | 查询转派历史 | 前端→后端 |
| 12 | GET | /api/tickets/:id/evaluation | 查询工单评价 | 前端→后端 |
| 13 | POST | /api/tickets/:id/evaluation | 提交满意度评价 | 前端→后端 |
| 14 | GET | /api/companies | 查询公司列表 | 前端→后端 |
| 15 | POST | /api/companies | 创建公司 | 前端→后端 |
| 16 | GET | /api/companies/:id/groups | 查询公司下业务组列表 | 前端→后端 |
| 17 | POST | /api/companies/:id/groups | 创建业务组 | 前端→后端 |
| 18 | GET | /api/groups/:id/members | 查询业务组成员列表 | 前端→后端 |
| 19 | POST | /api/groups/:id/members | 添加业务组成员 | 前端→后端 |
| 20 | GET | /api/assignment-rules | 查询分配规则列表（按公司筛选） | 前端→后端 |
| 21 | POST | /api/assignment-rules | 创建分配规则 | 前端→后端 |

### 3.3 实体 ID 对照

所有实体 ID 统一使用 UUID v4，TEXT 类型存储，应用层生成。

| 实体 | 生成方 | 数据库主键类型 | 外键引用类型 | API JSON 类型 | 前端类型 |
|------|--------|----------------|--------------|---------------|----------|
| Ticket | 后端创建时生成 | TEXT (UUID) | — | string | string |
| Reply | 后端创建时生成 | TEXT (UUID) | ticket_id: TEXT | string | string |
| Transfer | 后端创建时生成 | TEXT (UUID) | ticket_id, from_group_id, to_group_id: TEXT | string | string |
| Evaluation | 后端创建时生成 | TEXT (UUID) | ticket_id: TEXT | string | string |
| Company | 后端创建时生成 | TEXT (UUID) | — | string | string |
| BusinessGroup | 后端创建时生成 | TEXT (UUID) | company_id: TEXT | string | string |
| GroupMember | 后端创建时生成 | TEXT (UUID) | group_id: TEXT | string | string |
| AssignmentRule | 后端创建时生成 | TEXT (UUID) | company_id, target_group_id: TEXT | string | string |

所有 ID 在数据库主键、外键引用和 API JSON 中保持一致（TEXT/UUID），无需类型转换。前端统一使用 string 类型接收和传递。

## 4. 数据模型

### 4.1 表结构

**companies** — 公司

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PRIMARY KEY NOT NULL | UUID |
| name | TEXT | NOT NULL | 公司名称 |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

**business_groups** — 业务组

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PRIMARY KEY NOT NULL | UUID |
| company_id | TEXT | NOT NULL REFERENCES companies(id) | 所属公司 |
| name | TEXT | NOT NULL | 业务组名称 |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

**group_members** — 业务组成员

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PRIMARY KEY NOT NULL | UUID |
| group_id | TEXT | NOT NULL REFERENCES business_groups(id) | 所属业务组 |
| name | TEXT | NOT NULL | 成员姓名 |
| email | TEXT | NOT NULL | 成员邮箱 |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

**assignment_rules** — 分配规则

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PRIMARY KEY NOT NULL | UUID |
| company_id | TEXT | NOT NULL REFERENCES companies(id) | 规则适用公司 |
| category | TEXT | NOT NULL | 匹配的问题分类 |
| target_group_id | TEXT | NOT NULL REFERENCES business_groups(id) | 目标业务组 |
| created_at | TEXT | NOT NULL | ISO 8601 时间戳 |

**tickets** — 工单

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PRIMARY KEY NOT NULL | UUID |
| subject | TEXT | NOT NULL | 工单主题 |
| description | TEXT | NOT NULL | 工单描述 |
| category | TEXT | NOT NULL | 问题分类 |
| sla_priority | TEXT | NOT NULL | SLA优先级: P0/P1/P2/P3/P4 |
| submitter_name | TEXT | NOT NULL | 提交人姓名 |
| submitter_company_id | TEXT | NOT NULL REFERENCES companies(id) | 提交人所属公司 |
| submitter_department | TEXT | NOT NULL | 提交人部门 |
| submitter_email | TEXT | NOT NULL | 提交人邮箱 |
| status | TEXT | NOT NULL DEFAULT 'pending_assign' | 工单状态: created/pending_assign/pending_process/completed/cancelled |
| current_group_id | TEXT | REFERENCES business_groups(id) | 当前分配业务组（可空） |
| handler_member_id | TEXT | REFERENCES group_members(id) | 处理人（可空） |
| handler_name | TEXT | | 处理人姓名（可空） |
| processed_at | TEXT | | 处理完成时间（可空） |
| created_at | TEXT | NOT NULL | 创建时间 ISO 8601 |

**ticket_replies** — 工单回复

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PRIMARY KEY NOT NULL | UUID |
| ticket_id | TEXT | NOT NULL REFERENCES tickets(id) | 所属工单 |
| replier_name | TEXT | NOT NULL | 回复人姓名 |
| content | TEXT | NOT NULL | 回复内容 |
| created_at | TEXT | NOT NULL | 回复时间 ISO 8601 |

**ticket_transfers** — 转派记录

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PRIMARY KEY NOT NULL | UUID |
| ticket_id | TEXT | NOT NULL REFERENCES tickets(id) | 所属工单 |
| from_group_id | TEXT | NOT NULL REFERENCES business_groups(id) | 来源业务组 |
| to_group_id | TEXT | NOT NULL REFERENCES business_groups(id) | 目标业务组 |
| transferred_by | TEXT | NOT NULL | 操作人姓名 |
| created_at | TEXT | NOT NULL | 转派时间 ISO 8601 |

**evaluations** — 评价

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PRIMARY KEY NOT NULL | UUID |
| ticket_id | TEXT | NOT NULL REFERENCES tickets(id) | 关联工单 |
| rating | INTEGER | NOT NULL | 满意度评分 1-5 |
| comment | TEXT | | 评价备注（可空） |
| created_at | TEXT | NOT NULL | 评价时间 ISO 8601 |

### 4.2 关键关系与索引

- `tickets.submitter_company_id` → `companies.id`：工单归属于提交人所在公司，用于自动分配规则匹配
- `tickets.current_group_id` → `business_groups.id`：工单当前分配的业务组
- `assignment_rules` 上 (company_id, category) 唯一约束：同一公司同一分类仅一条规则
- `ticket_replies.ticket_id`、`ticket_transfers.ticket_id`、`evaluations.ticket_id` 均建立索引加速查询
- `tickets.submitter_email` 建立索引：支持按提交人邮箱查询历史工单

### 4.3 迁移策略

- 初始迁移文件：`migrations/sqlite/0001_init.sql`，包含全部 8 张表的 CREATE TABLE 语句和索引
- 迁移由 `runMigrations(db, {directory: './migrations'})` 在服务启动时自动执行
- 不使用 ORM 自动同步 schema；所有结构变更通过新增版本化 SQL 迁移文件

### 4.4 工单状态流转

```
created → pending_assign → pending_process → completed
              ↓                  ↓
           cancelled          cancelled
```

- **created**：工单刚创建的瞬时状态，创建后立即转为 pending_assign
- **pending_assign**：等待分配，系统自动匹配规则或等待手动分配
- **pending_process**：已分配到业务组，正在处理；支持转派和完成
- **completed**：处理完成，记录处理人和处理时间；可进行评价
- **cancelled**：已取消，终态

**自动分配流程：**
1. 创建工单时，根据 submitter_company_id + category 查询 assignment_rules
2. 匹配到规则 → 设置 current_group_id，状态转为 pending_process
3. 未匹配到规则 → 状态保持 pending_assign，等待手动分配

**转派流程：**
1. 工单处于 pending_process 时可转派
2. 记录 from_group_id → to_group_id 到 ticket_transfers
3. 更新 tickets.current_group_id 为目标业务组
4. 状态保持 pending_process
