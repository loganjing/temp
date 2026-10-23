# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | React 18 + Vite + TypeScript | SPA，桌面 Web 优先 |
| 后端 | Hono (Node.js) + TypeScript | REST API，单体服务 |
| 数据库 | SQLite (better-sqlite3) | 文件数据库，轻量部署 |
| 构建 | npm + Vite | 前端构建产物由后端静态托管 |

新建项目，采用 Hono + React/Vite 全栈方案。后端提供 REST API，前端为 SPA。SQLite 作为持久化数据库，数据在服务端权威存储，支持多角色（农场管理者、采摘作业人员）跨用户共享。

### 运行约定

- 启动入口：`npm start`（生产）或 `npm run dev`（开发，前后端热更新）
- 后端端口：`PORT` 环境变量，默认 3000
- 数据库路径：`DB_PATH` 环境变量，默认 `./data/app.db`
- 验证隔离数据库：`DB_PATH=./data/test.db`
- 干净目录启动：首次运行自动创建 `./data/` 目录并初始化数据库 schema（通过版本化迁移脚本）

### UI 全局基线

- **展示模板**：`saas-ops-console` — 左侧导航 + 顶部上下文栏 + 主工作区。农业采摘管理系统包含成熟度识别、任务规划、进度监控、异常上报、产量统计五个模块，需要导航切换、筛选条件和数据表格密集操作，适合运营管理控制台布局。
- **视觉预设**：Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、清晰字体，一个主色（绿色，呼应农业主题）与状态色（成功/警告/危险），短而有反馈作用的动效。
- **应用壳**：左侧固定导航栏（五个功能模块入口 + 应用标题），顶部上下文栏（当前模块标题 + 筛选区），主工作区为表格/表单/统计面板。
- **目标设备**：桌面 Web，最小宽度 1024px。
- **全局状态**：
  - 加载：表格骨架屏，表单提交按钮 loading 禁用
  - 空数据：表格空态文案 + 引导操作按钮
  - 错误：顶部 Toast 提示，表单字段内联错误
  - 成功：顶部 Toast 提示，列表自动刷新
- **模块工作流**：
  - 成熟度识别：地块列表 + 评估记录筛选表格，"新建评估"表单弹窗
  - 采摘任务规划：任务列表表格（紧急任务视觉高亮行）+ "创建任务"表单弹窗
  - 作业进度监控：顶部 KPI 汇总卡片 + 进行中任务进度列表；待处理异常提示标识
  - 异常上报：异常列表表格 + "上报异常"表单弹窗 + 状态更新操作
  - 产量统计：筛选条件 + 统计概览卡片 + 地块维度产量明细表格

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 模块划分

| 模块 | 职责 | 数据归属 |
|---|---|---|
| 地块与成熟度 | 地块 CRUD、成熟度评估记录管理、可采摘状态自动计算 | plots, maturity_assessments |
| 采摘任务 | 任务创建、分配、状态生命周期管理、任务筛选 | picking_tasks |
| 作业进度 | 进度上报、累计采摘量计算、整体进度概览 | progress_reports |
| 异常上报 | 异常报告提交、状态跟踪、处理更新 | exception_reports |
| 产量统计 | 基于已完成任务汇总产量数据，按地块/品种/时间范围统计 | 聚合查询 picking_tasks + progress_reports |

### 接口摘要

| 接口 | 用途 | 调用方向 |
|---|---|---|
| GET /api/plots | 地块列表（支持按编号、品种、可采摘状态筛选） | 前端 → 后端 |
| POST /api/plots | 创建地块 | 前端 → 后端 |
| GET /api/assessments | 成熟度评估记录列表（支持按地块、等级、可采摘筛选） | 前端 → 后端 |
| POST /api/assessments | 创建成熟度评估记录（后端自动更新地块可采摘状态） | 前端 → 后端 |
| GET /api/tasks | 采摘任务列表（支持按状态、地块、作业人员、计划日期筛选） | 前端 → 后端 |
| POST /api/tasks | 创建采摘任务（后端生成任务编号，仅允许可采摘地块） | 前端 → 后端 |
| PATCH /api/tasks/:id | 更新任务状态（待执行→执行中→已完成/已取消） | 前端 → 后端 |
| POST /api/tasks/:id/progress | 提交采摘进度上报 | 前端 → 后端 |
| GET /api/tasks/:id/progress | 查看指定任务的进度上报历史 | 前端 → 后端 |
| GET /api/monitoring/overview | 进度监控概览（各状态任务数量、进行中任务采摘量汇总、待处理异常提示） | 前端 → 后端 |
| GET /api/exceptions | 异常报告列表（支持按状态、类型、任务筛选） | 前端 → 后端 |
| POST /api/exceptions | 提交异常报告 | 前端 → 后端 |
| PATCH /api/exceptions/:id | 更新异常处理状态和说明 | 前端 → 后端 |
| GET /api/statistics | 产量统计（支持按地块、品种、时间范围筛选） | 前端 → 后端 |

