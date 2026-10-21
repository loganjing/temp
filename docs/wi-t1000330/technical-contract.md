# 技术契约：API 详细定义

本文件是前后端共同遵循的接口契约唯一来源，字段级细节以本文件为准；架构基线只保留接口摘要。约定值（枚举、时间格式、错误码）同样以本文件为准。

## 1. 通用约定

- 基础路径：`/api`；请求与响应均为 JSON（除登录页等静态资源外全部为接口）。
- 认证：除 `POST /api/auth/login` 外，全部接口要求 `Authorization: Bearer <token>`；令牌由登录获得，失效或缺失返回 `401` + `AUTH_REQUIRED`。
- 时间：ISO 8601 UTC 字符串，如 `2026-10-21T03:04:54.523Z`。
- 错误格式统一为：

  ```json
  { "error": { "code": "<ERROR_CODE>", "message": "<人可读中文提示>" } }
  ```

- 常用状态码：`400` 参数非法；`401` 未认证；`403` 无权限（含公司隔离拒绝，code=`COMPANY_FORBIDDEN`，message=`无权访问其他公司的工单`）；`404` 资源不存在；`409` 状态或唯一性冲突；`500` 内部错误。
- 公司隔离语义：工单类资源默认仅限当前用户所属公司；对其他公司工单的任何读写（含直接打开详情）返回 `403` + `COMPANY_FORBIDDEN`。列表、统计与公司维度筛选对带 `crossCompanyView` 标记的用户放开跨公司读；写操作（创建、分配、回复、转派、完成、取消、评价、配置）一律限定本公司。
- 幂等性：创建与动作类接口不承诺幂等，重复提交产生重复结果（业务上以唯一性约束拦截的除外，如重复评价返回 `409`）。

### 1.1 枚举

| 枚举 | 取值 | 中文含义 |
| --- | --- | --- |
| `priority` | `P0` / `P1` / `P2` / `P3` / `P4` | SLA 优先级五级 |
| `status` | `created` / `pending_assignment` / `pending_processing` / `completed` / `cancelled` | 创建 / 待分配 / 待处理 / 完成 / 取消 |
| `score` | `1` – `5` 整数 | 满意度评分（1 最不满意，5 最满意） |
| 分类 `category` | 共享常量字典（实现期冻结初始清单，如 `account` / `payment` / `performance` / `bug` / `feature` / `other`，前后端共享同一常量） | 问题分类 |

### 1.2 通用数据结构

**Ticket（工单对象）**

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `id` | integer | 否 | 工单ID，显示为 `#<id>` |
| `companyId` | integer | 否 | 所属公司 |
| `subject` | string(≤200) | 否 | 主题 |
| `description` | string | 否 | 描述（完整呈现，可多行） |
| `category` | string | 否 | 问题分类（字典内取值） |
| `priority` | string | 否 | SLA 优先级 P0-P4 |
| `status` | string | 否 | 生命周期状态 |
| `submitter` | UserBrief | 否 | 提交人摘要（含邮箱） |
| `assignedGroupId` | integer | 是 | 已分配业务组（未分配为 null） |
| `currentAssignee` | UserBrief | 是 | 当前处理责任（未接单为 null） |
| `firstReplyAt` | string(datetime) | 是 | 首次回复时间（响应时间口径） |
| `completedBy` | UserBrief | 是 | 完成操作处理人 |
| `completedAt` | string(datetime) | 是 | 处理完成时间 |
| `cancelledAt` | string(datetime) | 是 | 取消时间 |
| `createdAt` / `updatedAt` | string(datetime) | 否 | 创建/更新时间 |

**UserBrief（用户摘要）**：`id`(integer)、`displayName`(string)、`email`(string)、`companyId`(integer)、`companyName`(string)、`departmentName`(string，可空)。

**Reply（回复）**：`id`(integer)、`ticketId`(integer)、`replier`(UserBrief)、`content`(string)、`createdAt`(datetime)。

**Group（业务组）**：`id`(integer)、`companyId`(integer)、`name`(string)、`members`(UserBrief[])、`createdAt`(datetime)。

**AssignmentRule（分配规则）**：`id`(integer)、`companyId`(integer)、`category`(string)、`targetGroupId`(integer)、`targetGroupName`(string)、`createdAt`(datetime)。

