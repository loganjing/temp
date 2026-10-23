# 系统设计

> **工作项**：wi-t1000025  
> **业务任务**：161-仓储搬运

<!-- system-design: scope -->

## 1. 整体方案与设计基线

### 1.1 技术栈

| 层 | 技术选型 | 说明 |
|---|---|---|
| 前端 | React 18 + Vite + TypeScript | SPA，桌面 Web |
| 后端 | Hono + Node.js + TypeScript | REST API + WebSocket |
| 数据库 | SQLite (better-sqlite3) | 文件数据库，零运维 |
| 实时通信 | WebSocket (ws) | 设备状态与任务进度推送 |
| 图表 | ECharts | 统计报表可视化 |
| 包管理 | npm workspaces | monorepo 结构 |

### 1.2 架构概览

系统采用前后端分离的单体应用架构：

```
┌──────────────────────────────────────────────────┐
│                    前端 SPA                       │
│  任务管理 │ 实时监控 │ 任务统计 │ 设备/地图管理     │
└──────────────┬───────────────────────────────────┘
           REST API + WebSocket
┌──────────────┴───────────────────────────────────┐
│                后端服务 (Hono)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐     │
│  │任务管理  │ │设备管理  │ │仓库地图      │     │
│  └──────────┘ └──────────┘ └──────────────┘     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐     │
│  │路径规划  │ │交通协调  │ │执行监控      │     │
│  └──────────┘ └──────────┘ └──────────────┘     │
│  ┌──────────┐                                    │
│  │任务统计  │                                    │
│  └──────────┘                                    │
└──────────────┬───────────────────────────────────┘
               │
        ┌──────┴──────┐
        │  SQLite DB  │
        └─────────────┘
```

后端按领域模块组织，每个模块拥有独立的数据表和业务逻辑。模块间通过内部服务调用协作，不直接访问其他模块的私有表。

### 1.3 项目结构

```
/
├── server/                  # 后端
│   └── src/
│       ├── index.ts         # 应用入口，Hono 服务器
│       ├── db/              # 数据库初始化与迁移
│       ├── modules/         # 领域模块
│       │   ├── task-management/
│       │   ├── device-management/
│       │   ├── warehouse-map/
│       │   ├── path-planning/
│       │   ├── traffic-coordination/
│       │   ├── execution-monitoring/
│       │   └── statistics/
│       ├── routes/          # API 路由定义
│       └── ws/              # WebSocket 处理
├── client/                 # 前端
│   └── src/
│       ├── pages/           # 页面组件
│       ├── components/      # 通用组件
│       ├── hooks/           # 自定义 hooks
│       └── api/            # API 调用层
├── shared/                 # 前后端共享类型
│   └── types.ts
└── package.json            # 根 workspace
```

### 1.4 关键设计决策

- **SQLite 而非外部数据库**：需求未提出并发量或部署要求，文件数据库满足单机仓储场景的数据持久化需求，零运维成本。
- **WebSocket 实时推送**：执行监控要求反映设备实时位置和任务状态（NFR-02），WebSocket 提供低延迟的双向通信。
- **后端图算法路径规划**：仓库地图为拓扑图，Dijkstra 算法计算最短路径，服务端集中计算保证一致性。
- **事件驱动交通协调**：路径规划完成和设备位置上报时触发冲突检测，辅以后台安全循环检测死锁。

<!-- system-design: architecture-boundaries -->

## 2. 领域责任、模块边界与接口摘要

### 2.1 模块划分与职责

| 模块 | 核心职责 | 数据归属 |
|---|---|---|
| 任务管理 (task-management) | 搬运任务 CRUD、自动/手动分配、取消、完成确认 | transport_tasks |
| 设备管理 (device-management) | 搬运设备 CRUD、状态管理、位置上报接收 | transport_resources |
| 仓库地图 (warehouse-map) | 库位和通道拓扑管理 | locations, map_edges |
| 路径规划 (path-planning) | 最短路径计算（Dijkstra）、路径重规划 | routes |
| 交通协调 (traffic-coordination) | 冲突检测、避让调度、死锁检测与解除 | traffic_conflicts |
| 执行监控 (execution-monitoring) | 执行事件记录、实时状态推送、异常告警 | execution_events |
| 任务统计 (statistics) | 完成任务指标聚合、报表查询、导出 | 无独立表（聚合查询） |

### 2.2 模块间协作关系

- **任务管理 → 路径规划**：任务分配后调用路径规划服务计算路线
- **任务管理 → 设备管理**：分配时更新设备状态为「作业中」，完成/取消时恢复为「空闲」
- **路径规划 → 交通协调**：新路径生成后触发冲突检测
- **设备管理 → 交通协调**：设备位置上报时触发冲突重评估
- **设备管理 → 执行监控**：位置上报和状态变更触发事件记录
- **任务管理 → 执行监控**：分配、完成、取消等操作触发事件记录
- **交通协调 → 执行监控**：避让暂停/恢复触发事件记录
- **任务统计 ← 任务管理 + 执行监控**：读取已完成任务和执行事件进行聚合

