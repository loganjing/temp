# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 项目概述

为 JLG 机器人/设备构建统一的设备管理平台，覆盖设备状态监测、故障诊断、远程升级、维修工单和设备履历五大功能模块。所有业务数据通过 SQLite 数据库持久化存储，确保写入后可读回。

### 1.2 技术栈

| 层 | 技术选型 | 说明 |
|---|---|---|
| 后端框架 | Hono | 轻量 Node.js 服务端框架，提供 RESTful API |
| 前端框架 | React + Vite | SPA 单页应用 |
| UI 组件体系 | Ant Design（`antd` + `@ant-design/icons`） | 业务后台默认方案，组件丰富 |
| 数据库 | SQLite（via `@commonapp/dbkit` v0.2.0） | 文件数据库，无需独立数据库服务 |
| 包管理器 | npm | |
| 运行时 | Node.js >= 20 | dbkit 要求 |

### 1.3 CommonApp 模块

| 模块 ID | 包名 | 版本 | 状态 | 用途 | manifest SHA-256 |
|---|---|---|---|---|---|
| `dbkit` | `@commonapp/dbkit` | 0.2.0 | ready | SQLite 数据库配置、查询、事务与版本化迁移 | `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6` |

dbkit 无模块依赖闭包，运行时依赖 `better-sqlite3`。提供 `createDb`/`createDbConfig` 初始化、`queryOne`/`queryAll`/`run` 查询与写入、`transaction` 事务、`runMigrations` 版本化迁移和 `close` 关闭。

未选择 authkit/userkit/permissionkit：需求未规定用户角色与权限策略，以"操作人员"泛指发起操作的主体，不自行推断 RBAC/ACL。

### 1.4 项目结构

packageRoot 为 `app/jlgrobot`，由 workspace-init 初始化生成。源码使用 TypeScript，按 `platform-baseline.json` 的 `sourceLayout` 划分三层：

```
app/jlgrobot/
├── index.html                          # Vite 文档壳，加载 src/client/main.tsx
├── package.json                        # 应用脚本、依赖与运行命令
├── vite.config.ts                      # Vite 插件、开发端口与 API 代理
├── tsconfig.json                       # 聚合 TypeScript 编译选项
├── tsconfig.client.json                # 客户端 TypeScript 检查
├── tsconfig.server.json                # 服务端 TypeScript 检查
├── src/
│   ├── server/                         # 服务端（Hono）
│   │   ├── index.ts                    # 服务入口：初始化资源、组装 Hono app、启动 HTTP
│   │   ├── app.ts                      # 全局中间件、API 错误、路由注册与 SPA 回退
│   │   ├── routes.ts                   # 公开与业务路由注册点
│   │   ├── platform/
│   │   │   ├── bootstrap.ts            # dbkit 等模块资源初始化
│   │   │   ├── auth.ts                 # 身份解析与认证边界绑定点
│   │   │   └── locale.ts              # 默认 no-op 请求 locale 边界
│   │   ├── migrations/
│   │   │   └── sqlite/                 # SQLite 版本化迁移 SQL
│   │   ├── routes/                     # 业务路由：equipment、status、fault、upgrade、workorder
│   │   └── services/                   # 业务服务：history（设备履历聚合查询）
│   ├── client/                         # 前端（React/Vite）
│   │   ├── main.tsx                    # React 挂载与全局 Provider
│   │   ├── App.tsx                     # 顶层应用组合与导航
│   │   ├── platform/
│   │   │   ├── api-client.ts           # 浏览器请求边界与响应标准化
│   │   │   └── i18n.tsx               # 默认客户端 locale Provider
│   │   ├── pages/                      # 五大模块页面
│   │   ├── components/                 # 通用组件
│   │   └── styles/                     # 样式
│   └── shared/                         # 平台中立契约、schema、常量与纯逻辑
├── test/
│   ├── with-http-server.mjs            # 隔离 HTTP 服务器测试启动
│   ├── platform.test.mjs              # 基线 HTTP、健康检查与 SPA 回退检查
│   ├── dbkit.test.mjs                 # dbkit 启动、迁移与数据库行为验证
│   └── fixtures/
│       ├── qa-environment.mjs          # 隔离 QA 数据库与测试数据
│       └── README.md
└── AGENTS.md                           # 包级 Agent 约定
```

**层间约束**（由 `platform-baseline.json` `sourceLayout` 定义）：
- `src/server/` 禁止导入 `src/client/`、React、DOM API 或浏览器全局变量
- `src/client/` 禁止导入 `src/server/`、Node 内建、Hono 服务端运行时或服务端密钥
- `src/shared/` 禁止导入 `src/server/`、`src/client/`、Node API、Hono、React、DOM API 或数据库驱动

