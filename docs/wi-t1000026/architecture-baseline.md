# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

| 层 | 技术选型 | 说明 |
|----|----------|------|
| 后端框架 | Hono (Node.js ≥ 20) | 轻量 HTTP 服务，提供 RESTful API |
| 前端框架 | React + Vite | SPA，同时承载移动端登记页和桌面审批控制台 |
| 数据库 | SQLite (via dbkit) | 文件数据库，零运维，满足单实例访客系统持久化需求 |
| 样式框架 | Tailwind CSS | 基础布局与响应式样式 |
| 组件库 | Ant Design | 审批控制台的表格、表单、按钮等组件 |
| 包管理器 | npm | 与 Node 生态一致 |

### 架构概述

单体全栈应用，Hono 后端同时提供 API 服务和前端静态资源。前端为 React/Vite SPA，包含两个面向不同角色的界面：

- **移动端访客登记页**（`/register`）：面向访客，移动端优化的单列表单，填写并提交个人信息。
- **桌面审批控制台**（`/admin`）：面向审批人，桌面 Web 管理界面，列表-详情协同的审批工作流。

后端提供四个核心 API 端点（详见技术契约），数据通过 dbkit 持久化至 SQLite 文件数据库。

### CommonApp 模块

| 项目 | 值 |
|------|-----|
| 模块 ID | `dbkit` |
| 包名 | `@commonapp/dbkit` |
| 版本 | `0.2.0` |
| 状态 | `ready` |
| Manifest SHA-256 | `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6` |
| 模块依赖 | 无 |
| 运行时依赖 | `better-sqlite3` `^11.0.0 \|\| ^12.0.0` |
| 需求匹配 | 访客登记记录需持久化存储至数据库，审批后端系统需读取和更新记录 — dbkit 提供 SQLite 配置、查询、事务与迁移能力 |
| 集成边界 | 通过 `createDb(createDbConfig(...))` 初始化数据库连接，`runMigrations(db, {directory})` 执行版本化迁移，`db.run/queryOne/queryAll` 执行 SQL，`db.transaction` 确保审批状态变更的事务完整性 |
| 限制 | 已发布 dbkit 仅支持 SQLite 驱动 |

模块安装标记: `commonapp install: dbkit`

未选择 authkit/userkit/permissionkit：用户身份认证与权限控制机制在需求中未指定（需求第5节未规定事项），当前阶段不引入身份模块，审批控制台的访问控制留待后续需求明确后补充。

### UI 基线

**目标设备**：访客登记页为移动端窄屏布局（最小宽度 320px）；审批控制台为桌面 Web（最小宽度 1024px）。

**展示模板**：`split-master-detail` — 审批控制台采用列表/队列与当前记录详情协同的布局，左侧为待审核访客列表，右侧为选中访客的完整信息与审批操作区。访客登记页为独立单列表单，不使用此模板。

**视觉风格**：Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色（蓝色）与状态色（待审核-橙色、已通过-绿色、已拒绝-红色），短且有反馈作用的动效。

**组件体系**：Ant Design（antd + @ant-design/icons）— 审批控制台使用 antd 的 Table、Descriptions、Button、Tag 等组件；访客登记页使用 tailwind 原生样式构建移动端表单，保持轻量。

**应用壳与导航**：
- 访客登记页：全屏单列表单，顶部标题"访客登记"，无侧栏导航。
- 审批控制台：左侧深色侧栏导航（待审核 / 已通过 / 已拒绝三个分类入口），顶部上下文栏显示当前分类与统计，主工作区为 split-master-detail 布局。

**全局状态**：
- 加载：列表和详情加载时显示 skeleton/spin。
- 空数据：列表无记录时显示空状态提示。
- 错误：API 请求失败时显示错误提示，支持重试。
- 成功：提交登记或审批操作成功后显示成功反馈。

**窄屏策略**：审批控制台在窄屏下列表与详情垂直堆叠，表格可横向滚动，主要操作按钮固定底部可达。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 前端 — 访客登记页

