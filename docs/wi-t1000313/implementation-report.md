# 开发实现报告（127-ticket 工单系统）

> 工作项：wi-t1000313 ｜ 阶段：Development Implementation（开发实现）｜ 计划：`docs/wi-t1000313/development-task-plan.json`（plan:29df2af3-c0aa-441b-aca5-27611e05f76d）｜ 需求基线：`docs/wi-t1000313/requirements.md` ｜ 架构基线：`docs/wi-t1000313/architecture-baseline.md` ｜ 技术契约：`docs/wi-t1000313/technical-contract.md`

## 1. 阶段结论

工单系统（`app/ticket-system`，Hono + React/Vite SPA + SQLite）按已批准技术契约实现完成。计划拆分为同专家前后端两个并行任务，均一次通过：

| 任务 | 范围 | 状态 | 层级验证 |
|---|---|---|---|
| T01 后端 | `src/server/`、`src/shared/`、`test/` | completed（attempt 1） | `npm run typecheck:server` 通过；`npm test` 6/6 通过 |
| T02 前端 | `src/client/`、`index.html` | completed（attempt 1） | `npm run typecheck:client` 通过；`npm run build:client` 通过 |

合并整合验证（父会话在 packageRoot 下执行）：`npm run build`（typecheck:server ✓ + typecheck:client ✓ + vite build 54 modules ✓）；`npm test` 6/6 通过（platform 2、dbkit 1、ticket-flow 3）。测试输出中的 RangeError 堆栈来自平台测试故意触发的 500 场景日志（该用例本身通过），非缺陷。

## 2. 交付产物

| 产物 | 字节 | SHA-256 |
|---|---|---|
| `app/ticket-system/src/server/` | 87008 | `c1dc5d769a814d07254503a5746cf529035f902f9b6e2d8c95f178707439171b` |
| `app/ticket-system/src/shared/` | 4459 | `53c6e70d7adde164cd60664a8e991c14871d041bcc6034a4872259006c981929` |
| `app/ticket-system/src/client/` | 152252 | `1a0cb2782a86d7407d986faa5f5cc8a27454eec03b5cc41dfa0dc3f5ded22610` |
| `app/ticket-system/test/` | 38893 | `36c3f4cc57b648983ae03ddf553f1f00f2b48aaca763ba4d51fa7a060731297b` |

### 2.1 后端（T01）

- 迁移 `src/server/migrations/sqlite/0005_ticket_system.sql`：项目表 `companies`、`user_profiles`、`business_groups`、`business_group_members`、`assignment_rules`、`tickets`、`ticket_replies`、`ticket_ratings`，`categories` 表及 6 条推荐基线分类种子；模块表（`platform_users`、`platform_audit_events`）沿用 vendor 迁移。
- 平台层：`platform/auth.ts`（登录绑定 `user_profiles`，角色/公司只来自服务端 JOIN 结果，登录响应携带 CurrentUser，统一错误模型）、`platform/audit.ts`（审计写入经 auditkit、支持事务内写入）、`platform/email.ts`（SMTP 未配置时如实记为失败）、`platform/bootstrap.ts`（组装 db/auth/audit/email，首个 bootstrap 账户同事务创建初始公司+ops 档案）。
- 服务层 `src/server/services/`：工单全生命周期（创建含 `TKT-NNNNNN` 序号与创建请求内自动分配、列表筛选/搜索/排序/分页、多轮回复、手动分配、转派、完成含事务内处理记录与事务后邮件、取消、满意度评价、提交人完整视图）、业务组/成员/分配规则、公司/用户档案管理、统计聚合（分布与仪表盘）、授权数据域校验（越域 404、越权 403）。
- `src/shared/`：平台中立契约类型与常量（角色、状态、优先级、分类）。

### 2.2 前端（T02）

- 登录与全局壳（`AppShell`、`LoginScreen`、auth state），左侧导航（工作台、我的工单、统计、审计、管理）+ 顶部上下文栏。
- 工单工作台 `TicketListPanel`（待处理列表，公司/状态/分类/优先级筛选、搜索、排序、分页）、工单详情 `TicketDetailPanel`（工单字段、提交人信息面板含历史工单、回复时间线、分配/转派/完成/取消/评价操作区）、创建表单 `CreateTicketForm`。
- 统计仪表盘（公司/部门维度切换、KPI 卡、热点分类）、审计检索页、管理页 `AdminSections`（公司、用户档案、业务组与成员、分配规则）。
- API 集成经 `src/client/platform/api-client.ts` 单一边界，契约推导类型（`contracts.ts`）；图标为内联 SVG，未新增依赖（package.json 零改动）。
- 视觉遵循架构基线（split-master-detail、Modern SaaS、Tailwind 浅色）；越域 404 与越权 403 有明确文案。

