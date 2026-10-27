# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 技术栈

访客系统包含三个交付组件：

| 组件 | 技术栈 | 入口 |
|------|--------|------|
| 后端 API + 审批 Web 前端 | Hono + React/Vite + Tailwind CSS + dbkit (SQLite) | `app/guest-visitor/` |
| 微信小程序（访客登记） | 微信原生小程序（WXML/WXSS/JS） | `miniprogram/` |
| 数据库 | SQLite，通过 dbkit 管理，版本化迁移 | `app/guest-visitor/src/server/migrations/sqlite/` |

后端 API 和审批前端共用一个 Hono + React/Vite 工程。Hono 在开发时通过 Vite 代理提供 API，在生产环境托管 React 构建产物。微信小程序是独立的构建目标，通过 HTTP 调用后端 API。

### 项目结构

```
app/guest-visitor/          # 后端 + 审批前端（Hono + React/Vite）
  src/
    server/                 # Hono 服务端：路由、数据库、迁移
      migrations/sqlite/    # SQLite 迁移文件
      platform/bootstrap.ts # dbkit 初始化
      routes.ts             # 业务路由注册
    client/                 # React 审批前端
    shared/                 # 前后端共享类型与契约
  test/                     # 测试
  package.json
miniprogram/                # 微信小程序（访客登记端）
  pages/                    # 小程序页面
  app.json
  app.js
platform-baseline.json      # 工作区平台地图
docs/wi-t1000396/           # 设计文档
```

### CommonApp 模块

选用 `dbkit`（`@commonapp/dbkit@0.2.0`）提供 SQLite 配置、查询、事务和迁移能力。

- 模块 ID: `dbkit`
- 包名: `@commonapp/dbkit`
- 版本: `0.2.0`
- manifest SHA-256: `f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6`
- 依赖闭: 无模块依赖；运行时依赖 `better-sqlite3 ^11.0.0 || ^12.0.0`
- 需求匹配: 需求要求"记录到数据库"和"审批结果持久化"，dbkit 提供 SQLite 持久化、查询和迁移能力
- 集成边界: 服务端通过 `createDb` 初始化，迁移文件放在 `src/server/migrations/sqlite/`
- 限制: 仅支持 SQLite；不提供 ORM，使用 SQL 语句查询

`commonapp install: dbkit`

### 数据归属

后端 SQLite 数据库是唯一权威数据源。访客通过小程序提交登记，数据写入数据库；审批人员通过 Web 前端读取和审核，操作结果写回同一数据库。所有跨组件数据共享通过后端 API 完成。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 后端 API（`app/guest-visitor/src/server/`）

职责：访客登记接收、访客查询、审批操作、数据持久化。

| 接口 | 方法 | 路径 | 用途 | 调用方 |
|------|------|------|------|--------|
| 创建访客登记 | POST | `/api/visitors` | 接收访客信息并写入数据库，状态为待审批 | 微信小程序 |
| 查询访客列表 | GET | `/api/visitors` | 分页查询访客申请，支持状态筛选 | 审批前端 |
| 查询访客详情 | GET | `/api/visitors/:id` | 获取单条访客申请完整信息 | 审批前端 |
| 审批通过 | POST | `/api/visitors/:id/approve` | 将申请状态更新为已通过，记录审批意见 | 审批前端 |
| 审批驳回 | POST | `/api/visitors/:id/reject` | 将申请状态更新为已驳回，记录审批意见 | 审批前端 |

字段级 API 契约定义在 `docs/wi-t1000396/technical-contract.md`。

### 审批 Web 前端（`app/guest-visitor/src/client/`）

职责：为审批人员提供移动端适配的审批操作界面。

- 访客申请列表页（默认筛选"待审批"）
- 访客申请详情页（展示完整信息，提供通过/驳回操作）
- 移动端适配：列表卡片化布局，详情页单列布局，操作按钮底部固定

### 微信小程序（`miniprogram/`）

职责：为访客提供登记表单。

- 登记页面：表单录入访客信息，手机号优先通过微信获取
- 提交成功页面：展示提交结果和当前状态

### 数据库模型

