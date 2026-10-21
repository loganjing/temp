# 实现报告（137-ticket 工单系统）

## 概述

基于已批准需求 `docs/wi-t1000335/requirements.md`、架构基线 `docs/wi-t1000335/architecture-baseline.md` 与技术契约 `docs/wi-t1000335/technical-contract.md`，按契约完备的同专家前后端拆分策略，并行执行两个实现任务：

- **T01 后端**：工单系统全量后端 API（工单生命周期、分配规则、工作台、统计、邮件通知与审计查询）
- **T02 前端**：工单系统前端 SPA（工作台、工单管理、分配管理、统计仪表盘与日志查询）

## T01 后端实现

### 产物

| 产物路径 | 说明 |
| --- | --- |
| `app/ticketing/src/server/routes.ts` | 全部业务端点路由注册（4.2–4.6 节），复用现有 auth/user 路由 |
| `app/ticketing/src/server/platform/bootstrap.ts` | 扩展 auditkit 与 emailkit 初始化绑定 |
| `app/ticketing/src/server/migrations/sqlite/0010_ticketing_domain.sql` | 新增 companies/groups/group_members/assignment_rules/tickets/replies/ratings/notification_log 表及索引；users 表追加 department 列 |
| `app/ticketing/src/shared/contracts.ts` | API 契约类型与枚举常量（Ticket/Reply/Rating/Group/AssignmentRule/AuditEntry/CurrentUser 等） |
| `app/ticketing/src/server/modules/` | 领域模块：ticket/assignment/workbench/stats/notification/audit/session/util |

### 实现要点

- **公司隔离**：一切工单读取先校验 `ticket.company_id == 当前用户.company_id`，不满足返回 404；列表/统计/工作台在 SQL 层带公司过滤
- **生命周期状态机**：创建→pending_assignment（+命中规则→processing）；processing→completed；pending_assignment|processing→cancelled；非法迁移返回 409
- **自动分配**：创建事务提交后查 assignment_rules，命中则置组转 processing 并写 ticket_assigned 审计
- **多轮回复**：每条记录 author_id 与 created_at，时间升序返回
- **转派**：同公司其他业务组校验，状态保持 processing
- **完成与通知**：单事务置 handler/handled_at/status=completed + 审计；事务提交后发邮件并写 notification_log（失败不回滚）
- **满意度评价**：仅提交人、仅 completed 状态、唯一键约束
- **统计口径**：avgResponseMinutes=处理方首次回复-创建时间均值；satisfaction=已完成已评价均分；topCategories=按分类量排名；无样本返回 null
- **审计**：七类关键操作同事务写 audit_events
- **权限矩阵**：按技术契约第 5 节实现

### 验证结果

