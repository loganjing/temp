# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| 后端框架 | Hono (Node.js) | 轻量 HTTP 框架，适合 API 服务 + 静态前端托管 |
| 前端框架 | React + Vite SPA | 标准前端方案，满足监控界面需求 |
| 数据库 | SQLite (better-sqlite3) | 文件数据库，无需额外基础设施，满足任务队列与状态持久化 |
| 实时推送 | SSE (Server-Sent Events) | 单向推送，监控界面实时刷新队列/机器人/告警状态 |
| 语言 | TypeScript | 前后端类型安全 |

### 系统拓扑

```
┌─────────────────────────────────────────────┐
│              浏览器（操作人员）                │
│   React SPA — 运行监控 Dashboard             │
└────────────────┬────────────────────────────┘
                 │ HTTP API + SSE
┌────────────────▼────────────────────────────┐
│           Hono Server (Node.js)             │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│  │ Task     │ │ Robot    │ │ Path        │  │
│  │ Queue    │ │ Mgmt     │ │ Coordination│  │
│  └────┬─────┘ └────┬─────┘ └──────┬──────┘  │
│       │            │                │         │
│  ┌────▼─────┐ ┌────▼─────┐ ┌───────▼──────┐  │
│  │ Notifier │ │ Monitor  │ │  Dispatcher   │  │
│  │          │ │ Service  │ │  (background) │  │
│  └──────────┘ └──────────┘ └──────────────┘  │
│         │           │           │              │
│  ┌──────▼───────────▼───────────▼──────────┐  │
│  │         SQLite (better-sqlite3)          │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 运行约定

- 启动命令：`npm start`（构建前端后启动 Hono 服务）
- 开发命令：`npm run dev`（前端热更新 + 后端 tsx watch）
- 端口：`PORT` 环境变量，默认 `3000`
- 数据库路径：`DB_PATH` 环境变量，默认 `./data/catering.db`；启动前自动创建父目录
- 隔离测试数据库：`DB_PATH=./data/test.db`
- 前端构建产物由 `dist/` 目录托管，Hono 同时提供 API 和静态文件

### 核心设计决策

1. **任务队列与分配**：任务存入 SQLite，按 `created_at` 升序 FIFO 取出。后台 Dispatcher 以轮询方式检查空闲机器人 + 待分配任务，自动触发分配，满足 AC-02 的后台任务要求。
2. **路径协调**：采用路径段（segment）锁模型。每段路径同一时刻只允许一台机器人占用。分配任务时规划路径并预占段；检测到冲突时通过延迟启动、等待释放或重新规划避免冲突。运行中持续检查前方段是否被占用。
3. **到桌通知**：机器人到达目标桌位时由 API 触发通知记录，通知包含任务 ID、机器人 ID 和桌位标识，满足 AC-04。
4. **任务取消**：待分配任务从队列移除；配送中任务释放机器人状态和路径段锁，回到空闲。满足 AC-05。
5. **监控**：监控模块只读聚合其他模块数据，通过 SSE 推送实时更新，Dashboard 展示队列/机器人/任务进度/告警，满足 AC-06 和 AC-07。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 任务队列模块（Task Queue）

**职责**：配送任务的创建、排队、状态流转。

**唯一数据归属**：`delivery_tasks` 表（任务状态权威来源）。

**状态机**：

```
待分配 ──分配──▶ 配送中 ──送达──▶ 已送达
  │                │
  └──取消──▶ 已取消 ◀──取消──┘
