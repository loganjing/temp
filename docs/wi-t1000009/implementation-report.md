# 开发实现报告（k02-ticket）

- Work Item：`wi-t1000009`
- 计划：`docs/wi-t1000009/development-task-plan.json`（`plan:6523f6c5-7195-40c6-915f-84ce68cebf64`）
- 需求基线：`docs/wi-t1000009/requirements.md`（sha256 `0efb63d7…ba8174`）
- 设计基线：`docs/wi-t1000009/architecture-baseline.md`（sha256 `28b812ba…59a0d`）
- 技术契约：`docs/wi-t1000009/technical-contract.md`（sha256 `00be2a70…a972e`）
- 应用包根：`app/ticket`（`platform-baseline.json` 中 `packageRoot`）

## 1. 交付概览

工单系统按“服务端权威 + 浏览器端”两层并行交付，两侧绑定同一份已批准技术契约并各自完成定向自检。当前已实现：公司隔离的数据底座与权限、工单生命周期与协作（回复/指派/转派/完成/取消/评价）、按分类自动分配、业务组与成员维护、完成通知邮件与结果留痕及重试、公司与部门维度统计与运营指标、只追加操作日志，以及对应的浏览器界面与配置页面。

## 2. 任务与回执

| 任务 | 业务结果 | 产物 | 大小 / 摘要 | 状态 |
| --- | --- | --- | --- | --- |
| T01 | 工单服务端：数据底座、生命周期与协作接口、完成通知、统计聚合 | `app/ticket/src/server/` | 134 950 B / `sha256:db3eb277…ab86b1` | completed |
| T01 | 跨端契约与枚举 | `app/ticket/src/shared/` | 5 556 B / `sha256:5a280f15…b5692c` | completed |
| T01 | 服务端测试、隔离夹具与 SMTP 收件桩 | `app/ticket/test/` | 72 240 B / `sha256:fd8c6d6e…8cb9a4` | completed |
| T02 | 工单浏览器端：应用壳、工作台与详情、配置页面、统计仪表盘 | `app/ticket/src/client/` | 113 262 B / `sha256:85051b4f…156727` | completed |

前端任务同时持有包级配置写入权：`app/ticket/package.json`、`package-lock.json`、`tsconfig.json`、`tsconfig.client.json`、`index.html`、`vite.config.ts`（新增 `antd`、`@ant-design/icons` 依赖与 `seed`、`mail:sink` 脚本条目）。服务端任务不写这些路径，两侧无共享写入冲突。

## 3. 验证证据（真实运行结果）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 服务端与端到端用例 | `cd app/ticket && npm test` | 退出码 0（12 项，11 通过、1 条为脚手架预置 skip） |
| 全量类型检查 | `cd app/ticket && npm run typecheck` | 退出码 0 |
| 全量构建 | `cd app/ticket && npm run build` | 退出码 0（Vite 构建成功） |
| 通知链路冒烟（含 `sent` / 550 失败） | `cd app/ticket && node test/smoke-notifications.mjs` | 退出码 0 |
| 前端依赖安装 | `npm install antd@^5.29.3 @ant-design/icons@^5.6.1 -w ticket` | 退出码 0 |
| 客户端类型检查 | `cd app/ticket && npm run typecheck:client` | 退出码 0 |
| 未使用符号检查 | `cd app/ticket && npx tsc -p tsconfig.client.json --noUnusedLocals --noUnusedParameters` | 退出码 0 |
| 客户端构建 | `cd app/ticket && npm run build:client` | 退出码 0 |

服务端用例覆盖的关键路径：未认证 401、停用账号 403、跨公司 403、生命周期流转与终态 409、通知 `skipped` 与重试 `attempt=2`、统计口径、组织配置与成员角色同步、唯一约束与迁移结构。

## 4. 运行与预览

- 预览地址：`http://localhost:5180/`（Vite 开发服务器，`/api` 代理到 `http://localhost:3000`），已在本次交付中以注册后台作业启动并确认可达：`GET /api/health` → `{"ok":true,"app":"ticket"}`，`GET /` → 200。
- 经预览入口实测通过代理调用：`POST /api/auth/login` 取得令牌、`GET /api/me`、`GET /api/tickets?scope=workbench&status=all`、`GET /api/reference`、`GET /api/business-groups`、`GET /api/stats/overview`、`GET /api/stats/distribution?dimension=department` 均返回 200 且为契约字段形状。
- 演示数据：`npm run seed -w ticket` 输出 `companies=2 users=9 groups=3 categories=5 tickets=8`（幂等，可重复执行）。
- 演示登录账号：`admin.acme@example.test`（公司管理员）、`user.acme@example.test`（提交人）、`finance.acme@example.test`（财务支持组处理人）、`agent.globex@example.test`（他公司处理人）、`stats@acme.example.test`（平台统计只读），统一密码 `TicketDemo#2026`。
- 邮件：未配置 SMTP 时通知记录为 `skipped`；`npm run mail:sink` 启动本地 SMTP 桩（`fail@` 前缀返回 550），用于完成通知 `sent`/`failed` 的可复现验证。

