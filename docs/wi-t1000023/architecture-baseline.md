# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 后端 | Hono (Node.js, ESM) | 轻量 Web 框架，提供 REST API 和 WebSocket upgrade |
| 前端 | React + Vite SPA | 单页应用，通过 API 和 WebSocket 与后端通信 |
| UI 框架 | Tailwind CSS | 实用类优先的样式方案 |
| 数据库 | SQLite（via dbkit） | 文件数据库，零配置持久化 |
| 审计 | auditkit | 基于 dbkit 的不可变审计事件记录 |
| 实时推送 | WebSocket（Hono upgrade） | 告警实时推送给已连接的操作人员 |
| 包管理 | npm | Node.js 标准包管理器 |

### 架构总览

```
┌─────────────────────────────────────────────┐
│                浏览器前端 (React/Vite)        │
│  ┌───────────┐ ┌──────────┐ ┌────────────┐  │
│  │ 巡逻路线   │ │ 告警处置  │ │ 事件留痕    │  │
│  │ 配置页面   │ │ 工作台    │ │ 查询页面    │  │
│  └─────┬─────┘ └────┬─────┘ └─────┬──────┘  │
│        │ REST API    │ REST + WS    │ REST    │
└────────┼─────────────┼──────────────┼────────┘
         │             │              │
┌────────▼─────────────▼──────────────▼────────┐
│              Hono 后端 (src/server.js)         │
│  ┌───────────┐ ┌──────────┐ ┌────────────┐  │
│  │ 路线管理   │ │ 告警管理  │ │ 留痕查询    │  │
│  │ 模块       │ │ 模块     │ │ 模块       │  │
│  └─────┬─────┘ └────┬─────┘ └─────┬──────┘  │
│        │             │              │          │
│  ┌─────▼─────────────▼──────────────▼──────┐ │
│  │        视频事件识别 (后台任务)             │ │
│  │  定时模拟巡逻视频分析，生成事件→告警→推送   │ │
│  └─────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────┘
                   │
          ┌────────▼────────┐
          │   SQLite (dbkit)  │
          │  + auditkit 审计   │
          └───────────────────┘
```

### 运行约定

- **常规启动**：`npm start`（启动后端服务，同时托管前端静态资源）
- **端口**：通过 `PORT` 环境变量配置，默认 `3000`
- **数据库路径**：通过 `DB_PATH` 环境变量配置，默认 `./data/robotwarning.db`；启动时自动创建父目录
- **前端开发**：`npm run dev`（Vite dev server + Hono API，支持热更新）
- **隔离测试**：使用独立 `DB_PATH` 和空闲端口，验证脚本负责启动和清理服务

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 巡逻路线管理模块（patrol-route）

**职责**：巡逻路线的创建、编辑、查看和删除。路线配置包含名称和路径点序列。

**数据归属**：patrol_routes 表是路线数据的唯一权威来源。

**接口摘要**：

| 方法 | 路径 | 用途 | 方向 |
| --- | --- | --- | --- |
| GET | /api/patrol-routes | 获取路线列表 | 前端→后端 |
| GET | /api/patrol-routes/:id | 获取单条路线详情 | 前端→后端 |
| POST | /api/patrol-routes | 创建巡逻路线 | 前端→后端 |
| PUT | /api/patrol-routes/:id | 更新巡逻路线 | 前端→后端 |
| DELETE | /api/patrol-routes/:id | 删除巡逻路线 | 前端→后端 |

### 2.2 视频事件识别模块（video-event）

**职责**：后台定时任务，模拟巡逻过程中的视频分析，自动识别异常事件并生成事件记录。事件包含类型、发生时间、关联路线和位置信息。此模块为系统自动行为，不需要操作人员触发。

**数据归属**：video_events 表是视频事件数据的唯一权威来源，由后台任务写入，前端只读。

**接口摘要**：

| 方法 | 路径 | 用途 | 方向 |
| --- | --- | --- | --- |
| GET | /api/video-events | 查询视频事件列表（支持按路线、类型筛选） | 前端→后端 |

### 2.3 告警管理模块（alert）

**职责**：接收视频事件识别结果，自动生成告警，通过 WebSocket 实时推送给已连接的操作人员。管理告警生命周期（未处置→已处置），提供告警列表和详情查询。

**数据归属**：alerts 表是告警数据的唯一权威来源。告警由视频事件自动触发生成。

**接口摘要**：

| 方法 | 路径 | 用途 | 方向 |
| --- | --- | --- | --- |
| GET | /api/alerts | 获取告警列表（支持按状态筛选） | 前端→后端 |
| GET | /api/alerts/:id | 获取告警详情（含关联视频事件） | 前端→后端 |
| PATCH | /api/alerts/:id/handle | 处置告警（填写结果和说明） | 前端→后端 |
| WS | /ws/alerts | 实时告警推送 | 后端→前端 |

### 2.4 事件留痕模块（audit-trail）

**职责**：记录从视频事件识别到告警处置的全流程事件链，使用 auditkit 保证记录不可修改或删除。支持按时间和事件类型检索。留痕记录由系统在关键节点自动写入，前端只读。

**数据归属**：审计事件由 auditkit 管理的审计表存储，不可篡改。

**接口摘要**：

| 方法 | 路径 | 用途 | 方向 |
| --- | --- | --- | --- |
| GET | /api/audit-trail | 查询留痕记录（支持按时间范围、事件类型筛选） | 前端→后端 |
| GET | /api/audit-trail/:id | 查看单条留痕详情 | 前端→后端 |

