# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 后端框架 | Hono (Node.js ≥20) | 轻量 HTTP 服务，提供 REST API |
| 前端框架 | React + Vite (SPA) | 单页应用，通过 API 与后端交互 |
| UI 组件体系 | Ant Design (`antd` + `@ant-design/icons`) | 工单/管理工作台默认方案 |
| 数据库 | SQLite（通过 `@commonapp/dbkit` v0.2.0） | 文件数据库，满足持久化与结构化查询需求 |
| 包管理器 | npm | |
| 运行时 | Node.js ≥20 | dbkit 运行时要求 |

### 应用架构概述

前后端同仓的单体应用：

```
浏览器 (React SPA)
    │  REST API (JSON)
    ▼
Hono Server (Node.js)
    │  dbkit (better-sqlite3)
    ▼
SQLite 文件数据库
```

- 后端 Hono 服务同时托管 API 路由和前端静态资源（构建产物）。
- 前端 SPA 通过 `fetch` 调用 `/api/*` 接口，数据全部来自后端权威数据库。
- SQLite 数据库由 dbkit 管理，使用版本化迁移，不通过 ORM 自动同步 schema。

### CommonApp 模块选择

| 模块 ID | 包/版本 | 状态 | 需求匹配 |
|---|---|---|---|
| dbkit | `@commonapp/dbkit` v0.2.0 | ready | 提供 SQLite 配置、查询、事务与版本化迁移，满足"数据库存储"需求 |

- manifest SHA-256: `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6`
- 运行时依赖：`better-sqlite3 ^11 || ^12`
- 模块依赖闭包：无其他 CommonApp 依赖
- 未选择 authkit/userkit/permissionkit：需求未规定用户角色与权限体系。
- 未选择 auditkit：设备履历模块以业务事件形式承担审计追溯职责。

`commonapp install: dbkit`

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 设备管理模块

- **职责**：设备登记、信息编辑、列表与详情查看、软删除。
- **数据归属**：`devices` 表是所有模块的设备引用源。
- **接口摘要**：
  - `GET /api/devices` — 设备列表（支持状态筛选）
  - `POST /api/devices` — 登记新设备
  - `GET /api/devices/:id` — 设备详情
  - `PUT /api/devices/:id` — 编辑设备信息
  - `DELETE /api/devices/:id` — 软删除设备（履历数据保留）

### 2.2 设备状态监测模块

- **职责**：实时展示设备当前状态、状态变更历史。
- **数据归属**：`devices.status` 为当前状态权威字段；`device_status_logs` 记录变更历史。
- **接口摘要**：
  - `GET /api/devices?status=running` — 按状态筛选设备
  - `PUT /api/devices/:id/status` — 更新设备状态（写入状态日志 + 履历事件）
  - `GET /api/devices/:id/status-history` — 状态变更历史

### 2.3 故障诊断模块

- **职责**：记录设备故障、记录诊断结果、关联维修工单。
- **数据归属**：`faults` 表。
- **接口摘要**：
  - `GET /api/faults` — 故障列表（支持状态筛选）
  - `POST /api/faults` — 创建故障记录（写入履历事件）
  - `GET /api/faults/:id` — 故障详情
  - `PUT /api/faults/:id/diagnosis` — 记录诊断结果与建议（写入履历事件）

### 2.4 远程升级模块

- **职责**：创建升级任务、跟踪升级状态与进度、记录结果。
- **数据归属**：`upgrade_tasks` 表。
- **接口摘要**：
  - `GET /api/upgrade-tasks` — 升级任务列表（支持状态筛选）
  - `POST /api/upgrade-tasks` — 创建升级任务（写入履历事件）
  - `GET /api/upgrade-tasks/:id` — 升级任务详情
  - `PUT /api/upgrade-tasks/:id/status` — 更新升级状态/进度（完成或失败时写入履历事件）

### 2.5 维修工单模块

- **职责**：创建工单、状态流转、记录维修过程信息。
- **数据归属**：`work_orders` 表。
- **接口摘要**：
  - `GET /api/work-orders` — 工单列表（支持状态筛选）
  - `POST /api/work-orders` — 创建工单（写入履历事件）
  - `GET /api/work-orders/:id` — 工单详情
  - `PUT /api/work-orders/:id/transition` — 工单状态流转
  - `PUT /api/work-orders/:id/repair` — 记录维修内容（完成时写入履历事件）

### 2.6 设备履历模块

- **职责**：自动汇聚设备全生命周期事件，按设备查看，按事件类型筛选。
- **数据归属**：`device_events` 表，由各模块在业务操作中自动写入，不可手动修改。
- **接口摘要**：
  - `GET /api/devices/:id/history` — 设备履历（支持 `event_type` 筛选，时间倒序）

## 3. UI 全局基线

- **应用/业务模板**：设备管理工作台（多模块导航 + 列表/详情协同）
- **展示模板**：`saas-ops-console` — 导航、筛选、表格和操作密集的管理控制台
- **视觉风格**：Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、一个主色与状态色
- **组件体系**：Ant Design（`antd` + `@ant-design/icons`）
- **应用壳与导航**：左侧深色侧栏导航（设备管理、状态监测、故障诊断、远程升级、维修工单、设备履历）、顶部上下文栏、浅色主工作区
- **目标设备**：桌面 Web（默认）
- **全局状态**：
  - 加载：表格骨架屏或 Spin
  - 空数据：Empty 提示与引导操作
  - 错误：Message/Notification 提示，可重试
  - 成功：Message 轻提示