### 1.5 UI 全局基线

**应用/业务模板**：`helpdesk`（设备管理后台，以工单和故障处理为核心的高频记录处理工作台）

**展示模板**：`split-master-detail`（列表/队列与当前记录详情协同布局）

**视觉风格**：Modern SaaS（柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色与状态色、短且有反馈作用的动效）

**布局与设备策略**：
- 目标设备：桌面 Web（默认）
- 应用壳：左侧深色导航栏（5 个模块入口）+ 顶部上下文栏 + 右侧主工作区
- 主工作区采用 split-master-detail 布局：左侧列表（带筛选），右侧选中记录详情
- 导航模块：设备状态、故障诊断、远程升级、维修工单、设备履历

**组件体系**：Ant Design（`antd` + `@ant-design/icons`），工作台视觉方向为深色侧栏、浅色工作区、顶部上下文栏、清晰标题与主操作按钮。实现参考团包内 `experts/general-app-development-expert/skills/general-app-implementation/assets/antd-workbench/example.jsx` 和 `example.css`。

**全局状态**：
- 加载：列表区显示骨架屏或 Spin
- 空数据：列表区显示 Ant Design Empty 组件，附引导文案
- 错误：通过 Ant Design message 组件提示操作错误，详情区显示错误状态
- 成功：操作成功后通过 message 组件反馈，列表自动刷新

**关键工作流**：
1. 设备状态：设备列表 → 选中设备 → 查看当前状态与历史状态记录
2. 故障诊断：故障列表 → 选中故障 → 填写诊断结论 → 推进状态流转
3. 远程升级：升级任务列表 → 发起升级 → 选中任务 → 查看状态与结果
4. 维修工单：工单列表 → 创建工单 → 选中工单 → 填写处理记录 → 推进状态
5. 设备履历：选择设备 → 按时间顺序查看所有历史记录

### 1.6 运行约定

| 项目 | 说明 |
|---|---|
| 常规启动 | `npm start`（在 `app/jlgrobot/` 下启动 Hono 服务，端口由 `PORT` 环境变量配置，默认 3000） |
| 前端开发 | `npm run dev`（Vite 开发服务器，带 HMR） |
| 类型检查 | `npm run typecheck`（含 `typecheck:server` 与 `typecheck:client`） |
| 数据库路径 | 默认 `./data/application.db`，可通过 `DB_PATH` 环境变量覆盖 |
| 测试数据库 | 验收时通过 `DB_PATH` 指定隔离测试数据库路径（如 `DB_PATH=./data/test.db`） |
| 数据库初始化 | 服务启动时由 `src/server/platform/bootstrap.ts` 运行 `runMigrations`，在打开数据库前创建 `data/` 目录 |
| 前端构建 | `npm run build:client`（Vite 构建到 `dist/`） |
| 生产服务 | Hono 服务静态托管 `dist/` 前端产物 |
| 测试 | `npm test`（运行 `test/*.test.mjs`，包含平台基线与 dbkit 验证） |

服务入口为 `src/server/index.ts`，位于授权写入范围 `app/jlgrobot/` 内。文件数据库在打开前由 dbkit 配置创建父目录。干净目录无需手动创建 `data/` 即可启动。验收时选择空闲端口，等待真实监听就绪，测试完成后只清理本次启动的进程和测试数据库。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 核心领域模型

业务对象来自批准的需求，不增加无关领域概念。核心实体关系：

```
equipment (设备)
  ├── equipment_status (状态记录)     1:N
  ├── faults (故障事件)               1:N
  ├── upgrade_tasks (升级任务)         1:N
  └── work_orders (维修工单)           1:N

faults (故障事件)
  └── work_orders (维修工单)           0:1  (工单可选关联故障)
```

设备履历（Equipment History）不是独立存储实体，而是按设备汇聚其状态、故障、升级、工单已持久化数据的聚合视图，按时间顺序呈现。

### 2.2 模块职责与接口摘要

#### 2.2.1 设备管理（Equipment）

**职责**：维护设备基础信息，为其他模块提供设备标识引用。

| 接口 | 方向 | 用途 |
|---|---|---|
| `GET /api/equipment` | 前端→后端 | 查询设备列表 |
| `POST /api/equipment` | 前端→后端 | 创建设备 |
| `GET /api/equipment/:id` | 前端→后端 | 查询单个设备详情 |

#### 2.2.2 设备状态监测（Status）

**职责**：记录设备状态信息，支持当前与历史状态查询。状态值包含在线/离线/运行中/故障。唯一数据归属：`equipment_status` 表。

