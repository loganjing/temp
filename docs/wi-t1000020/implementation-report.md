# 实现报告

## 1. 概述

本报告记录访客系统（k03-guest）开发实现阶段的执行结果。基于已批准的需求基线（`docs/wi-t1000020/requirements.md`）、架构基线（`docs/wi-t1000020/architecture-baseline.md`）和技术契约（`docs/wi-t1000020/technical-contract.md`），将实现拆分为 3 个并行任务，覆盖后端服务、审批端移动 SPA 和微信小程序访客端三个组件。

**计划 ID**：plan:ad84eb32-d976-44dc-ab94-32ed7eb7d916

## 2. 任务执行结果

### T01：后端服务（Hono + SQLite）

**状态**：已完成

**实现内容**：
- 按 `technical-contract.md` 实现全部 5 个 API 端点：
  - `POST /api/visitors` — 提交访客登记（201 Created）
  - `GET /api/visitors` — 查询登记列表（支持 status / phone 过滤）
  - `GET /api/visitors/{id}` — 获取登记详情
  - `PATCH /api/visitors/{id}/status` — 更新审核状态（approved / rejected）
  - `POST /api/wechat/phone` — 微信手机号解密
- visitors 表 schema 使用版本化迁移脚本（`server/src/db/migrations/001-init.sql`），启动时自动创建 `data/` 目录并执行迁移
- 字段校验规则按契约 §4 实现（手机号 `^1[3-9]\d{9}$`、身份证号 `^\d{17}[\dXx]$`、字符长度限制）
- 状态机 `pending → approved/rejected`（终态不可变更，违反返回 409 `INVALID_STATE_TRANSITION`）
- 统一错误响应格式按契约 §5 实现
- ULID 生成访客记录 ID
- `PORT`（默认 3000）和 `DB_PATH`（默认 `data/visitors.db`）环境变量配置
- 根 `package.json` 作为 npm workspace 根
- `README.md` 记录项目结构和运行方式

**写入范围**：`server/`、`package.json`、`README.md`

**验证证据**：
| 检查项 | 状态 | 命令 | 退出码 |
| --- | --- | --- | --- |
| TypeScript 类型检查 | passed | `cd server && npx tsc --noEmit` | 0 |
| API 冒烟测试（34 项断言） | passed | `cd server && DB_PATH=data/test-visitors.db node --import tsx scripts/smoke-test.ts` | 0 |
| HTTP 服务启动验证 | passed | `cd server && DB_PATH=data/startup-test.db PORT=3998 node --import tsx src/index.ts` | 0 |

冒烟测试覆盖：提交登记(201) → 查询列表(200) → 查询详情(200) → 审批(200) → 终态状态校验(409) → 微信解密无环境(500) → 校验失败(400) → 不存在(404)。

### T02：审批端移动 SPA（React + Vite + Ant Design Mobile）

**状态**：已完成

**实现内容**：
- 待审核列表页（`admin/src/pages/VisitorList.tsx`）：调用 `GET /api/visitors?status=pending`，卡片列表展示人名、公司、访问事由、提交时间
- 审批详情页（`admin/src/pages/VisitorDetail.tsx`）：调用 `GET /api/visitors/{id}`，展示完整访客信息，底部固定操作栏提供通过/拒绝按钮，调用 `PATCH /api/visitors/{id}/status`
- 使用 Ant Design Mobile（`antd-mobile`）组件库
- 移动端优先布局，最小宽度 320px
- 关键状态：加载中 Spinner、空数据空态文案、错误提示+重试、审批成功 Toast 返回列表、审批失败内联错误
- Vite 开发代理 `/api` → `http://localhost:3000`
- API 客户端层（`admin/src/api/client.ts`）基于技术契约定义的端点和类型

**写入范围**：`admin/`

**验证证据**：
| 检查项 | 状态 | 命令 | 退出码 |
| --- | --- | --- | --- |
| TypeScript 类型检查 | passed | `npx tsc --noEmit` | 0 |
| Vite 构建 | passed | `npm run build` | 0 |

### T03：微信小程序访客端

**状态**：已完成

**实现内容**：
- 应用级配置：`app.js`、`app.json`（tabBar 两页：登记、我的登记）、`app.wxss`、`config.js`、`sitemap.json`、`project.config.json`
- 登记页（`miniprogram/pages/register/`）：
  - 手机号获取：`button` 组件 `open-type="getPhoneNumber"`，获取 code 后调用 `POST /api/wechat/phone` 解密
  - 失败/拒绝/不支持时回退手工填写，`phone_source` 标记为 `manual`
  - 必填字段：姓名、身份证号、公司信息、访问事由
  - 选填字段：被访人、预计到访时间
  - 客户端预校验规则与契约 §4 一致
  - 提交 `POST /api/visitors`，成功 toast 并跳转我的登记页，失败内联错误提示
