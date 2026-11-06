# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

新建全栈应用，后端使用 Hono（Node.js ≥ 20），前端使用 React + Vite，数据库使用 SQLite（通过 CommonApp dbkit 模块）。包管理器为 npm。UI 组件体系使用 Ant Design，CSS 基础框架使用 Tailwind CSS。

| 维度 | 选型 |
| --- | --- |
| 后端框架 | Hono |
| 前端框架 | React + Vite |
| UI 组件体系 | Ant Design（antd + @ant-design/icons） |
| CSS 框架 | Tailwind CSS |
| 数据库 | SQLite（better-sqlite3 驱动） |
| 数据库访问层 | CommonApp dbkit（@commonapp/dbkit v0.2.0） |
| 包管理器 | npm |
| 运行时 | Node.js ≥ 20 |

### CommonApp 模块选择

| 模块 ID | 包名/版本 | 状态 | 选择理由 |
| --- | --- | --- | --- |
| dbkit | @commonapp/dbkit v0.2.0 | ready（manifest SHA-256: f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6） | 新建项目需要服务端权威数据库持久化、结构化查询和事务，dbkit 提供 SQLite 配置、查询、事务与版本化迁移；无模块依赖闭包 |

未选择 authkit/userkit/permissionkit：需求未规定用户角色与权限体系。未选择 auditkit：事件留痕是核心业务功能（需记录特定业务节点的操作类型和关联业务对象，并供用户查询），作为项目内领域模块实现而非通用审计基础设施。

### 应用结构

脚手架由 workspace-init 生成，使用 TypeScript（.ts/.tsx），`packageRoot` 为 `app/park-security`。

```
app/park-security/
├── index.html                # Vite 文档壳，加载 src/client/main.tsx
├── package.json              # 应用脚本与依赖
├── vite.config.ts            # Vite 插件、开发端口与 API 代理
├── tsconfig.json             # 聚合 TypeScript 编译选项
├── tsconfig.client.json      # 客户端类型检查
├── tsconfig.server.json      # 服务端类型检查
├── tailwind.config.js        # Tailwind 配置
├── postcss.config.js         # PostCSS 插件
├── src/
│   ├── server/               # 后端模块（禁止导入 src/client、React、DOM）
│   │   ├── index.ts          # Hono 服务入口，初始化资源并启动 HTTP
│   │   ├── app.ts            # 全局中间件、错误处理、路由注册
│   │   ├── routes.ts         # 公开与业务路由注册点
│   │   ├── platform/
│   │   │   ├── bootstrap.ts  # 平台模块资源初始化（dbkit）
│   │   │   ├── auth.ts       # 身份解析与认证边界绑定点
│   │   │   └── locale.ts     # 服务端请求 locale 边界
│   │   ├── migrations/sqlite/ # 版本化数据库迁移
│   │   │   └── 001-init.sql
│   │   ├── routes/           # 业务 API 路由
│   │   │   ├── patrol-routes.ts
│   │   │   ├── events.ts
│   │   │   ├── alerts.ts
│   │   │   ├── handling.ts
│   │   │   └── trails.ts
│   │   └── services/         # 领域服务与仓储
│   ├── client/               # React 前端（禁止导入 src/server、Node 内建）
│   │   ├── main.tsx          # React 挂载入口
│   │   ├── App.tsx           # 顶层应用组合与导航
│   │   ├── platform/
│   │   │   ├── api-client.ts # 浏览器请求边界与响应规范化
│   │   │   └── i18n.tsx      # 客户端 locale provider
│   │   ├── pages/
│   │   │   ├── PatrolRoutes.tsx
│   │   │   ├── Events.tsx
│   │   │   ├── Alerts.tsx
│   │   │   ├── Handling.tsx
│   │   │   └── Trails.tsx
│   │   ├── components/
│   │   └── index.css         # 全局样式
│   └── shared/               # 前后端共享类型、常量与纯逻辑
├── test/                     # 验证测试
│   ├── with-http-server.mjs  # 隔离 HTTP 服务器测试启动
│   ├── platform.test.mjs     # 平台基线检查
│   ├── dbkit.test.mjs        # dbkit 启动与迁移验证
│   └── fixtures/
└── dist/                     # 生产构建产物
```

后端 Hono 服务在开发模式下通过 Vite 中间件服务前端；生产构建后由 Hono 静态托管前端产物。常规服务入口为 `src/server/index.ts`，位于授权写入范围内。

### 运行约定

