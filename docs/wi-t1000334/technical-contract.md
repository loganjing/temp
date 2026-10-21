# 工单系统技术契约（136-ticket）

> 工作项：wi-t1000334 · 阶段：design。本文件是前后端共同遵循的接口与数据契约的唯一字段级来源；架构决策见 architecture-baseline.md。

## 1. 通用约定

- 基础路径 `/api`；请求与响应体均为 `application/json; charset=utf-8`；除登录外全部接口需要认证。
- 认证：`Authorization: Bearer <token>`；令牌为 64 位十六进制字符串，有效期 7 天；缺失、无效或过期 → 401。
- 字段命名 camelCase；时间戳为 ISO-8601 UTC 字符串（如 `2026-10-21T08:30:00.000Z`）；主键为整数；工单对外编号 `ticketNo` 为字符串（`TKT-` + 6 位序号，如 `TKT-000012`）。
- 统一错误体：

```json
{ "error": { "code": "STATE_CONFLICT", "message": "工单已完成，不能再次完成" } }
```

- 状态码：`401 UNAUTHENTICATED`；`403 FORBIDDEN`（明确越权，如非提交人评价）；`404 NOT_FOUND`（不存在或跨公司，不区分暴露）；`409 STATE_CONFLICT`（状态机冲突、重复评价、同名业务组）；`422 VALIDATION_ERROR`（参数缺失或非法）。
- 分页：`page`（从 1 起，默认 1）、`pageSize`（默认 20，最大 100）；列表响应含 `total`。
- 幂等性：不引入幂等键；重复操作由状态机与唯一约束拒绝（409）。业务组重复添加成员视为成功（无操作）。

## 2. 枚举与字典

- 工单状态 `status`：`created`（创建）/ `pending_assignment`（待分配）/ `pending_process`（待处理）/ `completed`（完成）/ `cancelled`（取消）。
- 优先级 `priority`：`P0`（最高）… `P4`（最低）；按优先级升序排序时 P0 在前。
- 满意度 `rating`：整数 1–5，5 为最满意。
- 操作事件类型（日志与时间线共用）：`TICKET_CREATED`、`TICKET_ASSIGNMENT_ENTERED`、`TICKET_ASSIGNED`、`TICKET_TRANSFERRED`、`TICKET_REPLIED`、`TICKET_COMPLETED`、`TICKET_CANCELLED`、`TICKET_RATED`。
- 邮件类型 `kind`：`ticket_completed_notice`（工单完成通知）；发件箱状态 `status`：`recorded`（记录式投递；接入 SMTP 后扩展 `sent`/`failed`）。
- 全局问题分类（种子字典）：`account` 账号与权限 / `billing` 计费与商务 / `bug` 功能缺陷 / `feature` 功能咨询 / `performance` 性能问题 / `integration` 集成对接 / `data` 数据问题 / `other` 其他。

## 3. 认证接口

### POST /api/auth/login

- 请求：`{ "username": string, "password": string }`（均必填）。
- 200：`{ "token": string, "user": UserSummary }`。
- 401：用户名或密码错误（统一文案，不区分是哪一项错误）。

### POST /api/auth/logout

- 需认证；204，撤销当前会话令牌。

### GET /api/auth/me

- 200：`UserSummary`；401：未认证或会话过期。

`UserSummary`：`{ id: int, username: string, fullName: string, email: string, companyId: int, companyName: string, department: string }`。

## 4. 工单接口

### GET /api/tickets（工作台 / 我的工单列表）

- 查询参数：
  - `scope`：`company`（默认，本公司工单=工作台）| `mine`（当前用户提交的工单）。
  - `status`：`scope=company` 时默认 `pending_process`，可选 `pending_assignment`；`scope=mine` 时默认返回全部状态，可显式过滤。
  - `categoryId: int?`、`priority?`、`companyId: int?`（仅接受当前用户本公司，其他取值返回空结果）、`q?`（命中主题包含或工单编号精确，忽略大小写）。
  - `sort`：`createdAt`（默认）| `priority`；`order`：`desc`（默认）| `asc`（`priority` + `asc` 表示 P0 在前）；`page`、`pageSize`。
