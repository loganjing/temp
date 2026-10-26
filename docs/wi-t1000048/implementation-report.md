# 实现报告 — 170-餐饮服务

## 概述

餐饮配送机器人管理系统的开发实现阶段完成。系统覆盖配送任务队列、多机路径协调、到桌通知、任务取消和运行监控五大功能模块，采用 Hono (Node.js) 后端 + React + Vite SPA 前端 + SQLite 持久化的全栈架构。

## 任务拆分

按 `contract-backed-same-expert-frontend-backend` 策略拆分为两个并行任务：

| 任务 | 范围 | 写入归属 |
|------|------|---------|
| T01 | 后端：Hono API + SQLite + Dispatcher + 路径协调 + 通知 + 监控 + 告警 | `src/server/`、`package.json`、`tsconfig.json`、`migrations/001_init.sql` |
| T02 | 前端：React SPA 监控 Dashboard | `src/client/`、`index.html`、`vite.config.ts` |

两个任务均引用 `technical-contract.md` 作为 API 契约，无互相依赖，并行执行。

## 交付物

### 后端 (T01)

- `src/server/index.ts` — 入口：迁移 → Hono 服务（API + dist 静态托管）→ 1 秒间隔 Dispatcher
- `src/server/db.ts` — better-sqlite3 连接 + 迁移运行器（DB_PATH 可配置，自动建父目录）
- `src/server/services/path-service.ts` — BFS 最短路径、渐进式段锁（partial unique index 保证同段同时一个活跃锁）、冲突检测与绕行
- `src/server/services/task-service.ts` — 任务创建/查询（FIFO 按 createdAt 升序）/取消（待分配移除、配送中释放机器人与路径锁）
- `src/server/services/robot-service.ts` — 注册/查询/状态更新（idle 触发 Dispatcher、offline 生成告警）/到达（通知 + 释放锁 + 置 idle）
- `src/server/services/notification-service.ts` — 到桌通知生成与查询
- `src/server/services/alert-service.ts` — 离线告警 / 路径冲突告警生成
- `src/server/services/monitor-service.ts` — 监控聚合查询（overview/queue/robots/alerts）
- `src/server/services/mappers.ts` — 数据库行到 API 响应映射
- `src/server/services/dispatcher.ts` — 1 秒轮询：推进运行中机器人段锁（hold-and-wait），为 idle 机器人分配 FIFO 头部 pending 任务
- `src/server/routes/tasks.ts` — 任务端点：POST /api/tasks、GET /api/tasks、POST /api/tasks/:id/cancel
- `src/server/routes/robots.ts` — 机器人端点：POST /api/robots、GET /api/robots、PATCH /api/robots/:id/status、POST /api/robots/:id/arrive
- `src/server/routes/notifications.ts` — 通知端点：GET /api/notifications
- `src/server/routes/monitor.ts` — 监控端点：GET /api/monitor/overview|queue|robots|alerts|events(SSE)
- `src/server/events.ts` — SSE 事件总线（7 种事件类型）
- `src/server/types.ts` — 后端类型定义
- `src/server/errors.ts` — 错误处理
- `src/server/__tests__/path-service.test.ts` — 路径协调单元测试（7 项）
- `src/server/__tests__/api-smoke.test.ts` — API 路由冒烟测试（9 项）
- `src/server/vitest.config.ts` — Vitest 配置
- `migrations/001_init.sql` — 7 张表 + 初始路径图（厨房/交叉口/3 桌位/7 段，含替代干道供冲突绕行）
- `package.json` — 全量依赖与脚本
- `tsconfig.json` — TypeScript 配置

### 前端 (T02)

- `src/client/main.tsx` — React 应用入口（StrictMode）
- `src/client/App.tsx` — 应用根组件
- `src/client/types.ts` — 严格对照技术契约的类型定义
- `src/client/api.ts` — 全部 API 端点封装，统一错误处理
- `src/client/sse.ts` — SSEManager：连接 /api/monitor/events，监听 7 种事件，断线指数退避自动重连
- `src/client/hooks/useSSE.ts` — React hooks：useSSEConnection、useSSERefresh、useRefreshCallback
- `src/client/hooks/useFetch.ts` — 数据获取 hook
- `src/client/context/AppContext.tsx` — 全局 Context：页面导航 + SSE 连接生命周期
- `src/client/components/Layout.tsx` — 应用壳：左侧边栏 + 顶部上下文栏 + 主工作区
- `src/client/components/Sidebar.tsx` — 左侧导航：总览、任务队列、机器人、告警
- `src/client/components/TopBar.tsx` — 顶部栏：模块标题 + SSE 连接状态指示灯
- `src/client/components/ui.tsx` — UI 组件库：LoadingSpinner、SkeletonCards、EmptyState、ErrorBar、KpiCard、StatusDot、TaskStatusBadge、RobotStatusBadge、进度条、时间格式化
- `src/client/pages/OverviewPage.tsx` — 总览页：KPI 行 + 三栏
- `src/client/pages/QueuePage.tsx` — 任务队列页：创建表单 + 待分配表格 + 配送中列表 + 取消操作
- `src/client/pages/RobotsPage.tsx` — 机器人页：注册表单 + 卡片网格 + 状态操作
- `src/client/pages/AlertsPage.tsx` — 告警页：告警列表
- `src/client/styles.css` — Modern SaaS 视觉风格

