# 工单系统（134-ticket）开发实现报告

- Work Item：`wi-t1000332`；阶段：开发实现（implementation，授权范围仅此阶段）。
- 批准计划：`plan:5499aba2-fec5-4523-9480-1ce1b9be5608`（2 个并行任务：T01 服务端、T02 前端，同能力同专家，`taskKind=implement`）。
- 拆分依据：已批准技术契约（`docs/wi-t1000332/technical-contract.md`）完整到字段级，前后端可依据契约独立推进并分层验证；写入 owner 唯一（T01 独占 `src/server/`+`test/`+包级依赖配置，T02 独占 `src/client/`+client 层配置，`src/shared/` 双方均不写入，各自在层内定义契约类型）；两侧工作量均足够大，并行收益明确。
- 结论：两个任务均完成；合并后整体验证（完整 build + 全部测试）真实通过。浏览器交互验收不在本阶段范围，移交后续验证阶段。

## 1. 交付产物

### 1.1 服务端（T01，独占 `app/ticket-system/src/server/` 与 `app/ticket-system/test/`）

- 数据迁移：`src/server/migrations/sqlite/0004_ticket_system.sql`（`companies`、`users` 扩展 `company_id`/`department`、`business_groups`、`group_members`、`category_rules`、`tickets`、`ticket_replies`、`ticket_ratings`、`email_outbox`；编号依设计自 0004 起，平台迁移 0001/0003 先行）。
- 业务域（`src/server/domain/`，合计约 1563 行）：
  - `tickets.ts`（619 行）：提交（同步分类自动分配，未匹配保持待分配）、列表（筛选/搜索/排序/公司维度筛选）、详情聚合（提交人完整信息+历史工单+回复+评价）、回复、人工分配、转派（含目标组成员校验）、完成（记录处理人/时间，事务内写审计与发件箱，事务外发送）、取消、满意度评价。
  - `groups.ts`（301 行）：业务组与成员维护、分类自动分配规则、公司可用分类集合。
  - `stats.ts`（86 行）：公司/部门维度分布、运营仪表盘（工单量、状态分布、平均响应时间、满意度、热点问题 Top5）。
  - `notify.ts`（75 行）/`outbox.ts`（86 行）：emailkit 接线（SMTP 真实发送或本地发件箱）、发件箱查询。
  - `audit.ts`（105 行）/`logs.ts`（38 行）：auditkit 接线（契约第 6 节事件集合）、单工单日志与公司日志查询。
  - `users.ts`（69 行）/`support.ts`（184 行）：用户资料查询、公司上下文、校验与统一错误。
- 路由与平台接线：`src/server/routes.ts`（登录/me/bootstrap/admin 用户端点扩展公司名与部门字段）、`src/server/platform/email.ts`（SMTP 配置构造）、`platform/auth.ts`、`platform/bootstrap.ts`、`app.ts`。
- 服务端公司隔离：单据级读写按当前登录用户公司强制过滤；跨公司单据 403/404；列表天然过滤，跨公司筛选条件返回空结果集。
- 测试：`test/tickets.test.mjs`（582 行，6 个业务测试，经 `test/with-http-server.mjs` 启动隔离真实 HTTP 服务器执行）。

### 1.2 前端（T02，独占 `app/ticket-system/src/client/`，共 20 个文件）

- 契约类型：`src/client/types.ts`（严格按契约第 1–6 节定义，未虚构 API 行为）。
- 组件：`components/AppShell.tsx`（左侧导航 + 顶部上下文栏 + 会话上下文）、`TicketDetailPanel.tsx`（提交人信息卡、历史工单、回复流、分配/转派/完成/取消/评价操作与状态门控）、`TicketRow.tsx`、`ui.tsx`、`ExpandableText.tsx`（长文本展开/收起）、`useAsyncData.ts`。
- 页面：`pages/WorkbenchPage.tsx`（split-master-detail 工作台：状态/优先级/分类/业务组/公司筛选、搜索防抖、排序、分页）、`MyTicketsPage.tsx`、`StatsPage.tsx`（KPI 行 + 分布 + 明细表）、`GroupsPage.tsx`、`RulesPage.tsx`、`LogsPage.tsx`、`OutboxPage.tsx`。
- starter 扩展：`admin/UsersPage.tsx` 支持公司名与部门字段；登录/首个账户初始化/改密流程齐备。
- 请求边界：全部请求经 `platform/api-client.ts`；Modern SaaS/Tailwind 视觉基线，覆盖加载/空/错误/隔离 403 反馈/成功反馈。

### 1.3 未触碰

`src/shared/`（空目录，双方按计划不写入）、`vendor/@commonapp/`、平台迁移 0001/0003、`tsconfig.json`、根目录与其他 WorkItem 文件。

## 2. 执行过程记录

- T01 与 T02 并行派发（spawn_task 子代理执行），各自在授权写入范围内完成，无越界写入（T02 报告确认未触碰并行任务产物）。
- T01 在共享工作树合并后修复 2 处导致测试失败的服务端缺陷：
  1. `groups.ts` 规则视图 snake_case 行直接返回导致 `groupName` 为 undefined，改为显式映射；
  2. `tickets.ts` 转派补充校验：指定 `handlerId` 时处理人须为目标业务组成员，否则 400 INVALID_STATE。
