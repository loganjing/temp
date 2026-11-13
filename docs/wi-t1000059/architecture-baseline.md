# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 后端框架 | Hono | Node.js ESM 服务端，提供 REST API |
| 数据库 | SQLite（通过 dbkit） | 文件数据库，满足持久化与重启保留需求 |
| 前端框架 | React + Vite | SPA 单页应用 |
| UI 组件体系 | Ant Design（antd + @ant-design/icons） | 工单管理工作台默认方案 |
| 包管理器 | npm | workspace-init 标准初始化 |

### CommonApp 模块

| 模块 ID | 包/版本 | manifest SHA-256 | 用途 |
|---|---|---|---|
| dbkit | @commonapp/dbkit@0.2.0 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | SQLite 连接配置、查询、事务与版本化迁移 |

选择理由：需求明确要求数据库持久存储，dbkit 提供 SQLite 配置、查询、事务和版本化迁移能力，无额外模块依赖，运行时仅需 better-sqlite3，与新建 Hono + React/Vite 项目天然匹配。未选择其他 CommonApp 模块（authkit/userkit/permissionkit 等），因为需求未规定用户角色与权限划分。

### 架构总览

```
┌──────────────┐     REST API      ┌──────────────┐     dbkit      ┌──────────┐
│  React SPA   │ ◄──────────────► │  Hono Server │ ◄────────────► │  SQLite  │
│  (Vite)      │   JSON over HTTP  │  (Node 20+)  │   query/txn    │  .db file │
└──────────────┘                   └──────────────┘                └──────────┘
```

前端 SPA 通过 HTTP 调用后端 REST API，后端通过 dbkit 读写 SQLite 数据库。所有业务数据由数据库权威存储，应用重启后数据保留。

### 运行约定

- 常规启动：`npm start`（后端服务），前端开发：`npm run dev`
- 监听端口：`PORT` 环境变量，默认 3000
- 持久化数据库路径：`DB_PATH` 环境变量，默认 `./data/application.db`
- 数据库父目录在打开前自动创建
- 测试隔离：验证时使用空闲端口和 `DB_PATH` 指向临时文件路径

### UI 全局基线

- **应用/业务模板**：helpdesk（设备工单管理）
- **展示模板**：`split-master-detail`（列表/队列与当前记录详情协同）
- **视觉风格**：Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色与状态色
- **组件体系**：Ant Design，深色侧栏、浅色工作区、顶部上下文栏
- **应用壳**：左侧导航栏（设备、状态监测、故障诊断、远程升级、维修工单、设备履历），顶部上下文栏，主工作区为列表+详情分栏
- **目标设备**：桌面 Web
- **全局状态**：加载（Ant Design Spin/骨架屏）、空数据（Empty 描述）、错误（Alert 提示）、成功（message 提示）
- **依据**：需求以设备为中心、高频逐条处理工单和故障记录，适合列表+详情协同布局

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 设备状态监测

- **职责**：管理设备列表，记录和查询设备运行状态及其变化历史
- **数据归属**：`devices` 表（设备基本信息与当前状态）、`status_logs` 表（状态变化记录）
- **接口摘要**：
  - `GET /api/devices` — 设备列表
  - `POST /api/devices` — 创建设备
  - `GET /api/devices/:id` — 设备详情（含当前状态）
  - `GET /api/devices/:id/status-logs` — 设备状态变化历史
  - `POST /api/devices/:id/status-logs` — 记录状态变化

### 2.2 故障诊断

- **职责**：记录设备故障信息（故障类型、严重程度、发生时间），关联设备，支持按设备查看故障列表
- **数据归属**：`faults` 表
- **接口摘要**：
  - `GET /api/faults` — 故障列表（支持按设备筛选）
  - `POST /api/devices/:id/faults` — 记录设备故障
  - `GET /api/devices/:id/faults` — 设备故障列表

### 2.3 远程升级

- **职责**：对设备发起远程升级，跟踪升级进度和最终结果（成功/失败）
- **数据归属**：`upgrades` 表
- **行为**：发起升级后状态为 `pending`，随后推进至 `in_progress`（带进度百分比），最终到达 `success` 或 `failed`
- **接口摘要**：
  - `GET /api/upgrades` — 升级列表（支持按设备筛选）
  - `POST /api/devices/:id/upgrades` — 发起设备升级
  - `GET /api/devices/:id/upgrades` — 设备升级列表
  - `PATCH /api/upgrades/:id` — 更新升级状态和进度
