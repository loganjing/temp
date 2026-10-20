# 开发实现结算报告

- Work Item：wi-t1000312
- 业务任务：126-ticket（工单系统）
- 阶段：implementation（本次授权范围仅此阶段）
- 日期：2026-10-20
- 批准计划：`plan:e5b1f7d2-e82b-43cd-b34c-c2d5f8c127e0`（`docs/wi-t1000312/development-task-plan.json`，sha256:933853a9b3dc685105484ebafd01490f23a751f23ae4894234d21ba8f8ef223d）
- 计划批准回执：`approval:general-application-development-spec:approve_plan:implementation:3`（批准人：荆龙刚，2026-10-20T07:09:43Z）

## 1. 执行摘要

批准计划包含两个并行实现任务（同 capability `engineering.implementation`、同专家），全部完成：

| 任务 | 范围 | attempt | 执行 ID | 结果 |
| --- | --- | --- | --- | --- |
| T01 | 服务端业务 API、数据迁移、种子数据、服务端集成测试 | 1（实现） | ses_ea7da4fa6ffeo1zLYA66BlEnbp | completed |
| T01 | 同上（返工：修复 finding F1 测试偶发失败） | 2（qa-repair） | ses_ea7adb1d7ffeAb4bn66xWg3g12 | completed，fixedFindingIds=[F1] |
| T02 | React SPA 全部页面、路由、API 集成 | 1（实现） | ses_ea7da44eeffeKsR3NX24K1aMNw | completed |

合并状态（前后端代码共存）下由协调者复核验证全部通过：`npm test` 19/19、`npm run build`（服务端+客户端类型检查 + Vite 生产构建）通过；预览服务已在注册后台作业上启动并确认健康。

## 2. 交付产物

| 产物 | 大小 | sha256 | owner |
| --- | --- | --- | --- |
| `app/ticket-system/src/server/` | 78,715 bytes | sha256:2076e96a70228fb8be3b2b2d23053ed2112c850eceafaa7eb06065a5367f397c | T01 |
| `app/ticket-system/src/shared/` | 6,548 bytes | sha256:0de2928ed29cefec4a286228f4f9dd46a2ae40e8a114ea4f1b9fc8d2163db6f0 | T01 |
| `app/ticket-system/test/` | 51,141 bytes | sha256:ca92b6308488bf26b32551d318b1c0ee2a032e7c4f5088fb1aa2c927df481be8 | T01 |
| `app/ticket-system/src/client/` | 116,903 bytes | sha256:791fc715d8fe8cf6d9088c78719152972f39f44fb2a807057067bf0772998137 | T02 |

写入范围符合计划声明：T01 写 `src/server/`、`src/shared/`、`test/`（`package.json` 未变更）；T02 写 `src/client/`、`index.html`（标题改为“工单系统”）；无越界写入。

### 服务端交付要点（T01）

- 身份与登录：authkit 密码登录（限流 429、停用 401、错误凭证 401）、`/api/me`、handler/admin 用户列表（submitter 403）。
- 工单域：创建（事务内发号 `TK-xxxxxx` + 分类规则自动分配 + 创建日志）、列表（状态/公司/分类/优先级筛选、关键词搜索、排序、分页、公司行级隔离）、详情、人工分配、转派、完成、取消、提交人完整信息与历史工单。
- 回复与评价：多轮回复（首条回复回填 `firstReplyAt`）、1-5 分满意度评价（一工单一评，重复 409）。
- 日志与通知：七类工单操作日志（创建/分配/转派/回复/完成/取消/评价）；完成邮件通知经 emailkit 发送并落 `notifications` 记录（sent/skipped/failed）。
- 统计：按公司/部门分布、工单量、平均响应时间（分钟、1 位小数）、满意度均分与评价数、热点分类 Top5。
- 迁移与种子：`0002_business_schema.sql`（companies、user_profiles、groups、group_members、category_rules、tickets、ticket_sequence、replies、ratings、ticket_logs、notifications）、`0003_business_seed.sql`（2 家公司、11 个用户含 1 个停用账号、3 个业务组、10 张已知分布工单）。

### 前端交付要点（T02）

