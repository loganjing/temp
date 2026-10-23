# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 前端 | React 18 + Vite (SPA) | 桌面 Web，单页应用 |
| 后端 | Hono (Node.js ≥ 20) | REST API，同时托管前端静态资源 |
| 数据库 | SQLite（通过 dbkit） | 文件数据库，服务端权威数据 |
| 包管理 | npm | `package-lock.json` 锁定依赖 |

### 应用类型与边界

本应用为全栈应用，需要服务端权威数据、跨用户数据共享（清洁人员上报障碍、主管处理障碍）、后台调度（定时作业自动生成任务实例）和自动检测逻辑（耗材库存阈值提醒）。数据权威在服务端 SQLite，前端通过 REST API 读写，不使用 localStorage 承载业务数据。

### CommonApp 模块选择

| 模块 | 包/版本 | 状态 | 用途 |
| --- | --- | --- | --- |
| dbkit | @commonapp/dbkit v0.2.0 | ready | SQLite 配置、查询、事务与版本化迁移 |

- 模块依赖闭包：dbkit 无 `moduleDependencies`，闭包仅自身。
- manifest SHA-256: `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6`
- 集成边界：通过 `createDb(createDbConfig({...}))` 初始化，`runMigrations(db, {directory: './migrations'})` 执行迁移，SQL 文件存放于 `migrations/sqlite/`。
- 不需要 workspace-bootstrap 初始化（dbkit 无模块依赖闭包，仅通过 npm 安装）。
- 未选用 authkit/userkit/permissionkit：需求未规定事项中用户角色与权限体系未明确，当前不引入认证基础设施。

### UI 全局基线

- **应用/业务模板**：SaaS 运营管理台
- **展示模板 ID**：`saas-ops-console`
- **视觉风格**：Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、清晰字体，一个主色与状态色，短且有反馈作用的动效
- **应用壳与导航**：左侧侧边栏导航（清洁区域、定时作业、任务实例、障碍处理、耗材管理、质量报告），顶部上下文栏显示当前模块标题与关键操作按钮，主工作区为表格/表单/报告内容
- **目标设备**：桌面 Web（默认），不专门设计窄屏布局
- **全局状态**：
  - 加载：表格区域显示骨架屏或加载指示
  - 空数据：列表无数据时显示空状态提示与创建入口
  - 错误：操作失败时在上下文栏或表单内显示错误消息
  - 成功：创建/编辑/删除后刷新列表并显示成功反馈
- **依据需求事实**：五个功能模块均以列表+表单操作为主（AC-01~AC-05），信息密度高，适合 `saas-ops-console` 的导航+表格+操作布局

### 运行约定

- 常规启动命令：`npm start`（启动 Hono 服务，端口由 `PORT` 环境变量配置，默认 3000）
- 持久化数据库默认路径：`./data/application.db`（启动时自动创建 `data/` 目录）
- 测试数据库路径覆盖：通过 `DB_PATH` 环境变量指定隔离测试数据库
- 前端开发模式：`npm run dev`（Vite dev server + Hono API proxy）
- 构建：`npm run build`（Vite 构建前端到 `dist/`，Hono 生产模式托管静态资源）
- 验收脚本负责启动和清理服务，不额外后台启动或 sleep

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 模块职责与数据归属

#### 2.1 清洁区域模块（Cleaning Area）

- **职责**：管理清洁区域的增删改查。每个区域记录名称、位置描述和清洁要求（频次要求、标准说明）。
- **唯一数据归属**：`cleaning_areas` 表
- **接口摘要**：
  - `GET /api/areas` — 获取区域列表
  - `POST /api/areas` — 创建区域
  - `GET /api/areas/:id` — 获取单个区域
  - `PUT /api/areas/:id` — 编辑区域
  - `DELETE /api/areas/:id` — 删除区域

#### 2.2 定时作业模块（Scheduled Job）

- **职责**：基于清洁区域创建定时清洁作业，管理调度周期和执行人；按调度周期自动生成待执行任务实例；支持编辑和停用。
- **唯一数据归属**：`scheduled_jobs` 表（作业定义）、`task_instances` 表（生成的任务实例）
- **后台调度**：服务端定时检查器每分钟扫描活跃作业，对到达执行时间的作业生成当日任务实例
- **接口摘要**：
  - `GET /api/jobs` — 获取作业列表（含关联区域名称）
  - `POST /api/jobs` — 创建定时作业
  - `PUT /api/jobs/:id` — 编辑或停用作业
  - `GET /api/task-instances` — 获取任务实例列表（可按作业筛选）

#### 2.3 障碍处理模块（Obstacle）

- **职责**：清洁人员上报执行中的障碍；主管查看待处理障碍列表并标记处理，记录处理方式和结果；障碍处理后关联作业实例状态更新为"有障碍-已完成"。
- **唯一数据归属**：`obstacles` 表
- **跨模块数据引用**：引用 `task_instances.id`；处理障碍时更新 `task_instances.status`
- **接口摘要**：
  - `GET /api/obstacles` — 获取障碍列表（可按状态筛选）
  - `POST /api/obstacles` — 上报障碍（关联任务实例 ID + 描述）
  - `PUT /api/obstacles/:id/resolve` — 标记障碍已处理（记录处理方式和结果）

