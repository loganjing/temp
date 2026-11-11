# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 后端框架 | Hono (Node.js) | 新建全栈应用默认服务端框架 |
| 前端框架 | React + Vite (SPA) | 新建全栈应用默认前端方案 |
| UI 组件体系 | Ant Design (`antd` + `@ant-design/icons`) | 设备管理工作台默认 UI 方案，在实现阶段安装 |
| 数据库 | SQLite (via dbkit `@commonapp/dbkit` v0.2.0) | 用户明确要求数据库存储；dbkit 提供配置、查询、事务与版本化迁移 |
| 包管理器 | npm | 新建项目默认 |
| 运行时 | Node.js >= 20 | dbkit 运行时要求 |

### 架构概览

```
┌─────────────────────────────────────────────┐
│              浏览器 (Desktop Web)              │
│  React SPA · Ant Design · Vite 开发服务器      │
└──────────────────┬──────────────────────────┘
                   │ HTTP REST API (JSON)
                   ▼
┌─────────────────────────────────────────────┐
│           Hono 服务端 (Node.js)               │
│  设备监测 · 故障诊断 · 远程升级 · 维修工单 · 履历 │
└──────────────────┬──────────────────────────┘
                   │ dbkit (better-sqlite3)
                   ▼
┌─────────────────────────────────────────────┐
│           SQLite 数据库文件                    │
│  devices · device_status_logs · faults       │
│  upgrade_tasks · repair_orders               │
└─────────────────────────────────────────────┘
```

前后端同源部署，开发阶段 Vite 开发服务器代理 API 请求到 Hono 后端，生产构建后 Hono 直接托管前端静态资源。

### CommonApp 模块选择

| 模块 | 包/版本 | 状态 | 需求匹配 | manifest SHA-256 |
|---|---|---|---|---|
| dbkit | `@commonapp/dbkit` v0.2.0 | ready | 用户明确要求数据库存储；设备管理5个模块的业务数据需要持久化到 SQLite | `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6` |

- **选择理由**：用户明确要求"需要数据库存储"，5个模块的跨模块数据关联（故障→设备、工单→设备/故障、履历→全部模块）需要关系型查询与事务保障，SQLite + dbkit 提供零配置持久化、版本化迁移和事务支持。
- **集成边界**：dbkit 负责数据库连接管理（`createDb`/`createDbConfig`）、查询（`queryOne`/`queryAll`）、写入（`run`/`exec`）、事务（`transaction`）和迁移（`runMigrations`）。业务逻辑在 Hono 路由层实现。
- **未选模块**：authkit/userkit/permissionkit/auditkit — 需求未规定用户角色与权限，不引入身份认证模块。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 设备状态监测

**职责**：管理设备注册信息与当前状态，记录状态变更历史，标记异常。

**数据归属**：`devices` 表（设备当前状态）和 `device_status_logs` 表（状态变更历史）的唯一权威来源。

**接口摘要**：

| 方向 | 接口 | 用途 |
|---|---|---|
| 浏览器→服务端 | `GET /api/devices` | 获取设备列表及当前状态 |
| 浏览器→服务端 | `GET /api/devices/:id` | 获取单台设备详情 |
| 浏览器→服务端 | `POST /api/devices` | 注册新设备 |
| 浏览器→服务端 | `PATCH /api/devices/:id/status` | 更新设备状态，触发状态日志记录和异常标记 |

### 故障诊断

**职责**：记录设备故障信息，支持按设备筛选，故障可关联维修工单。

**数据归属**：`faults` 表的唯一权威来源。故障通过 `device_id` 关联设备，通过 `repair_orders.fault_id` 被工单引用。

**接口摘要**：

| 方向 | 接口 | 用途 |
|---|---|---|
| 浏览器→服务端 | `GET /api/faults?deviceId=:id` | 获取故障列表，可按设备筛选 |
| 浏览器→服务端 | `POST /api/faults` | 记录新故障 |

### 远程升级

**职责**：管理设备远程升级任务的状态流转（待执行→执行中→成功/失败），记录升级结果。

**数据归属**：`upgrade_tasks` 表的唯一权威来源。升级任务通过 `device_id` 关联设备。

**接口摘要**：