- 常规启动：`npm start`（启动 Hono 服务，默认监听 `PORT` 环境变量，未设置时使用 3000）
- 前端开发：`npm run dev`（Vite 开发服务器 + Hono API 代理）
- 数据库路径：`DB_PATH` 环境变量，默认 `./data/application.db`；服务启动时自动创建父目录
- 测试数据库：验证时通过 `DB_PATH` 指定隔离的测试数据库路径
- 版本化迁移：`src/server/migrations/sqlite/` 目录下的 SQL 文件，通过 dbkit `runMigrations` 执行

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 模块职责

| 模块 | 职责 | 唯一数据归属 |
| --- | --- | --- |
| 巡逻路线配置 | 巡逻路线与有序巡逻点位的 CRUD 管理 | patrol_routes, patrol_points |
| 视频事件识别 | 对视频画面执行事件识别，生成事件记录 | events（含 video_sources 种子数据） |
| 实时告警 | 事件触发告警生成，维护告警状态生命周期 | alerts |
| 人工处置 | 处置人员对告警进行确认与处置，记录处置结果 | handling_records |
| 事件留痕 | 对事件产生、告警生成、告警处置等节点进行留痕记录 | event_trails |

### 接口摘要

| 接口 | 方法 | 路径 | 用途 | 调用方向 |
| --- | --- | --- | --- | --- |
| 巡逻路线列表 | GET | /api/patrol-routes | 查询路线列表（含点位） | 前端 → 后端 |
| 巡逻路线详情 | GET | /api/patrol-routes/:id | 查询单条路线详情（含点位） | 前端 → 后端 |
| 创建巡逻路线 | POST | /api/patrol-routes | 创建路线及关联点位 | 前端 → 后端 |
| 更新巡逻路线 | PUT | /api/patrol-routes/:id | 编辑路线名称、点位及顺序 | 前端 → 后端 |
| 删除巡逻路线 | DELETE | /api/patrol-routes/:id | 删除路线（级联删除点位） | 前端 → 后端 |
| 视频源列表 | GET | /api/video-sources | 查询视频源列表 | 前端 → 后端 |
| 触发事件识别 | POST | /api/events/recognize | 触发视频事件识别，生成事件与告警 | 前端 → 后端 |
| 事件列表 | GET | /api/events | 查询事件记录 | 前端 → 后端 |
| 告警列表 | GET | /api/alerts | 查询告警（可按状态筛选） | 前端 → 后端 |
| 告警详情 | GET | /api/alerts/:id | 查询单条告警详情 | 前端 → 后端 |
| 告警处置 | POST | /api/alerts/:id/handling | 确认接收或完成处置，流转告警状态 | 前端 → 后端 |
| 留痕记录列表 | GET | /api/trails | 查询留痕记录（可按类型筛选） | 前端 → 后端 |

事件识别模块在生成事件后自动创建关联告警和留痕记录；人工处置模块在处置操作后自动更新告警状态并写入留痕记录。接口字段级定义见 `technical-contract.md`。

## 3. 数据模型与持久化

### 数据库表

**patrol_routes** — 巡逻路线

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | UUID v4 |
| name | TEXT | NOT NULL | 路线名称 |
| created_at | TEXT | NOT NULL | ISO 8601 |
| updated_at | TEXT | NOT NULL | ISO 8601 |

**patrol_points** — 巡逻点位

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | UUID v4 |
| route_id | TEXT | NOT NULL FK → patrol_routes.id ON DELETE CASCADE | 所属路线 |
| name | TEXT | NOT NULL | 点位名称 |
| sequence_order | INTEGER | NOT NULL | 顺序序号（从 1 开始） |
| created_at | TEXT | NOT NULL | ISO 8601 |

**video_sources** — 视频源

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | UUID v4 |
| name | TEXT | NOT NULL | 视频源名称 |
| source_url | TEXT | NOT NULL | 视频源地址 |
| created_at | TEXT | NOT NULL | ISO 8601 |

**events** — 事件记录

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | UUID v4 |
| video_source_id | TEXT | NOT NULL FK → video_sources.id | 关联视频源 |
| event_type | TEXT | NOT NULL | 事件类型 |
| occurred_at | TEXT | NOT NULL | 事件发生时间 |
| created_at | TEXT | NOT NULL | ISO 8601 |

**alerts** — 告警

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | UUID v4 |
| event_id | TEXT | NOT NULL FK → events.id | 关联事件 |
| status | TEXT | NOT NULL DEFAULT 'pending' | pending / handling / handled |
| alert_time | TEXT | NOT NULL | 告警时间 |
| created_at | TEXT | NOT NULL | ISO 8601 |
| updated_at | TEXT | NOT NULL | ISO 8601 |

