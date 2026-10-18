# 技术契约 · API 字段级定义（WorkItem: wi-t1000063）

> 本文是前后端共同遵循的 API 契约唯一来源：method/path、请求/响应字段、类型、可空性、错误、授权、幂等与转换责任。业务语义（谁在何状态下可做什么）引用需求基线条目，不在此复制完整规则。架构概览见 `architecture-baseline.md`。

## 1. 通用约定

- **Base URL**：`/api`；所有请求/响应体为 JSON（CSV 与文件下载除外）。
- **认证**：除 `POST /api/auth/login` 外全部接口要求 `Authorization: Bearer <token>`（authkit 签发）。MCP 端点使用 authkit 的 MCP 会话认证，不复用浏览器 Bearer。
- **角色枚举**：`requester | agent | manager | admin`；单角色，登录后不可切换。角色决定数据范围，对象级授权另见各接口。
- **时间**：请求/响应时间均为 ISO 8601 UTC 字符串（如 `2026-10-18T02:30:00Z`）；日期（无时刻）为 `YYYY-MM-DD`。SLA 倒计时文案与「今日」边界由服务端统一按工作日历时区计算后以文本返回。
- **双语字段**：可维护名称类字段成对出现（`nameZh`、`nameEn`；工单主题为 `subjectZh`、`subjectEn`）。展示取值规则：按请求 `Accept-Language: zh|en` 优先取对应语言，缺失回退另一语言，绝不返回空白——该回退由服务端在序列化时完成（返回既有原值），前端不做二次判断。
- **分页**：请求 `page`（1 起，默认 1）、`pageSize`（管理类列表固定默认 20；工单列表默认 20，可取 10/20/50/100）。响应统一 `{ items, page, pageSize, total }`。
- **排序**：`sort=<field>:<asc|desc>`；工单列表默认 `updated_at:desc`，且列表必须返回 `updatedAt` 列。
- **错误结构**：

```json
{ "error": { "code": "STATE_CONFLICT", "message": "工单当前状态不允许该操作", "details": { "status": "on_hold" } } }
```

- **状态/枚举值**（snake_case 字符串）：
  - 工单状态：`draft | pending_assign | assigned | in_progress | on_hold | pending_confirm | cancelled | closed`
  - 优先级：`low | medium | high | urgent`
  - 工单类型（分类属性）：`service_request | incident`
  - SLA 徽标（未完成维度）：`normal | warning | breached`；已完成维度：`met | missed`；不适用（如挂起中）：`paused`
  - 回复类型：`normal | resolution | rejection`
  - 活动来源：`user | system | mcp`
- **错误码表**：

| HTTP | code | 场景 |
|---|---|---|
| 401 | `AUTH_REQUIRED` | 缺失/无效令牌 |
| 401 | `INVALID_CREDENTIALS` | 登录失败 |
| 403 | `FORBIDDEN` | 角色/对象关系不满足（含非管理员访问配置审计、非提交人访问嵌入工作台） |
| 404 | `NOT_FOUND` | 资源不存在或对当前用户不可见（读路径防枚举，越权读一律 404） |
| 409 | `STATE_CONFLICT` | 工单当前状态不允许该操作（含删除已提交工单、终态工单写操作） |
| 409 | `ASSIGNEE_ON_VACATION` | 指派/转派目标正在休假中（message 固定「该处理人正在休假中」） |
| 409 | `ASSIGNEE_NOT_IN_DEPARTMENT` | 目标处理人不属于工单所在部门 |
| 409 | `RATING_EXISTS` | 已评价工单重复评分 |
| 409 | `TICKET_NOT_DRAFT` | 非草稿态执行草稿专属操作 |
| 413 | `FILE_TOO_LARGE` | 单文件超过 10MB |
| 422 | `VALIDATION` | 字段缺失/格式/枚举不符（`details.fields[]` 列出字段） |
| 422 | `RULE_TEAM_DEPARTMENT_MISMATCH` | 分配规则目标 Team 不属于分类所属部门（前后端同一校验口径） |
| 400 | `CSV_ROW_INVALID` | CSV 导入行无法按编码匹配（`details.row`） |
| 500 | `INTERNAL` | 未分类服务端错误 |