## 3. 验收标准证据（AC-01～AC-14）

实现层证据来自真实服务端集成测试（隔离 SQLite 库 + 真实 HTTP 服务）与前端类型检查/构建；浏览器交互层验证属于后续验证阶段（本阶段不执行浏览器验证）。

| AC | 实现层证据 | 状态 | 浏览器运行时验证 |
|---|---|---|---|
| AC-01 创建工单记录完整信息 | ticket-flow 测试覆盖创建+详情读回；前端表单与详情面板实现 | passed | not-run（验证阶段） |
| AC-02 多轮回复记录回复人与时间 | 服务端测试覆盖回复；前端回复时间线实现 | passed | not-run |
| AC-03 公司隔离 | 服务端测试覆盖跨公司访问 404（不泄露内容）；前端 404/403 文案实现 | passed | not-run |
| AC-04 生命周期流转与终态 | 服务端测试覆盖状态机（分配→待处理→完成；终态 409 INVALID_STATE；取消终态）；前端状态与操作区实现 | passed | not-run |
| AC-05 业务组与成员管理 | 服务端测试覆盖；前端管理区实现 | passed | not-run |
| AC-06 按分类自动分配 | 服务端测试覆盖规则命中自动分配（in_progress）与无匹配保持 pending_assignment | passed | not-run |
| AC-07 工单转派 | 服务端测试覆盖转派保持 in_progress 与审计可追溯；前端转派操作实现 | passed | not-run |
| AC-08 提交人完整信息与处理记录 | 服务端测试覆盖提交人视图（姓名/公司/部门/历史工单）与完成记录处理人/处理时间；前端信息面板实现 | passed | not-run |
| AC-09 完成邮件通知 | 完成事务提交后经 emailkit 触发，发送/失败结果写审计 `email.notification_sent|failed`（测试覆盖 SMTP 未配置失败路径）；真实送达需部署方 SMTP 配置 | passed（触发链路与审计）；真实送达待 SMTP 配置 | not-run |
| AC-10 满意度评价 | 服务端测试覆盖评价（1–5 分、每工单一次、ALREADY_RATED）；前端评价操作实现 | passed | not-run |
| AC-11 公司/部门分布统计 | 服务端测试覆盖分布口径（部门 NULL 归“未填写”）；前端维度切换实现 | passed | not-run |
| AC-12 运营仪表盘指标 | 服务端测试覆盖工单量/平均响应时间/满意度/热点分类口径；前端 KPI 卡实现 | passed | not-run |
| AC-13 工作台列表 | 服务端测试覆盖 scope/筛选/搜索/排序/分页与非 ops 传 company_id 403；前端工作台实现 | passed | not-run |
| AC-14 关键操作日志 | 服务端测试覆盖审计检索（按工单/公司/动作）与动作枚举写入；前端审计页实现 | passed | not-run |

## 4. 契约差异记录（目标与实现证据差异）

1. **用户 ID 类型**：契约第 3/5 节标注 INTEGER，userkit 实际 `users.id` 为 TEXT UUID；项目表用户外键及 API 用户 id 字段按 UUID 字符串实现。影响：契约文档类型标注需修订（owner：契约作者/后续文档修订）；API 行为已按契约语义交付，运行不受影响。
2. **移除 starter 端点**：`/api/admin/users/:id/status`、`/api/admin/users/:id/password` 不在契约端点集合内，已移除；原依赖的 starter `UsersPage` 由前端任务以契约端点重建为 `AdminSections`。
3. **审计检索过滤**：auditkit list API 不支持 ticket_id/company_id 过滤，检索以直查 SQL + `json_extract` 实现，契约对外行为（`/api/audit-events` 过滤参数与响应）不变。

## 5. 遗留事项（后续阶段处理）

- 端到端浏览器联调与全部 AC 的运行时交互验证：属于后续验证阶段（implementation 阶段不执行浏览器验证）。
- AC-09 真实邮件送达：依赖部署方提供可用 SMTP 配置（`SMTP_HOST` 等）；无配置时通知失败被如实记录，不改变工单状态。
- 前端 CompanyDirectory 对 handler 使用 `/api/statistics/distribution` 的 `label` 解析公司名（key=company_id）：推断若不成立则回退显示「公司 #id」，不阻塞验收，端到端验证时确认。