- 语义：所有条件可组合（AC-11）；跨公司工单永不出现在结果中（AC-02）。
- 200：`{ "items": TicketListItem[], "total": int, "page": int, "pageSize": int }`。
- `TicketListItem`：`{ id: int, ticketNo: string, subject: string, categoryId: int, categoryName: string, priority: string, status: string, companyName: string, submitterName: string, assignedGroupId: int?, assignedGroupName: string?, createdAt: string, firstReplyAt: string? }`。

### POST /api/tickets（创建工单）

- 请求：`{ subject: string（必填，非空，≤200）, categoryId: int（必填，须为有效分类）, priority: string（必填，P0–P4）, description: string?（≤5000，默认 ""） }`。
- 行为：提交人 = 当前用户，公司 = 当前用户公司；创建事务内生成 `ticketNo`、插入 `created` 状态、流转进入 `pending_assignment`，并按本公司"分类 → 业务组"规则自动分配：命中则进入 `pending_process` 并记录归属组；未命中停留 `pending_assignment`。全部事件写入操作日志。
- 200：`{ ticket: TicketDetail, replies: [], timeline: TimelineItem[], submitterHistory: HistoryTicketItem[], rating: null }`（结构同 GET 详情）。
- 422：必填字段缺失或取值非法。

### GET /api/tickets/:id（工单详情）

- 200：`{ ticket: TicketDetail, replies: ReplyItem[], timeline: TimelineItem[], submitterHistory: HistoryTicketItem[], rating: RatingInfo? }`
  - `TicketDetail`：`TicketListItem` 全部字段 + `description: string` + `submitter: UserSummary` + `completedBy: { id: int, fullName: string }?` + `completedAt: string?` + `updatedAt: string`。
  - `ReplyItem`：`{ id: int, author: { id: int, fullName: string }, content: string, createdAt: string }`，按 `createdAt` 升序。
  - `TimelineItem`：`{ type: 事件类型（§2）, operator: { id: int, fullName: string } | "system", payload: object, occurredAt: string }`，按时间升序；不含回复类事件（回复在 `replies` 展示）。
  - `HistoryTicketItem`：`{ id: int, ticketNo: string, subject: string, status: string, createdAt: string }`，为提交人历史工单，按 `createdAt` 倒序。
  - `RatingInfo`：`{ rating: int, ratedAt: string, ratedBy: { id: int, fullName: string } }`。
- 404：工单不存在或属于其他公司。

### POST /api/tickets/:id/replies（回复）

- 请求：`{ content: string（必填，非空，≤5000） }`。
- 行为：`author` = 当前用户；首条回复回写 `tickets.first_reply_at`；写 `TICKET_REPLIED` 事件。
- 200：`{ reply: ReplyItem }`；404：跨公司或不存在；409：工单处于终态（completed/cancelled 不可回复）。

### POST /api/tickets/:id/assign（手动分配）

- 请求：`{ groupId: int（必填，须为本公司已存在业务组） }`；前置：`status = pending_assignment`。
- 行为：归属组写入、状态 → `pending_process`；写 `TICKET_ASSIGNED` 事件（操作人为当前用户）。
- 200：`{ ticket: TicketDetail }`；409：状态非待分配；404：工单或业务组不存在/跨公司；422：参数非法。

### POST /api/tickets/:id/transfer（转派）

- 请求：`{ toGroupId: int（必填） }`；前置：`status = pending_process`；目标组须为本公司业务组且不同于当前归属组。
- 行为：归属组变更，状态保持 `pending_process`；写 `TICKET_TRANSFERRED` 事件（负载含原组/目标组）；允许多次转派。
- 200：`{ ticket: TicketDetail }`；409：非待处理或终态；422：目标组与当前归属组相同；404：目标组不存在/跨公司。

### POST /api/tickets/:id/complete（完成处理）

