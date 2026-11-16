# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

- 后端：Hono（Node.js ≥ 20）
- 前端：React + Vite SPA
- 数据库：SQLite，通过 CommonApp dbkit 模块管理
- UI 组件库：Ant Design（`antd` + `@ant-design/icons`）
- 包管理器：npm

### 架构概述

单体全栈应用。Hono 服务端提供 RESTful API，React SPA 前端通过 HTTP 调用后端接口。SQLite 数据库作为唯一持久化存储，由 dbkit 管理连接、查询、事务和版本化迁移。前端与后端在同一 npm 项目中，开发时由 Vite dev server 代理 API 请求到 Hono 服务端。

### CommonApp 模块

| 模块 | 包/版本 | manifest SHA-256 | 需求匹配 | 集成边界 | 限制 |
| --- | --- | --- | --- | --- | --- |
| dbkit | `@commonapp/dbkit` v0.2.0 | `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6` | 提供 SQLite 持久化、查询、事务与版本化迁移，满足全部模块数据存储和 AC-06 持久化要求 | 后端通过 `createDb(createDbConfig({driver:'sqlite', sqlitePath: process.env.DB_PATH ?? './data/jlgrobot.db'}))` 初始化；迁移文件置于 `migrations/sqlite/` | 仅支持 SQLite；Node ≥ 20；运行时依赖 `better-sqlite3` |

不选择其他模块：需求未提及认证/权限/审计/文件上传/国际化/邮件能力，无需引入 authkit、userkit、permissionkit、auditkit、attachment、i18n 或 emailkit。

`commonapp install: dbkit`

### 运行约定

- 常规启动：`npm start`（启动 Hono 服务端 + Vite 开发服务器）
- 端口：`PORT` 环境变量，默认 3000
- 数据库路径：`DB_PATH` 环境变量，默认 `./data/jlgrobot.db`
- 数据库文件父目录在打开前自动创建
- 测试数据库：`DB_PATH` 指向隔离路径（如 `./data/test.db`），使用空闲端口
- 迁移：`npm run migrate`（运行 `migrations/sqlite/` 下的迁移文件）
- 干净目录无需手动创建 `data/` 目录即可启动

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### M1 设备状态监测

- 职责：管理设备列表和当前状态，提供状态变更入口
- 数据归属：`devices` 表为设备主数据的唯一权威来源
- 接口摘要：
  - `GET /api/devices` — 设备列表
  - `GET /api/devices/:id` — 设备详情
  - `PATCH /api/devices/:id/status` — 更新设备状态（触发履历写入）

### M2 故障诊断

- 职责：记录设备故障诊断信息，关联设备履历
- 数据归属：`fault_diagnoses` 表归属本模块
- 接口摘要：
  - `POST /api/devices/:deviceId/fault-diagnoses` — 创建故障诊断（触发履历写入）
  - `GET /api/devices/:deviceId/fault-diagnoses` — 设备故障诊断历史

### M3 远程升级

- 职责：创建和跟踪设备远程升级任务
- 数据归属：`upgrade_tasks` 表归属本模块
- 接口摘要：
  - `POST /api/devices/:deviceId/upgrade-tasks` — 创建升级任务（触发履历写入）
  - `GET /api/devices/:deviceId/upgrade-tasks` — 设备升级任务列表
  - `PATCH /api/upgrade-tasks/:id` — 更新升级任务状态（触发履历写入）

### M4 维修工单

- 职责：创建和管理维修工单，跟踪状态流转
- 数据归属：`maintenance_orders` 表归属本模块
- 状态流转：待处理 → 处理中 → 已完成（不可逆）
- 接口摘要：
  - `POST /api/maintenance-orders` — 创建工单（触发履历写入）
  - `GET /api/maintenance-orders` — 工单列表（支持 `deviceId` 筛选）
  - `GET /api/maintenance-orders/:id` — 工单详情
  - `PATCH /api/maintenance-orders/:id` — 更新工单状态（触发履历写入）

### M5 设备履历

- 职责：按设备汇聚生命周期事件，按时间排序展示
- 数据归属：`equipment_history` 表归属本模块，由其他四个模块的业务事件触发写入
- 接口摘要：
  - `GET /api/devices/:deviceId/history` — 设备履历（按时间排序）

### 履历汇聚机制

设备履历通过 `equipment_history` 表实现。其他模块在关键业务操作完成后（状态变更、故障诊断创建、升级任务创建与状态变更、工单创建与状态变更），在同一事务中向 `equipment_history` 写入一条事件记录，包含事件类型、来源记录 ID、描述和时间。履历查询直接从该表按设备 ID 和时间排序读取，无需跨表联合查询。

## 3. 数据模型

### devices

| 列名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PRIMARY KEY | UUID v4 |
| name | TEXT | NOT NULL | 设备名称 |
| identifier | TEXT | NOT NULL, UNIQUE | 设备标识 |
| status | TEXT | NOT NULL, DEFAULT 'idle' | running / idle / fault / offline |
| status_updated_at | TEXT | NOT NULL | ISO 8601 时间戳 |