**handling_records** — 处置记录

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | UUID v4 |
| alert_id | TEXT | NOT NULL FK → alerts.id | 关联告警 |
| handler | TEXT | NOT NULL | 处置人 |
| action | TEXT | NOT NULL | confirm / complete |
| handling_result | TEXT | | 处置结果说明 |
| handled_at | TEXT | NOT NULL | 处置时间 |
| created_at | TEXT | NOT NULL | ISO 8601 |

**event_trails** — 事件留痕

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | UUID v4 |
| operation_type | TEXT | NOT NULL | event_created / alert_created / alert_confirmed / alert_completed |
| business_object_type | TEXT | NOT NULL | event / alert / handling_record |
| business_object_id | TEXT | NOT NULL | 关联业务对象 ID |
| operation_time | TEXT | NOT NULL | 操作时间 |
| detail | TEXT | | 补充说明 |
| created_at | TEXT | NOT NULL | ISO 8601 |

### 持久化与事务

- 所有业务数据通过 dbkit 持久化到 SQLite 数据库
- 数据库 schema 通过版本化迁移文件管理（`src/server/migrations/sqlite/001-init.sql`），不使用 ORM 自动同步
- 事件识别创建事件后，在同一事务中创建关联告警和留痕记录
- 处置操作在同一事务中更新告警状态、创建处置记录和留痕记录
- 删除巡逻路线时级联删除关联巡逻点位（ON DELETE CASCADE）
- video_sources 表在初始迁移中预置 3 条种子数据（园区大门、停车场、仓库通道）

## 4. UI 基线

### 全局 UI 决策

| 维度 | 决策 | 依据 |
| --- | --- | --- |
| 应用/业务模板 | 安防管理工作台（security-ops） | 需求为园区安防管理，核心动作为巡逻配置、告警处理和留痕查询 |
| 展示模板 | split-master-detail | 核心动作为高频逐条处理记录（告警处置、路线管理、留痕查询），列表与详情协同 |
| 视觉风格 | Modern SaaS | 通用业务应用默认值，柔和中性色、细边界、少阴影、一个主色与状态色 |
| 组件体系 | Ant Design（antd + @ant-design/icons） | 新建 React 管理工作台默认方案 |
| 目标设备 | 桌面 Web | 需求未要求移动端/窄屏 |

### 应用壳与导航

左侧深色侧栏导航，顶部上下文栏，右侧主工作区。侧栏包含五个模块入口：巡逻路线、视频事件、实时告警、处置管理、事件留痕。主工作区采用列表 + 详情面板的 split-master-detail 布局。

### 主要工作流

- **巡逻路线**：路线列表（表格）→ 选中路线详情（含有序点位列表）→ 创建/编辑路线表单（支持点位增删与顺序调整）
- **视频事件**：事件列表（表格，含事件类型、视频来源、发生时间）→ 触发识别按钮 → 事件详情
- **实时告警**：告警列表（表格，按状态筛选：待处置/处置中/已处置）→ 告警详情（含关联事件信息和处置记录）
- **处置管理**：待处置告警队列 → 确认接收（状态→处置中）→ 记录处置结果并完成（状态→已处置）
- **事件留痕**：留痕记录列表（表格，按操作类型筛选）→ 留痕详情

### 全局状态

- 加载中：表格骨架屏或 Ant Design Spin
- 空数据：表格空态提示（暂无数据）
- 错误：Ant Design Message 错误提示
- 成功：Ant Design Message 成功提示

## 5. 验证方式

涉及后台任务和长状态路径的验收场景验证方式：

- **AC-02（视频事件识别，后台任务）**：POST /api/events/recognize 触发识别，系统从预置视频源中选取并生成事件记录。验证时调用该端点后查询 GET /api/events 确认事件已创建并持久化。识别结果为模拟生成，不依赖实际视频处理算法。
- **AC-03（实时告警）**：事件识别后自动生成告警，验证时调用识别端点后查询 GET /api/alerts 确认告警状态为 pending。
- **AC-04（人工处置，长状态路径）**：依次调用 POST /api/alerts/:id/handling（action=confirm）将状态从 pending→handling，再调用同一端点（action=complete）将状态从 handling→handled。每步后查询告警状态和处置记录确认流转正确。
- **AC-05（事件留痕）**：完成上述完整流程后查询 GET /api/trails，确认包含 event_created、alert_created、alert_confirmed、alert_completed 各节点记录。

验证使用 `DB_PATH` 指定隔离测试数据库，每次验证前使用干净数据库状态，迁移自动执行，无需手动预置数据。
