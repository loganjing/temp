# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 选型 | 依据 |
| --- | --- | --- |
| 后端框架 | Hono (Node.js ≥ 20, TypeScript) | 新建需服务端权威数据的应用默认选 Hono |
| 前端框架 | React + Vite (SPA, TypeScript) | 新建前端默认选 React/Vite |
| 数据库 | SQLite (via @commonapp/dbkit v0.2.0) | 需求明确要求数据库存储，dbkit 提供 SQLite 配置、查询、事务与版本化迁移 |
| UI 组件体系 | Ant Design (antd + @ant-design/icons) | 设备管理工作台类应用默认选 Ant Design |
| 包管理器 | npm | 新项目默认 |
| 迁移机制 | 版本化 SQL 迁移文件，通过 dbkit `runMigrations` 执行 | 数据库变更必须使用版本化迁移，不通过 ORM 自动同步 |

dbkit manifest SHA-256: `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6`。dbkit 无模块依赖，运行时依赖 `better-sqlite3`。未选择 authkit/userkit/permissionkit/auditkit——需求未要求认证、权限、审计或用户管理。

### 项目结构

packageRoot 为 `app/jlgrobot/`，使用 TypeScript。目录结构基于初始化脚手架：

```
app/jlgrobot/
├── src/server/                    # Hono 后端
│   ├── index.ts                   # 服务入口：初始化资源、组装 Hono app、启动 HTTP
│   ├── app.ts                     # 全局中间件、API 错误、路由注册、SPA fallback
│   ├── routes.ts                  # 业务路由注册点（设备/故障/升级/工单/履历）
│   ├── platform/bootstrap.ts      # dbkit 实例初始化与迁移执行
│   └── migrations/sqlite/         # SQL 迁移文件
├── src/client/                    # React/Vite 前端
│   ├── main.tsx                   # React 挂载入口
│   ├── App.tsx                    # 顶层应用与导航
│   └── platform/api-client.ts     # 浏览器请求边界
├── src/shared/                    # 平台中立的共享类型、常量与契约
└── test/                          # 测试与隔离 fixture
```

### 数据库选择理由

需求基线第 3 节明确要求"需要数据库存储"，AC-01~AC-05 均要求"系统重启后数据仍可读回"。这要求服务端权威持久化存储，排除浏览器 localStorage。选用 SQLite 文件数据库——满足持久化与重启后可读的要求，无需额外数据库服务，适合单机部署的设备管理场景。通过 dbkit 获得查询、事务和版本化迁移能力。

### UI 全局基线

- **应用/业务模板**：设备管理工作台（helpdesk 类——设备列表与设备详情/记录协同处理）
- **展示模板**：`split-master-detail`——左侧/上方为设备列表，右侧/下方为选中设备的详情面板，详情面板内按 Tab 切换状态、故障、升级、工单、履历
- **视觉风格**：Modern SaaS——深色侧栏、浅色工作区、顶部上下文栏、清晰标题与主操作按钮、柔和中性色、细边界、一个主色与状态色
- **组件体系**：Ant Design（antd + @ant-design/icons），Layout/Table/Tabs/Form/Tag/Modal 等组件
- **目标设备**：桌面 Web（需求未要求移动端/窄屏）
- **导航结构**：左侧导航栏包含"设备总览"入口；主工作区为设备列表 + 详情分栏，详情内通过 Tab 组织五个功能模块
- **全局状态**：加载中（Skeleton/Table loading）、空数据（Empty）、错误（message.error 提示）、成功（message.success 提示）
- **选择依据**：需求涉及设备逐条管理与多类型记录协同查看，核心动作为高频逐条处理设备记录，匹配 `split-master-detail` 展示模板

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 设备管理模块

- **职责**：维护设备基本信息（名称、型号）和当前运行状态
- **数据归属**：`devices` 表（唯一事实源）
- **接口摘要**：
  - 设备列表查询 — 前端 → GET /api/devices
  - 设备详情查询 — 前端 → GET /api/devices/:id
  - 创建设备 — 前端 → POST /api/devices
  - 更新设备状态 — 前端 → PATCH /api/devices/:id/status

### 2.2 故障诊断模块

- **职责**：记录设备故障信息和诊断结果，支持按设备查看故障诊断记录
- **数据归属**：`fault_diagnoses` 表（唯一事实源）
- **接口摘要**：
  - 故障诊断记录列表 — 前端 → GET /api/devices/:deviceId/faults
  - 创建故障诊断记录 — 前端 → POST /api/devices/:deviceId/faults

### 2.3 远程升级模块

- **职责**：向指定设备发起远程升级操作，记录升级过程和结果
- **数据归属**：`upgrade_records` 表（唯一事实源）
- **接口摘要**：
  - 升级记录列表 — 前端 → GET /api/devices/:deviceId/upgrades
  - 发起远程升级 — 前端 → POST /api/devices/:deviceId/upgrades

