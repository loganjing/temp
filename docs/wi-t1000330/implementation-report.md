# 开发实现报告（133-ticket 工单系统）

## 1. 阶段范围与执行方式

本阶段为 Development Implementation（开发实现），按已批准开发任务计划（`plan:722af3c2-1cef-4fc2-90ad-560320393539`）以同专家前后端两个并行任务执行：

| 任务 | 范围 | 写入归属 | 结果 |
| --- | --- | --- | --- |
| T01 服务端实现 | 数据迁移与种子、身份与八个业务模块 API、公司隔离、完成邮件通知、HTTP 集成测试 | `app/ticket-system/src/server/`、`src/shared/`、`test/`、`package.json`、server 侧 tsconfig | completed（1 次尝试） |
| T02 前端 SPA 实现 | 登录、工单工作台、处理视图、我的工单、分配配置、统计分析与日志查询界面 | `app/ticket-system/src/client/`、`index.html`、`vite.config.ts`、`tailwind.config.js`、`postcss.config.js`、client 侧 tsconfig | completed（1 次尝试） |

接口字段、枚举、错误码、状态机与公司隔离语义以 `docs/wi-t1000330/technical-contract.md` 为唯一依据；模块与数据归属以 `docs/wi-t1000330/architecture-baseline.md` 为准。

## 2. 实现内容

### 2.1 服务端（T01）

- **数据层**：`src/server/migrations/sqlite/0004_ticket_system_business.sql` 建立全部业务表（`companies`、`departments`、`user_profiles`、`tickets`、`ticket_replies`、`groups`、`group_members`、`assignment_rules`、`ticket_ratings`），编号排在平台迁移（0001/0003）之后；`src/server/seed.ts` 提供幂等种子脚本（两家演示公司、部门、含跨公司视角用户与业务组、分配规则），并在 `package.json` 挂接 `seed` 命令。
- **业务模块**（`src/server/modules/`）：identity（登录/会话/当前用户/用户列表）、ticket（创建含事务内分类自动分配、列表筛选搜索排序分页、详情、多轮回复、取消、提交人完整信息与历史工单）、assignment（业务组与成员、分配规则、人工分配）、processing（接单、转派、完成）、rating（满意度评价）、stats（公司/部门分布与仪表盘聚合）、audit-query（按工单与全局日志查询）。
- **支撑层**：`src/server/http.ts`（统一错误形状）、`src/server/profile.ts`（业务档案与公司隔离判断）、`src/server/views.ts`（Ticket/UserBrief 等视图组装）、`src/server/audit-log.ts`（关键操作审计事件写入）、`src/server/notification.ts`（完成邮件，SMTP 禁用时 `sent=false`、真实失败写审计事件且不回滚）。
- **共享层**：`src/shared/domain.ts`（前后端共享枚举与分类字典）。
- **集成测试**（`test/`）：`ticket-system.test.mjs`（工单闭环全链路）、`ticket-system-stats-notify.test.mjs`（统计口径与本地 SMTP 通知三态）、`startup.test.mjs`（启动冒烟与健康检查）、`seeded-app.mjs` / `local-smtp.mjs`（种子环境与本地 SMTP 捕获解码辅助）。

### 2.2 前端（T02）

- **应用壳与登录**：`src/client/components/AppShell.tsx`（左侧导航：工单工作台/我的工单/分配配置/统计分析/操作日志 + 顶部用户上下文栏）、`pages/LoginPage.tsx`、`app/session.tsx`（Bearer 会话管理，失效返回登录）。
- **工单工作台**：`pages/WorkbenchPage.tsx`，split-master-detail 布局；状态（待处理/待分配）、分类、优先级、公司维度筛选（仅 `crossCompanyView` 用户可见）、关键字搜索、排序与分页。
- **处理视图**：`pages/TicketDetailView.tsx`，回复流（按时间升序）、提交人完整信息区（姓名、公司、部门、历史工单）、接单/回复/转派/完成/取消操作、完成后 `notification.sent=false` 的邮件失败提示、该工单操作日志。
- **其余页面**：`pages/MyTicketsPage.tsx`（提交人全状态列表与满意度评价 1-5）、`pages/AssignmentPage.tsx`（业务组与成员、分类自动分配规则）、`pages/StatsPage.tsx`（仪表盘指标卡与公司/部门分布切换）、`pages/LogsPage.tsx`（全局日志查询过滤）。
- **契约与基础设施**：`src/client/contract.ts`（从技术契约推导的类型与枚举，不发明 API 行为）、`src/client/api.ts`、`labels.ts`（状态/优先级中文文案与状态色）、`components/ui.tsx`、`app/useAsyncData.ts`、`app/useCompanyOptions.ts`；加载/空数据/错误/无权限（`COMPANY_FORBIDDEN`）状态齐备。
- **渲染核对**：`src/client/devcheck/run.tsx` + `mockData.ts` 以契约推导 mock 数据核对各页面渲染（不依赖后端启动）。

