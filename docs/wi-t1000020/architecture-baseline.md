# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

本系统为微信小程序访客登记与审批系统（k03-guest），包含三个独立运行的部分：

1. **微信小程序（访客端）**：访客填写来访信息、获取手机号、提交登记、查看审核状态。使用微信小程序原生框架（WXML/WXSS/JS）开发。
2. **移动端审批系统（审批端）**：审批人查看待审核列表、查看访客详情、执行通过/拒绝。使用 React + Vite 构建的移动端优先 SPA。
3. **后端服务**：提供 RESTful API，处理访客登记、查询、审批操作，数据持久化到 SQLite 数据库。使用 Hono（Node.js）框架。

### 技术栈

| 层 | 技术选型 | 选型依据 |
| --- | --- | --- |
| 访客端 | 微信小程序原生框架 | 用户明确要求微信小程序；需调用微信 `getPhoneNumber` API |
| 审批端 | React + Vite + TypeScript | 移动端 Web SPA；fullstack-design 默认 React/Vite；需适配移动端布局 |
| 审批端 UI 组件 | Ant Design Mobile（`antd-mobile`） | 移动端优先的组件库，提供列表、卡片、按钮等移动端适配组件 |
| 后端 | Hono + Node.js + TypeScript | fullstack-design 默认新建服务端应用选型；轻量、类型安全 |
| 数据库 | SQLite（better-sqlite3） | 文件数据库，零配置运行，适合单实例访客系统 |
| ID 生成 | ULID（字符串） | 趋势有序、URL 安全、无需中央协调 |

### 架构关系

```
┌─────────────┐         ┌─────────────────┐
│  微信小程序  │         │  移动端审批 SPA  │
│  （访客端）  │         │   （审批端）     │
└──────┬──────┘         └────────┬────────┘
       │                         │
       │  HTTPS / REST API       │  HTTPS / REST API
       │                         │
       └──────────┬──────────────┘
                  │
         ┌────────▼────────┐
         │   Hono 后端     │
         │  （Node.js）    │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │   SQLite DB     │
         │   visitors.db   │
         └─────────────────┘
```

### 设计约束

- 访客端为微信小程序，不作为 Web 页面交付；审批端为移动端优先 Web SPA。
- 后端同时服务两端，API 统一前缀 `/api`。
- 数据库使用文件数据库（SQLite），默认路径 `data/visitors.db`，可通过 `DB_PATH` 环境变量覆盖。
- 后端启动端口通过 `PORT` 环境变量配置，默认 `3000`。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 访客端（微信小程序）

**职责**：访客来访信息登记与状态查看。

**核心页面**：
- 登记页：手机号获取/手填、身份证号、公司信息、人名、访问事由、被访人（选填）、预计到访时间（选填）→ 提交登记
- 我的登记页：查看已提交登记列表及当前状态（待审核/通过/拒绝）

**接口调用方向**：
- `POST /api/visitors` — 提交访客登记
- `GET /api/visitors?phone={phone}` — 按手机号查询自己的登记记录

### 2.2 审批端（移动端 Web SPA）

**职责**：审批人查看待审核访客并执行审批。

**核心页面**：
- 待审核列表页：展示状态为「待审核」的访客登记列表，每条显示人名、公司、访问事由、提交时间
- 审批详情页：展示完整访客信息，提供「通过」「拒绝」操作按钮

**接口调用方向**：
- `GET /api/visitors?status=pending` — 获取待审核列表
- `GET /api/visitors/{id}` — 获取访客详情
- `PATCH /api/visitors/{id}/status` — 执行审批（通过/拒绝）

### 2.3 后端服务（Hono）

**职责**：提供 API、业务逻辑处理、数据持久化。

**模块划分**：
- **路由层**：定义 REST 端点，请求校验，响应序列化
- **业务层**：访客登记逻辑、状态流转（待审核→通过/拒绝）、手机号来源处理
- **数据层**：SQLite 数据访问，visitor 实体 CRUD

**接口摘要**：

| 接口 | 方法 | 用途 | 调用方 |
| --- | --- | --- | --- |
| `/api/visitors` | POST | 提交访客登记 | 访客端 |
| `/api/visitors` | GET | 查询登记列表（支持 status / phone 过滤） | 访客端、审批端 |
| `/api/visitors/{id}` | GET | 获取单条登记详情 | 审批端 |
| `/api/visitors/{id}/status` | PATCH | 更新审核状态（通过/拒绝） | 审批端 |

接口的详细字段定义、请求/响应结构、类型、错误码见 `technical-contract.md`。

### 2.4 数据归属

- **visitors 表**为后端唯一权威数据源，存储所有访客登记记录及其审核状态。
- 访客端和审批端均为无状态客户端，不缓存权威数据。
- 审核状态（`pending` / `approved` / `rejected`）由后端管理，客户端只读。