## 3. 数据模型与迁移

### 数据表

**patrol_routes**

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PRIMARY KEY | UUID v4，服务端生成 |
| name | TEXT | NOT NULL | 路线名称 |
| waypoints | TEXT (JSON) | NOT NULL | 路径点序列，JSON 数组 `[{name, lat, lng}]` |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 创建时间 |
| updated_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 更新时间 |

**video_events**

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PRIMARY KEY | UUID v4，后台任务生成 |
| event_type | TEXT | NOT NULL | 事件类型（如：intrusion, fire, obstacle, anomaly） |
| occurred_at | TEXT | NOT NULL | 事件发生时间 |
| route_id | TEXT | NOT NULL, FK → patrol_routes.id | 关联巡逻路线 |
| location | TEXT | NOT NULL | 事件发生位置描述 |
| video_segment_ref | TEXT | | 关联视频片段引用 |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 记录创建时间 |

**alerts**

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PRIMARY KEY | UUID v4，服务端生成 |
| event_id | TEXT | NOT NULL, FK → video_events.id | 关联视频事件 |
| alert_time | TEXT | NOT NULL | 告警时间 |
| status | TEXT | NOT NULL DEFAULT 'pending' | 告警状态：pending / handled |
| handler_name | TEXT | | 处置人姓名 |
| handling_result | TEXT | | 处置结果 |
| handling_note | TEXT | | 处置说明 |
| handled_at | TEXT | | 处置时间 |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | 记录创建时间 |

### 审计留痕

使用 auditkit 提供的审计事件表，在以下关键节点自动写入：
- 视频事件识别生成（event_type: `video_event_detected`）
- 告警生成（event_type: `alert_created`）
- 告警处置（event_type: `alert_handled`）

每条审计记录包含事件类型、时间戳、关联实体 ID 和摘要信息，由 auditkit 保证不可篡改。

### 迁移策略

所有数据库变更通过版本化 SQL 迁移文件管理，存放在 `migrations/sqlite/` 目录。使用 dbkit 提供的 `runMigrations` 函数执行迁移。禁止通过 ORM 自动同步或手工改 schema。

## 4. CommonApp 模块

| 模块 ID | 包/版本 | Manifest SHA-256 | 需求匹配 | 集成边界 | 限制 |
| --- | --- | --- | --- | --- | --- |
| dbkit | @commonapp/dbkit@0.2.0 | sha256:f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | 提供 SQLite 配置、查询、事务和迁移 | 通过 `createDb` / `createDbConfig` 初始化数据库连接，迁移文件放在 `migrations/sqlite/` | 仅支持 SQLite；Node >=20 |
| auditkit | @commonapp/auditkit@0.1.0 | sha256:27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 提供持久化审计事件，满足留痕记录不可修改/删除的审计完整性要求 | 依赖 dbkit，通过 `createAuditKit` 初始化，在关键业务节点写入审计事件 | 依赖 dbkit；Node >=20 |

**模块安装标记**：`commonapp install: dbkit`、`commonapp install: auditkit`

### 不选择的模块及理由

- **authkit / userkit**：需求未明确要求认证登录功能。处置人姓名作为字段记录，不需完整认证体系。
- **permissionkit**：需求未要求 RBAC 权限控制。
- **attachment**：需求中"关联视频片段"为引用信息，不要求文件上传/下载。
- **emailkit / i18n**：需求未涉及邮件通知或国际化。

## 5. UI 全局基线

### 展示模板与布局

- **展示模板 ID**：`split-master-detail`
- **选择依据**：核心工作流为高频逐条处理——操作人员从告警列表中选择告警，在详情区查看关联视频事件并执行处置。列表与详情协同是主要交互模式。
- **应用壳**：左侧导航栏（巡逻路线、告警处置、事件留痕三个主区域），顶部上下文栏（显示当前区域名称和未处置告警计数），右侧主工作区。
- **主工作流布局**：告警处置页采用列表/详情左右分栏；巡逻路线和事件留痕使用表格+表单/详情。

### 视觉风格

- **视觉预设**：Modern SaaS
- **设计 Token 方向**：柔和中性色背景、细边界、少阴影、中等圆角；一个主色（蓝色系）用于操作和状态高亮；状态色用于告警级别（pending=琥珀，handled=绿）；清晰无衬线字体；短而有反馈的动效（告警通知淡入、状态切换过渡）。

### 目标设备

- 桌面 Web（默认）。需求未明确要求移动端/窄屏。

### 全局状态

- **加载态**：数据请求时显示骨架或加载指示器。
- **空态**：无路线、无告警、无留痕时显示引导文案和创建/等待提示。
- **错误态**：请求失败时显示错误信息和重试按钮。
- **成功态**：路线保存、告警处置成功后显示短暂成功提示。

## 6. 运行与可靠性

- 后端服务 `src/server.js` 作为唯一入口，同时注册 REST API 路由和 WebSocket upgrade 处理。
- 前端构建产物由后端静态托管，开发时通过 Vite dev server 代理 API 请求。
- 后台视频事件识别任务在服务启动时自动开始，以固定间隔（如 15 秒）模拟巡逻视频分析，随机为已配置路线生成事件。
- WebSocket 连接断开后前端自动重连。
- 数据库文件位于 `./data/robotwarning.db`，启动前自动创建 `data/` 目录。