### fault_diagnoses

| 列名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PRIMARY KEY | UUID v4 |
| device_id | TEXT | NOT NULL, FK → devices(id) | 关联设备 |
| description | TEXT | NOT NULL | 故障描述 |
| diagnosed_at | TEXT | NOT NULL | ISO 8601 诊断时间 |

### upgrade_tasks

| 列名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PRIMARY KEY | UUID v4 |
| device_id | TEXT | NOT NULL, FK → devices(id) | 关联设备 |
| package_id | TEXT | NOT NULL | 升级包标识 |
| status | TEXT | NOT NULL, DEFAULT 'pending' | pending / executing / success / failed |
| initiated_at | TEXT | NOT NULL | ISO 8601 发起时间 |
| completed_at | TEXT | nullable | ISO 8601 完成时间 |

### maintenance_orders

| 列名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PRIMARY KEY | UUID v4 |
| device_id | TEXT | NOT NULL, FK → devices(id) | 关联设备 |
| fault_description | TEXT | NOT NULL | 故障描述 |
| technician | TEXT | nullable | 维修人员 |
| status | TEXT | NOT NULL, DEFAULT 'pending' | pending / processing / completed |
| created_at | TEXT | NOT NULL | ISO 8601 创建时间 |
| updated_at | TEXT | NOT NULL | ISO 8601 更新时间 |

### equipment_history

| 列名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PRIMARY KEY | UUID v4 |
| device_id | TEXT | NOT NULL, FK → devices(id) | 关联设备 |
| event_type | TEXT | NOT NULL | status_change / fault_diagnosis / remote_upgrade / maintenance_order |
| source_id | TEXT | NOT NULL | 来源记录 ID |
| description | TEXT | NOT NULL | 事件描述 |
| occurred_at | TEXT | NOT NULL | ISO 8601 事件时间 |

### ID 类型对照

| 实体 | 数据库主键 | 外键引用 | API JSON 类型 | 前端类型 |
| --- | --- | --- | --- | --- |
| Device | TEXT (UUID v4) | — | string | string |
| FaultDiagnosis | TEXT (UUID v4) | device_id: TEXT | string | string |
| UpgradeTask | TEXT (UUID v4) | device_id: TEXT | string | string |
| MaintenanceOrder | TEXT (UUID v4) | device_id: TEXT | string | string |
| EquipmentHistory | TEXT (UUID v4) | device_id: TEXT | string | string |

所有实体 ID 统一使用 UUID v4 字符串，从数据库到 API 到前端保持一致，无需转换。

### 迁移

数据库变更通过版本化 SQL 迁移文件管理，置于 `migrations/sqlite/` 目录。首次迁移创建全部五张表、外键约束和索引。迁移通过 `runMigrations(db, {directory: './migrations'})` 执行，不使用 ORM 自动同步或手工改 schema。

## 4. UI 基线

### 全局布局

- 应用/业务模板：helpdesk（设备工单管理工作台）
- 展示模板：`split-master-detail`
- 视觉风格：Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、一个主色与状态色
- 组件体系：Ant Design（`antd` + `@ant-design/icons`），在实现阶段安装
- 应用壳：左侧深色侧栏导航 + 顶部上下文栏 + 浅色主工作区
- 目标设备：桌面 Web

### 导航结构

侧栏导航项：

1. 设备监测 — 设备列表与详情
2. 故障诊断 — 故障诊断记录（按设备筛选）
3. 远程升级 — 升级任务列表与跟踪
4. 维修工单 — 工单列表与详情
5. 设备履历 — 按设备查看完整履历

### 工作流布局

- 设备监测：左侧设备列表表格，右侧选中设备详情（含状态、基本信息、操作入口）
- 故障诊断/远程升级/维修工单：master-detail 布局，列表 + 详情面板
- 设备履历：按设备筛选的时间轴列表

### 状态设计

- 加载状态：Spin 组件
- 空数据：Empty 组件提示
- 错误状态：`message.error` 提示 + 重试
- 成功状态：`message.success` 反馈
- 设备状态色：running（绿色）/ idle（灰色）/ fault（红色）/ offline（默认色）

## 5. 验证可重复性

本应用验收涉及状态流转和跨模块履历汇聚，以下 AC 需要预置状态：

- AC-01：需预置至少一台设备。通过迁移后 seed 脚本或 API 创建初始设备数据。
- AC-02~AC-05：在预置设备基础上执行对应业务操作（故障诊断、升级、工单流转），验证履历自动汇聚。
- AC-04：工单状态流转（待处理→处理中→已完成）需依次调用 PATCH 接口；已完成状态不可逆，验证时需创建新工单或重置测试数据库。
- AC-06：持久化验证需重启服务后重新查询同一数据库。

验证时使用 `DB_PATH` 指向隔离测试数据库，验证前运行迁移，验证后清理本次启动的进程和测试数据库文件。
