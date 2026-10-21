# 实现阶段报告（128-ticket 工单系统 · wi-t1000316）

## 1. 阶段结论

**开发实现已完成**。按已批准开发任务计划（`planId: plan:062643dc-d48d-48c0-9bef-a567e9537dbd`）以同专家前后端两个并行任务完成 `app/ticket-system` 全栈实现：

| 任务 | 范围 | 状态 | 结算产物 |
| --- | --- | --- | --- |
| T01 服务端 | 数据迁移、契约 §4 全部 REST API、状态机、邮件通知、统计、种子脚本 | completed（attempt 1） | `app/ticket-system/src/server/`（sha256:ec4e3118e3f3798ed5d2de7d35a316a4dde35880da990e7b73b03c04ac72601c） |
| T02 前端 | React SPA：登录、工作台、详情、统计、配置、用户管理 | completed（attempt 2，qa-repair 修复 DEV-001） | `app/ticket-system/src/client/`（返工产物哈希见 §5.2） |

执行说明：T01 首轮在产出最终报告前异常中断（子会话 UnknownError），经父会话恢复续跑后完成收尾验证并结算；两任务写入范围均未越界（git 状态核对）。T02 第 2 次派发为验证阶段缺陷返工（finding DEV-001，repairId verification:4:repair:T02:T02:2），已完成修复并结算。

## 2. 实现内容

### 2.1 服务端（T01）

- `src/server/migrations/sqlite/0002_ticket_system.sql`：10 张业务表与索引（companies、user_profiles、groups、group_members、company_categories、category_rules、tickets、ticket_replies、ratings、ticket_activity、notification_log）。
- `src/server/http.ts`、`context.ts`、`notifications.ts`、`assignment.ts`、`tickets.ts`、`stats.ts`、`seed.ts`：统一错误结构、认证用户上下文（公司隔离边界）、完成通知邮件（emailkit，空 SMTP_HOST 降级 skipped，失败不回滚完成）、业务组/成员/分类/规则配置与自动分配、工单五状态机（创建→待分配→待处理→完成/取消）、多轮回复、评价、统计聚合、幂等种子。
- `src/server/routes.ts`：契约 §4 全部 REST 路由装配；`platform/auth.ts`、`bootstrap.ts`：userkit 身份解析（含 403 短路修复）、emailkit 集成。
- `scripts/seed.ts` + `package.json` `seed` 脚本；`test/ticket-domain.test.mjs`（9 个业务测试）。
- 用户管理路由叠加 company_admin 角色守卫（架构基线固定约束）。

### 2.2 前端（T02）

- 契约层：`platform/types.ts`、`platform/api-client.ts`（Bearer 认证、统一错误解码、401 全局跳登录）、`api/auth.ts`、`api/tickets.ts`、`api/admin.ts`、`api/stats.ts`（23 个契约端点）。
- 应用壳：`auth/AuthContext.tsx`、`auth/LoginPage.tsx`、`components/AppShell.tsx`（左侧导航 + 顶部上下文栏，配置与用户管理仅 company_admin 可见）、统一反馈/徽章/分页组件、Modern SaaS Tailwind 基线。
- 页面：`tickets/TicketCreatePage.tsx`（两步流：create → dispatch）、`tickets/TicketWorkspace.tsx`（split-master-detail，筛选/搜索/排序/分页，URL 承载状态）、`tickets/TicketDetail.tsx`（提交人信息面板 + 历史工单、多轮回复流、转派/完成/取消、满意度评价、操作日志、通知记录）、`stats/StatsPage.tsx`（仪表盘指标 + 公司/部门分布）、`admin/GroupsPage.tsx`（业务组/成员/分类/规则配置）、`admin/UsersPage.tsx`（用户管理 + department/role 字段）。

## 3. 验证证据（实际执行，工作目录 `app/ticket-system/`）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 服务端类型检查 | `npm run typecheck:server` | EXIT=0 |
| 客户端类型检查 | `npm run typecheck:client` | EXIT=0 |
| 整包构建（聚合） | `npm run build` | EXIT=0 |
| 测试套件 | `npm test` | 12 pass / 0 fail |
| 种子幂等 | `DB_PATH=/tmp/seed-idem.db npm run seed` 连跑两次 | 计数一致：companies=2、user_profiles=8、groups=4、group_members=4、company_categories=8、category_rules=2、tickets=0、notification_log=0 |
| 真实服务器 HTTP 冒烟（T01，PORT=4517，临时 DB，已清理） | 未认证 401；临时密码 403 PASSWORD_CHANGE_REQUIRED → 改密 200 → 恢复 200；create 201 → dispatch（规则命中→processing、未命中→pending_assignment）→ 重复 dispatch 409；reply 201；complete 200 + notification skipped；rating 201 / 重复 409；transfer 200；cancel 200 / 重复 409 / 对 cancelled complete 409；详情含 ticket/replies/activity/notifications/rating/submitter.historyTickets；跨公司 404 与空列表；admin 配置与用户管理；dashboard/distribution | 全部符合契约 |
| 前端生产构建（T02） | `npm run build:client` | EXIT=0，54 modules，dist 246 KB（gzip 74 KB） |