## 2. 认证与会话

| 接口 | 请求 | 响应 | 说明 |
|---|---|---|---|
| `POST /api/auth/login` | `{ email: string, password: string }` | `200 { token: string, user: UserRef }`；401 `INVALID_CREDENTIALS` | authkit 承载；登录成功返回 Bearer 令牌 |
| `POST /api/auth/logout` | – | `204` | 使当前令牌失效 |
| `GET /api/auth/me` | – | `200 { id, email, role, nameZh, nameEn, companyId, companyNameZh?, companyNameEn? }` | 会话用户画像，前端初始化时拉取 |

`UserRef = { id: number, nameZh: string, nameEn: string, email: string, role: Role }`（列表内嵌用户均用此精简结构；`nameZh/nameEn` 序列化时执行回退规则，两语言都缺失时返回空串并在 `displayName` 提供回退结果）。

## 3. 工单

### 3.1 数据形状

`TicketSummary`（列表行）：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| `id` | number | 否 | 内部 ID |
| `ticketNo` | string | 否 | 对外编码（提交后生成；草稿为 null） |
| `subjectZh` / `subjectEn` | string | En 可空 | 主题双语 |
| `category` | `{ id, nameZh, nameEn }` | 否 | 一级分类 |
| `subCategory` | `{ id, nameZh, nameEn }` | 是 | 二级分类 |
| `priority` | string | 否 | 优先级枚举 |
| `status` | string | 否 | 状态枚举（草稿对非创建人不可见，见范围规则） |
| `requester` | `UserRef` | 否 | 提交人 |
| `assignee` | `UserRef` | 是 | 当前处理人 |
| `team` / `department` | `{ id, nameZh, nameEn }` | 是 | 归属 |
| `submittedAt` / `firstResponseAt` / `resolvedAt` / `closedAt` | string(datetime) | 是 | 里程碑时间 |
| `createdAt` / `updatedAt` | string(datetime) | 否 | 排序依据列（列表必返） |
| `slaFirstResponse` / `slaResolution` | `SlaBadge` | 否 | 双维度徽标（见下） |

`SlaBadge = { state: "normal"|"warning"|"breached"|"met"|"missed"|"paused", text: string }`——未完成维度返回 `normal/warning/breached` + 剩余或超时倒计时文案（如「剩余 1 天 11 小时」「超时 3 小时 5 分」）；已完成的维度返回 `met/missed` + 结果文案（按时/超时），不得为空；挂起中 `paused`。文案语言随 `Accept-Language`。

`TicketDetail = TicketSummary + { description, slaFirstResponseDeadline, slaResolutionDeadline, can: { editDraft, submit, reply, resolve, confirm, reject, cancel, hold, resume, assign, transfer, changeCategory, changePriority, rate, deleteDraft } }`——`can` 为前端入口显隐提示（体验层），后端仍独立强制校验。

### 3.2 列表与查询

| 接口 | 说明 |
|---|---|
| `GET /api/tickets` | 参数：`status`（逗号多值）、`category`、`priority`、`assignee`、`requester`、`department`、`team`、`sla=alert`（双维度告警口径，见 §7.2）、`q`（主题/编码模糊）、`page`、`pageSize`、`sort`。**数据范围由服务端按角色强制**：requester→`requester=self`；agent→`assignee=self`；manager→本组动态范围（所属 Team 成员 ∪ 管辖部门）；admin→全部。**草稿恒仅 `requester=self`**（任何角色创建的草稿只对创建人可见，统计同口径）。 |

### 3.3 草稿与提交（幂等）