- 我的登记页（`miniprogram/pages/my-visits/`）：
  - 调用 `GET /api/visitors?phone={phone}` 查询本人记录
  - 展示列表与状态（待审核/通过/拒绝），空列表显示空态文案，支持下拉刷新
- API 封装（`miniprogram/utils/api.js`）：统一对接 `/api/visitors`、`/api/wechat/phone`

**写入范围**：`miniprogram/`

**验证证据**：
| 检查项 | 状态 | 命令 | 退出码 |
| --- | --- | --- | --- |
| 项目结构完整性 | passed | `find . -type f \| sort` | 0 |
| JSON 文件合法性 | passed | `node -e` 校验 app.json/sitemap.json/project.config.json/页面 json | 0 |
| app.json pages/tabBar 配置 | passed | `node -e` 校验 pages 与 tabBar 及页面四件套 | 0 |
| JS 语法检查 | passed | `node --check` 5 个 JS 文件 | 0 |
| 登记页契约字段 | passed | `node -e` 校验 API 路径/字段/正则/phone_source/跳转/错误处理 | 0 |
| 我的登记页契约字段 | passed | `node -e` 校验 phone 查询/状态映射/空态/刷新 | 0 |
| getPhoneNumber 绑定 | passed | `grep open-type/bindgetphonenumber register.wxml` | 0 |

## 3. 验收标准覆盖

| 验收标准 | 覆盖任务 | 实现状态 | 说明 |
| --- | --- | --- | --- |
| AC-01：访客可在微信小程序完成来访登记并持久化 | T01（后端 API + 数据库）、T03（小程序登记页） | 已实现 | 后端 API 冒烟测试验证登记持久化；小程序登记页实现全部必填字段和手机号获取/手填路径 |
| AC-02：访客可在小程序查看登记状态与审核结果 | T01（查询 API）、T03（我的登记页） | 已实现 | 后端 GET /api/visitors?phone= 查询；小程序我的登记页展示状态列表 |
| AC-03：审批人可在移动端审批系统对待审核访客进行审核 | T01（审批 API）、T02（列表+详情+操作） | 已实现 | 后端 PATCH /api/visitors/{id}/status 状态机；审批端列表→详情→通过/拒绝完整流程 |
| AC-04：审批系统在移动端可用且可操作 | T02（移动端优先布局） | 已实现 | Ant Design Mobile 组件、320px 最小宽度、卡片列表、底部固定操作栏 |

## 4. 项目结构

```
jlgguest/
├── server/                         # 后端服务
│   ├── src/
│   │   ├── app.ts                  # Hono app
│   │   ├── index.ts                # 入口
│   │   ├── routes/
│   │   │   ├── visitors.ts         # 访客 CRUD 路由
│   │   │   └── wechat.ts           # 微信手机号解密路由
│   │   ├── services/
│   │   │   └── visitor-service.ts  # 业务逻辑
│   │   ├── db/
│   │   │   ├── connection.ts       # SQLite 连接
│   │   │   └── migrations/
│   │   │       └── 001-init.sql    # 初始化迁移
│   │   └── utils/
│   │       ├── error.ts            # 错误工具
│   │       └── validate.ts         # 校验工具
│   ├── scripts/
│   │   └── smoke-test.ts           # API 冒烟测试
│   ├── package.json
│   └── tsconfig.json
├── admin/                          # 审批端 SPA
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── VisitorList.tsx     # 待审核列表
│   │   │   └── VisitorDetail.tsx   # 审批详情
│   │   ├── api/
│   │   │   └── client.ts           # API 调用
│   │   ├── styles/
│   │   │   └── index.css
│   │   └── utils/
│   │       └── format.ts
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── tsconfig.json
├── miniprogram/                    # 访客端微信小程序
│   ├── pages/
│   │   ├── register/               # 登记页
│   │   └── my-visits/              # 我的登记页
│   ├── utils/
│   │   └── api.js                  # API 封装
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── config.js
│   ├── project.config.json
│   └── sitemap.json
├── package.json                    # 根 workspace
├── README.md
└── docs/wi-t1000020/               # 设计文档
```

## 5. 运行方式

### 后端
```bash
cd server && npm install
npm run dev          # 开发模式，端口 3000
```

### 审批端
```bash
cd admin && npm install
npm run dev          # Vite 开发服务器，端口 5173，代理 /api → localhost:3000
```

### 微信小程序
使用微信开发者工具打开 `miniprogram/` 目录，在 `config.js` 中配置后端 API 地址。

## 6. 已知限制

- 微信手机号解密端点（`POST /api/wechat/phone`）在无微信环境时返回 500 错误，开发环境使用手工填写路径
- 端到端集成验证（后端 + 审批端 + 小程序联调）未在本阶段执行，由后续 QA 阶段负责
- 审批人身份认证与权限方案未实现（需求标记为未规定）