## 4. AC 覆盖情况（实现阶段）

两条任务对全部 12 条验收标准均有实现贡献（AC-01～AC-12），服务端承载行为语义、前端承载用户界面。实现阶段证据以上表为准；**浏览器端到端验收未执行，属后续验证阶段职责**（AC 证据类型含 interaction/runtime-render/session-persistence 的部分留待验证阶段核验）。

## 5. 集成点与关键修复

- 契约对齐：GET /api/categories 与 GET /api/groups 对本公司任意登录用户开放读（提交人创建工单、agent 转派所需），写操作限 company_admin；冒烟实证 submitter 读 categories 200。
- 用户管理：POST /api/admin/users、PUT /api/admin/users/:id 接受并维护 department/role，同步 user_profiles（测试覆盖）；新建用户 passwordChangeRequired 流程：改密前业务 API 403、改密后恢复。
- 关键缺陷修复（T01）：authkit 短路分支 `context.json(403)` 未落 `context.res`，经 locale 中间件透传 Context 导致真实 HTTP 下 500 RangeError；修复为 `context.res = context.json(..., 403)`（`src/server/platform/auth.ts`），真实 HTTP 复现验证通过。

### 5.2 返工（T02 attempt 2，修复 DEV-001）

- **根因**：`useResource` 的 `useEffect` 以 loader 函数引用为重载依赖，9 处调用点传入内联箭头函数导致每次渲染触发 refetch，形成无限请求循环（QA 观测约 370 req/s、页面冻结）。
- **修复**：调用方全部改用 `useCallback` 稳定回调（5 个文件：`TicketCreatePage.tsx`、`TicketWorkspace.tsx`、`TicketDetail.tsx`、`GroupsPage.tsx`、`StatsPage.tsx`），每处附注释防回归；`hooks/useResource.ts` 语义不变（loader 引用变化或显式 `reload()` 时重载）。静态复核确认 client 内其余 `useEffect` 依赖均为稳定值，无同类隐患。
- **开发侧验证**：`npm run typecheck:client` EXIT=0；`npm run build:client` EXIT=0（54 modules）。
- **返工结算产物**（attempt 2，sha256）：`tickets/TicketCreatePage.tsx` sha256:738a93b9c253acace200e1165264caafc7709f93ddf4745dddc1bda532aa0655、`tickets/TicketWorkspace.tsx` sha256:0bee45ea8302bae9ec21014138c794f99ee427717fa59a50b5abec006313acd2、`tickets/TicketDetail.tsx` sha256:2f9b6fee59652de97a2d3bb0399b6cfbe8dbb824d0eb46f04dca021ce9b13acf、`admin/GroupsPage.tsx` sha256:00724aea80614feb216f3a8d96df9922c1842e084fc278a559d0b9e0f7b05a29、`stats/StatsPage.tsx` sha256:5ec4b677a852220fec4d7364f49057adbb776b8ad92d41dc06c8e4b5d6ec6696。
- 浏览器端复验（返工要求中的复跑 browser-ui 检查）按任务边界移交本 Work Item 的验证阶段执行。

## 6. 边界与移交

- 浏览器端到端验收（登录闭环、创建→dispatch 两步流、回复流、转派/完成/取消、评价读回、统计口径一致性）移交后续验证阶段执行。
- 本阶段写入范围：`app/ticket-system/src/server/`、`src/client/`、`test/`、`scripts/`、`src/shared/`（未写入）、`data/`（运行时）、`package.json`（seed 脚本）、`index.html`、`vite.config.ts`、`tailwind.config.js`、`postcss.config.js`、`dist/`（构建产物）及本 WorkItem 文档目录；未越界。
- 运行入口：工作区根 `npm run build && npm start`（PORT 默认 3000）；种子 `npm run seed`；数据库 `DB_PATH`（默认 `./data/application.db`）。