| 接口 | 方向 | 用途 |
|---|---|---|
| `GET /api/equipment/:equipmentId/status` | 前端→后端 | 查询设备当前与历史状态列表 |
| `POST /api/equipment/:equipmentId/status` | 前端→后端 | 记录一条设备状态 |

#### 2.2.3 故障诊断（Fault）

**职责**：记录设备故障事件，支持诊断信息写入与状态流转。故障状态流转：已记录→诊断中→已诊断→已关闭。唯一数据归属：`faults` 表与 `fault_status_logs` 表。

| 接口 | 方向 | 用途 |
|---|---|---|
| `GET /api/faults` | 前端→后端 | 查询故障列表（可按设备筛选） |
| `POST /api/faults` | 前端→后端 | 创建故障事件 |
| `GET /api/faults/:id` | 前端→后端 | 查询故障详情（含诊断信息与状态流转记录） |
| `PATCH /api/faults/:id` | 前端→后端 | 更新诊断信息（诊断结论、处理建议） |
| `POST /api/faults/:id/status` | 前端→后端 | 推进故障状态（记录状态流转日志） |

#### 2.2.4 远程升级（Upgrade）

**职责**：向指定设备发起远程升级任务，支持升级状态流转与结果记录。升级状态流转：待执行→执行中→成功/失败。唯一数据归属：`upgrade_tasks` 表与 `upgrade_status_logs` 表。

| 接口 | 方向 | 用途 |
|---|---|---|
| `GET /api/upgrades` | 前端→后端 | 查询升级任务列表（可按设备筛选） |
| `POST /api/upgrades` | 前端→后端 | 发起升级任务 |
| `GET /api/upgrades/:id` | 前端→后端 | 查询升级任务详情（含状态流转与结果） |
| `POST /api/upgrades/:id/status` | 前端→后端 | 推进升级状态（记录状态流转日志，失败时记录原因） |

#### 2.2.5 维修工单（WorkOrder）

**职责**：创建维修工单，关联设备（可选关联故障），支持处理记录写入与状态流转。工单状态流转：待处理→处理中→已完成→已关闭。唯一数据归属：`work_orders` 表、`work_order_status_logs` 表与 `work_order_records` 表。

| 接口 | 方向 | 用途 |
|---|---|---|
| `GET /api/work-orders` | 前端→后端 | 查询工单列表（可按设备筛选） |
| `POST /api/work-orders` | 前端→后端 | 创建维修工单 |
| `GET /api/work-orders/:id` | 前端→后端 | 查询工单详情（含处理记录与状态流转） |
| `POST /api/work-orders/:id/records` | 前端→后端 | 添加处理记录 |
| `POST /api/work-orders/:id/status` | 前端→后端 | 推进工单状态（记录状态流转日志） |

#### 2.2.6 设备履历（History）

**职责**：按设备汇聚其历史记录，包含状态变更、故障事件、升级任务、维修工单，按时间顺序呈现。数据来源于各模块已持久化数据，不独立写入。

| 接口 | 方向 | 用途 |
|---|---|---|
| `GET /api/equipment/:equipmentId/history` | 前端→后端 | 查询设备完整履历（聚合状态、故障、升级、工单） |

## 3. 数据模型与持久化

### 3.1 数据库选择

采用 SQLite 文件数据库，通过 `@commonapp/dbkit` v0.2.0 提供配置、查询、事务和版本化迁移。数据库变更通过 `migrations/sqlite/` 下的版本化 SQL 文件管理，不通过 ORM 自动同步或手工改 schema。

### 3.2 核心表结构

#### equipment（设备）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | 设备名称 |
| identifier | TEXT | NOT NULL UNIQUE | 设备标识（业务编码） |
| type | TEXT | | 设备类型 |
| created_at | TEXT | NOT NULL | 创建时间（ISO 8601） |

#### equipment_status（设备状态记录）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| equipment_id | TEXT | NOT NULL REFERENCES equipment(id) | 设备外键 |
| status | TEXT | NOT NULL | 状态值：online/offline/running/fault |
| params | TEXT | | 关键运行参数（JSON 字符串） |
| recorded_at | TEXT | NOT NULL | 记录时间（ISO 8601） |

#### faults（故障事件）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| equipment_id | TEXT | NOT NULL REFERENCES equipment(id) | 故障设备 |
| description | TEXT | NOT NULL | 故障描述 |
| status | TEXT | NOT NULL DEFAULT 'recorded' | 故障状态：recorded/diagnosing/diagnosed/closed |
| diagnosis | TEXT | | 诊断结论 |
| suggestion | TEXT | | 处理建议 |
| created_at | TEXT | NOT NULL | 创建时间 |
| updated_at | TEXT | NOT NULL | 最后更新时间 |
| closed_at | TEXT | | 关闭时间 |