- 职责：提供移动端表单界面，收集访客信息并提交至后端。
- 数据归属：无本地持久化数据，表单数据通过 API 提交至后端。
- 接口调用方向：调用 `POST /api/visitors` 提交登记。

### 前端 — 审批控制台

- 职责：展示访客登记列表与详情，提供审批操作界面。
- 数据归属：无本地持久化数据，所有数据通过 API 获取和更新。
- 接口调用方向：调用 `GET /api/visitors`（列表）、`GET /api/visitors/:id`（详情）、`PATCH /api/visitors/:id/status`（审批）。

### 后端 — API 服务

- 职责：接收访客登记提交，提供访客列表/详情查询，处理审批状态变更。
- 数据归属：访客登记记录的唯一权威数据源在 SQLite 数据库。
- 接口调用方向：通过 dbkit 读写数据库。
- 接口摘要：

| 方法 | 路径 | 用途 | 调用方 |
|------|------|------|--------|
| POST | `/api/visitors` | 提交访客登记 | 访客登记页 |
| GET | `/api/visitors` | 查询访客列表（按状态筛选） | 审批控制台 |
| GET | `/api/visitors/:id` | 查询单条访客详情 | 审批控制台 |
| PATCH | `/api/visitors/:id/status` | 更新访客审批状态 | 审批控制台 |

接口字段级细节（method/path、请求/响应字段与类型、可空性、错误码、映射责任）见 `technical-contract.md`。

## 3. 数据模型与迁移

### 数据库初始化

通过 dbkit 初始化 SQLite 数据库：

```js
import { createDb, createDbConfig } from '@commonapp/dbkit';

const db = createDb(createDbConfig({
  driver: 'sqlite',
  sqlitePath: process.env.DB_PATH ?? './data/visitors.db'
}));
```

### visitors 表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 访客登记记录主键 |
| name | TEXT | NOT NULL | 访客姓名 |
| phone | TEXT | NOT NULL | 手机号码 |
| id_card | TEXT | NOT NULL | 身份证号 |
| company | TEXT | NOT NULL | 公司信息 |
| visit_reason | TEXT | NOT NULL | 访问事由 |
| host_person | TEXT | NOT NULL | 被访人 |
| expected_arrival_time | TEXT | NOT NULL | 预计到访时间（ISO 8601） |
| license_plate | TEXT | NULL | 车牌号（选填） |
| status | TEXT | NOT NULL DEFAULT 'pending', CHECK(status IN ('pending','approved','rejected')) | 登记状态 |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 更新时间 |
| reviewed_at | TEXT | NULL | 审批时间（审批操作时写入） |

### 迁移

使用 dbkit 的 `runMigrations` 执行版本化迁移，SQL 文件位于 `migrations/sqlite/`。初始迁移创建 `visitors` 表。数据库变更必须通过版本化迁移执行，不通过 ORM 自动同步或手工改 schema。

## 4. 运行与校验

### 启动命令

- 常规启动：`npm start`（启动 Hono 服务，同时提供前端静态资源和 API）
- 开发模式：`npm run dev`（Vite 开发服务器 + Hono API）
- 端口配置：`PORT` 环境变量（默认 3000）

### 数据库路径

- 默认路径：`./data/visitors.db`（启动前自动创建 `./data` 目录）
- 测试覆盖：`DB_PATH` 环境变量指向测试专用数据库路径

### 验收测试约定

- 验证脚本负责启动和清理服务，只运行该脚本；不额外后台启动服务或执行 sleep。
- 验证使用空闲端口，等待真实监听就绪后执行验收动作。
- 干净目录和默认数据库路径无需人工准备即可运行。
- 必填字段缺失的验证（AC-02）：在登记表单留空必填字段并提交，预期 API 返回 400 错误并提示缺失字段。
- 登记持久化验证（AC-03）：访客提交登记后，通过 `GET /api/visitors?status=pending` 确认记录出现且内容一致。
- 审批状态变更验证（AC-04）：通过 `PATCH /api/visitors/:id/status` 执行通过/拒绝，再通过 `GET /api/visitors/:id` 确认状态更新，通过 `GET /api/visitors?status=approved` 或 `?status=rejected` 确认记录出现在已处理列表。