- 请求体：空对象。
- 行为：记录 `completed_by` = 当前用户、`completed_at` = 当前时间；状态 → `completed`；同事务写入发件箱（收件人为提交人邮箱，主题含 `ticketNo` 与 `subject`，`kind = ticket_completed_notice`，`status = recorded`）。
- 200：`{ ticket: TicketDetail }`；409：状态非 `pending_process`（含终态重复完成）。

### POST /api/tickets/:id/cancel（取消）

- 请求体：空对象；前置：`status ∈ { created, pending_assignment, pending_process }`。
- 200：`{ ticket: TicketDetail }`；409：终态工单不可取消。

### POST /api/tickets/:id/rating（满意度评价）

- 请求：`{ rating: int（必填，1–5） }`；前置：`status = completed` 且当前用户 = 工单提交人。
- 200：`{ rating: RatingInfo }`；403：当前用户非提交人；409：工单未完成或已评价；422：`rating` 取值非法。

## 5. 业务组、分配规则与字典接口

### GET /api/groups

- 200：`{ items: GroupInfo[] }`（仅本公司）。
- `GroupInfo`：`{ id: int, name: string, description: string, memberCount: int, members: [{ id: int, username: string, fullName: string, department: string }], createdAt: string }`。

### POST /api/groups

- 请求：`{ name: string（必填，非空，≤50）, description: string?（≤200，默认 ""） }`。
- 200：`{ group: GroupInfo }`；409：本公司同名业务组已存在；422：参数非法。

### POST /api/groups/:id/members

- 请求：`{ userIds: int[]（必填，非空） }`，全部须为本公司用户；已在组内的忽略（幂等）。
- 200：`{ group: GroupInfo }`；404：组不存在/跨公司；422：包含非本公司用户。

### DELETE /api/groups/:id/members/:userId

- 204；404：组或成员关系不存在/跨公司。

### GET /api/assignment-rules

- 200：`{ items: RuleInfo[] }`（仅本公司）。
- `RuleInfo`：`{ id: int, categoryId: int, categoryName: string, groupId: int, groupName: string, createdAt: string }`。

### PUT /api/assignment-rules

- 请求：`{ categoryId: int（必填，有效分类）, groupId: int（必填，本公司业务组） }`；语义：本公司"分类 → 组"规则 upsert（已存在则改指向）。
- 200：`{ rule: RuleInfo }`；404：组不存在/跨公司；422：参数非法。

### DELETE /api/assignment-rules/:categoryId

- 204：删除本公司该分类规则；404：本公司无该分类规则。删除后该分类新工单停留待分配（等待手动分配）。

### GET /api/categories

- 200：`{ items: [{ id: int, code: string, name: string }] }`（全局字典，只读）。

### GET /api/users

- 200：`{ items: [{ id: int, username: string, fullName: string, email: string, department: string }] }`（仅本公司用户，供业务组成员选择）。

## 6. 统计接口

### GET /api/stats/dashboard

- 查询参数：`companyId?`、`department?`（均可选，过滤作用于全部指标与分布；维度切换由前端基于返回的两组分布数据完成）。
- 200：

```json
{
  "volume": 12,
  "avgResponseMinutes": 36.5,
  "satisfaction": { "average": 4.5, "ratedCount": 6 },
  "hotCategories": [{ "categoryId": 3, "categoryName": "功能缺陷", "count": 5 }],
  "byCompany": [{ "companyId": 1, "companyName": "示例科技有限公司", "count": 8 }],
  "byDepartment": [{ "companyId": 1, "companyName": "示例科技有限公司", "department": "产品部", "count": 5 }]
}
```

- 口径：`volume` = 过滤范围内工单总数；`avgResponseMinutes` =「创建 → 首条回复」时长的平均分钟数（无回复的工单不计入，无样本时为 `null`）；`satisfaction.average` = 已评价工单的平均分（保留 2 位小数，无评价时为 `null`）；`hotCategories` = 范围内按分类工单量降序前 5（并列按分类名稳定排序）；`byCompany` / `byDepartment` = 按公司、按（公司 + 提交人部门）聚类的工单量，计数降序。
- 可见性：登录即可查询聚合数据；跨公司仅暴露指标计数，不含工单明细（UV-02 保守基线）。

