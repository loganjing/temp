# 实现报告 — 工单系统 (T1000487)

## 概述

工单系统实现通过两个并行任务完成：后端（T01）和前端（T02），均基于已批准的需求文档、架构基线和技术契约。两个任务独立推进、独立验证，写入范围无重叠。

- **计划 ID**: plan:9eb2a7a8-99e2-44c7-8802-9f9acc920808
- **任务拆分策略**: contract-backed-same-expert-frontend-backend（完整技术契约支持的前后端并行）
- **技术栈**: Hono + React/Vite + SQLite(dbkit) + Tailwind CSS

---

## T01 — 后端实现

### 交付产物

| 产物路径 | 说明 |
|----------|------|
| `app/jlg-ticket/src/server/` | 后端服务全部源码 |
| `app/jlg-ticket/src/shared/` | 平台中立共享层（类型、常量） |

### 实现内容

**数据库迁移** (`src/server/migrations/sqlite/0001_init.sql`)：
- 8 张表：companies、business_groups、group_members、assignment_rules、tickets、ticket_replies、ticket_transfers、evaluations
- 9 个索引：覆盖外键关联和查询热点（submitter_email、ticket_id 等）

**共享层** (`src/shared/`)：
- `constants.ts`：工单状态枚举（created/pending_assign/pending_process/completed/cancelled）、SLA 优先级枚举（P0-P4）和校验函数
- `types.ts`：全部 API 响应类型定义

**21 个 API 路由** (`src/server/routes.ts`)：
- 工单管理：创建（含自动分配）、列表查询、详情查询、状态更新（取消）、手动分配、转派、完成处理、提交人信息查询（含历史工单）
- 回复管理：查询回复列表、添加回复
- 转派记录：查询转派历史
- 评价：查询评价、提交满意度评价
- 组织管理：公司 CRUD、业务组 CRUD、成员 CRUD
- 分配规则：查询规则列表、创建规则

**dbkit 集成** (`src/server/platform/bootstrap.ts`)：
- SQLite 连接初始化，数据库路径 `./data/ticket.db`
- 迁移自动执行

**业务逻辑**：
- 自动分配：工单创建时根据 submitter_company_id + category 匹配 assignment_rules
- 状态转换校验：created→pending_assign→pending_process→completed/cancelled
- 转派：记录 from_group_id→to_group_id，更新 current_group_id
- 完成：记录 handler_member_id、handler_name、processed_at
- 评价：仅 completed 工单可评价，每工单仅一次
- snake_case ↔ camelCase 转换在 API 层完成

**API 集成测试** (`test/ticket-api.test.mjs`)：
- 覆盖核心流程：创建→自动分配→回复→转派→完成→评价
- 状态转换校验、重复评价拦截、404/400 错误响应

### 验证结果

| 检查项 | 状态 | 命令 | 退出码 |
|--------|------|------|--------|
| 服务端类型检查 | passed | `npm run typecheck:server` | 0 |
| API 集成测试 | passed | `npm test` | 0 |

测试覆盖 5 个用例，全部通过。

---

## T02 — 前端实现

### 交付产物

| 产物路径 | 说明 |
|----------|------|
| `app/jlg-ticket/src/client/` | 前端 React SPA 全部源码 |

### 实现内容

**类型定义** (`src/client/types.ts`)：
- 与技术契约完全对齐的 API 类型：TicketDetail、TicketSummary、Reply、TransferRecord、Evaluation、SubmitterInfo、Company、BusinessGroup、GroupMember、AssignmentRule

**API 客户端** (`src/client/platform/api-client.ts`)：
- 统一浏览器请求边界，覆盖全部 21 个 API 端点
- 类型化函数，支持技术契约 `{error, code}` 和平台 `{error:{code,message}}` 两种错误格式解码

**UI 组件** (`src/client/components/ui.tsx`)：
- 状态/优先级徽章、骨架屏、空数据引导、错误重试、弹窗、表单输入控件

**应用骨架**：
- `src/client/App.tsx`：左侧导航（工单工作台/组织管理/分配规则）+ 主工作区
- `src/client/main.tsx`：React 挂载

**工单工作台** (split-master-detail)：
- `src/client/pages/TicketWorkbench.tsx`：左面板工单列表（状态/优先级/分类筛选 + 关键字搜索），右面板工单详情
- `src/client/pages/TicketDetailPanel.tsx`：工单信息、提交人信息面板（含历史工单）、回复列表+添加回复、转派记录、评价展示、操作弹窗（分配/转派/完成/评价/取消）
- `src/client/pages/CreateTicketModal.tsx`：工单创建表单（主题/描述/分类/SLA优先级/提交人信息）

**组织管理** (`src/client/pages/OrganizationManagement.tsx`)：
- 三级联动：公司→业务组→成员，每级支持创建/添加

**分配规则** (`src/client/pages/AssignmentRules.tsx`)：
- 规则列表（按公司筛选）+ 创建规则表单（公司/分类/目标业务组联动）

**前端配置**：
- `index.html`：Vite 文档壳
- `vite.config.ts`：Vite 插件、开发端口、API 代理
- `tsconfig.client.json`：客户端 TypeScript 检查
- `tailwind.config.js`：Tailwind 内容扫描和主题
- `postcss.config.js`：PostCSS 插件

### 验证结果

| 检查项 | 状态 | 命令 | 退出码 |
|--------|------|------|--------|
| 客户端类型检查 | passed | `npm run typecheck:client` | 0 |
| 客户端构建 | passed | `npm run build:client` | 0 |

---

## 验收场景覆盖

| AC | 描述 | 后端贡献 | 前端贡献 |
|----|------|----------|----------|
| AC-01 | 提交人可创建工单并记录完整信息 | POST /api/tickets | 创建工单表单弹窗 |
| AC-02 | 工单支持多轮回复 | GET/POST /api/tickets/:id/replies | 回复列表+添加回复 |
| AC-03 | 工单SLA优先级和分类可设置 | 创建工单含 slaPriority/category | 创建表单优先级/分类选择 |
| AC-04 | 公司可创建多个业务组并设置成员 | 公司/业务组/成员 CRUD | 组织管理三级联动 |
| AC-05 | 工单按分类自动分配到业务组 | 自动分配逻辑+分配规则 API | 分配规则管理界面 |
| AC-06 | 工单可转派到其他业务组 | POST /api/tickets/:id/transfer | 转派操作弹窗 |
| AC-07 | 处理工单时可查看提交人完整信息含历史工单 | GET /api/tickets/:id/submitter-info | 提交人信息面板 |
| AC-08 | 工单处理后记录处理人和处理时间 | POST /api/tickets/:id/complete | 完成操作弹窗 |
| AC-09 | 工单完成后用户可进行满意度评价 | GET/POST /api/tickets/:id/evaluation | 评价展示+提交表单 |
| AC-10 | 工单可取消 | PATCH /api/tickets/:id/status | 取消操作按钮 |

---

## 边界与后续

- **浏览器端到端验证**：页面渲染、筛选交互、表单提交和状态联动的浏览器验证留给后续 QA 阶段
- **集成构建**：前后端独立验证均通过，整包集成构建和端到端测试由后续 QA 阶段执行
- **未实现范围**：用户认证/权限体系、文件附件、邮件通知、国际化（需求未规定）