| 接口 | 请求 | 响应 | 语义 |
|---|---|---|---|
| `POST /api/tickets` | `{ idempotencyKey: string(uuid), subjectZh: string, subjectEn?: string, description: string, categoryId: number, subCategoryId?: number, priority: Priority, attachmentIds?: number[] }` | `201 TicketDetail`；同 `idempotencyKey` 重放 → `200 { ...原工单, idempotentReplay: true }` | 创建草稿；任何登录角色可为本人创建；`idempotencyKey` 客户端生成并持久化到提交完成 |
| `PATCH /api/tickets/{id}` | 同上字段任意子集 | `200 TicketDetail`；409 `TICKET_NOT_DRAFT`；403 非创建人 | 草稿反复编辑 |
| `DELETE /api/tickets/{id}` | – | `204`；409 `TICKET_NOT_DRAFT` | 仅草稿态；创建人或 admin 可删；提交后无删除路径 |
| `POST /api/tickets/{id}/submit` | `{ idempotencyKey: string }` | `200 { ticket: TicketDetail, assignment: { result: "assigned"|"pending_assign", team?: Ref, assignee?: UserRef, fallback?: "manager", reason?: string } }` | 触发唯一一次自动分配（链路为服务内部实现，对客户端仅暴露结果）；幂等：同键重复提交返回原结果不重复路由；成功后发受理邮件（见 §9） |

### 3.4 处理与流转

| 接口 | 请求 | 响应 / 错误 | 授权与状态语义 |
|---|---|---|---|
| `POST /api/tickets/{id}/replies` | `{ body: string }` | `201 { reply: { id, author: UserRef, body, kind: "normal", createdAt }, ticket: TicketDetail }` | 提交人（本人工单）或当前处理人可回复；普通回复不改状态。**例外副作用**：处理人回复「已分配」工单→`in_progress`；部门经理回复本组「待分配」工单→回复即认领（经理成为处理人，→`in_progress`）。回复触发对侧邮件 |
| `POST /api/tickets/{id}/start` | – | `200 TicketDetail`；409 `STATE_CONFLICT` | 当前处理人；`assigned`→`in_progress`（与首次回复并列，二者取先）；该时刻为解决 SLA 计时起点 |
| `POST /api/tickets/{id}/resolve` | `{ resolutionNote: string }` | `200 TicketDetail`；422 缺说明 | 当前处理人/本组经理（认领后）/admin；`in_progress`→`pending_confirm`，记 `resolvedAt`；`kind=resolution` 回复入时间线 |
| `POST /api/tickets/{id}/confirm` | – | `200 TicketDetail` | 提交人；`pending_confirm`→`closed`，记 `closedAt` |
| `POST /api/tickets/{id}/reject` | `{ reason: string }` | `200 TicketDetail` | 提交人；`pending_confirm`→`in_progress`，处理人不变，`kind=rejection` 回复 + 原因入活动日志 |
| `POST /api/tickets/{id}/cancel` | `{ reason: string }` | `200 TicketDetail` | 处理人/本组经理/admin；`assigned|in_progress`→`cancelled`（终态） |
| `POST /api/tickets/{id}/hold` | `{ reason: string, note?: string, expectedResumeAt?: string(datetime) }` | `200 TicketDetail` | 处理人/本组经理/admin；`assigned|in_progress`→`on_hold`；SLA 双时钟暂停（见 §7.1） |
| `POST /api/tickets/{id}/resume` | – | `200 TicketDetail` | 同上；`on_hold`→`in_progress`；按挂起时长整体顺延截止时间；挂起前未首次响应的以恢复时刻补记 `firstResponseAt` 并现算该时钟 |

### 3.5 指派、转派与在线修改

| 接口 | 请求 | 响应 / 错误 | 授权与状态语义 |
|---|---|---|---|
| `POST /api/tickets/{id}/assign` | `{ teamId: number, userId: number }` | `200 TicketDetail`；409 `ASSIGNEE_NOT_IN_DEPARTMENT` / `ASSIGNEE_ON_VACATION` | 部门经理对本部门 `pending_assign` 工单（或 admin 不限）；服务端强制校验目标处理人属于该工单所在部门且非休假（409 文案固定）；成功→`assigned`，目标收到分配通知 |
| `POST /api/tickets/{id}/transfer` | `{ targetDepartmentId: number, targetUserId?: number }` | `200 TicketDetail`；403 跨部门指定人；409 `ASSIGNEE_ON_VACATION` | 专员：本人处理的 `assigned|in_progress` 工单，仅可转本部门同事或本部门经理（跨部门指定人→403）；经理：本组工单整单转其他部门排队（`pending_assign` 时不允许带 `targetUserId`；`assigned|in_progress` 可带本部门目标）；admin 不限；转派后原处理人立即失去处理权 |
| `PATCH /api/tickets/{id}/category` | `{ categoryId: number }` | `200 TicketDetail` | 处理人（本人处理）/本组经理/admin；非草稿非终态；选中即保存立即生效：状态与处理人不变、不退回待分配、无审批；按新分类 SLA 策略从原起算点重算双时钟截止时间（§7.1）；变更写活动日志（前后值） |
| `PATCH /api/tickets/{id}/priority` | `{ priority: Priority }` | `200 TicketDetail` | 同上（不改 SLA） |