**LogEntry（日志条目，来自审计事件）**：`id`(integer)、`action`(string)、`actor`(UserBrief 或 `system`)、`createdAt`(datetime)、`ticketId`(integer，可空)、`detail`(string，操作摘要中文描述)。

`action` 取值：`ticket_created` / `ticket_assigned` / `ticket_replied` / `ticket_transferred` / `ticket_completed` / `ticket_cancelled` / `ticket_rated` / `notification_failed`。

## 2. 认证与用户（identity 模块）

### 2.1 `POST /api/auth/login`

- 请求：`{ "username": string, "password": string }`（均必填）。
- 响应 `200`：`{ "token": string, "user": AuthUser }`；`AuthUser` = UserBrief + `crossCompanyView`(boolean)。
- 错误：`401` + `AUTH_INVALID`（用户名或密码错误）。
- 幂等：是（重复登录返回新令牌）。

### 2.2 `POST /api/auth/logout`

- 请求：无正文。
- 响应 `204`。错误：`401`。

### 2.3 `GET /api/auth/me`

- 响应 `200`：`AuthUser`（同 2.1）。

### 2.4 `GET /api/users?companyId=`

- 用途：转派目标选择、业务组成员选择。
- 权限：默认返回本公司用户；`crossCompanyView` 用户可传 `companyId` 查看指定公司用户（省略时仍默认本公司）。
- 响应 `200`：`UserBrief[]`（按 displayName 排序）。

## 3. 工单（ticket 模块）

### 3.1 `POST /api/tickets`（创建）

- 权限：任何已登录用户（提交人视角）。
- 请求：`{ "subject": string(1-200), "description": string(≥1), "category": string, "priority": "P0"|"P1"|"P2"|"P3"|"P4" }`。
- 行为：单事务内写入工单（公司取当前用户公司、提交人为当前用户、初始 `created`），随即执行本公司"分类 → 业务组"规则匹配：命中则设置 `assignedGroupId` 并流转 `pending_assignment → pending_processing`；未命中流转为 `pending_assignment`。
- 响应 `201`：完整 Ticket 对象（含事务结束后的状态与分配结果）。
- 错误：`400` + `VALIDATION_ERROR`（字段缺失/超长/分类或优先级不在枚举内）。
- 幂等：否。

### 3.2 `GET /api/tickets`（列表 / 工作台）

- 查询参数：

  | 参数 | 类型/默认 | 说明 |
  | --- | --- | --- |
  | `scope` | `workbench`(默认) / `mine` | `workbench`=本公司待处理池（跨公司视角配合 `companyId` 跨公司）；`mine`=当前用户提交的工单（全状态） |
  | `status` | string，可空 | 单个状态过滤（`workbench` 默认 `pending_processing`，显式传 `pending_assignment` 可看待分配池） |
  | `category` / `priority` / `groupId` | string/integer，可空 | 筛选 |
  | `companyId` | integer，可空 | 公司维度筛选；仅 `crossCompanyView` 用户生效，其他用户传入非本公司值返回 `403` + `COMPANY_FORBIDDEN` |
  | `q` | string，可空 | 主题/描述/工单ID 关键字搜索（大小写不敏感包含匹配） |
  | `sort` | `createdAt`(默认) / `priority` / `status` / `firstReplyAt` | 排序字段 |
  | `order` | `desc`(默认) / `asc` | 排序方向；`priority` 排序按 P0 最高 |
  | `page` / `pageSize` | integer，默认 1 / 20 | 分页 |

- 响应 `200`：`{ "items": Ticket[], "total": integer, "page": integer, "pageSize": integer }`。
- 公司隔离：非 `crossCompanyView` 用户的任何结果集只含本公司工单。

### 3.3 `GET /api/tickets/:id`（详情）

- 响应 `200`：`{ "ticket": Ticket, "replies": Reply[]（按 createdAt 升序）, "rating": { "score": integer, "createdAt": datetime } | null }`。
- 错误：`404` + `NOT_FOUND`；他公司工单 `403` + `COMPANY_FORBIDDEN`。

### 3.4 `POST /api/tickets/:id/replies`（回复）

- 权限：本公司已登录用户（提交人或处理人）；工单状态为活跃三态（`created`/`pending_assignment`/`pending_processing`）。
- 请求：`{ "content": string(1-5000) }`。
- 行为：写入回复；若 `firstReplyAt` 为空则写入当前时间（响应时间口径锚点）。
- 响应 `201`：Reply 对象。
- 错误：`400` + `VALIDATION_ERROR`；`403` + `COMPANY_FORBIDDEN`；`409` + `STATE_CONFLICT`（工单已完成或已取消，message=`工单已结束，无法回复`）。