字段级 API 契约（请求/响应字段、类型、可空性、错误码、ID 对照表）详见 `technical-contract.md`。

### 数据模型

```
plots (地块)
├── id          TEXT PK (UUID)
├── code        TEXT UNIQUE    地块编号
├── name        TEXT           地块名称
├── variety     TEXT           品种
├── area        REAL           面积 (亩)
├── created_at  TEXT (ISO 8601)
└── updated_at  TEXT (ISO 8601)

maturity_assessments (成熟度评估)
├── id               TEXT PK (UUID)
├── plot_id          TEXT FK → plots.id
├── maturity_level   TEXT    未成熟 / 接近成熟 / 成熟 / 过熟
├── assessment_time  TEXT (ISO 8601)
├── assessor         TEXT    评估人
├── notes            TEXT NULL
└── created_at       TEXT (ISO 8601)
* 可采摘状态 = 该地块最新评估记录等级 ∈ {接近成熟, 成熟, 过熟}

picking_tasks (采摘任务)
├── id                TEXT PK (UUID)
├── task_no           TEXT UNIQUE   系统生成 (PT-YYYYMMDD-NNN)
├── plot_id           TEXT FK → plots.id
├── planned_quantity  REAL          计划采摘量 (kg)
├── assigned_worker   TEXT          分配作业人员
├── planned_date      TEXT (YYYY-MM-DD)
├── priority          TEXT          普通 / 紧急
├── status            TEXT          待执行 / 执行中 / 已完成 / 已取消
├── notes             TEXT NULL
├── created_at        TEXT (ISO 8601)
└── updated_at        TEXT (ISO 8601)

progress_reports (进度上报)
├── id              TEXT PK (UUID)
├── task_id         TEXT FK → picking_tasks.id
├── picked_quantity REAL          本次采摘量 (kg)
├── report_time     TEXT (ISO 8601)
├── notes           TEXT NULL
└── created_at      TEXT (ISO 8601)
* 累计已采摘量 = SUM(progress_reports.picked_quantity) WHERE task_id = ?

exception_reports (异常报告)
├── id               TEXT PK (UUID)
├── task_id          TEXT NULL FK → picking_tasks.id (可选关联)
├── exception_type   TEXT    天气 / 病虫害 / 设备故障 / 人员 / 其他
├── description      TEXT
├── reporter         TEXT    上报人
├── report_time      TEXT (ISO 8601)
├── status           TEXT    待处理 / 处理中 / 已解决
├── resolution_notes TEXT NULL  处理说明
├── created_at       TEXT (ISO 8601)
└── updated_at       TEXT (ISO 8601)
```

### 业务规则实现要点

- **可采摘状态计算**：创建成熟度评估记录后，后端查询该地块最新评估记录，若等级为"接近成熟""成熟"或"过熟"，则标记为可采摘。可采摘状态通过查询计算，不在 plots 表存储冗余字段。
- **任务编号生成**：后端按日期序列生成 `PT-YYYYMMDD-NNN`，NNN 为当日序号。
- **任务创建约束**：仅允许对可采摘地块创建任务。
- **累计采摘量**：通过聚合查询 progress_reports 计算，不存储冗余累计字段。
- **进度监控待处理异常提示**：GET /api/monitoring/overview 返回待处理异常数量，前端在进度监控界面展示提示标识。
- **产量统计**：基于 status = 已完成 的任务，聚合其 progress_reports 的 picked_quantity 总和。

### 状态流转

采摘任务：待执行 → 执行中 → 已完成；任意非已完成状态 → 已取消

异常报告：待处理 → 处理中 → 已解决