### 2.4 维修工单模块

- **职责**：创建和管理设备维修工单，记录维修内容和处理结果
- **数据归属**：`repair_orders` 表（唯一事实源）
- **接口摘要**：
  - 维修工单列表 — 前端 → GET /api/devices/:deviceId/work-orders
  - 创建维修工单 — 前端 → POST /api/devices/:deviceId/work-orders

### 2.5 设备履历模块

- **职责**：按设备聚合状态变更、故障诊断、升级记录和维修工单，返回统一时间线
- **数据归属**：跨表聚合查询（devices、fault_diagnoses、upgrade_records、repair_orders），不独立存储
- **接口摘要**：
  - 设备完整履历 — 前端 → GET /api/devices/:deviceId/history

### 模块间依赖

所有业务模块（故障诊断、远程升级、维修工单、设备履历）均依赖设备管理模块提供的 `devices` 实体及其 `id` 作为外键。设备履历模块为只读聚合，依赖其余四个模块的数据。模块间无直接服务调用，通过共享数据库表关联。

## 3. 数据模型

所有实体 ID 使用应用层生成的 TEXT 类型 UUID（crypto.randomUUID()），在数据库主键、外键、API JSON 和前端类型中保持一致，无需类型转换。时间戳使用 ISO 8601 字符串存储。

### devices

| 列名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | 设备名称 |
| model | TEXT | | 设备型号 |
| current_status | TEXT | NOT NULL DEFAULT 'unknown' | 当前状态（如 online/offline/running/standby/fault/unknown） |
| created_at | TEXT | NOT NULL | ISO 8601 创建时间 |
| updated_at | TEXT | NOT NULL | ISO 8601 更新时间 |

### fault_diagnoses

| 列名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PRIMARY KEY | UUID |
| device_id | TEXT | NOT NULL, FK → devices(id) | 关联设备 |
| fault_description | TEXT | NOT NULL | 故障描述 |
| diagnosis_result | TEXT | | 诊断结果 |
| created_at | TEXT | NOT NULL | ISO 8601 记录时间 |

### upgrade_records

| 列名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PRIMARY KEY | UUID |
| device_id | TEXT | NOT NULL, FK → devices(id) | 关联设备 |
| target_version | TEXT | NOT NULL | 目标升级版本 |
| status | TEXT | NOT NULL DEFAULT 'pending' | 升级状态（pending/in_progress/success/failed） |
| result | TEXT | | 升级结果说明 |
| created_at | TEXT | NOT NULL | ISO 8601 发起时间 |
| completed_at | TEXT | | ISO 8601 完成时间 |

### repair_orders

| 列名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PRIMARY KEY | UUID |
| device_id | TEXT | NOT NULL, FK → devices(id) | 关联设备 |
| content | TEXT | NOT NULL | 维修内容 |
| result | TEXT | | 处理结果 |
| status | TEXT | NOT NULL DEFAULT 'open' | 工单状态（open/in_progress/completed） |
| created_at | TEXT | NOT NULL | ISO 8601 创建时间 |
| updated_at | TEXT | NOT NULL | ISO 8601 更新时间 |

### 设备履历聚合

不创建独立表。`GET /api/devices/:deviceId/history` 查询时联合 `fault_diagnoses`、`upgrade_records`、`repair_orders` 三表以及 `devices` 的状态变更记录，按 `device_id` 关联，按时间排序返回统一格式的履历事件列表。每个事件包含 `event_type`（fault/upgrade/work_order/status）、`timestamp`、`summary` 和原始记录引用。

## 4. 运行约定

- **常规启动**：`npm start`（启动 Hono 后端 `node --import tsx src/server/index.ts`）
- **开发模式**：`npm run dev:server`（后端热重载）+ `npm run dev:web`（Vite 前端开发服务器）
- **服务端口**：`PORT` 环境变量，默认 3000
- **数据库路径**：`DB_PATH` 环境变量，默认 `./data/application.db`；`bootstrap.ts` 在打开前自动创建父目录
- **隔离测试数据库**：设置 `DB_PATH` 为临时文件路径（如 `./data/test.db`），验证完成后清理
- **迁移目录**：`src/server/migrations/sqlite/`，服务启动时由 `bootstrap.ts` 调用 `runMigrations` 自动执行待应用的迁移
- **验收命令**：与常规启动分开；验收脚本通过 `test/with-http-server.mjs` 启动隔离 HTTP 服务、等待真实监听就绪、执行验收步骤并清理本次启动的进程

## 5. 模块安装标记

| 模块 | 包名 | 版本 | 安装标记 |
| --- | --- | --- | --- |
| dbkit | @commonapp/dbkit | 0.2.0 | `commonapp install: dbkit` |