### 2.3 接口摘要

| 模块 | 接口 | 方向 | 用途 |
|---|---|---|---|
| 任务管理 | POST /api/tasks | 前端→后端 | 创建搬运任务 |
| 任务管理 | GET /api/tasks | 前端→后端 | 查询任务列表（支持状态/设备/优先级筛选） |
| 任务管理 | GET /api/tasks/:id | 前端→后端 | 获取任务详情 |
| 任务管理 | POST /api/tasks/:id/assign | 前端→后端 | 分配任务（自动或手动） |
| 任务管理 | POST /api/tasks/:id/cancel | 前端→后端 | 取消任务 |
| 任务管理 | POST /api/tasks/:id/complete | 前端→后端 | 确认任务完成 |
| 任务管理 | POST /api/tasks/:id/recover | 前端→后端 | 异常恢复 |
| 设备管理 | GET /api/resources | 前端→后端 | 查询设备列表 |
| 设备管理 | GET /api/resources/:id | 前端→后端 | 获取设备详情 |
| 设备管理 | POST /api/resources | 前端→后端 | 创建设备 |
| 设备管理 | PATCH /api/resources/:id/status | 前端→后端 | 更新设备状态 |
| 设备管理 | POST /api/resources/:id/position | 前端→后端 | 设备位置上报 |
| 仓库地图 | GET /api/locations | 前端→后端 | 查询库位列表 |
| 仓库地图 | GET /api/maps/topology | 前端→后端 | 获取地图拓扑图 |
| 路径规划 | GET /api/routes/:taskId | 前端→后端 | 获取任务当前路径 |
| 交通协调 | GET /api/traffic/conflicts | 前端→后端 | 查询活跃冲突 |
| 执行监控 | GET /api/tasks/:id/events | 前端→后端 | 获取执行事件序列 |
| 执行监控 | WS /ws/monitoring | 前端↔后端 | 实时监控推送 |
| 任务统计 | GET /api/statistics | 前端→后端 | 查询统计指标 |
| 任务统计 | GET /api/statistics/export | 前端→后端 | 导出统计结果 |

> 字段级 API 契约详见 `technical-contract.md`。

## 3. 全局 UI 基线

### 3.1 应用模板与展示模板

- **应用/业务模板**：SaaS 运营控制台
- **展示模板 ID**：`saas-ops-console`
- **选择依据**：系统为多模块仓储运营管理后台，核心工作流为任务列表管理、实时监控看板和统计报表，符合导航+筛选+表格+操作的密集操作型布局。

### 3.2 视觉预设

- **视觉风格**：Modern SaaS
- **设计 Token 方向**：柔和中性色背景、细边界、少阴影、中等圆角；一个主色（蓝色系）与状态色（成功绿、警告橙、错误红）；清晰无衬线字体；短而有反馈作用的动效。

### 3.3 应用壳与导航

- **应用壳**：左侧固定导航栏 + 顶部上下文栏 + 右侧主工作区
- **导航结构**：

| 导航项 | 页面 | 说明 |
|---|---|---|
| 任务管理 | 任务列表 + 创建 + 详情 | 搬运任务的创建、分配、取消和详情查看 |
| 实时监控 | 监控看板 | 任务状态总览、设备状态总览、执行进度、异常告警 |
| 任务统计 | 统计报表 | 任务总量、完成率、搬运时长、设备利用率等指标 |
| 设备管理 | 设备列表 + 创建 | 搬运设备的注册和状态管理 |
| 地图配置 | 库位 + 通道 | 仓库地图拓扑的查看和配置 |

### 3.4 目标设备

- **目标设备**：桌面 Web（默认 1280px+ 宽度）
- 需求未要求移动端或窄屏布局，不设计窄屏适配。

### 3.5 关键全局状态

| 状态 | 说明 |
|---|---|
| 加载中 | 表格和列表数据请求时显示骨架屏或加载动画 |
| 空数据 | 无任务/无设备/无统计数据时显示空状态提示 |
| 错误 | API 请求失败时显示错误提示，支持重试 |
| 成功 | 任务创建/分配/取消/完成等操作成功后显示短暂成功提示 |

## 4. 数据库模型与数据

### 4.1 数据库选择

SQLite 文件数据库，默认路径 `data/warehouse.db`，测试路径通过 `DB_PATH` 环境变量覆盖。数据库文件父目录在打开前自动创建。

### 4.2 表结构

#### transport_tasks

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | 任务ID |
| source_location_code | TEXT NOT NULL | 源库位编码 |
| target_location_code | TEXT NOT NULL | 目标库位编码 |
| cargo_name | TEXT NOT NULL | 货物名称 |
| cargo_quantity | INTEGER NOT NULL | 货物数量 |
| priority | TEXT NOT NULL DEFAULT 'normal' | 优先级：normal/urgent/highest |
| status | TEXT NOT NULL DEFAULT 'pending' | 状态：pending/assigned/in_transit/completed/cancelled/error |
| created_by | TEXT NOT NULL | 创建人 |
| created_at | TEXT NOT NULL | 创建时间 (ISO 8601) |
| assigned_resource_id | INTEGER | 分配设备ID |
| assigned_at | TEXT | 分配时间 |
| assignment_method | TEXT | 分配方式：auto/manual |
| cancelled_by | TEXT | 取消人 |
| cancelled_at | TEXT | 取消时间 |
| completed_at | TEXT | 完成时间 |