### 3.6 评价、时间线与导出

| 接口 | 请求 | 响应 | 语义 |
|---|---|---|---|
| `POST /api/tickets/{id}/rating` | `{ score: 1..5, comment?: string }` | `201 { score, comment, createdAt }`；409 `RATING_EXISTS`；403 非提交人 | 仅已关闭工单的提交人、每工单一次；系统默认好评由后台任务生成（`isSystemDefault`，不占用户评价入口） |
| `GET /api/tickets/{id}/timeline` | – | `200 { items: TimelineItem[] }` | 全部回复（normal/resolution/rejection）与活动日志合并、按时间倒序；多人多次提交的解决记录完整保留；`TimelineItem = { kind: "reply"|"activity", occurredAt, author?: UserRef, body?: string, action?: string, fromStatus?, toStatus?, fieldChanges?, source? }`；权限同工单详情 |
| `GET /api/tickets/export.csv` | 同列表筛选参数 | `text/csv` 流 | agent/manager/admin 可导出（requester 403）；列与 `TicketSummary` 对应；UTF-8 带 BOM |

## 4. 组织与用户管理

管理类接口统一仅 admin（部门/Team 维护为部门经理本部门范围，见各接口）；列表默认 20 条/页。

### 4.1 公司

| 接口 | 说明 |
|---|---|
| `GET /api/org/companies?q=` | 返回树（含每节点 `code, nameZh, nameEn, status, children[]`）；admin |
| `POST /api/org/companies` | `{ code, nameZh, nameEn, parentId?, status }`；`code` 唯一（422 `VALIDATION` 重复码）；admin |
| `PATCH /api/org/companies/{id}` | 名称/状态可改，`code` 不可改；admin |
| `GET /api/org/companies/export.csv` / `POST /api/org/companies/import` | 列：`code,parentCode,nameZh,nameEn,status`；导入按 `parentCode` 解析父节点 |

### 4.2 部门 / Team / 成员 / 休假

| 接口 | 说明 |
|---|---|
| `GET /api/org/departments` / `POST /api/org/departments` | `GET`（admin，分页）含经理、Team 数、状态；`POST { code, nameZh, nameEn, managerIds: number[], assignMode?: "auto"|"manual", status }`——`assignMode` 仅存储（路由不读取），字段保留供配置展示 |
| `PATCH /api/org/departments/{id}` | 可更新名称/经理/分配模式/启停；admin；变更写配置审计 |
| `GET /api/org/departments/{id}/teams` / `POST /api/org/teams` | `POST { departmentId, code, nameZh, nameEn, status }`；admin；新建 Team 候选池见成员接口 |
| `PATCH /api/org/teams/{id}` / `POST /api/org/teams/{id}/status` | 名称/启停；admin（或本部门经理）；写配置审计 |
| `GET /api/org/teams/{id}/members` | 成员卡片列表：`{ user: UserRef, vacation: null \| { state: "on_leave"|"scheduled", startDate, endDate, autoReplyText? } }`——`state` 三态：无记录或仅历史休假→`null`（在岗）；今天在区间→`on_leave`；区间在未来→`scheduled`；两者均返回具体日期范围 |
| `GET /api/org/teams/{id}/member-candidates` | 候选池：该部门所有 Team 成员并集（部门已有成员时）；部门无任何 Team 成员时返回全公司候选（启动缺口） |
| `POST /api/org/teams/{id}/members` | `{ userId }`；服务端校验 userId ∈ 候选池（422 `VALIDATION`） |
| `DELETE /api/org/teams/{id}/members/{userId}` | 移出 Team |
| `GET /api/org/departments/{id}/member-candidates` | 部门维度入口：不受部门内候选池限制，返回全公司人员（「向部门引入新人」场景） |
| `POST /api/org/departments/{id}/members` | `{ userId }`；全公司可选 |
| `POST /api/org/teams/{teamId}/members/{userId}/vacations` | `{ startDate: date, endDate: date, autoReplyText?: string }`（起止自动排序校验）；`autoReplyText` 仅存储不接入流程 |
| `DELETE /api/org/teams/{teamId}/members/{userId}/vacations` | 取消休假；对 `on_leave` 与 `scheduled` 两态均可用 |