### 配置文件

- `index.html` — Vite 入口 HTML
- `vite.config.ts` — Vite 构建配置（React 插件 + dev server /api 代理 + dist 输出）

## 验证结果

### TypeScript 类型检查

```
npm run typecheck (tsc --noEmit)
→ exit 0，无错误
```

### 单元测试

```
npm test (vitest run --config src/server/vitest.config.ts)
→ 16 passed (2 test files)
  - path-service.test.ts: 7 项（BFS 路径规划、段锁互斥、冲突绕行、冲突不可解、释放后复用、进度递增）
  - api-smoke.test.ts: 9 项（API 路由冒烟）
```

### 前端构建

```
npm run build (vite build)
→ 成功产出 dist/
  - dist/index.html (0.40 kB)
  - dist/assets/index-D32VVCEz.css (9.00 kB)
  - dist/assets/index-CyTV1IPb.js (161.78 kB)
```

### 集成启动冒烟测试

使用 `DB_PATH=./data/smoke-test2.db PORT=3200 npm start` 启动服务，执行以下流程验证：

| 步骤 | 操作 | 结果 |
|------|------|------|
| 1 | POST /api/tasks `{"tableId":"table-1"}` | 201 — 任务 id:1, status:"pending" |
| 2 | POST /api/robots `{"name":"Bot-1"}` | 201 — 机器人 id:1, status:"idle" |
| 3 | 等待 2 秒（Dispatcher 自动分配） | 自动分配成功 |
| 4 | GET /api/monitor/overview | queueCount:0, activeTaskCount:1, deliveringRobotCount:1, idleRobotCount:0 |
| 5 | GET /api/tasks | 任务 id:1 status:"delivering", robotId:1, assignedAt 已设置 |
| 6 | GET /api/robots | 机器人 id:1 status:"delivering", currentTaskId:1 |
| 7 | POST /api/robots/1/arrive | 200 — notificationId:1, taskId:1, tableId:"table-1", robotId:1, sentAt 已设置 |
| 8 | GET /api/notifications | 返回通知记录，包含 tableId:"table-1" |
| 9 | GET / (前端) | 返回 dist/index.html |

## 验收条件覆盖

| AC | 描述 | 后端 (T01) | 前端 (T02) | 验证状态 |
|----|------|-----------|-----------|---------|
| AC-01 | 任务创建并入队 | POST /api/tasks 创建 + FIFO 队列 | — | ✅ 集成冒烟通过 |
| AC-02 | 空闲机器人自动分配 | Dispatcher 1 秒轮询 + 自动分配 | — | ✅ 集成冒烟通过 |
| AC-03 | 多机路径不冲突 | BFS + 段锁互斥 + 冲突绕行 | — | ✅ 单元测试 7 项通过 |
| AC-04 | 到桌通知 | arrive 端点触发通知记录 | — | ✅ 集成冒烟通过 |
| AC-05 | 任务取消 | cancel 端点（待分配移除/配送中释放资源） | 取消按钮 UI | ✅ 后端逻辑通过；UI 待 QA |
| AC-06 | 监控队列/机器人/进度 | 监控 API（overview/queue/robots） | Dashboard 各页面 | ✅ API 冒烟通过；UI 待 QA |
| AC-07 | 异常告警显示 | offline / conflict 告警生成 | 告警页 UI | ✅ 后端告警逻辑实现；UI 待 QA |

## 未验证项（留待 QA 阶段）

- **浏览器端到端验证**：页面渲染、导航切换、SSE 连接生命周期与断线重连、取消操作交互 — 需要浏览器自动化验收
- **多机同时配送的浏览器可视化验证**：两台机器人同时配送时的路径协调在监控界面的实时展示
- **SSE 事件推送的前端接收**：后端事件总线已实现，前端 SSEManager 已实现，联调验证由 QA 执行

## 关键设计决策

1. **段锁模型**：`segment_locks` 采用 partial unique index `uq_locks_active_segment ON (segment_id) WHERE released_at IS NULL AND locked_at IS NOT NULL`，支持「通过段时获取锁、通过后释放锁」的渐进式占用，比设计文档字面约束更精确地保证 AC-03。
2. **冲突绕行**：初始路径图包含替代干道（junction 之间的额外段），使冲突检测后可重新规划替代路径而非仅等待。
3. **前端依赖集成**：T01 创建的 package.json 在结算阶段补充了前端依赖（react、react-dom、@vitejs/plugin-react、vite 及类型声明），修复了并行任务边界导致的依赖缺失，集成构建验证通过。