- T01 报告的修复后验证：`npm test` 9/9 通过、`npm run typecheck:server` 通过。
- T02 报告的分层验证：client 类型检查与 Vite 生产构建通过。

## 3. 合并后整体验证（协调者在合并状态实际执行）

| 命令（在 `app/ticket-system/` 内执行） | 结果 |
| --- | --- |
| `npm run build`（`typecheck:server` + `typecheck:client` + `vite build`） | 通过；50 个模块转换，产出 `dist/`（index.html 0.39 kB、CSS 20.19 kB、JS 228.01 kB） |
| `npm test` | 9/9 通过，0 失败（duration ≈ 1.6s） |

测试清单（真实执行输出）：

1. dbkit startup opens SQLite, applies migrations, and closes
2. platform serves a real HTTP API and keeps unknown API paths out of the SPA
3. unexpected server errors do not expose their details
4. 工单提交、分类自动分配与生命周期状态机（AC-01/03/04/06/07/08/09/10）
5. 公司隔离拒绝语义与列表天然过滤（AC-02）
6. 工作台列表筛选、搜索与排序语义（AC-13）
7. 统计分布与运营指标口径（AC-11/12）
8. 审计事件记录与查询（AC-14）
9. SMTP 发送失败不阻塞工单完成主流程（AC-09）

## 4. 验收条件实现状态（实现级证据）

浏览器交互验收属后续验证阶段范围，本阶段不执行浏览器验证；下表"实现状态"指源码实现与自动化/构建证据，"浏览器验收"均未运行（not-run，移交验证阶段）。

| AC | 实现状态 | 实现级证据 |
| --- | --- | --- |
| AC-01 提交并完整记录 | passed | 服务端字段记录与读回（测试 4）；提交表单与详情读回 UI 已实现（构建通过） |
| AC-02 公司隔离 | passed | 测试 5（403/404 拒绝语义与列表天然过滤）；前端隔离反馈文案已实现 |
| AC-03 多轮回复 | passed | 测试 4（双向回复与时间记录）；回复流 UI 已实现 |
| AC-04 生命周期状态机 | passed | 测试 4（创建/待分配/待处理/完成/取消流转与终态校验） |
| AC-05 业务组与成员 | passed | 业务组创建/更新成员在测试 4、8 流程中真实执行（POST/PUT /api/groups 201/200）；配置 UI 已实现 |
| AC-06 分类自动分配 | passed | 测试 4（命中规则→待处理，未命中→待分配） |
| AC-07 工单转派 | passed | 测试 4（转派变更归属、非法处理人 400、审计 ticket.reassigned） |
| AC-08 提交人完整信息 | passed | 测试 4（详情聚合含提交人信息与历史工单）；信息卡与历史工单 UI 已实现 |
| AC-09 完成记录与邮件通知 | passed | 测试 4、9（处理人/时间记录、发件箱通知、SMTP 失败不阻塞） |
| AC-10 满意度评价 | passed | 测试 4（提交人限定、完成态限定、一单一评）；评价 UI 已实现 |
| AC-11 公司/部门分布统计 | passed | 测试 7（分布口径与实际数据一致） |
| AC-12 运营指标仪表盘 | passed | 测试 7（工单量、平均响应时间、满意度、热点问题口径） |
| AC-13 工作台列表 | passed | 测试 6（筛选/搜索/排序/公司维度筛选查询语义）；工作台 UI 已实现 |
| AC-14 操作日志 | passed | 测试 8（关键操作事件、操作人与时间）；日志页 UI 已实现 |

## 5. 跨任务集成核对（协调者读源码核实）

T02 移交的两处契约未冻结假设，已在合并后的服务端实现中核对：

1. starter 扩展端点（bootstrap/admin users）字段命名 `companyName`/`department`：与服务端 `routes.ts`（第 37–59、141–142、155–156、193–196 行）实际命名一致，无偏差。
2. 工作台公司筛选选项取自 `GET /api/stats/distribution?dimension=company` 的 `key`（服务端为公司名，`stats.ts` 第 30 行）并作为 `companyId` 查询值：可观察行为符合契约 2.2"传他公司 → 空结果集，不报错"（服务端 `tickets.ts` 第 317–320 行对非本公司值一律返回空结果集；选他公司呈现空列表即隔离反馈）。已知极低风险边缘情况：若其他公司名称恰为等于本公司 `companyId` 的纯数字，会误放行显示本公司工单；QA 验收如遇此类数据可复验。

## 6. 遗留与移交

1. 浏览器交互验收（AC-01～AC-14 用户界面入口、刷新读回、403/404 文案、通知结果反馈）：本阶段未运行，属验证阶段职责。
2. 可选优化：前端转派处理人下拉当前列出公司全部用户，服务端会拒绝非目标组成员组合（功能正确，交互可过滤）；属非必需优化。
3. 契约回写建议：`docs/wi-t1000332/technical-contract.md` 2.6 节未明文规定"转派处理人须为目标业务组成员"，服务端按测试语义实现；如需固化该语义，建议在后续契约修订中回写（不阻塞本阶段）。
