# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

- **后端**：Hono（Node.js ≥ 20），单进程提供 REST API 和前端静态资源服务
- **前端**：React + Vite SPA，构建产物由 Hono 静态托管
- **数据库**：SQLite，通过 CommonApp 模块 `dbkit`（`@commonapp/dbkit` v0.2.0）管理连接、查询、事务和版本化迁移
- **UI 组件体系**：Ant Design（`antd` + `@ant-design/icons`），实施阶段安装

### 项目结构

```
app/jlgrobot/
├── package.json
├── index.html                 # Vite 文档入口
├── vite.config.ts             # Vite 配置和 API 代理
├── tsconfig.json              # TypeScript 配置
├── src/
│   ├── server/
│   │   ├── index.ts           # Hono 服务启动入口
│   │   ├── app.ts             # 全局中间件、错误处理、SPA fallback
│   │   ├── routes.ts          # 业务路由注册点
│   │   ├── platform/
│   │   │   ├── bootstrap.ts   # dbkit 连接初始化
│   │   │   ├── auth.ts        # 认证边界（当前未启用）
│   │   │   └── locale.ts      # 请求本地化中间件
│   │   └── migrations/
│   │       └── sqlite/
│   │           └── 001-init.sql  # 初始 schema
│   ├── client/
│   │   ├── main.tsx           # React 挂载入口
│   │   ├── App.tsx            # 应用组合与导航
│   │   └── platform/
│   │       └── api-client.ts  # 浏览器请求边界
│   └── shared/                # 跨端共享的契约、类型和常量
└── test/
    ├── with-http-server.mjs   # HTTP 服务器测试启动
    └── platform.test.mjs      # 基线 HTTP 测试
```

业务路由文件（equipment、faults、upgrades、work-orders、history）在实施阶段于 `src/server/routes.ts` 注册。前端页面组件在实施阶段于 `src/client/` 下创建。

### CommonApp 模块选择

| 模块 | 包/版本 | 状态 | 用途 |
| --- | --- | --- | --- |
| dbkit | `@commonapp/dbkit` v0.2.0 | ready | SQLite 连接、查询、事务、版本化迁移 |

- **manifest SHA-256**：`f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6`
- **依赖闭包**：无模块依赖；运行时依赖 `better-sqlite3 ^11.0.0 || ^12.0.0`
- **集成边界**：在 `src/server/platform/bootstrap.ts` 中通过 `createDb(createDbConfig({driver: 'sqlite', sqlitePath: process.env.DB_PATH ?? './data/application.db'}))` 初始化；迁移文件置于 `src/server/migrations/sqlite/`，通过 `runMigrations(db, {directory: './src/server/migrations'})` 执行
- **未选模块**：authkit/userkit/permissionkit — 需求未要求认证或权限；attachment — 需求未要求文件上传；auditkit — 需求未要求审计日志

### 设计结论

`ready` — 核心边界、数据归属、技术选型和迁移方案均已确定，无阻塞事项。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 模块职责与数据归属

| 模块 | 唯一数据归属 | 职责 |
| --- | --- | --- |
| 设备状态监测 | `equipment` 表 | 设备 CRUD、状态查看与更新 |
| 故障诊断 | `fault_records` 表 | 为设备记录故障信息、查看故障列表 |
| 远程升级 | `upgrade_records` 表 | 对设备发起升级、跟踪状态、查看记录 |
| 维修工单 | `maintenance_orders` 表 | 创建工单、状态流转、记录维修结果 |
| 设备履历 | 无独立表（聚合查询） | 按 `equipment_id` 聚合上述四模块数据，时间排序 |

模块间通过 `equipment_id` 外键关联，不直接操作彼此私有表。设备履历模块通过跨表查询聚合数据。

### 接口摘要