#### transport_resources

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | 设备ID |
| name | TEXT NOT NULL | 设备名称 |
| type | TEXT NOT NULL | 设备类型：agv/forklift |
| status | TEXT NOT NULL DEFAULT 'idle' | 状态：idle/busy/offline/fault |
| current_location_code | TEXT | 当前位置库位编码 |
| last_position_at | TEXT | 最后位置上报时间 |

#### locations

| 字段 | 类型 | 说明 |
|---|---|---|
| code | TEXT PK | 库位编码（唯一） |
| name | TEXT NOT NULL | 库位名称 |
| x | REAL NOT NULL | X 坐标 |
| y | REAL NOT NULL | Y 坐标 |
| type | TEXT NOT NULL DEFAULT 'storage' | 类型：storage/transit |

#### map_edges

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | 边ID |
| from_location_code | TEXT NOT NULL | 起点库位编码 |
| to_location_code | TEXT NOT NULL | 终点库位编码 |
| distance | REAL NOT NULL | 通道距离 |
| direction | TEXT NOT NULL DEFAULT 'bidirectional' | 方向：bidirectional/unidirectional |

#### routes

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | 路径ID |
| task_id | INTEGER NOT NULL | 关联任务ID |
| resource_id | INTEGER NOT NULL | 关联设备ID |
| nodes | TEXT NOT NULL | 路径节点序列 (JSON: [{code, x, y, order}]) |
| planned_distance | REAL NOT NULL | 预计搬运距离 |
| planned_duration | REAL NOT NULL | 预计搬运时长（秒） |
| is_active | INTEGER NOT NULL DEFAULT 1 | 是否为当前活动路径 |
| replan_reason | TEXT | 重规划原因 |
| replaced_by_route_id | INTEGER | 被替代路径ID |
| created_at | TEXT NOT NULL | 创建时间 |

#### execution_events

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | 事件ID |
| task_id | INTEGER NOT NULL | 关联任务ID |
| resource_id | INTEGER | 关联设备ID |
| event_type | TEXT NOT NULL | 事件类型 |
| occurred_at | TEXT NOT NULL | 发生时间 (ISO 8601) |
| description | TEXT | 事件描述 |
| metadata | TEXT | 附加数据 (JSON) |

#### traffic_conflicts

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | 冲突ID |
| conflict_type | TEXT NOT NULL | 冲突类型：node/oncoming/tailgating |
| resource_ids | TEXT NOT NULL | 涉及设备ID列表 (JSON: [int]) |
| location_code | TEXT NOT NULL | 冲突位置库位编码 |
| detected_at | TEXT NOT NULL | 检测时间 |
| resolved_at | TEXT | 解决时间 |
| strategy | TEXT | 避让策略：priority_yield/first_arrive/detour |
| status | TEXT NOT NULL DEFAULT 'active' | 状态：active/resolved |

### 4.3 迁移策略

数据库变更使用版本化 SQL 迁移脚本，存放在 `server/src/db/migrations/` 目录下。迁移按序号执行，不通过 ORM 自动同步。初始迁移创建全部表结构。

## 5. 运行与可靠性

### 5.1 启动命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 同时启动后端和前端开发服务器 |
| `npm run dev:server` | 仅启动后端 (Hono + WebSocket) |
| `npm run dev:client` | 仅启动前端 (Vite) |
| `npm run build` | 构建前端生产包 |
| `npm start` | 启动生产服务器 |
| `npm run migrate` | 执行数据库迁移 |

### 5.2 端口与路径配置

| 配置项 | 默认值 | 环境变量 | 说明 |
|---|---|---|---|
| 后端端口 | 3000 | `PORT` | Hono HTTP 服务端口 |
| 前端开发端口 | 5173 | — | Vite 开发服务器端口 |
| 数据库路径 | `data/warehouse.db` | `DB_PATH` | SQLite 文件路径 |

### 5.3 后台服务

| 服务 | 触发方式 | 说明 |
|---|---|---|
| 自动任务分配 | 事件触发 | 任务创建（autoAssign=true）或设备恢复空闲时检查并执行分配 |
| 交通冲突检测 | 事件触发 + 安全循环 | 路径规划完成或设备位置上报时检测；每 5 秒安全循环检查死锁 |
| 设备心跳监控 | 定时循环 | 每 30 秒检查设备最后上报时间，超时触发异常告警 |

### 5.4 隔离测试

测试使用独立的 `DB_PATH` 指向临时数据库文件，后端选择空闲端口启动，等待真实监听就绪后运行验证。测试完成后清理本次启动的进程和临时数据库文件。干净目录无需人工准备即可运行。