## 7. 邮件记录接口

### GET /api/mail-outbox

- 查询参数：`ticketId?`、`page`、`pageSize`；仅返回当前用户公司工单的邮件记录。
- 200：`{ items: [{ id: int, ticketId: int, ticketNo: string, kind: string, toEmail: string, subject: string, body: string, status: string, createdAt: string }], total: int, page: int, pageSize: int }`。

## 8. 数据库模型与种子数据

表结构、约束与索引见 architecture-baseline.md §4.1；本节登记实现级细节与种子账号。

- 密码哈希格式：`scrypt:N:r:p:saltB64:hashB64`（N=16384, r=8, p=1；校验使用常量时间比较）；会话令牌为 32 字节随机数的十六进制，库内存 `SHA-256(token)`。
- `ticket_no` 生成：创建事务内取自增 id，格式化为 `TKT-` + 6 位零填充序号。
- 演示账号（种子迁移内置，密码统一 `Demo@1234`，哈希以预计算常量内嵌）：

| 用户名 | 姓名 | 公司 | 部门 | 邮箱 | 用途 |
|---|---|---|---|---|---|
| alice | 张丽 | 示例科技有限公司 | 产品部 | alice@example-tech.cn | 公司A 提交人 |
| bob | 王强 | 示例科技有限公司 | 客服部 | bob@example-tech.cn | 公司A 处理人 |
| carol | 李梅 | 星辰控股集团 | 运营部 | carol@xingchen-group.cn | 公司B 提交人 |
| dave | 赵磊 | 星辰控股集团 | 技术部 | dave@xingchen-group.cn | 公司B 处理人 |

- 公司种子：示例科技有限公司（id=1）、星辰控股集团（id=2）；业务组、分配规则与工单数据不种子化。

## 9. 状态机与业务规则

### 9.1 状态机（操作前置状态 → 结果）

| 操作 | 前置状态 | 结果 |
|---|---|---|
| 创建（含自动分配尝试） | — | `created → pending_assignment` →（规则命中）`pending_process` + 归属组 |
| 手动分配 assign | `pending_assignment` | `pending_process` + 归属组 |
| 转派 transfer | `pending_process` | `pending_process` + 归属组变更 |
| 完成 complete | `pending_process` | `completed` + 处理人/处理时间 + 完成通知入发件箱 |
| 取消 cancel | `created` / `pending_assignment` / `pending_process` | `cancelled` |
| 评价 rating | `completed` 且操作人为提交人 | 唯一评价记录 |
| 回复 reply | 非终态（`created` / `pending_assignment` / `pending_process`） | 回复追加；首条回写 `first_reply_at` |
| 终态（`completed` / `cancelled`） | — | 一切状态变更与转派操作 → 409 |

### 9.2 业务规则

- **公司隔离**：工单域全部读写按当前用户公司过滤；跨公司详情与操作返回 404；列表、搜索、工作台结果不含其他公司工单（AC-02）。
- **操作日志**：§9.1 每个关键操作在同一事务内写一条 `audit_events` 事件（经 auditkit `record` 写入）：`event_type` = 操作类型（§2 事件枚举）、`actor_user_id` = 操作人（系统自动动作为空，对外展示为 `system`）、`occurred_at` = 操作时间、`metadata_json` 携带 `ticketId`（关联工单）与上下文负载（如分配/转派的目标组）；无对应操作不产生日志（AC-12）。工单时间线按 `metadata_json.ticketId` 过滤、按 `occurred_at` 升序读取。
- **完成通知**：仅 `complete` 事务产生 `ticket_completed_notice` 发件箱记录；未完成工单不产生通知记录（AC-08）。
- **评价唯一**：`ticket_ratings` 以工单为主键，重复评价拒绝（409）；未完成工单不可评价（RB-12）。
- **业务组成员变更**：不影响组内已分配工单的归属（§5.2.1）。