#### 2.4 耗材提醒模块（Supply）

- **职责**：管理耗材库存（名称、数量、单位、阈值）；库存低于阈值时自动生成提醒；入库/消耗后更新库存并触发或消除提醒。
- **唯一数据归属**：`supply_items` 表（耗材）、`supply_alerts` 表（提醒）
- **自动检测**：耗材数量变更时，服务端检查是否低于阈值，低于则创建提醒，高于阈值时标记已有提醒为已消除
- **接口摘要**：
  - `GET /api/supplies` — 获取耗材列表（含库存状态）
  - `POST /api/supplies` — 创建耗材
  - `PUT /api/supplies/:id` — 更新耗材（含库存数量变更）
  - `DELETE /api/supplies/:id` — 删除耗材
  - `GET /api/supply-alerts` — 获取未处理提醒列表
  - `PUT /api/supply-alerts/:id/resolve` — 消除提醒（库存补充后）

#### 2.5 作业质量报告模块（Quality Report）

- **职责**：按区域和时间范围生成作业质量报告，包含作业完成率、障碍统计（上报数量、处理率）和耗材消耗汇总。
- **唯一数据归属**：无独立表，报告从 `task_instances`、`obstacles`、`supply_items` 聚合计算
- **接口摘要**：
  - `GET /api/reports/quality` — 生成质量报告（参数：`areaId`、`from`、`to`）

### 数据模型

```
cleaning_areas
  id              TEXT PRIMARY KEY   -- UUID v4
  name            TEXT NOT NULL
  location_desc   TEXT NOT NULL
  requirements    TEXT NOT NULL      -- 频次要求、标准说明
  created_at      TEXT NOT NULL      -- ISO 8601

scheduled_jobs
  id              TEXT PRIMARY KEY   -- UUID v4
  area_id         TEXT NOT NULL      -- FK -> cleaning_areas.id
  assignee        TEXT NOT NULL
  schedule_type   TEXT NOT NULL      -- 'daily' | 'weekly'
  schedule_days   TEXT               -- JSON 数组，weekly 时如 [1,3,5]（周一=1..周日=7）
  start_time      TEXT NOT NULL      -- 'HH:MM' 格式
  active          INTEGER NOT NULL DEFAULT 1  -- 0=停用, 1=活跃
  created_at      TEXT NOT NULL      -- ISO 8601

task_instances
  id              TEXT PRIMARY KEY   -- UUID v4
  job_id          TEXT NOT NULL      -- FK -> scheduled_jobs.id
  scheduled_date  TEXT NOT NULL      -- 'YYYY-MM-DD'
  status          TEXT NOT NULL DEFAULT 'pending'  -- pending|in_progress|completed|has_obstacle_completed
  created_at      TEXT NOT NULL      -- ISO 8601
  updated_at      TEXT NOT NULL      -- ISO 8601

obstacles
  id                  TEXT PRIMARY KEY   -- UUID v4
  task_instance_id    TEXT NOT NULL      -- FK -> task_instances.id
  description         TEXT NOT NULL
  reported_at         TEXT NOT NULL      -- ISO 8601
  status              TEXT NOT NULL DEFAULT 'pending'  -- pending|resolved
  resolution_method   TEXT               -- 处理方式
  resolution_result   TEXT               -- 处理结果
  resolved_at         TEXT               -- ISO 8601

supply_items
  id              TEXT PRIMARY KEY   -- UUID v4
  name            TEXT NOT NULL
  quantity        REAL NOT NULL DEFAULT 0
  unit            TEXT NOT NULL
  threshold       REAL NOT NULL DEFAULT 0
  created_at      TEXT NOT NULL      -- ISO 8601
  updated_at      TEXT NOT NULL      -- ISO 8601

supply_alerts
  id              TEXT PRIMARY KEY   -- UUID v4
  supply_item_id  TEXT NOT NULL      -- FK -> supply_items.id
  created_at      TEXT NOT NULL      -- ISO 8601
  resolved_at     TEXT               -- ISO 8601
  status           TEXT NOT NULL DEFAULT 'active'  -- active|resolved
```

### 后台调度

- 服务端启动时初始化定时检查器，每 60 秒扫描一次活跃作业（`active = 1`）。
- 对每个活跃作业，检查当前日期和时间是否匹配 `schedule_type`、`schedule_days` 和 `start_time`；匹配时检查当日是否已生成对应任务实例（按 `job_id + scheduled_date` 去重），未生成则创建。
- 调度器使用 `setInterval`，应用退出时清理。

### 项目结构

```
/
├── package.json
├── vite.config.js          # Vite 配置，dev proxy → Hono API
├── src/
│   ├── server.js           # Hono 服务入口 (npm start)
│   ├── server/
│   │   ├── routes/         # API 路由（areas, jobs, obstacles, supplies, reports）
│   │   ├── db.js           # dbkit 初始化与导出
│   │   └── scheduler.js    # 定时作业调度检查器
│   ├── client/             # React 前端
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── components/
│   │   └── pages/
│   └── index.html          # Vite HTML 入口
├── migrations/
│   └── sqlite/
│       └── 001_init.sql    # 初始迁移
└── data/                   # SQLite 数据库目录（自动创建）
```