## 5. 验收覆盖

以下为**实现与自动化证据**层面的结论；浏览器交互、样式与端到端联调由后续验收阶段在合并工作区上独立判定，本报告不预先给出验收结论。

| AC | 实现结果 | 当前证据 | 状态 |
| --- | --- | --- | --- |
| AC-01 提交生成完整工单信息 | 服务端取号 `TK-000001` 序列、必填与长度校验、提交人信息取自账号；前端提交表单与错误回显 | 服务端用例（校验、取号、详情字段）、构建与类型检查 | 已实现，待浏览器验收 |
| AC-02 生命周期状态流转 | `pending_assignment`/`pending`/`completed`/`cancelled` 与流转守卫，终态 409 | 服务端用例（初始状态、指派、完成、取消、终态拦截） | 已实现，待浏览器验收 |
| AC-03 多轮回复留痕 | `ticket_replies` 顺序读取，记录回复人与时间 | 服务端用例 + 前端回复流组件 | 已实现，待浏览器验收 |
| AC-04 公司隔离 | 所有查询与写入附加公司条件，跨公司 403；工作台/统计/业务组均按公司过滤 | 跨公司 403 用例、他公司账号的接口验证 | 已实现，待浏览器验收 |
| AC-05 多业务组与成员 | 业务组增改、成员添加/移除、同名与重复成员冲突、成员角色同步 | 组织配置用例 | 已实现，待浏览器验收 |
| AC-06 按分类自动分配 | `assignment_rules` 按“公司 + 分类”幂等覆盖，提交事务内匹配 | 提交命中/未命中用例 | 已实现，待浏览器验收 |
| AC-07 待分配指派 | 指派到业务组/成员，写归属与日志 | 指派用例 | 已实现，待浏览器验收 |
| AC-08 转派记录前后归属 | 转派保持 `pending`，日志记录前后业务组、转派人、时间 | 转派用例 | 已实现，待浏览器验收 |
| AC-09 提交人信息与历史工单 | 详情返回提交人四项信息与最近 10 条历史工单 | 详情接口用例 | 已实现，待浏览器验收 |
| AC-10 完成记录并发送通知 | 完成人/时间、通知 `sent`/`failed`/`skipped`、失败不阻塞完成、可重试 | `node test/smoke-notifications.mjs`（真实 SMTP 桩） | 已实现，待浏览器验收 |
| AC-11 满意度评价 | 评价唯一约束 409、仅提交人、仅已完成 | 评价用例 | 已实现，待浏览器验收 |
| AC-12 工作台筛选搜索排序 | 状态/优先级/分类/业务组/公司/时间筛选、`q` 搜索、三种排序与分页 | 列表查询用例 | 已实现，待浏览器验收 |
| AC-13 公司与部门分布 | `dimension=company|department` 聚合与合计一致 | 分布接口实测（部门维度合计 5 = 总量 5） | 已实现，待浏览器验收 |
| AC-14 运营指标 | 工单量、取消数、平均首次响应、满意度、热点前 5 | 概览接口实测（`volume=5`、`satisfaction.average=4.5/count=2`、`avgFirstResponseMinutes=40`） | 已实现，待浏览器验收 |
| AC-15 操作日志可追溯 | `ticket_logs` 只追加，含操作人、时间、动作与变更摘要，无编辑删除端点 | 日志用例 + 只读端点 | 已实现，待浏览器验收 |

## 6. 未闭合事项与风险

1. **浏览器端验收未执行**：本次实现只完成开发自检（类型检查、构建、接口与通知链路），未做真实浏览器交互与视觉检查，AC-01～AC-15 的界面证据需由验收阶段补齐。
2. **演示 SMTP 为本地桩**：真实外部邮件服务未接入，`sent`/`failed` 分支以本地桩复现；生产配置（`SMTP_HOST` 等）由部署阶段按环境提供。
3. **`platform_stats` 只读范围**：统计页对平台统计角色返回全部公司聚合值，仅聚合数值、不含工单明细，需在验收时确认该范围的展示边界。
4. **范围外能力**：SLA 响应/解决时限与超时告警、工单附件、内部备注、导出与多语言按需求基线明确不纳入本期。
5. **并发写入顺序**：前端任务持有 `package.json` 与锁文件，若后续需要新增依赖，应由该 owner 继续维护，避免两侧同时修改。