### 4.3 用户

| 接口 | 说明 |
|---|---|
| `GET /api/admin/users` / `POST /api/admin/users` | 分页 20；`POST { email, nameZh, nameEn, phone?, role, companyId, status, password }`；email 唯一；凭证入 userkit 存储 |
| `PATCH /api/admin/users/{id}` | 业务属性更新（密码重置单独字段 `password?`） |
| `GET /api/admin/users/export.csv` / `POST /api/admin/users/import` | 列：`email,nameZh,nameEn,phone,role,companyCode,status`；按 `companyCode` 关联；批量导入逐行校验、失败行返回 `details.rows[]` |
| `GET /api/admin/users/me` 等会话接口见 §2 | — |

## 5. 分类与分配规则

| 接口 | 说明 |
|---|---|
| `GET /api/admin/categories` | 分页 20；admin；字段：`code, nameZh, nameEn, department: Ref, ticketType, sortOrder, status`——**不含任何分配字段**（无 defaultTeam 类字段） |
| `POST /api/admin/categories` / `PATCH /api/admin/categories/{id}` | 同上字段；编码唯一；变更写配置审计 |
| `GET /api/categories/options` | 业务用户可见的分类下拉（**过滤系统骨架分类**：`isSkeleton=true` 不返回，同样适用于 SLA 配置列表与创建下拉）；返回 `{ id, code, nameZh, nameEn, ticketType, subCategories: [...] }` |
| `POST /api/admin/subcategories` / `PATCH /api/admin/subcategories/{id}` | `{ code, nameZh, nameEn, categoryId, sortOrder, status }`；仅展示/统计细分 |
| `GET /api/admin/assignment-rules?q=` | 按分类名/部门名搜索过滤；响应：`{ items: [{ id, category: Ref, department: Ref, teams: Ref[] }], unconfiguredCategories: Ref[] }`——未配置规则的分类醒目列出 |
| `POST /api/admin/assignment-rules` | `{ categoryId, teamIds: number[] }`；**校验每个 team 属于该分类所属部门**（422 `RULE_TEAM_DEPARTMENT_MISMATCH`，前后端同口径） |
| `PATCH /api/admin/assignment-rules/{id}` | `{ teamIds }`（同校验） |
| `DELETE /api/admin/assignment-rules/{id}` | 删除规则 |
| `GET /api/admin/assignment-rules/export.csv` | **始终全量导出**（不受当前搜索过滤影响）；列：`categoryCode,teamCodes`（多个编码分号分隔） |
| `POST /api/admin/assignment-rules/import` | 客户端解析 + 预览确认后逐行提交：请求体 `{ rows: [{ categoryCode, teamCodes: string[] }] }`，服务端按编码解析并复用同一部门归属校验，单行失败返回 `CSV_ROW_INVALID`（`details.row`）不影响已提交行 |

## 6. SLA 策略、工作日历与节假日