- 登录页（错误文案区分凭证错误/停用/限流）与认证状态（token 持久化、401 统一处理、按角色首页跳转与导航显隐）。
- 工作台（master-detail：状态/公司/分类/优先级筛选、关键词搜索、三种排序+方向、清除恢复默认、分页）。
- 我的工单 + 新建工单弹窗（主题/描述/分类/P0-P4）；工单详情（基础信息、提交人完整信息卡含历史工单入口、多轮回复流、按角色与状态渲染的分配/转派/完成/取消操作、满意度评价区、操作日志、通知记录）。
- 统计分析页（公司范围筛选、公司/部门维度切换、KPI 行、分布条形图+明细列表）；配置管理页（业务组与成员全量维护、分类分配规则增删）。
- 契约类型从 `technical-contract.md` 转写于 `src/client/api/types.ts`，不依赖并行任务的 `src/shared/` 产物；全局状态基线（骨架屏、空态、错误条、403/404 提示、toast、可截断文本展开）。

## 3. 返工记录（finding F1）

- **发现**：协调者在合并状态复核 `npm test` 时观察到偶发失败（一次 19/19 通过、一次 18/19 失败，失败均为「multi-round replies record author and time and backfill first reply」；单文件运行通过）。
- **根因**：该用例第 264 行断言两次回复 `createdAt` 严格大于，而契约 §1 仅承诺毫秒精度 ISO 8601 时间戳；全量并发下两次请求落在同一毫秒即失败。属交付测试套件的稳定性缺陷，非产品行为缺陷。
- **处置**：按正式返工流程 reopen T01（repairId `cli:reopen:T01:ffffc6c0-89be-4d10-b65d-619dd362808b:T01:2`），原 owner 以 attempt 2 修复：断言改为 `>=`（时间不回退，对齐毫秒精度契约）并新增确定性可区分断言（回复列表按 `(createdAt, id)` 稳定排序，第 2、3 项的 `id`/`authorId` 分别对应两轮回复人）——`test/tickets.test.mjs:264-278`。未修改产品代码、契约与产品行为。
- **复验**：原 owner 连续 3 次 `npm test` 均 19/19；协调者修复后合并状态再跑 `npm test` 19/19（见 §4）。

## 4. 验证证据（真实命令与结果，工作目录 `app/ticket-system`）

| 时间 | 执行者 | 命令 | 结果 |
| --- | --- | --- | --- |
| 2026-10-20 | T01 attempt 1 | `npm run typecheck:server` | 通过（exit 0） |
| 2026-10-20 | T01 attempt 1 | `npm test` | 19/19 通过 |
| 2026-10-20 | T01 attempt 1 | `npm run build` | 通过（server+client 类型检查 + Vite 构建） |
| 2026-10-20 | T02 | `npm run typecheck:client` | 通过（exit 0；曾发现 1 处类型错误，修正后复跑通过） |
| 2026-10-20 | T02 | `npm run build:client` | 通过（63 模块；CSS 19.96 kB、JS 225.93 kB） |
| 2026-10-20 | 协调者（修复前合并状态） | `npm test` | 一次 19/19、一次 18/19（偶发失败，形成 finding F1） |
| 2026-10-20 | T01 attempt 2 | `npm run typecheck:server`；`npm test` ×3 连续 | 全部通过，3 次均 19/19 |
| 2026-10-20 | 协调者（修复后合并状态） | `npm test` | 19/19 通过、0 失败 |
| 2026-10-20 | 协调者（修复后合并状态） | `npm run build` | 通过（typecheck:server + typecheck:client + vite build，63 模块） |

**预览服务（本阶段注册后台作业，供预览不构成浏览器验证）**：`PORT=3312 npm start`，启动日志 `[ticket-system] server listening on :3312`；`GET /` → 200；`GET /api/health` → 200；种子账号 `submitter.a1@example.com` 登录成功（返回 token 与含部门/公司的用户对象）。预览地址：http://localhost:3312

**跨任务对齐点复核**：`GET /api/me` 响应形状契约存在“裸用户对象 vs 包裹结构”歧义，两端实现一致采用裸用户对象（含 `companyName`）：服务端 `src/server/routes.ts:36` + `src/server/services/users.ts:14`，客户端 `src/client/api/auth.ts:9`（`CurrentUser` 类型）——无实际冲突。