- **选择依据**：需求涉及多模块设备管理后台，核心动作为设备登记、故障处理、工单流转和履历查看，信息密度高、表格操作密集。

## 4. 数据模型与持久化

### 4.1 数据表设计

**devices**（设备）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| code | TEXT | NOT NULL UNIQUE | 设备编号 |
| name | TEXT | NOT NULL | 设备名称 |
| model | TEXT | | 设备型号 |
| status | TEXT | NOT NULL DEFAULT 'idle' | 当前状态：idle/running/fault/upgrading/maintenance/offline |
| deleted_at | TEXT | | 软删除时间戳，null 表示未删除 |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

**device_status_logs**（状态变更历史）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| device_id | TEXT | NOT NULL FK → devices(id) | |
| status | TEXT | NOT NULL | 变更后的状态 |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

**faults**（故障记录）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| device_id | TEXT | NOT NULL FK → devices(id) | |
| description | TEXT | NOT NULL | 故障描述 |
| occurred_at | TEXT | NOT NULL | 故障发生时间 |
| diagnosis_result | TEXT | | 诊断结果 |
| diagnosis_advice | TEXT | | 处理建议 |
| status | TEXT | NOT NULL DEFAULT 'pending' | pending/diagnosed/resolved |
| work_order_id | TEXT | FK → work_orders(id) | 关联维修工单 |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

**upgrade_tasks**（远程升级任务）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| device_id | TEXT | NOT NULL FK → devices(id) | |
| content | TEXT | NOT NULL | 升级内容/版本信息 |
| status | TEXT | NOT NULL DEFAULT 'pending' | pending/upgrading/success/failed |
| progress | INTEGER | DEFAULT 0 | 0–100 |
| failure_reason | TEXT | | 失败原因 |
| started_at | TEXT | | |
| completed_at | TEXT | | |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

**work_orders**（维修工单）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| device_id | TEXT | NOT NULL FK → devices(id) | |
| fault_id | TEXT | FK → faults(id) | 关联故障 |
| reason | TEXT | NOT NULL | 维修原因 |
| priority | TEXT | NOT NULL DEFAULT 'normal' | low/normal/high/urgent |
| status | TEXT | NOT NULL DEFAULT 'pending' | pending/processing/completed/closed |
| repair_content | TEXT | | 维修内容 |
| replaced_parts | TEXT | | 更换零件 |
| completed_at | TEXT | | |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

**device_events**（设备履历事件）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PK | UUID |
| device_id | TEXT | NOT NULL FK → devices(id) | |
| event_type | TEXT | NOT NULL | device_registered/status_changed/fault_recorded/fault_diagnosed/upgrade_started/upgrade_completed/upgrade_failed/work_order_created/work_order_completed |
| event_summary | TEXT | NOT NULL | 事件摘要 |
| event_data | TEXT | | JSON 扩展数据 |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | |

### 4.2 关系与事务

- 所有业务表通过 `device_id` 外键关联到 `devices` 表。
- `faults.work_order_id` 和 `work_orders.fault_id` 实现故障与工单的双向关联。
- 履历事件由各模块在业务写入时通过事务一并写入 `device_events`，保证业务数据与履历数据的一致性。
- 设备软删除（`deleted_at` 置值）后，关联的履历数据保留可追溯。

### 4.3 迁移方式

- 使用 dbkit 的 `runMigrations(db, {directory: './migrations'})` 执行版本化迁移。
- SQL 迁移文件位于 `migrations/sqlite/` 目录，按序号命名（如 `001_init.sql`）。
- 严禁通过 ORM 自动同步或手工改 schema 绕过迁移。

## 5. 运行与校验

### 启动命令

| 用途 | 命令 |
|---|---|
| 常规启动 | `npm start` |
| 前端开发 | `npm run dev` |
| 构建前端 | `npm run build` |

### 端口与数据库路径

- 服务端口：`PORT` 环境变量，默认 `3000`
- 数据库路径：`DB_PATH` 环境变量，默认 `./data/application.db`
- 启动时自动创建 `data/` 父目录

### 验收验证方式

AC-03（远程升级）涉及设备端通信，但需求未规定升级协议和设备通信方式。设计中升级状态通过 API 手动推进（`PUT /api/upgrade-tasks/:id/status`），模拟设备升级生命周期。验收时通过 API 调用将升级状态从 `pending → upgrading → success/failed`，验证状态流转与履历记录。正常运行仍按产品要求展示升级进度。

其余 AC 均为标准请求-响应流程，通过 UI 交互验证：
- AC-01：登记设备 → 查看设备列表 → 查看设备状态
- AC-02：创建故障 → 查看故障详情 → 记录诊断结果
- AC-03：创建升级任务 → 更新状态 → 查看升级详情
- AC-04：创建工单 → 流转状态 → 记录维修内容
- AC-05：查看设备履历 → 按事件类型筛选
- AC-06：操作后重新加载页面验证数据持久化