| 接口 | 说明 |
|---|---|
| `GET /api/admin/sla-policies` | `{ items: [{ id, category: Ref, firstResponseMinutes, resolutionMinutes, warnThresholdPercent }], unconfiguredCategories: Ref[] }`——未配置分类醒目横幅数据源 |
| `POST /api/admin/sla-policies` / `PATCH /api/admin/sla-policies/{id}` | `{ categoryId, firstResponseMinutes, resolutionMinutes, warnThresholdPercent? }`；挂一级分类（二级分类不绑定） |
| `GET /api/admin/calendar` / `PUT /api/admin/calendar` | `{ weekdays: number[](1=周一..7=周日), workStartTime: "HH:mm", workEndTime: "HH:mm", timezone: string }`；默认时区 `Asia/Kuala_Lumpur`；表头悬浮说明文案由前端静态文案承载，两条时钟规则说明一致于本契约 §7.1 |
| `GET /api/admin/holidays` / `POST /api/admin/holidays` / `DELETE /api/admin/holidays/{id}` | `{ date: "YYYY-MM-DD", nameZh, nameEn }` |

## 7. SLA 计算契约（服务端统一实现）

### 7.1 双时钟规则（对客户端只暴露结果）

- **首次响应时钟**：起算点=工单提交时刻（`submittedAt`）；终点=首次回复或处理人首次动作时刻（`firstResponseAt`，含挂起前已响应的补记场景）。
- **解决时钟**：起算点=首次回复或手工标记开始处理（二者取先）时刻；终点=工单关闭时刻（`closedAt`）。
- **截止时间**：`起算点 + 时限`，按工作日历滚动累加（仅工作日的工作时段内计时，排除周末/节假日/非工作时段，按配置时区换算）。
- **挂起**：`on_hold` 期间双时钟暂停；恢复时两条截止时间各 `+=` 挂起实际时长（整体顺延，不重算）。挂起期间徽标 `paused`。挂起前从未首次响应的工单：恢复时刻补记 `firstResponseAt`，该时钟截止时间从恢复时刻现算（非顺延）。
- **改分类**：按新分类 SLA 策略，从各时钟**原起算点**重算两条截止时间（不改变已流逝事实）。
- **完成判定**：`firstResponseAt ≤ deadline` → `met`，否则 `missed`；解决维度同理（`closedAt` 比较）。已完成维度必须返回明确结果徽标，不得空白。
- **预警**：未完成且剩余时长 ≤ `warnThresholdPercent × 时限` → `warning`；超过截止 → `breached`。
- 无 SLA 策略的分类：徽标 `state: "normal"`，`text` 标注未配置（不阻塞工单流转）。

### 7.2 告警口径（列表/工作台/统计共用同一实现）

「SLA 告警」= 首次响应**或**解决任一维度处于 `warning|breached`，且工单状态 ∉ {`draft, closed, cancelled, on_hold, pending_confirm`}。`GET /api/tickets?sla=alert`、部门工单箱聚合视图、Dashboard 告警卡片均复用此谓词（数字与明细可对账）。

## 8. Dashboard 与统计

| 接口 | 说明 |
|---|---|
| `GET /api/dashboard/summary` | `{ kpis: { total, todayCreated, inProgress, onHold, closed }, slaAlerts: { count } }`；**数据范围按角色**（requester/agent 本人数据、manager 本部门、admin 全局）；**草稿不计入任何统计**；`todayCreated` 的「今日」= 服务端按工作日历时区计算的自然日（唯一口径，所有接口共用） |
| `GET /api/dashboard/breakdown?dimension=category\|priority\|department` | `[{ key, labelZh, labelEn, count }]`；同角色范围；草稿排除 |
| 下钻 | KPI/告警卡/图表下钻均调用 `GET /api/tickets` + 对应筛选（同一谓词构建器），保证条数与卡片数字完全一致 |

## 9. 通知（服务端行为，无独立 API）

- 触发点仅两个：**提交**（提交人「已创建」确认邮件；当场自动分配成功时处理人「已分配」邮件）、**回复**（提交人回复→通知当前处理人；处理人或其他非提交人角色回复→通知提交人）。
- 异步发送（事务提交后 fire-and-forget），失败仅记 error 日志；未配置 SMTP 主机静默跳过（debug 日志）；二者均不影响工单操作响应码。
- 其余状态流转与 SLA 预警/超期不发送邮件。

## 10. 审计