#### fault_status_logs（故障状态流转日志）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| fault_id | TEXT | NOT NULL REFERENCES faults(id) | 故障外键 |
| from_status | TEXT | | 前一状态（首次为 NULL） |
| to_status | TEXT | NOT NULL | 目标状态 |
| changed_at | TEXT | NOT NULL | 变更时间 |

#### upgrade_tasks（升级任务）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| equipment_id | TEXT | NOT NULL REFERENCES equipment(id) | 目标设备 |
| package_id | TEXT | NOT NULL | 升级包标识 |
| status | TEXT | NOT NULL DEFAULT 'pending' | 升级状态：pending/executing/success/failed |
| result | TEXT | | 升级结果说明 |
| failure_reason | TEXT | | 失败原因（失败时填写） |
| created_at | TEXT | NOT NULL | 创建时间 |
| updated_at | TEXT | NOT NULL | 最后更新时间 |

#### upgrade_status_logs（升级状态流转日志）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| task_id | TEXT | NOT NULL REFERENCES upgrade_tasks(id) | 升级任务外键 |
| from_status | TEXT | | 前一状态（首次为 NULL） |
| to_status | TEXT | NOT NULL | 目标状态 |
| changed_at | TEXT | NOT NULL | 变更时间 |

#### work_orders（维修工单）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| equipment_id | TEXT | NOT NULL REFERENCES equipment(id) | 关联设备 |
| fault_id | TEXT | REFERENCES faults(id) | 关联故障（可选） |
| description | TEXT | NOT NULL | 工单描述 |
| status | TEXT | NOT NULL DEFAULT 'pending' | 工单状态：pending/processing/completed/closed |
| created_at | TEXT | NOT NULL | 创建时间 |
| updated_at | TEXT | NOT NULL | 最后更新时间 |
| closed_at | TEXT | | 关闭时间 |

#### work_order_status_logs（工单状态流转日志）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| order_id | TEXT | NOT NULL REFERENCES work_orders(id) | 工单外键 |
| from_status | TEXT | | 前一状态（首次为 NULL） |
| to_status | TEXT | NOT NULL | 目标状态 |
| changed_at | TEXT | NOT NULL | 变更时间 |

#### work_order_records（工单处理记录）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID |
| order_id | TEXT | NOT NULL REFERENCES work_orders(id) | 工单外键 |
| content | TEXT | NOT NULL | 处理记录内容 |
| created_at | TEXT | NOT NULL | 创建时间 |

### 3.3 事务与一致性

- 状态推进操作（故障、升级、工单）在事务中完成：更新主表 `status` 和 `updated_at`，同时插入状态流转日志记录。
- 工单创建时若关联故障，在同一事务中完成外键写入。
- 设备履历查询通过各模块已持久化数据按 `recorded_at`/`created_at`/`changed_at` 时间字段排序聚合，不独立写入。

### 3.4 ID 策略

所有实体主键使用 TEXT 类型 UUID，由服务端通过 `crypto.randomUUID()` 生成。外键同为 TEXT 类型 UUID。API JSON 中 ID 字段统一为字符串。前端 TypeScript 类型使用 `string`。无需转换。

## 4. 可重复验证说明

本应用的验收场景均为确定状态流程，不涉及随机结果、动画或外部异步事件：

- **状态流转验收**（AC-02/03/04）：通过 API 或界面操作按预定义状态路径逐步推进，每步后读取详情验证状态与日志一致性。
- **数据持久化验收**（AC-06）：对各模块分别执行写入 API 调用后立即读取，验证返回数据一致。使用 `DB_PATH` 指定隔离测试数据库，验收后删除测试数据库文件恢复初态。
- **履历聚合验收**（AC-05）：先预置状态、故障、升级、工单数据，再查询履历接口验证时间顺序与内容完整性。

## 5. 架构决策记录

### ADR-01：选择 SQLite + dbkit 而非自建数据层

**背景**：需求明确要求数据库存储，但不指定具体数据库产品。新项目需要轻量、零配置的持久化方案。

**决策**：采用 SQLite 文件数据库 + `@commonapp/dbkit` v0.2.0。dbkit 提供 SQLite 配置、查询、事务和版本化迁移，无需独立数据库服务，适合开发与验收环境。

**影响**：数据存储在本地文件（`./data/application.db`），无需运维数据库实例。迁移通过版本化 SQL 文件管理，不通过 ORM 自动同步。