| 方向 | 接口 | 用途 |
|---|---|---|
| 浏览器→服务端 | `GET /api/upgrades?deviceId=:id` | 获取升级任务列表，可按设备筛选 |
| 浏览器→服务端 | `POST /api/upgrades` | 创建升级任务（初始状态：待执行） |
| 浏览器→服务端 | `PATCH /api/upgrades/:id/status` | 推进升级任务状态，记录结果 |

### 维修工单

**职责**：管理维修工单全生命周期（已创建→处理中→已完成），支持按状态筛选。

**数据归属**：`repair_orders` 表的唯一权威来源。工单通过 `device_id` 关联设备，可选通过 `fault_id` 关联故障。

**接口摘要**：

| 方向 | 接口 | 用途 |
|---|---|---|
| 浏览器→服务端 | `GET /api/repair-orders?status=:status` | 获取工单列表，可按状态筛选 |
| 浏览器→服务端 | `POST /api/repair-orders` | 创建维修工单（初始状态：已创建） |
| 浏览器→服务端 | `PATCH /api/repair-orders/:id/status` | 推进工单状态，记录处理结果 |

### 设备履历

**职责**：按设备汇集全生命周期记录，数据来源于其他四个模块的持久化数据，只读聚合。

**数据归属**：无独立数据表，聚合查询 `devices`、`device_status_logs`、`faults`、`upgrade_tasks`、`repair_orders` 五张表。

**接口摘要**：

| 方向 | 接口 | 用途 |
|---|---|---|
| 浏览器→服务端 | `GET /api/devices/:id/history` | 获取设备完整履历（按时间线聚合全部记录） |

## 3. 数据库模型与迁移

### 数据表设计

**devices** — 设备注册信息与当前状态

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID，服务端生成 |
| name | TEXT | NOT NULL | 设备名称 |
| model | TEXT | | 设备型号 |
| online_status | TEXT | NOT NULL DEFAULT 'offline' | 在线状态：online / offline |
| running_status | TEXT | NOT NULL DEFAULT 'idle' | 运行状态：idle / running / error / maintenance |
| is_abnormal | INTEGER | NOT NULL DEFAULT 0 | 异常标记：0=正常, 1=异常（running_status 为 error 时置 1） |
| registered_at | TEXT | NOT NULL | 注册时间（ISO 8601） |
| updated_at | TEXT | NOT NULL | 最后更新时间（ISO 8601） |

**device_status_logs** — 状态变更历史

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| device_id | TEXT | NOT NULL, FK→devices(id) | 关联设备 |
| online_status | TEXT | NOT NULL | 变更后的在线状态 |
| running_status | TEXT | NOT NULL | 变更后的运行状态 |
| is_abnormal | INTEGER | NOT NULL DEFAULT 0 | 变更后是否异常 |
| created_at | TEXT | NOT NULL | 记录时间（ISO 8601） |

**faults** — 故障记录

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| device_id | TEXT | NOT NULL, FK→devices(id) | 故障设备 |
| description | TEXT | NOT NULL | 故障描述 |
| occurred_at | TEXT | NOT NULL | 故障发生时间（ISO 8601） |
| created_at | TEXT | NOT NULL | 记录时间（ISO 8601） |

**upgrade_tasks** — 远程升级任务

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| device_id | TEXT | NOT NULL, FK→devices(id) | 升级设备 |
| status | TEXT | NOT NULL DEFAULT 'pending' | 状态：pending / in_progress / success / failed |
| result | TEXT | | 升级结果描述（终态时填写） |
| created_at | TEXT | NOT NULL | 创建时间（ISO 8601） |
| updated_at | TEXT | NOT NULL | 最后更新时间（ISO 8601） |

**repair_orders** — 维修工单

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| device_id | TEXT | NOT NULL, FK→devices(id) | 关联设备 |
| fault_id | TEXT | FK→faults(id) | 关联故障（可空） |
| description | TEXT | NOT NULL | 故障/维护描述 |
| requirement | TEXT | | 维修要求 |
| status | TEXT | NOT NULL DEFAULT 'created' | 状态：created / in_progress / completed |
| result | TEXT | | 处理结果（终态时填写） |
| created_at | TEXT | NOT NULL | 创建时间（ISO 8601） |
| updated_at | TEXT | NOT NULL | 最后更新时间（ISO 8601） |

### 迁移策略

