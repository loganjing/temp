# 132-ticket 工单系统 — 开发实现报告

阶段范围：implementation（本轮唯一执行阶段）。本报告记录两个并行实现任务的交付物、真实验证结果与验收条件状态，作为本地执行事实保存。

## 1. 执行概述

按已批准的开发任务计划（plan:5bfa961f-7bc0-40a7-9b85-734da3626fee），以"契约支撑的同专家前后端并行"方式派发两个实现任务，均一次尝试完成：

| 任务 | 范围 | 状态 | 产物（含摘要） |
|---|---|---|---|
| T01 | 服务端全部业务能力与 emailkit 接线 | completed | `app/ticket-system/src/server/`（85267 字节，sha256:678e9ffeb43a57cdf7d5c19bd77870862d1b36613a97a78c55b97ed6ec855cee）；另交付契约测试 `app/ticket-system/test/tickets.test.mjs`（写权限范围内，未作为产物申报） |
| T02 | 前端 SPA 全部页面与应用壳 | completed | `app/ticket-system/src/client/`（149638 字节，sha256:da47c76f326b24254470233a1a8c4def0c67c12f853a4e0ad986a2788f2c2b1b） |

## 2. 实现摘要

### 2.1 服务端（T01，工程能力 engineering.implementation / implement）

- **数据迁移**：`src/server/migrations/sqlite/0002_ticket_business_tables.sql` 落地全部业务表（companies、user_profiles、categories 含种子、business_groups、group_members、routing_rules、tickets、ticket_replies、ticket_logs、satisfaction_ratings、email_logs），索引与唯一约束遵循架构基线第 3 节。
- **领域服务**：`src/server/services/` 下 ticket（编号生成 TK-6 位零填充、状态机事务、回复、转派、完成、取消、评价、提交人完整信息与历史工单）、org-config（公司/业务组/成员/分类规则）、user-profile（开户与档案，含 userkit 用户管理 API 的 admin 角色检查收紧项）、notify（emailkit 接线：完成事务提交后发送通知，结果写 email_logs，SMTP 未配置记 skipped、异常记 failed，均不回滚工单完成）、stats（分布与仪表盘口径）、ticket-log（随业务变更同事务写入）。
- **路由与授权**：`src/server/routes/`（auth/org/stats/tickets/users）按技术契约 method/path、字段、错误码与授权矩阵落地；角色与公司隔离在服务端强制，越权访问返回 404 资源隐藏。
- **认证修正**：`GET /api/me` 路由路径、logout token 吊销（应用层吊销表 + 定期清理）。

### 2.2 前端（T02，工程能力 engineering.implementation / implement）

- **契约层**：`src/client/contracts/types.ts`（全部接口类型，以 technical-contract.md 为唯一来源）、`labels.ts`（状态/优先级/日志操作/角色/邮件状态中文静态映射）。
- **API 封装**：`src/client/platform/api-client.ts`（唯一请求边界：Bearer token、JSON 编码、`{error:{code,message}}` 解码、401 全局回调）+ `src/client/api/*` 真实契约调用，无契约外行为。
- **应用壳与页面**：登录页、按角色左侧导航与顶部上下文栏、403/404 提示页、全局加载/空态/错误/成功反馈；我的工单（列表+创建表单，SLA P0-P4 与分类选择）；工单详情（提交人信息卡、历史工单、回复时间线、日志视图、按角色渲染转派/完成/取消/评价、处理人与处理时间、满意度星级、邮件发送记录）；工作台（split-master-detail：待处理队列 + 公司筛选/工单号与主题搜索/创建时间与优先级排序 + 状态/优先级/分类筛选 + 分页）；分配配置（公司→业务组→成员→分类规则）；统计分析（公司/部门分布切换 + 仪表盘四项指标）；用户管理页 admin 专用化。
- **视觉**：Tailwind 工具类 + Modern SaaS（蓝色单一主色 + 语义状态色）；图标按 Lucide 规格在 `components/icons.tsx` 内实现子集（lucide-react 不在锁定依赖内且 package.json 非本任务可写）。

## 3. 验证结果（真实运行）

| 检查 | 执行位置 | 结果 |
|---|---|---|
| 全量测试（含隔离 HTTP 服务的契约测试） | 工作区根 `npm test` | tests 23 / pass 23 / fail 0（platform、dbkit、tickets 三个测试文件） |
| 聚合类型检查 + 前端构建 | 工作区根 `npm run build` | typecheck:server 通过、typecheck:client 通过、vite build 成功（54 模块，dist 产物生成） |
| 服务端契约测试（子任务内） | `node --import tsx --test app/ticket-system/test/tickets.test.mjs` | tests 20 / pass 20 / fail 0（AC-01..AC-13 服务端断言 + 登录限流/错误形状/授权边界） |
| 客户端类型检查与构建（子任务内） | `npm run typecheck:client`、`npm run build:client` | 退出码 0；构建产物生成 |
| 前后端契约口径核对（父级代码核验） | `src/server/services/ticket.ts:99-107,241-245` vs `src/client/contracts/types.ts:141-148,186-193,222-229` | 一致：detail/complete 响应的 `ticket` 键均为 TicketObject（摘要+扩展字段），服务端同时平铺顶层字段，前端按 `ticket.*` 读取，兼容 |

## 4. 验收条件状态记录

服务端行为以 23/23 真实测试为证据；前端以类型检查与构建为证据。浏览器交互级验收（interaction/runtime-render 证据）属后续验证阶段，本轮未执行。

| AC | 服务端 | 前端实现 | 浏览器端到端 |
|---|---|---|---|
| AC-01 创建并读回 | passed | passed | not-run（后续验证阶段） |
| AC-02 多轮回复 | passed | passed | not-run |
| AC-03 公司隔离 | passed（服务端强制过滤 + 404 资源隐藏测试） | 不适用（按契约由服务端承担） | not-run |
| AC-04 状态流转 | passed | passed | not-run |
| AC-05 业务组与自动分配 | passed | passed | not-run |
| AC-06 转派 | passed | passed | not-run |
| AC-07 提交人完整信息 | passed | passed | not-run |
| AC-08 完成+邮件通知 | passed（含邮件失败不回滚与发送记录断言） | passed | not-run |
| AC-09 满意度评价 | passed | passed | not-run |
| AC-10 分布统计 | passed | passed | not-run |
| AC-11 运营仪表盘 | passed | passed | not-run |
| AC-12 工作台筛选/搜索/排序 | passed | passed | not-run |
| AC-13 操作日志 | passed | passed | not-run |

## 5. 修正记录

- AC-07 测试期望值 `TK-000003` → `TK-000004`（T01）：数据流证据显示 TK-000003 属于乙公司另一提交人，A1 提交人最新工单为 TK-000004，原期望值为笔误。
- `GET /api/me` 路由路径、logout 吊销、detail 响应顶层平铺字段（T01）：依据技术契约第 1、6 节修正，已由全量测试复验。

## 6. 剩余风险与已知边界

1. **浏览器端到端验收未执行**：属后续验证阶段范围（本阶段为 implementation）。
2. **转派目标组选择**：契约未提供 agent 可用的同公司业务组列表接口，前端转派表单使用目标组 ID 数字输入，并在分配配置页展示组 ID 供参照。
3. **工作台公司筛选选项**：由列表响应中出现过的公司聚合（服务端仍按 companyId 真实过滤）。
4. **SMTP 邮件**：默认未配置时记 skipped；真实外发渠道与模板属环境配置（需求未规定渠道）。