```

**接口摘要**：

| 接口 | 方向 | 用途 |
|------|------|------|
| `POST /api/tasks` | 前端 → 后端 | 创建配送任务，含目标桌位标识 |
| `GET /api/tasks` | 前端 → 后端 | 查询任务列表，可按状态过滤 |
| `POST /api/tasks/:id/cancel` | 前端 → 后端 | 取消任务（待分配或配送中） |
| `assignNextTask(robotId)` | Dispatcher → Queue | 内部调用，从队列头部取任务分配给机器人 |
| `markDelivered(taskId)` | Robot → Queue | 标记任务已送达 |

### 2.2 机器人管理模块（Robot Management）

**职责**：机器人注册、状态管理、到达事件处理。

**唯一数据归属**：`robots` 表（机器人状态权威来源）。

**机器人状态**：`idle`（空闲）、`delivering`（配送中）、`offline`（离线）。

**接口摘要**：

| 接口 | 方向 | 用途 |
|------|------|------|
| `POST /api/robots` | 前端 → 后端 | 注册机器人 |
| `GET /api/robots` | 前端 → 后端 | 查询所有机器人状态 |
| `PATCH /api/robots/:id/status` | 前端 → 后端 | 更新机器人状态（如置为空闲或离线） |
| `POST /api/robots/:id/arrive` | 前端 → 后端 | 机器人到达桌位，触发通知 |

### 2.3 路径协调模块（Path Coordination）

**职责**：路径规划、冲突检测、冲突避免。

**唯一数据归属**：`path_segments`（路径段定义）、`segment_locks`（段锁状态）。

**路径模型**：
- 节点（Node）：餐厅关键位置（厨房、桌位、交叉口）
- 路径段（Segment）：连接两个节点的可通行段，同一时刻只允许一台机器人占用
- 路径规划：从厨房节点到目标桌位节点的最短路径（BFS）

**协调流程**：
1. 任务分配时规划路径，获取有序段列表
2. 检查每个段是否被其他机器人占用 → 冲突检测
3. 若冲突：延迟该机器人启动等待释放，或重新规划替代路径 → 冲突避免
4. 运行中：机器人通过段时获取锁，通过后释放锁；持续检查前方段占用状态

**接口摘要**：

| 接口 | 方向 | 用途 |
|------|------|------|
| `planPath(robotId, taskId, tableId)` | Dispatcher → Path | 内部调用，规划路径并预占段 |
| `releasePath(robotId, taskId)` | Queue/Cancel → Path | 内部调用，释放机器人所有段锁 |
| `checkConflicts()` | Monitor → Path | 内部调用，查询当前冲突状态 |

### 2.4 通知模块（Notification）

**职责**：到桌通知生成与查询。

**唯一数据归属**：`notifications` 表。

**接口摘要**：

| 接口 | 方向 | 用途 |
|------|------|------|
| `POST /api/notifications` | Robot/Arrive → 后端 | 机器人到达时创建通知（内部触发） |
| `GET /api/notifications` | 前端 → 后端 | 查询通知记录 |

### 2.5 监控模块（Monitoring）

**职责**：只读聚合其他模块数据，提供监控视图和实时推送。

**接口摘要**：

| 接口 | 方向 | 用途 |
|------|------|------|
| `GET /api/monitor/overview` | 前端 → 后端 | 队列数量、机器人状态汇总、活跃任务数、告警数 |
| `GET /api/monitor/queue` | 前端 → 后端 | 待执行任务列表及详情 |
| `GET /api/monitor/robots` | 前端 → 后端 | 各机器人状态及当前任务 |
| `GET /api/monitor/alerts` | 前端 → 后端 | 活跃告警列表 |
| `GET /api/monitor/events` | 前端 → 后端 | SSE 流，实时推送状态变更 |

### 2.6 后台调度器（Dispatcher）

**职责**：后台轮询，当有空闲机器人且队列有待分配任务时自动分配。

**运行方式**：间隔 1 秒轮询；检测到 `idle` 机器人 + `pending` 任务时触发 `assignNextTask`，调用路径协调模块规划路径，更新任务和机器人状态。

### 2.7 告警生成

**触发条件**：
- 机器人状态变为 `offline` → 生成离线告警
- 路径冲突无法通过等待或重规划解决 → 生成冲突告警

**数据归属**：`alerts` 表。

## 3. 数据模型

### 3.1 delivery_tasks

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 任务 ID |
| table_id | TEXT | NOT NULL | 目标桌位标识 |
| status | TEXT | NOT NULL DEFAULT 'pending' | pending / delivering / delivered / cancelled |
| robot_id | INTEGER | FK robots(id) NULL | 分配的机器人 ID |
| created_at | TEXT | NOT NULL | 创建时间 ISO8601 |
| assigned_at | TEXT | NULL | 分配时间 |
| delivered_at | TEXT | NULL | 送达时间 |
| cancelled_at | TEXT | NULL | 取消时间 |

索引：`idx_tasks_status_created` (status, created_at) — FIFO 取出和状态过滤。

### 3.2 robots

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 机器人 ID |
| name | TEXT | NOT NULL | 机器人名称 |
| status | TEXT | NOT NULL DEFAULT 'idle' | idle / delivering / offline |
| current_task_id | INTEGER | FK delivery_tasks(id) NULL | 当前执行任务 ID |
| created_at | TEXT | NOT NULL | 注册时间 |

### 3.3 path_nodes

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 节点 ID |
| label | TEXT | NOT NULL | 节点标签（如 "kitchen"、"table-5"、"junction-A"） |
| node_type | TEXT | NOT NULL | kitchen / table / junction |

### 3.4 path_segments

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 段 ID |
| from_node | INTEGER | FK path_nodes(id) | 起始节点 |
| to_node | INTEGER | FK path_nodes(id) | 终止节点 |
| label | TEXT | NOT NULL | 段标签 |

### 3.5 segment_locks

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 锁 ID |
| segment_id | INTEGER | FK path_segments(id) | 被占用的段 |
| robot_id | INTEGER | FK robots(id) | 持有锁的机器人 |
| task_id | INTEGER | FK delivery_tasks(id) | 关联任务 |
| sequence | INTEGER | NOT NULL | 在路径中的顺序 |
| locked_at | TEXT | NOT NULL | 获取时间 |
| released_at | TEXT | NULL | 释放时间 |

唯一约束：`segment_id` + `released_at IS NULL` — 同一段同一时刻只能有一个活跃锁。

### 3.6 notifications

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 通知 ID |
| task_id | INTEGER | FK delivery_tasks(id) | 关联任务 |
| robot_id | INTEGER | FK robots(id) | 送达机器人 |
| table_id | TEXT | NOT NULL | 目标桌位标识 |
| sent_at | TEXT | NOT NULL | 通知时间 |

### 3.7 alerts

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 告警 ID |
| type | TEXT | NOT NULL | robot_offline / path_conflict_unresolved |
| message | TEXT | NOT NULL | 告警描述 |
| robot_id | INTEGER | FK robots(id) NULL | 关联机器人 |
| resolved | INTEGER | NOT NULL DEFAULT 0 | 0 未解决 / 1 已解决 |
| created_at | TEXT | NOT NULL | 告警时间 |

### 3.8 迁移策略

使用编号 SQL 迁移文件（`db/migrations/001_init.sql`），启动时自动执行未应用的迁移。不使用 ORM 自动同步。

## 4. UI 基线

### 展示模板

`command-center-dashboard` — 运行监控 Dashboard，顶部 KPI 行 + 下方分区明细联动。

### 视觉风格

Modern SaaS — 柔和中性色背景，细边界，少阴影，中等圆角，一个主色（蓝），状态色（绿=空闲、橙=配送中、红=离线/告警），清晰无衬线字体。

### 应用壳与导航

- 左侧边栏：模块导航（总览、任务队列、机器人、告警）
- 顶部上下文栏：当前模块标题 + 系统状态指示灯
- 主工作区：Dashboard 布局
- 目标设备：桌面 Web（最小宽度 1024px）

### 主工作流布局

1. **总览页**：顶部 KPI 行（待分配任务数、配送中任务数、空闲机器人数、活跃告警数）；下方三栏：队列摘要表、机器人状态卡片网格、活跃告警列表。
2. **任务队列页**：上半部分为待分配任务表格（序号、桌位、创建时间、状态、取消操作），下半部分为配送中任务列表（机器人、桌位、进度状态、取消操作）。
3. **机器人页**：机器人卡片网格，每张卡片显示名称、状态色标、当前任务、操作按钮（置空闲、置离线）。
4. **告警页**：告警列表，含类型、描述、关联机器人、时间、解决状态。

### 全局状态

- 加载：骨架屏 / 旋转加载图标
- 空数据：占位提示文案
- 错误：错误提示条 + 重试按钮
- 实时更新：SSE 连接状态指示灯

### 实体 ID 对照表

| 实体 | 生成方 | 数据库主键 | API JSON 类型 | 前端类型 | 转换 |
|------|--------|-----------|--------------|---------|------|
| 任务 ID | 后端 AUTOINCREMENT | INTEGER | number | number | 无需转换 |
| 机器人 ID | 后端 AUTOINCREMENT | INTEGER | number | number | 无需转换 |
| 桌位标识 | 用户输入 | TEXT | string | string | 无需转换 |

字段级 API 定义详见 `technical-contract.md`。

## 5. 运行与可靠性

### 启动流程

1. 执行数据库迁移（创建表和初始路径图数据）
2. 构建前端静态资源（`dist/`）
3. 启动 Hono 服务，监听 `PORT`
4. 启动后台 Dispatcher 轮询循环

### 数据库

- 引擎：SQLite via better-sqlite3
- 默认路径：`./data/catering.db`
- 测试路径：`./data/test.db`
- 启动前自动创建 `data/` 父目录
- 初始数据：迁移文件内置示例路径图（厨房节点 + 若干桌位节点 + 交叉口节点 + 连接段）

### 错误处理

- API 错误统一返回 `{ error: string, code: string }` 格式
- 数据库操作失败返回 500
- 任务不存在或状态不允许返回 400
- 机器人不存在返回 404

### 残留风险

- 路径图拓扑为设计假设（需求未规定餐厅布局），实现阶段需确认初始路径图合理性
- SSE 连接在网络不稳定时可能断开，需前端自动重连
- Dispatcher 轮询间隔（1 秒）在极高并发下可能有延迟，当前需求规模下足够