`visitors` 表：

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4，应用生成 |
| name | TEXT | NOT NULL | 访客姓名 |
| phone | TEXT | NOT NULL | 手机号码 |
| id_card | TEXT | NOT NULL | 身份证号 |
| company | TEXT | NOT NULL | 公司信息 |
| visit_reason | TEXT | NOT NULL | 访问事由 |
| host_name | TEXT | NOT NULL | 被访人姓名 |
| expected_visit_time | TEXT | NOT NULL | 预计到访时间（ISO 8601 字符串） |
| photo_url | TEXT | NULL | 访客照片 URL（选填） |
| status | TEXT | NOT NULL DEFAULT 'pending' | 状态：pending / approved / rejected |
| review_comment | TEXT | NULL | 审批意见 |
| reviewed_at | TEXT | NULL | 审批时间（ISO 8601 字符串） |
| created_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 更新时间 |

状态流转：`pending`（待审批）→ `approved`（已通过）/ `rejected`（已驳回）

迁移文件：`app/guest-visitor/src/server/migrations/sqlite/001-create-visitors.sql`

## 3. UI 基线

### 审批 Web 前端

- 展示模板: `split-master-detail` — 列表与详情协同的高频审批处理场景
- 视觉预设: Modern SaaS — 柔和中性色、细边界、少阴影、一个主色与状态色
- 应用壳: 顶部标题栏 + 主工作区，无侧导航（移动端优先）
- 目标设备: 移动端为主，兼容桌面浏览器
- 主工作流: 打开审批列表 → 点击查看详情 → 通过或驳回
- 全局状态:
  - 加载中: 列表骨架屏
  - 空数据: "暂无待审批申请"提示
  - 错误: 页面内错误提示，不暴露技术细节
  - 成功: 操作后轻量提示并刷新列表
- 窄屏策略: 列表使用卡片布局（非表格），详情页单列垂直排列，操作按钮固定底部，文本溢出省略并提供展开

### 微信小程序

- 使用微信原生组件（`<input>`、`<button>`、`<form>`）
- 登记表单垂直排列，手机号获取按钮置于表单顶部
- 视觉风格与审批前端保持一致的中性色调

### 设计依据

- 需求第 5 节明确要求"审批系统要适配移动端"
- 需求第 4 节审批流程为高频逐条处理，匹配 `split-master-detail`
- 微信小程序为访客唯一入口，使用原生开发以支持微信 API（getPhoneNumber）

## 4. 运行与校验

### 启动命令

| 用途 | 命令 | 说明 |
|------|------|------|
| 后端开发 | `npm run dev:server`（在 `app/guest-visitor/`） | tsx watch 热重载，监听 `PORT`（默认 3000） |
| 前端开发 | `npm run dev:web`（在 `app/guest-visitor/`） | Vite 开发服务器，端口 5173，代理 `/api` 到后端 |
| 生产构建 | `npm run build`（在 `app/guest-visitor/`） | 类型检查 + Vite 构建 |
| 生产启动 | `npm start`（在 `app/guest-visitor/`） | Hono 托管 API 和前端构建产物 |
| 测试 | `npm test`（在 `app/guest-visitor/`） | Node 内置测试运行器 |

### 数据库配置

- 默认数据库路径: `./data/application.db`（相对于 `app/guest-visitor/`）
- 测试数据库覆盖: `DB_PATH` 环境变量（支持 `:memory:` 或文件路径）
- 启动前自动创建数据目录
- 迁移在服务启动时自动执行

### 端口配置

- 后端 API: `PORT` 环境变量，默认 `3000`
- 前端开发: Vite 端口 `5173`，开发时通过代理访问后端 API

### 微信小程序

- 微信小程序使用微信开发者工具打开 `miniprogram/` 目录
- 小程序配置中的 API 基地址需指向后端服务地址
- 手机号获取依赖微信小程序的 `getPhoneNumber` 能力，需在微信后台配置 AppID

### 验收验证

- AC-01（访客提交登记）: 通过小程序或直接调用 POST `/api/visitors` 提交访客信息，验证数据库写入且状态为 `pending`，审批列表中可见
- AC-02（移动端审批）: 在移动端视口下打开审批前端，执行通过/驳回操作，验证状态持久化（刷新后保持）
- AC-03（移动端布局）: 在手机尺寸视口下检查列表卡片布局和详情页布局，元素不溢出、操作可触达