| 检查项 | 结果 |
| --- | --- |
| `npm run typecheck:server`（tsc -p tsconfig.server.json） | 通过（退出码 0） |
| `npm test`（node --import tsx --test test/*.test.mjs） | 3/3 通过 |
| 进程内冒烟验证 | 生命周期 25 项断言通过、业务组与规则管理 10 项断言通过 |

### 已知偏差（非阻断）

- 契约将用户相关 id 标为 number，但 userkit users 主键为 TEXT UUID（平台事实），故 submitter/handler/member/rater/operator/CurrentUser.id 在共享类型中为 string；companies/groups/rules/tickets 等新建表主键为自增整数，id 为 number，与契约一致。AuditEntry.id 因 auditkit 主键为 TEXT 故为 string。不改变行为，仅反映平台主键类型。
- `POST /api/auth/login` 仍返回 starter 形态（未改 platform/auth.ts，不在写入范围）；`/api/me` 已富化为完整 CurrentUser（含公司/部门/groupIds）。
- 临时冒烟测试脚本位于 /tmp，已清理，未污染写入范围。

## T02 前端实现

### 产物

| 产物路径 | 说明 |
| --- | --- |
| `app/ticketing/src/client/App.tsx` | 应用壳：保留登录/bootstrap/改密流程；认证后进入 BrowserRouter，左侧导航 + 顶部上下文栏 |
| `app/ticketing/src/client/pages/` | 六大业务页面：工单工作台、工单列表+详情、工单创建、业务组与规则管理、统计分析、操作日志查询 |
| `app/ticketing/src/client/components/` | 共享组件：contracts.ts（契约类型复刻）、ui.tsx（Card/PriorityBadge/StatusBadge/Skeleton/EmptyState/Toast/useAsync）、TicketDetail.tsx（详情分栏） |
| `app/ticketing/src/client/platform/api-client.ts` | 扩展六组业务端点函数，严格遵循技术契约字段与可空性 |

### 实现要点

- **应用壳**：左侧导航（工作台/工单/统计/业务组与规则/操作日志/用户管理）+ 顶部上下文栏（当前用户、所属公司）
- **工单工作台**：split-master-detail 布局，支持按公司筛选、关键字搜索、排序
- **工单详情**：基本信息卡 + 提交人信息卡（含历史工单）+ 回复时间线 + 操作区（回复/转派/完成/取消/评价按权限矩阵与状态机显隐）+ 完成通知记录 + 内嵌操作日志
- **UI 视觉**：Modern SaaS 方向（Tailwind CSS）；优先级徽标（P0 红/P1 橙/P2 黄/P3 蓝/P4 灰）；状态徽标（待分配/待处理/完成/取消）；骨架加载、空态文案、错误 toast、操作成功反馈

### 验证结果

| 检查项 | 结果 |
| --- | --- |
| `npm run typecheck:client`（tsc -p tsconfig.client.json） | 通过（退出码 0） |
| `npm run build:client`（vite build） | 通过（退出码 0），产物 dist/assets/index-*.js（215.12 kB） |

### 跨任务协调说明

- `src/shared/` 由 T01 拥有，前端按"独立开发、不等待后端"要求在 `components/contracts.ts` 内复刻契约类型（严格依据技术契约第 2、3 节），未臆造 API 行为。集成阶段可将 contracts.ts 替换为共享导入。
- 前端不最终决定权限/状态/计算；所有操作均经 api-client 调用服务端端点，操作显隐仅作 UI 优化，最终授权以服务端为准。
- 已有 admin/UsersPage.tsx 与登录/bootstrap 流程保留未改（仅 App.tsx 接入路由）。

## 验收标准覆盖

| AC | T01 后端 | T02 前端 |
| --- | --- | --- |
| AC-01 工单创建与信息完整性 | ✅ API 实现 | ✅ 创建表单 + 详情视图 |
| AC-02 工单按公司隔离 | ✅ SQL 层公司过滤 + 404 | ✅ 列表/搜索/详情 UI 隔离 |
| AC-03 生命周期状态流转 | ✅ 状态机实现 | ✅ 状态展示 + 取消操作 |
| AC-04 多轮回复 | ✅ 回复持久化 | ✅ 回复时间线 + 表单 |
| AC-05 业务组与成员管理 | ✅ CRUD API | ✅ 管理 UI |
| AC-06 按分类自动分配 | ✅ 规则匹配分配 | ✅ 规则配置 + 分配结果展示 |
| AC-07 工单转派 | ✅ 同公司转派校验 | ✅ 转派操作 UI |
| AC-08 处理与完成通知 | ✅ 处理记录 + 邮件 | ✅ 提交人信息 + 完成操作 |
| AC-09 满意度评价 | ✅ 评价持久化 | ✅ 评价 UI |
| AC-10 统计分析 | ✅ 分布 + 仪表盘 API | ✅ 统计页面 + 仪表盘 |
| AC-11 工单工作台 | ✅ 待处理队列 API | ✅ 工作台 + 筛选/搜索/排序 |
| AC-12 操作日志 | ✅ 审计写入 + 查询 | ✅ 日志查询页面 |

## 遗留事项

- 真实交互、刷新读回、公司隔离边界、真实 HTTP 与交付启动入口属 QA 验收范围，未在开发阶段执行浏览器/E2E 验证。
- `src/shared/contracts.ts`（T01）与 `src/client/components/contracts.ts`（T02）存在类型重复，集成阶段可统一为共享导入。
- identity 边界（platform/auth.ts 的 responseTransform）未改，登录响应仍为 starter 形态；`/api/me` 已返回完整 CurrentUser。