## 3. 验证证据

在 `app/ticket-system` 下执行的真实命令与结果：

| 命令 | 结果 |
| --- | --- |
| `npm test`（`node --import tsx --test test/*.test.mjs`） | 15/15 通过，0 失败 |
| `npm run typecheck`（server + client tsc） | 通过，无错误 |
| `npm run build`（typecheck + vite build） | 通过，51 modules transformed，`dist/` 产物正常 |
| `npm run typecheck:client` | 通过（初跑 4 处类型错误，修复后通过） |
| `npm run build:client` | 通过，51 modules transformed |
| `node --import tsx src/client/devcheck/run.tsx` | 46/46 渲染检查通过（初跑 37/45，8 处失败经修复后全通过） |

集成测试覆盖范围：登录、创建与分类自动分配、公司隔离 `403 COMPANY_FORBIDDEN`、多轮回复、人工分配兜底、接单、转派（含 `NOT_ASSIGNEE` 拒绝）、完成（本地 SMTP 成功/失败/禁用三态通知）、评价（非提交人 `403`、重复评价 `409`）、统计口径（分布、仪表盘、平均响应、满意度、热点分类）、工作台筛选/搜索/排序/分页、业务组与规则配置、启动健康检查。

修复记录（初跑失败 → 修复后通过）：服务端修复测试辅助签名、Unicode 排序断言、SMTP 禁用误记审计、MIME 邮件解码断言、外键约束造数方式；客户端修复 4 处类型错误与 8 处渲染核对失败（SSR 文本节点分隔、缺失空态提示、mock 跨公司归属与契约冲突的转派断言拆分）。所有修复均已复验通过。

## 4. 验收标准证据记录（实现层）

以下记录 implementation 阶段可得证据；浏览器端到端操作验收属于后续验证阶段，本阶段未执行浏览器操作。

| AC | 结论 | 实现层证据 |
| --- | --- | --- |
| AC-01 创建工单完整信息 | passed | 创建 API 集成测试（字段回读、校验错误 400）；创建表单与详情字段渲染核对 |
| AC-02 生命周期流转与取消 | passed | 状态机流转测试（创建→待分配→待处理→完成）与取消终态测试；页面状态呈现核对 |
| AC-03 公司隔离 | passed | 跨公司读写返回 `403 COMPANY_FORBIDDEN` 集成测试；无权限反馈渲染核对 |
| AC-04 多轮回复 | passed | 回复 API 测试（多轮、按时间、首回复锚点）；回复流渲染核对 |
| AC-05 业务组与成员配置 | passed | 组 CRUD 与成员校验集成测试；配置页渲染核对 |
| AC-06 分类自动分配 | passed | 创建即分配集成测试（命中规则→待处理、组成员可见）；工作台列表测试 |
| AC-07 转派 | passed | 转派集成测试（责任转移、`NOT_ASSIGNEE` 403、审计记录）；转派 UI 渲染核对 |
| AC-08 提交人完整信息 | passed | 提交人信息与历史工单 API 测试；处理视图信息区渲染核对 |
| AC-09 完成记录与邮件通知 | passed | 完成集成测试（处理人/处理时间落库、本地 SMTP 捕获解码断言、通知三态可见）；完成反馈与失败提示渲染核对 |
| AC-10 满意度评价 | passed | 评价集成测试（1-5 分、非提交人 403、重复 409）；评价表单渲染核对 |
| AC-11 公司/部门分布统计 | passed | 分布聚合 API 测试（维度切换、未分配部门兜底）；分布视图渲染核对 |
| AC-12 运营仪表盘 | passed | 仪表盘 API 测试（工单量、平均响应分钟、满意度、热点分类 Top）；指标卡渲染核对 |
| AC-13 工作台筛选搜索排序 | passed | 列表筛选/搜索/排序/分页集成测试（含公司维度与权限拦截）；筛选控件渲染核对 |
| AC-14 关键操作日志 | passed | 审计事件写入与按工单/全局查询集成测试；日志页渲染核对 |

## 5. 遗留问题与边界

- 无实现层遗留缺陷；种子演示账号、公司隔离、工单闭环、通知三态、统计口径、工作台检索、组与规则配置、启动健康检查均已由自动化测试验证。
- 浏览器端到端用户操作验收（真实界面走查）属后续验证阶段范围，本阶段未执行。
- 架构基线已记录的既有边界（平台用户管理 API 不区分角色、邮件依赖外部 SMTP 可用性——验收用本地 SMTP 规避）保持不变。