### 3.5 `POST /api/tickets/:id/cancel`（取消）

- 权限：本公司已登录用户；完成前任意活跃状态可取消（R7）。
- 请求：无正文。
- 行为：`cancelled_at` 置为当前时间，状态流转 `cancelled`，写审计事件。
- 响应 `200`：更新后 Ticket。
- 错误：`403` + `COMPANY_FORBIDDEN`；`409` + `STATE_CONFLICT`（已完成工单不可取消）。

### 3.6 `GET /api/tickets/:id/submitter`（处理上下文：提交人完整信息）

- 权限：本公司用户（处理人视角）；`crossCompanyView` 用户可读任意公司工单的该视图。
- 响应 `200`：

  ```json
  {
    "name": string, "email": string, "companyName": string, "departmentName": string|null,
    "historyTickets": [ { "id": integer, "subject": string, "status": string, "category": string, "priority": string, "createdAt": datetime } ]
  }
  ```

  `historyTickets` 为该提交人全部历史工单（跨工单读取其提交记录），按 `createdAt` 降序。
- 错误：`404`；`403` + `COMPANY_FORBIDDEN`。

## 4. 分配配置（assignment 模块）

权限约定：本组接口的读默认本公司；`crossCompanyView` 可用 `companyId` 跨公司读；写（POST/PUT/DELETE）仅限本公司（配置操作者角色未规定，本公司已登录用户可维护，见架构基线 2.3/6）。

### 4.1 `GET /api/groups?companyId=`

- 响应 `200`：`Group[]`（含成员列表）。

### 4.2 `POST /api/groups`

- 请求：`{ "name": string(1-100), "memberIds": integer[]（可空数组） }`。
- 行为：在本公司创建业务组并设置成员（成员必须属于本公司，否则 `400`）。
- 响应 `201`：Group。
- 错误：`400` + `VALIDATION_ERROR`（名称为空/成员不属于本公司）。

### 4.3 `PUT /api/groups/:id`

- 请求：`{ "name": string(1-100)?, "memberIds": integer[]? }`；`memberIds` 传入时整组替换成员。
- 响应 `200`：Group。错误：`404`；`403` + `COMPANY_FORBIDDEN`；`400`。

### 4.4 `DELETE /api/groups/:id`

- 行为：删除前检查引用：被 `assignment_rules` 引用或被未结束工单引用时拒绝。
- 响应 `204`。错误：`404`；`403`；`409` + `GROUP_IN_USE`（message 说明需先删除规则或处理引用工单）。

### 4.5 `GET /api/assignment-rules?companyId=`

- 响应 `200`：`AssignmentRule[]`。

### 4.6 `POST /api/assignment-rules`

- 请求：`{ "category": string, "targetGroupId": integer }`。
- 行为：创建本公司"分类 → 业务组"规则；目标组必须为本公司组。
- 响应 `201`：AssignmentRule。
- 错误：`400` + `VALIDATION_ERROR`；`409` + `RULE_CONFLICT`（本公司该分类已存在规则；同一分类唯一，规避未规定的多规则冲突）。

### 4.7 `DELETE /api/assignment-rules/:id`

- 响应 `204`。错误：`404`；`403`。

### 4.8 `POST /api/tickets/:id/assign`（人工分配）

- 权限：本公司已登录用户；工单状态必须为 `pending_assignment`（自动分配未命中的兜底，R1）。
- 请求：`{ "groupId": integer }`（本公司业务组）。
- 行为：设置 `assignedGroupId`，状态流转 `pending_processing`，写审计事件。
- 响应 `200`：Ticket。
- 错误：`404`；`403`；`400`（组不属于本公司）；`409` + `STATE_CONFLICT`（状态非待分配）。

## 5. 处理协作（processing 模块）

### 5.1 `POST /api/tickets/:id/claim`（接单，确立处理责任）

- 权限：本公司用户；状态 `pending_processing`；`currentAssignee` 为空。
- 行为：`current_assignee_id` 置为当前用户。
- 响应 `200`：Ticket。错误：`403`；`409` + `STATE_CONFLICT`（已有人接单或状态不允许）。

### 5.2 `POST /api/tickets/:id/transfer`（转派）