## 3. 数据模型

### visitors 表

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PRIMARY KEY | ULID |
| name | TEXT | NOT NULL | 访客姓名 |
| phone | TEXT | NOT NULL | 手机号 |
| id_card | TEXT | NOT NULL | 身份证号 |
| company | TEXT | NOT NULL | 公司信息 |
| visit_reason | TEXT | NOT NULL | 访问事由 |
| host_name | TEXT | NULL | 被访人（选填） |
| expected_arrival_time | TEXT | NULL | 预计到访时间 ISO 8601（选填） |
| phone_source | TEXT | NOT NULL DEFAULT 'manual' | 手机号来源：`wechat` / `manual` |
| status | TEXT | NOT NULL DEFAULT 'pending' | 审核状态：`pending` / `approved` / `rejected` |
| created_at | TEXT | NOT NULL | 提交时间 ISO 8601 |
| updated_at | TEXT | NOT NULL | 最后更新时间 ISO 8601 |

数据库使用版本化迁移脚本（`db/migrations/`）管理 schema 变更，不通过 ORM 自动同步。

## 4. 外部集成

### 微信小程序手机号获取

- 访客端使用微信 `button` 组件的 `open-type="getPhoneNumber"` 获取手机号。
- 获取到的为加密数据，需由后端调用微信解密接口或使用 `phonenumber.getPhoneNumber` 服务端接口解密。
- 后端提供 `POST /api/wechat/phone` 端点接收微信回调 code，返回解密后的手机号。
- 获取失败时（用户拒绝或环境不支持），访客端回退到手工填写，`phone_source` 标记为 `manual`。
- 开发环境无法调用微信真实接口时，直接使用手工填写路径。

## 5. UI 基线

### 访客端（微信小程序）

- **应用框架**：微信小程序原生 tabBar 导航，两个 tab 页（登记、我的登记）
- **视觉方向**：简洁表单为主，使用微信原生组件风格
- **目标设备**：移动端（微信小程序运行环境）
- **关键状态**：
  - 提交成功：toast 提示并跳转到「我的登记」页
  - 提交失败：表单页内联错误提示
  - 空列表：「我的登记」页显示空态文案

### 审批端（移动端 Web SPA）

- **展示模板**：`split-master-detail`（列表与详情协同，适配审批高频逐条处理）
- **视觉风格**：Modern SaaS（柔和中性色、细边界、少阴影、清晰字体、一个主色与状态色）
- **组件体系**：Ant Design Mobile（`antd-mobile`）
- **应用壳**：顶部标题栏 + 内容区，无侧栏（移动端不适用侧栏导航）
- **目标设备**：移动端优先，最小宽度 320px
- **主工作流**：
  - 待审核列表页：卡片列表，每张卡片显示人名、公司、访问事由、提交时间；点击进入详情
  - 审批详情页：完整信息展示 + 底部固定操作栏（通过/拒绝按钮）
- **关键状态**：
  - 加载中：列表页骨架屏 / Spinner
  - 空数据：列表页空态文案「暂无待审核访客」
  - 错误：页面级错误提示 + 重试
  - 审批成功：Toast 提示并返回列表
  - 审批失败：详情页内联错误提示
- **窄屏策略**：列表卡片单列排列；详情页信息纵向滚动；操作按钮底部固定吸底；文本溢出省略并提供点击展开

## 6. 运行与校验

### 后端

- **启动命令**：`npm run dev`（开发模式，带热重载）/ `npm start`（生产模式）
- **端口**：`PORT` 环境变量，默认 `3000`
- **数据库路径**：`DB_PATH` 环境变量，默认 `data/visitors.db`
- **数据库初始化**：启动时自动创建 `data/` 目录并执行迁移脚本
- **隔离测试**：设置 `DB_PATH=data/test-visitors.db` 和 `PORT=<空闲端口>` 运行隔离验证

### 审批端

- **启动命令**：`npm run dev`
- **端口**：Vite 默认 `5173`，可通过 `--port` 覆盖
- **API 代理**：Vite 开发代理 `/api` → `http://localhost:3000`

### 访客端

- **开发工具**：微信开发者工具
- **后端地址**：开发时在 `config.js` 中配置后端 API 地址
- **真机调试**：需配置后端可访问地址

### 验收辅助

- AC-01（访客登记持久化）：通过审批端或直接 API 查询验证后端记录存在且状态为 pending
- AC-02（状态查看与更新）：访客端提交后查看状态 → 审批端执行审批 → 访客端刷新查看更新状态
- AC-03（审批操作）：审批端列表→详情→通过/拒绝→验证后端记录状态更新
- AC-04（移动端适配）：在移动端视口（375px 宽度）下操作审批端，验证列表与详情可浏览、可操作