| 接口 | 方法 | 路径 | 调用方向 |
| --- | --- | --- | --- |
| 设备列表 | GET | `/api/equipment` | 前端 → 后端 |
| 设备详情 | GET | `/api/equipment/:id` | 前端 → 后端 |
| 创建设备 | POST | `/api/equipment` | 前端 → 后端 |
| 更新设备状态 | PATCH | `/api/equipment/:id` | 前端 → 后端 |
| 故障记录列表 | GET | `/api/equipment/:id/faults` | 前端 → 后端 |
| 创建故障记录 | POST | `/api/equipment/:id/faults` | 前端 → 后端 |
| 升级记录列表 | GET | `/api/equipment/:id/upgrades` | 前端 → 后端 |
| 发起升级 | POST | `/api/equipment/:id/upgrades` | 前端 → 后端 |
| 更新升级状态 | PATCH | `/api/upgrades/:id` | 前端 → 后端 |
| 工单列表 | GET | `/api/work-orders` | 前端 → 后端 |
| 工单详情 | GET | `/api/work-orders/:id` | 前端 → 后端 |
| 创建工单 | POST | `/api/equipment/:id/work-orders` | 前端 → 后端 |
| 更新工单 | PATCH | `/api/work-orders/:id` | 前端 → 后端 |
| 设备履历 | GET | `/api/equipment/:id/history` | 前端 → 后端 |

字段级细节（method/path、请求/响应字段、类型、可空性、错误码）见 `technical-contract.md`。

## 3. UI 全局基线

- **应用/业务模板**：设备管理工作台
- **展示模板 ID**：`split-master-detail` — 设备/记录列表与当前选中项详情协同
- **视觉风格**：Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、一个主色与状态色
- **组件体系**：Ant Design（`antd` + `@ant-design/icons`），实施阶段安装
- **应用壳**：左侧深色导航栏（五个模块入口）+ 顶部上下文栏 + 主工作区（master-detail 布局）
- **目标设备**：桌面 Web，默认 1280px 宽度
- **全局状态**：
  - 加载中：表格/列表显示骨架屏或 Spin
  - 空数据：显示空状态提示和引导操作
  - 错误：显示错误信息和重试按钮
  - 成功：操作后短暂 Toast 提示
- **选择依据**：需求要求设备列表查看、故障录入、升级跟踪、工单管理、履历展示，均为高频逐条处理记录的 CRUD 场景，适合 master-detail 布局

## 4. 数据模型与迁移

### 表结构

**equipment**（设备）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 主键 |
| code | TEXT | NOT NULL UNIQUE | 设备编号 |
| name | TEXT | NOT NULL | 设备名称 |
| status | TEXT | NOT NULL DEFAULT 'standby' | 状态：running/standby/fault/offline |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 创建时间 |
| updated_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 更新时间 |

**fault_records**（故障记录）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 主键 |
| equipment_id | INTEGER | NOT NULL REFERENCES equipment(id) | 关联设备 |
| description | TEXT | NOT NULL | 故障描述 |
| occurred_at | TEXT | NOT NULL | 发生时间 |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 创建时间 |

**upgrade_records**（升级记录）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 主键 |
| equipment_id | INTEGER | NOT NULL REFERENCES equipment(id) | 关联设备 |
| status | TEXT | NOT NULL DEFAULT 'in_progress' | 状态：in_progress/success/failed |
| started_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 开始时间 |
| completed_at | TEXT | | 完成时间（状态为 success/failed 时写入） |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 创建时间 |

**maintenance_orders**（维修工单）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 主键 |
| equipment_id | INTEGER | NOT NULL REFERENCES equipment(id) | 关联设备 |
| status | TEXT | NOT NULL DEFAULT 'pending' | 状态：pending/in_progress/completed |
| result | TEXT | | 维修结果（状态为 completed 时可写入） |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 创建时间 |
| updated_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 更新时间 |

### 设备履历聚合

设备履历不设独立表，通过查询 `equipment`、`fault_records`、`upgrade_records`、`maintenance_orders` 四表按 `equipment_id` 过滤，统一按时间字段排序后返回聚合事件列表。

### 迁移策略

- 使用 dbkit `runMigrations(db, {directory: './src/server/migrations'})` 执行版本化迁移
- 初始迁移文件 `src/server/migrations/sqlite/001-init.sql` 创建上述四张表
- 所有 schema 变更必须通过新增迁移文件，不使用 ORM 自动同步或手工改 schema

## 5. 运行约定

- **常规启动**：`npm start`（启动 Hono 服务，默认端口 3000，可通过 `PORT` 环境变量配置）
- **前端开发**：`npm run dev`（Vite 开发服务器）
- **构建**：`npm run build`（构建 React 前端产物）
- **数据库默认路径**：`./data/application.db`（启动前自动创建 `data/` 目录）
- **测试数据库覆盖**：通过 `DB_PATH` 环境变量指定隔离测试数据库路径
- **验证端口**：测试时使用空闲端口，等待真实监听就绪后执行验收