- 权限：当前处理人（`current_assignee` 为操作者本人）；状态 `pending_processing`。未接单时需先接单（责任链明确）。
- 请求：`{ "targetUserId": integer }`（同公司其他用户，不得为本人）。
- 行为：处理责任转移（`current_assignee_id` 置为目标用户）；写审计事件（转派人、目标、时间）。
- 响应 `200`：Ticket。
- 错误：`404`；`403`（含非当前处理人操作 `403` + `NOT_ASSIGNEE`，message=`仅当前处理人可转派`）；`400`（目标非法）；`409` + `STATE_CONFLICT`。

### 5.3 `POST /api/tickets/:id/complete`（完成处理）

- 权限：本公司用户且为当前处理人；若未接单，完成动作隐含接单（完成者即处理人）。状态 `pending_processing`。
- 请求：`{ "resolution`: string(0-5000，可空，处理说明) }`。
- 行为：单事务内 `completed_by`/`completed_at` 落库、状态流转 `completed`、审计事件；事务提交后同步发送提交人邮箱通知（失败不回滚，见下）。
- 响应 `200`：`{ "ticket": Ticket, "notification": { "sent": boolean, "error": string|null } }`。
- 错误：`403`；`409` + `STATE_CONFLICT`；`500`（完成事务本身失败时返回，工单状态不变）。

## 6. 用户评价（rating 模块）

### 6.1 `POST /api/tickets/:id/rating`

- 权限：该工单提交人本人；工单状态 `completed`；未评价过（评价修改/删除未规定，本期一单一条）。
- 请求：`{ "score": 1|2|3|4|5 }`。
- 响应 `201`：`{ "ticketId": integer, "score": integer, "createdAt": datetime }`。
- 错误：`403`（非提交人 `403` + `NOT_SUBMITTER`）；`409` + `STATE_CONFLICT`（未完成或已评价）；`400`。

## 7. 统计分析（stats 模块）

### 7.1 `GET /api/stats/distribution?dimension=company|department&companyId=`

- 权限：`company` 维度要求 `crossCompanyView`（跨公司视角，R8）；`department` 维度默认本公司，`crossCompanyView` 可配合 `companyId` 指定公司。非跨公司用户访问 `company` 维度返回 `403` + `CROSS_COMPANY_REQUIRED`。
- 响应 `200`：`{ "dimension": string, "items": [ { "key": integer|string, "label": string, "count": integer } ] }`；公司维度按工单所属公司聚合，部门维度按提交人所属部门聚合（无部门的工单计入 `未分配部门` 桶）。

### 7.2 `GET /api/stats/dashboard?companyId=`

- 权限：默认统计本公司；`crossCompanyView` 可用 `companyId` 指定公司或省略以统计全部公司。
- 响应 `200`：

  ```json
  {
    "ticketCount": { "total": integer, "byStatus": { "created": integer, "pending_assignment": integer, "pending_processing": integer, "completed": integer, "cancelled": integer } },
    "avgResponseMinutes": number|null,      // 平均响应时间：创建到首次回复的分钟均值，仅统计已回复工单
    "satisfaction": { "avgScore": number|null, "ratedCount": integer },
    "hotCategories": [ { "category": string, "count": integer } ]   // 按分类聚合工单量，降序，Top 10
  }
  ```

## 8. 操作日志（audit 模块）

### 8.1 `GET /api/tickets/:id/logs`

- 权限：本公司用户；`crossCompanyView` 可读。
- 响应 `200`：`LogEntry[]`（按时间升序）。
- 错误：`404`；`403`。

### 8.2 `GET /api/logs?ticketId=&action=&companyId=&page=&pageSize=`

- 权限：默认返回本公司事件；`crossCompanyView` 可跨公司查询（`companyId` 可选过滤）。
- 响应 `200`：`{ "items": LogEntry[], "total": integer, "page": integer, "pageSize": integer }`。

## 9. 服务端到前端的映射约定

- 前端列表页使用 3.2 的分页与筛选参数；公司筛选控件仅对 `crossCompanyView=true` 的用户可见，普通用户隐藏以避免必然失败的请求。
- 完成动作后前端读取 `notification.sent`，为 `false` 时在界面给出"工单已完成，但邮件通知发送失败"的可见反馈。
- 状态中文文案映射：`created`→创建、`pending_assignment`→待分配、`pending_processing`→待处理、`completed`→完成、`cancelled`→取消。