- **测试控制**：`POST /api/test/upgrades/:id/advance` — 仅测试环境使用，手动推进升级状态至下一阶段，用于可重复验证（AC-03）。正常运行不使用此入口

### 2.4 维修工单

- **职责**：创建维修工单并关联设备（和故障，如有），处理工单并标记完成，查看工单列表及状态
- **数据归属**：`work_orders` 表
- **状态流转**：`open` → `in_progress` → `completed`
- **接口摘要**：
  - `GET /api/work-orders` — 工单列表（支持按设备和状态筛选）
  - `POST /api/work-orders` — 创建工单
  - `PATCH /api/work-orders/:id` — 更新工单状态

### 2.5 设备履历

- **职责**：按设备聚合展示状态变化、故障、升级和维修工单记录
- **数据归属**：只读聚合，无独立写入；查询 `devices`、`status_logs`、`faults`、`upgrades`、`work_orders` 表
- **接口摘要**：
  - `GET /api/devices/:id/history` — 设备完整履历（按时间聚合各模块事件）

## 3. 数据库模型

### 3.1 devices

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | 设备名称 |
| model | TEXT | NOT NULL | 设备型号 |
| location | TEXT | | 设备位置 |
| current_status | TEXT | NOT NULL DEFAULT 'normal' | 当前运行状态 |
| created_at | TEXT | NOT NULL | ISO 8601 创建时间 |
| updated_at | TEXT | NOT NULL | ISO 8601 更新时间 |

### 3.2 status_logs

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| device_id | TEXT | NOT NULL REFERENCES devices(id) | 关联设备 |
| status | TEXT | NOT NULL | 新状态 |
| previous_status | TEXT | | 变更前状态 |
| recorded_at | TEXT | NOT NULL | ISO 8601 记录时间 |

### 3.3 faults

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| device_id | TEXT | NOT NULL REFERENCES devices(id) | 关联设备 |
| fault_type | TEXT | NOT NULL | 故障类型 |
| severity | TEXT | NOT NULL CHECK IN ('low','medium','high') | 严重程度 |
| description | TEXT | | 故障描述 |
| occurred_at | TEXT | NOT NULL | ISO 8601 发生时间 |
| created_at | TEXT | NOT NULL | ISO 8601 记录创建时间 |

### 3.4 upgrades

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| device_id | TEXT | NOT NULL REFERENCES devices(id) | 关联设备 |
| version | TEXT | NOT NULL | 目标升级版本 |
| status | TEXT | NOT NULL DEFAULT 'pending' CHECK IN ('pending','in_progress','success','failed') | 升级状态 |
| progress | INTEGER | NOT NULL DEFAULT 0 | 进度百分比 0-100 |
| started_at | TEXT | | 开始时间 |
| completed_at | TEXT | | 完成时间 |
| created_at | TEXT | NOT NULL | 创建时间 |

### 3.5 work_orders

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| device_id | TEXT | NOT NULL REFERENCES devices(id) | 关联设备 |
| fault_id | TEXT | REFERENCES faults(id) | 关联故障（可空） |
| status | TEXT | NOT NULL DEFAULT 'open' CHECK IN ('open','in_progress','completed') | 工单状态 |
| description | TEXT | NOT NULL | 工单描述 |
| created_at | TEXT | NOT NULL | 创建时间 |
| updated_at | TEXT | NOT NULL | 更新时间 |
| completed_at | TEXT | | 完成时间 |

### 迁移

所有表结构通过 dbkit 版本化迁移创建，SQL 文件位于 `migrations/sqlite/` 目录下。不使用 ORM 自动同步或手工改 schema。

## 4. 验证控制说明

AC-03（远程升级可发起和跟踪）涉及异步状态推进。由于无真实设备升级协议，升级过程为服务端模拟。测试控制入口 `POST /api/test/upgrades/:id/advance` 仅在测试环境使用，手动将升级状态从 `pending` 推进至 `in_progress`（progress=50），再推进至 `success`（progress=100, completed_at）。验证时通过该入口确定性地推进状态，确保升级生命周期可重复验证。正常运行不依赖此入口。
