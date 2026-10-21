# 工单系统实现报告（136-ticket）

> 工作项：wi-t1000334 · 阶段：implementation · 计划：plan:619a514e-5bc0-4955-91c5-394e9b806084（2 个并行任务，均一次执行成功）

## 1. 阶段执行概览

按已批准的需求（requirements.md）、架构基线（architecture-baseline.md）与技术契约（technical-contract.md），以同专家前后端两任务并行实现完成开发：

| 任务 | 范围 | 产物 | 状态 |
| --- | --- | --- | --- |
| T01 服务端 | 迁移与种子、登录会话、工单生命周期与公司隔离、业务组与自动分配、完成通知发件箱、统计聚合、操作日志与全部 REST 接口 | `app/ticket-system/src/server/` | completed |
| T02 前端 | 登录与应用壳、工作台与我的工单主从视图、工单详情全量操作、业务组、分配规则、统计仪表盘、邮件记录页面 | `app/ticket-system/src/client/` | completed |

两任务均无依赖、并行执行，写入边界互不重叠（服务端独占 `src/server/` 与 `test/`，前端独占 `src/client/` 与包级样式/入口配置及依赖清单），`src/shared/` 保持未写入。

## 2. 交付内容

### 2.1 T01 服务端（`app/ticket-system/src/server/`）

- 数据层：`0004` 起工单域迁移与种子（2 家公司、8 个问题分类、4 个演示账号，密码 scrypt 哈希内嵌预计算常量），复用 `0003` 审计表迁移；表、约束与索引按架构基线 §4.1。
- 领域层：IdentityService（登录/登出/me、令牌哈希会话）、TicketService（创建含按分类自动分配尝试、多轮回复含首条回复回写、手动分配、转派、完成含同事务发件箱写入、取消、满意度评价）、AssignmentService（业务组与成员、分类分配规则、自动分配解析）、NotificationService（完成通知入 mail_outbox，记录式投递）、StatsService（工单量、平均响应时间、满意度、热点分类、公司/部门分布）、OperationLog 端口（经 auditkit 写 8 类工单事件并按工单查询时间线）。
- 接口层：Hono 路由、参数校验、统一错误映射（401/403/404/409/422），公司隔离与状态机按技术契约 §9，跨公司统一 404 语义；业务写与审计事件同事务。
- 测试：新增 `test/tickets.test.mjs` 域测试（13 用例），保留既有 auth/dbkit/platform 基线测试；全部使用独立临时数据库隔离。

### 2.2 T02 前端（`app/ticket-system/src/client/`，23 个源码文件）

- 契约层：`api/types.ts` 逐字段对齐技术契约 §3–§7；`api/endpoints.ts` 封装全部 22 个端点，不发明 API 行为。
- 请求边界：Bearer 令牌自动注入、统一错误体解码、401 回调跳登录、令牌 localStorage 持久化与会话恢复。
- 应用壳：左侧六项主导航（工作台、我的工单、业务组、分配规则、统计仪表盘、邮件记录）+ 顶栏用户姓名/公司与退出登录。
- 工作台/我的工单：split-master-detail 队列 + 详情；筛选（状态/分类/优先级/公司）、搜索（主题关键字与工单编号）、排序（创建时间/优先级）可组合；详情含提交人信息面板（姓名、公司、部门、历史工单）、多轮回复、操作时间线与分配/转派/完成/取消/评价操作，终态冲突与 404 内联错误反馈。
- 业务组、分配规则、统计仪表盘、邮件记录四个控制台式页面；Modern SaaS 视觉预设、Tailwind、Lucide 图标（新增 `lucide-react` 依赖并更新根锁文件）。

## 3. 验证结果（真实执行记录）

| 检查 | 命令（工作目录 `app/ticket-system/`） | 结果 |
| --- | --- | --- |
| 服务端类型检查 | `npm run typecheck:server` | 通过 |
| 服务端域测试 | `node --import tsx --test test/tickets.test.mjs` | 13/13 通过 |
| 全量测试 | `npm test` | 23/23 通过（auth、dbkit、platform、domain） |
| 客户端类型检查 | `npm run typecheck:client` | 通过（退出码 0） |
| 客户端构建 | `npm run build:client`（vite build） | 通过（1970 模块；JS 260.7 kB、CSS 22.7 kB） |
| 聚合构建（两端合并后） | `npm run build` | 通过（typecheck 全量 + vite build） |
| 依赖安装 | `npm install lucide-react -w ticket-system` | 通过，`package.json` 与根 `package-lock.json` 已更新 |

T01 执行中曾修正 4 处测试侧断言缺陷（分配 404 场景、统计口径计数、Response 体重复读取、优先级排序范围），均为测试侧问题，服务端行为复核符合契约；修正后全部测试通过。

## 4. 验收标准状态

AC-01 至 AC-12 的服务端业务规则与接口、前端界面与交互均已实现并通过各自层级验证（测试、类型检查、构建）。其中：

- 服务端可自动化断言（生命周期流转与终态拒绝、公司隔离 404、按分类自动分配、完成通知发件箱、评价唯一、统计口径、列表筛选/搜索/排序语义、审计事件）在 `test/tickets.test.mjs` 中以真实 HTTP 端到端方式验证通过。
- 浏览器端到端验收（runtime-render、interaction、session-persistence 等证据类型）不在本阶段范围，归后续验证阶段执行。
- 两个任务对每条 AC 的贡献划分见 development-task-plan.md 任务契约。

## 5. 边界与遗留

- 浏览器端到端与跨用户旅程验证未在本阶段执行（本 WorkItem 指定阶段范围仅 implementation），后续验证阶段需启动真实服务（`npm start`，默认端口 3000）执行 AC 级浏览器验收。
- 邮件通知为记录式投递（mail_outbox 可查询），真实 SMTP 外发为架构基线声明的后续可选升级，不影响 AC-08 验收口径。
- 权限基线为「认证 + 同公司范围」（UV-01 未规定角色模型），RBAC 为后续升级路径。