| 接口 | 说明 |
|---|---|
| `GET /api/tickets/{id}/activities` | `{ items: [{ id, actor?: UserRef, action, fromStatus?, toStatus?, fieldChanges?: [{ field, oldValue, newValue }], remarkZh, remarkEn, source: "user"\|"system"\|"mcp", createdAt }] }`；可见性同工单详情（对象级） |
| `GET /api/admin/audit-logs` | 仅 admin（其他角色 403 且前端无入口）；分页 20；auditkit 事件：`{ id, category, actor, summaryZh, summaryEn, detail, createdAt }`——部门/用户/分类/SLA/日历/分配规则/公司等配置变更 |

工单写操作的活动日志字段要求：动作、操作人、前后状态、字段前后值（改分类/优先级/分配/转派）、中英文备注、来源；分配失败原因（待分配记录）同样入活动日志。

## 11. 嵌入式工作台（`/embed/workbench`）

前端路由无应用外壳（无侧边导航/面包屑，可 iframe 嵌入）；仅提交人角色可用（服务端对以下接口强制 `role=requester`，其他角色 403）；唯一对外跳转灵基智能体入口由前端以最外层窗口打开。

| 接口 | 说明 |
|---|---|
| `GET /api/embed/summary` | `{ kpis: { toProcess: {drafts + pending_confirm 的本人工单数}, inProgress, completed, avgResolutionHours } }`；平均处理时长=已关闭本人工单 `closedAt − 首次响应起算点` 的均值 |
| `GET /api/embed/kanban` | `{ limit: number, truncated: boolean, columns: { drafts: TicketSummary[], teamProcessing: TicketSummary[] /*待分配+已分配+处理中+挂起*/, toConfirm: TicketSummary[], done: TicketSummary[] /*已关闭+已取消*/ } }`；一次性拉取、有条数上限，`truncated=true` 时前端提示切换列表视图；卡片含编码/优先级/状态/主题/分类/SLA 提示 |
| 列表视图 | 复用 `GET /api/tickets`（requester 强制 `requester=self`，即本人工单）：搜索 + 状态 Tab + 分页 + SLA 倒计时列 |
| 草稿编辑 / 详情 | 草稿卡片点击进入嵌入式草稿编辑器（复用标准工单表单创建/编辑接口 §3.3）；其余状态进入嵌入式详情（复用 `GET /api/tickets/{id}`，前端隐藏「编辑草稿」入口；详情回复接口复用 §3.4，权限同标准端） |

## 12. 附件

| 接口 | 请求 | 响应 | 说明 |
|---|---|---|---|
| `POST /api/attachments` | `multipart/form-data`：`file`、`ticketId?`、`replyId?` | `201 { id, fileName, sizeBytes }`；413 `FILE_TOO_LARGE`（>10MB） | attachment 模块承载；上传者须对目标工单有写权限；元数据记录归属与来源 `upload` |
| `GET /api/attachments/{id}/download` | – | 文件流 | 可见性同所属工单/回复（对象级，防枚举 404） |

MCP 下载挂接为服务内部动作：从 `attachmentUrl(s)` 拉取文件、写入同一存储、元数据 `source: "mcp-download"`，受单文件 10MB 上限约束。

## 13. MCP 工具（灵基智能体）

authkit MCP 端点注册以下工具（工具入参校验与 REST 同口径）：

| 工具 | 入参 | 返回 | 语义 |
|---|---|---|---|
| `create_ticket` | `{ subjectZh: string, subjectEn?: string, description: string, categoryId: number, subCategoryId?: number, priority: Priority, attachmentUrl?: string, attachmentUrls?: string[], idempotencyKey: string }` | `{ id, ticketNo, status, assignment }`（assignment 同 §3.3 submit 响应） | 等价「创建草稿 + 提交」一步完成；服务端下载 `attachmentUrl(s)` 并挂接到工单/回复名下（下载尽力执行，失败记日志并写活动日志注明未挂接原因，**不阻塞工单创建**）；不带链接时行为与常规创建一致；幂等键语义同 §3.3 |

## 14. CSV 通用格式

- 编码 UTF-8 带 BOM；首行为表头；逗号分隔、引号转义。
- 导出接口不受当前搜索过滤影响时以各接口注明为准（分配规则导出始终全量）。
- 导入均先在客户端解析并预览确认，再以各接口定义的行结构提交；服务端逐行校验并返回失败行定位。