## 5. 验收条件状态（implementation 阶段口径）

“服务端行为”证据为真实 HTTP 集成测试用例；“前端界面”证据为已交付页面/组件通过局部类型检查与生产构建；浏览器级验收（runtime-render / interaction / session-persistence 证据）属后续验证阶段职责，本次授权范围不含该阶段，全部记为 **not-run**。

| AC | 服务端行为证据（test/ 用例） | 前端界面交付 | 浏览器验收 |
| --- | --- | --- | --- |
| AC-01 创建读回 | ticket creation auto-assigns by category rule and reads back all fields | 新建工单表单 + 详情读回 | not-run |
| AC-02 生命周期 | lifecycle transitions persist and reject invalid repeats | 状态徽章 + 按状态渲染操作 | not-run |
| AC-03 公司隔离 | ticket data is isolated per company with 404 non-disclosure | 列表/搜索/详情越权提示（不泄露存在性） | not-run |
| AC-04 多轮回复 | multi-round replies record author and time and backfill first reply | 回复流 + 按角色回复表单 | not-run |
| AC-05 业务组配置 | companies, groups, members and category rules are manageable | 配置管理页（组/成员/规则） | not-run |
| AC-06 自动分配 | ticket creation auto-assigns by category rule and reads back all fields | 提交表单无业务组字段 | not-run |
| AC-07 转派追溯 | reassign changes ownership with traceable logs | 转派操作（组/处理人） | not-run |
| AC-08 提交人完整信息 | handler sees submitter full info with history tickets | 提交人信息卡 + 历史工单入口 | not-run |
| AC-09 完成与通知 | completion records handler, notification and rating flow | 完成操作 + 通知记录区 | not-run |
| AC-10 满意度评价 | completion records handler, notification and rating flow（评价 1-5、重复 409、越权 403） | 满意度评价区（1-5 星） | not-run |
| AC-11 工作台 | workbench supports filters, search, sort, company scope and pagination | 工作台筛选/搜索/排序/公司维度控件 | not-run |
| AC-12 统计仪表盘 | stats distribution and dashboard match seeded data | 统计页（KPI + 分布） | not-run |
| AC-13 操作日志 | ticket logs record all operations in time order | 工单详情操作日志区 | not-run |

## 6. 边界与遗留说明

- 本阶段授权范围仅为 implementation；工作项的 verification/QA 阶段未在本范围执行，浏览器级验收证据见 §5 的 not-run 记录。
- SMTP 未配置（设计既定承载方式）：工单完成邮件在 `notifications` 表记录为 `skipped`，不影响工单完成事务；后续配置 `SMTP_HOST` 等环境变量即可真实投递。
- `app/ticket-system/data/`（本地 SQLite 运行数据）与 `dist/`（构建产物）均为 gitignore 的运行时产物，不属交付源码。
- 种子账号密码统一为 `Passw0rd!`（见 `test/app-fixture.mjs` 的 seed 常量，与 `0003_business_seed.sql` 对应），供验收与预览使用。

## 附录：测试用例清单（19/19 通过）

1. selected authkit boundary rejects requests without a valid token
2. login rejects bad credentials and disabled accounts with contract error codes
3. login rate limit returns 429 after ten attempts in the window
4. dbkit startup opens SQLite, applies migrations, and closes
5. platform serves a real HTTP API and keeps unknown API paths out of the SPA
6. unexpected server errors do not expose their details
7. me returns session user with company and department
8. ticket data is isolated per company with 404 non-disclosure
9. ticket creation auto-assigns by category rule and reads back all fields
10. lifecycle transitions persist and reject invalid repeats
11. multi-round replies record author and time and backfill first reply
12. reassign changes ownership with traceable logs
13. completion records handler, notification and rating flow
14. handler sees submitter full info with history tickets
15. workbench supports filters, search, sort, company scope and pagination
16. stats distribution and dashboard match seeded data
17. ticket logs record all operations in time order
18. companies, groups, members and category rules are manageable
19. user listing is available to handlers with role and department