- 使用 dbkit 的 `runMigrations(db, {directory: './migrations'})` 执行版本化迁移。
- SQL 迁移文件位于 `migrations/sqlite/` 目录，按序号命名（如 `001_init.sql`）。
- 初始迁移创建全部 5 张表及外键索引。
- 所有数据库 schema 变更必须通过迁移文件，不得通过 ORM 自动同步或手工改 schema。

### 事务边界

- **设备状态更新**：更新 `devices` 当前状态 + 插入 `device_status_logs` 记录，在单个事务中完成。
- **升级任务状态推进**：更新 `upgrade_tasks` 状态和结果，单表操作。
- **工单状态推进**：更新 `repair_orders` 状态和结果，单表操作。

## 4. UI 全局基线

### 应用/业务模板

设备管理平台 — 多模块业务后台，类似工单/CRM 系统。

### 展示模板

`saas-ops-console` — 左侧导航、顶部上下文栏、主工作区。5 个模块各有独立导航入口，模块内以表格、筛选和操作为主。维修工单页面在表格基础上提供详情查看/编辑。

### 视觉预设

Modern SaaS — 深色侧栏、浅色工作区、清晰标题和主操作、柔和中性色、细边界、少阴影、中等圆角。一个主色（蓝色系）与状态色（成功/警告/错误）。短而有反馈作用的动效。

### 组件体系

Ant Design（`antd` + `@ant-design/icons`），在实现阶段安装。使用 Ant Design 的 Table、Form、Tag、Button、Card、Steps、Timeline 等组件。

### 应用壳与导航

- **左侧导航栏**：5 个模块入口（设备监测、故障诊断、远程升级、维修工单、设备履历），深色背景。
- **顶部上下文栏**：当前模块标题 + 模块内操作按钮（如"注册设备"、"记录故障"、"发起升级"、"创建工单"）。
- **主工作区**：浅色背景，各模块以表格为核心，配合筛选区和操作列。

### 目标设备

桌面 Web（默认）。最小宽度 1280px，表格列可伸缩，长文本截断并提供悬停标题查看全文。

### 全局状态

- **加载中**：表格骨架屏（Skeleton）或 Spin 指示器。
- **空数据**：表格 Empty 提示 + 主操作按钮引导创建。
- **错误**：表格区域显示 Alert 错误提示，可重试。
- **成功**：操作完成后 Toast（message.success）反馈。

### 关键页面布局

| 模块 | 页面布局 |
|---|---|
| 设备状态监测 | 设备表格（名称、型号、在线状态、运行状态、异常标记、操作列）+ 顶部"注册设备"按钮 + 状态更新弹窗 |
| 故障诊断 | 故障表格（设备、描述、发生时间、关联工单、操作列）+ 顶部设备筛选下拉 + "记录故障"按钮 |
| 远程升级 | 升级任务表格（设备、状态、结果、时间、操作列）+ 顶部设备筛选 + "发起升级"按钮 + 状态推进操作 |
| 维修工单 | 工单表格（设备、描述、状态、结果、时间、操作列）+ 顶部状态筛选 + "创建工单"按钮 + 状态流转操作 |
| 设备履历 | 设备选择下拉 + 时间线视图（Timeline），按时间倒序展示状态变更、故障、升级、工单记录，每条记录标注类型和内容 |

## 5. 运行约定

### 常规启动

```sh
npm start
```

启动 Hono 服务端，同时托管前端静态资源。默认监听端口通过 `PORT` 环境变量配置（默认 3000）。

### 开发模式

```sh
npm run dev
```

Vite 开发服务器 + Hono 后端，Vite 代理 API 请求到后端。

### 数据库配置

- **默认数据库路径**：`./data/application.db`
- **测试数据库覆盖**：通过 `DB_PATH` 环境变量指定测试数据库路径（如 `DB_PATH=./data/test.db`）
- **目录创建**：服务端启动时自动创建数据库文件的父目录（`mkdirSync({recursive: true})`）
- **迁移执行**：服务端启动时自动运行 `runMigrations`，确保数据库 schema 最新

### 端口配置

- `PORT` 环境变量，默认 3000
- 验收测试使用空闲端口，等待真实监听就绪后执行验证

### 隔离验证

- 使用独立测试数据库（`DB_PATH` 指定）
- 验收脚本负责启动和清理服务
- 干净目录无需手动创建数据目录即可启动
