# 实施阶段报告（工单系统 · wi-t1000327）

## 1. 执行概要

- 阶段：implementation（开发实现），本次授权范围为该单一阶段。
- 开发任务计划：`plan:3bd92da2-9c9b-4218-9325-36182aad6ef1`（已批准，同专家前后端两个并行任务）。
- 执行结果：T01（服务端）与 T02（前端）均一次性完成，无失败重试、无阻塞。
- 依据：需求基线 `docs/wi-t1000327/requirements.md`、架构基线 `docs/wi-t1000327/architecture-baseline.md`、技术契约 `docs/wi-t1000327/technical-contract.md`。

## 2. 任务交付

### T01 服务端（app/ticket-system/src/server/，产物摘要 sha256:bae7f515…）

- 业务迁移：新增编号迁移建立 companies、user_profiles、business_groups、group_members、categories、assignment_rules、tickets、ticket_replies、ticket_logs、ticket_ratings、email_notifications（含索引与约束），未修改 userkit 既有迁移。
- 首次启动空库种子：公司 A/B、9 个演示账户（统一密码 demo-131）、分类、业务组、分配规则，不种子工单。
- 工单 API：创建（含按分类自动分配事务）、列表查询（筛选/搜索/排序/角色可见性/scope/mine）、详情、多轮回复（含首次回复时间）、人工分配、转派、完成（同事务写处理记录与本地发件箱通知）、取消、满意度评价、操作日志查询、提交人完整信息（含历史工单）。
- 组织与分配 API：业务组与成员、分类、分配规则、平台公司列表；统计 API：公司/部门分布与运营仪表盘（platform_ops 跨公司只读）；通知 API：本人收件列表。
- 公司隔离与角色权限：全部业务读写按会话用户公司强制过滤，端点级角色授权与统一错误码。
- 实现中修复的真实缺陷：种子数据公司键与名称不匹配导致空库初始化失败；assign/transfer 与 rating 的校验顺序（404/400 应先于 409）。

### T02 前端（app/ticket-system/src/client/，产物摘要 sha256:e83139af…）

- 契约类型与类型化 API 客户端边界（不发明 API 行为）；会话上下文与列表查询 hook（竞态保护、防抖）。
- 登录页与应用壳：左侧导航（工作台、我的工单、统计、管理、我的通知）+ 顶部上下文栏（用户/公司/角色/登出）+ starter 用户管理保留为账户引导。
- 工作台：split-master-detail 双栏；状态/优先级/分类/组筛选、公司维度筛选（platform_ops）、主题与工单号搜索、创建时间/优先级排序，条件可组合。
- 工单详情面板：完整字段与长文本、多轮回复时间线与输入、提交人完整信息（姓名/公司/部门/历史工单）、操作日志、按角色与状态的分配/转派/完成/取消/评价动作。
- 页面：我的工单（创建表单 + 评价入口）、统计（KPI + 状态分布 + 公司/部门维度 + 热点问题 + platform_ops 公司切换）、管理（业务组/成员/分类/规则，company_admin 守卫）、我的通知。
- Modern SaaS 视觉基线、加载骨架、空态、错误重试、403/404/401 文案、Toast；桌面 ≥1280px。
- 修改：`App.tsx`（认证壳+导航+路由）、`index.css`、`admin/UsersPage.tsx`（样式作用域隔离）、`index.html`（标题）；`tailwind.config.js` 无需改动。

## 3. 验证证据（实际执行）

| 检查 | 命令（工作目录 app/ticket-system） | 结果 |
| --- | --- | --- |
| 服务端集成测试（真实 HTTP + 隔离 DB_PATH） | `npm test` | 19 pass / 0 fail（含 tickets.test.mjs 16 个子测试） |
| 聚合类型检查（server + client） | `npm run typecheck` | 通过，无错误 |
| 客户端类型检查 | `npm run typecheck:client` | 退出码 0 |
| 客户端构建 | `npm run build:client` | 退出码 0（50 模块） |
| 应用启动 | `npm start`（后台作业） | 就绪：`/` HTTP 200，`/api/health` `{"ok":true,"app":"ticket-system"}` |

服务端测试覆盖：种子初始化、登录会话、工单创建与分类自动分配、列表筛选/搜索/排序/可见性、回复与首次响应时间、人工分配/转派/完成（含同事务通知写入）/取消、评价唯一约束、公司隔离（跨公司 404）、角色权限（403）、统计口径、操作日志、服务重启数据保持。

前后端边界核对（T02 只读复核）：详情/日志/回复响应形态、登录与 me 端点、列表排序规则（priority P0 在前）、groups 形态均与服务端实现一致。

## 4. 验收条件状态（分层证据口径）

实现层（代码交付 + 开发期验证）均为 passed；浏览器运行时验收（runtime-render/interaction）属验证阶段职责，本次授权范围不含该阶段，记 not-run：

| AC | 实现层 | API 测试证据 | 浏览器运行时验收 |
| --- | --- | --- | --- |
| AC-01 工单创建与完整信息 | passed | 有 | not-run |
| AC-02 多轮回复 | passed | 有 | not-run |
| AC-03 公司隔离 | passed | 有（跨公司 404/列表过滤） | not-run |
| AC-04 生命周期流转 | passed | 有（含取消终态） | not-run |
| AC-05 业务组与成员管理 | passed | 有 | not-run |
| AC-06 分类自动分配 | passed | 有 | not-run |
| AC-07 工单转派 | passed | 有 | not-run |
| AC-08 提交人完整信息 | passed | 有（历史工单端点） | not-run |
| AC-09 完成记录与邮件通知 | passed | 有（同事务发件箱） | not-run |
| AC-10 满意度评价 | passed | 有（唯一约束） | not-run |
| AC-11 公司/部门分布统计 | passed | 有 | not-run |
| AC-12 运营指标仪表盘 | passed | 有（口径断言） | not-run |
| AC-13 工作台筛选/搜索/排序 | passed | 有（API 组合查询） | not-run |
| AC-14 关键操作日志 | passed | 有（日志断言） | not-run（UI 查看区已实现） |

## 5. 运行入口

- 前端 URL：http://localhost:3000（`npm start` 常规启动，后台作业运行中；PORT 可用环境变量覆盖，DB_PATH 默认 `./data/application.db`）。
- 登录账户见技术契约 4.7（统一演示密码 demo-131，如 `a-sub1`、`a-agent1`、`a-admin`、`b-sub1`、`ops1`）。

## 6. 遗留与边界说明

1. 邮件通知为本地发件箱（email_notifications + 我的通知界面），不承诺真实邮箱投递；SMTP 为后续可选扩展（架构 ADR-2）。
2. 管理页添加成员依赖已知用户档案 ID（契约无"本司用户档案列表"端点；界面提供聚合自现有组成员与工单提交人的参考来源）。若目标用户从未出现在任何工单或业务组中，需预先知晓其档案 ID。
3. 浏览器 E2E 与真实 API 联调的运行时验收未执行（属验证阶段职责，超出本次授权阶段范围）。
4. 实现阶段的产物仅作为本地执行事实；最终产物发布与 WorkItem 快照在全部阶段成功后进行。
