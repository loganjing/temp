# 工单系统技术契约

> Work Item: wi-t1000016  
> 本文件定义前后端共同遵循的 API 契约。字段级细节以此文件为唯一来源。

## 1. 通用约定

### 1.1 认证

所有 `/api/*` 接口（除 `POST /api/auth/login`）需在请求头携带 `Authorization: Bearer <token>`。authkit 中间件校验令牌并注入认证上下文（userId、companyId、role、name、email、department）。

### 1.2 公司隔离

后端在每个业务查询中附加 `WHERE company_id = ?`（值来自认证上下文）。前端不传递 `company_id` 参数，由后端自动绑定。

### 1.3 统一响应格式

**成功**（单个资源）：

```json
{ "data": { ... } }
```

**成功**（列表）：

```json
{ "data": [ ... ], "total": 100, "page": 1, "pageSize": 20 }
```

**错误**：

```json
{ "error": { "code": "NOT_FOUND", "message": "工单不存在" } }
```

HTTP 状态码：200（成功）、201（创建）、400（参数错误）、401（未认证）、403（无权限）、404（不存在）、409（状态冲突）、500（服务错误）。

### 1.4 ID 对照表

| 实体 | 生成方 | 数据库主键类型 | 外键引用类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---|---|---|---|---|---|---|
| Ticket | 后端 `crypto.randomUUID()` | TEXT (UUID) | TEXT (UUID) | string | string | 后端生成，前端透传，无需转换 |
| User | 后端 `crypto.randomUUID()` | TEXT (UUID) | TEXT (UUID) | string | string | 同上 |
| BusinessGroup | 后端 `crypto.randomUUID()` | TEXT (UUID) | TEXT (UUID) | string | string | 同上 |
| Category | 后端 `crypto.randomUUID()` | TEXT (UUID) | TEXT (UUID) | string | string | 同上 |
| TicketReply | 后端 `crypto.randomUUID()` | TEXT (UUID) | TEXT (UUID) | string | string | 同上 |
| Company | 后端 `crypto.randomUUID()` | TEXT (UUID) | TEXT (UUID) | string | string | 同上 |

## 2. 认证接口

### 2.1 POST /api/auth/login

登录获取 Bearer Token。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| email | string | 是 | 用户邮箱 |
| password | string | 是 | 密码 |

**响应 200**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| token | string | 否 | Bearer Token |
| user | UserDTO | 否 | 当前用户信息 |

### 2.2 GET /api/auth/me

获取当前登录用户信息。

**响应 200**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | UserDTO | 否 | 当前用户信息 |

## 3. 工单接口

### 3.1 POST /api/tickets

创建工单。创建后系统自动匹配分配规则。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| subject | string | 是 | 工单主题 |
| description | string | 是 | 工单描述 |
| categoryId | string | 是 | 问题分类 ID |
| priority | string | 是 | SLA 优先级，枚举值：P0/P1/P2/P3/P4 |

**响应 201**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | TicketDTO | 否 | 创建的工单 |

**行为**：
- 自动填充 submitterId（当前用户）、companyId（当前用户公司）、createdAt（当前时间）。
- 查询 assignment_rules 按 companyId + categoryId 匹配。
  - 匹配成功 → groupId 设为目标业务组，status = `pending`，handlerId 为空。
  - 未匹配 → groupId 为空，status = `unassigned`，handlerId 为空。
- 写入 auditkit 日志（event_type: `ticket_created`）。

**授权**：所有角色可创建工单。

### 3.2 GET /api/tickets

查询工单列表（工单工作台）。

**查询参数**：

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| status | string | 否 | - | 按状态筛选：created/unassigned/pending/completed/cancelled |
| priority | string | 否 | - | 按优先级筛选：P0-P4 |
| categoryId | string | 否 | - | 按分类筛选 |
| search | string | 否 | - | 按主题或工单 ID 模糊搜索 |
| sort | string | 否 | createdAt | 排序字段：createdAt/priority |
| order | string | 否 | desc | 排序方向：asc/desc |
| page | integer | 否 | 1 | 页码 |
| pageSize | integer | 否 | 20 | 每页条数 |

**响应 200**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | TicketDTO[] | 否 | 工单列表 |
| total | integer | 否 | 总数 |
| page | integer | 否 | 当前页 |
| pageSize | integer | 否 | 每页条数 |

**行为**：自动按当前用户 companyId 过滤。提交人只看到自己提交的工单；处理人看到分配给自己或所在业务组的工单；管理员看到全公司工单。

### 3.3 GET /api/tickets/:id

获取工单详情。

**响应 200**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | TicketDetailDTO | 否 | 工单详情（含回复列表） |

**授权**：只能查看同公司工单。

### 3.4 PATCH /api/tickets/:id/status

更新工单状态（完成/取消）。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | string | 是 | 目标状态：completed/cancelled |

**响应 200**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | TicketDTO | 否 | 更新后的工单 |

**行为**：
- `completed`：仅在 `pending` 状态下可操作。记录 handlerId（当前用户）、completedAt（当前时间）。触发 emailkit 向提交人发送完成通知邮件。写入 auditkit 日志（event_type: `ticket_completed`）。
- `cancelled`：仅在 `unassigned` 或 `pending` 状态下可操作。写入 auditkit 日志（event_type: `ticket_cancelled`）。
- 状态冲突返回 409。

**授权**：处理人可完成/取消分配给自己的工单；管理员可取消任何工单。

### 3.5 POST /api/tickets/:id/replies

添加工单回复。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| content | string | 是 | 回复内容 |

**响应 201**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | TicketReplyDTO | 否 | 创建的回复 |

**行为**：replierId 取当前用户，createdAt 取当前时间。写入 auditkit 日志（event_type: `ticket_replied`）。

**授权**：提交人可回复自己工单；处理人可回复分配给自己或所在业务组的工单。

### 3.6 POST /api/tickets/:id/transfer

转派工单。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| toUserId | string | 否 | 转派目标处理人 ID（与 toGroupId 二选一） |
| toGroupId | string | 否 | 转派目标业务组 ID（与 toUserId 二选一） |

**响应 200**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | TicketDTO | 否 | 转派后的工单 |

**行为**：
- 仅在 `pending` 状态下可操作，否则返回 409。
- toUserId 提供时：handlerId 设为目标用户。
- toGroupId 提供时：groupId 设为目标业务组，handlerId 清空。
- 记录 ticket_transfers（fromUserId、toUserId/toGroupId、createdAt）。
- 写入 auditkit 日志（event_type: `ticket_transferred`）。

**授权**：当前处理人可转派分配给自己的工单；管理员可转派任何待处理工单。

### 3.7 POST /api/tickets/:id/evaluation

提交满意度评价。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| rating | integer | 是 | 评分 1-5（1=非常不满意，5=非常满意） |
| comment | string | 否 | 评价备注 |

**响应 201**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | EvaluationDTO | 否 | 创建的评价 |

**行为**：仅在工单 `completed` 状态下可评价，每个工单仅允许一次评价。重复评价返回 409。

**授权**：工单提交人可评价。

### 3.8 GET /api/tickets/:id/submitter-info

获取提交人完整信息（含历史工单）。

**响应 200**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | SubmitterInfoDTO | 否 | 提交人信息 |

**行为**：查询提交人的 name、email、company、department 信息，以及该提交人在同一公司内的历史工单列表（排除当前工单）。按公司隔离原则，仅展示同公司历史工单。

**授权**：处理人查看分配给自己或所在业务组的工单时可调用。

### 3.9 GET /api/tickets/:id/logs

获取工单操作日志。

**响应 200**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | LogEntryDTO[] | 否 | 日志列表 |

**行为**：从 auditkit 查询 entity_id = ticketId 的审计事件，按 created_at 升序排列。

**授权**：同公司用户可查看。

## 4. 业务组接口

### 4.1 POST /api/business-groups

创建业务组。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | string | 是 | 业务组名称 |

**响应 201**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | BusinessGroupDTO | 否 | 创建的业务组 |

**行为**：companyId 取当前用户公司。

**授权**：管理员。

### 4.2 GET /api/business-groups

查询业务组列表（含成员）。

**查询参数**：无（自动按当前用户公司过滤）。

**响应 200**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | BusinessGroupDTO[] | 否 | 业务组列表 |

### 4.3 POST /api/business-groups/:id/members

添加业务组成员。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| userId | string | 是 | 用户 ID |

**响应 201**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | MemberDTO | 否 | 成员关系 |

**行为**：校验目标用户属于同公司。重复添加返回 409。

**授权**：管理员。

## 5. 分类与分配规则接口

### 5.1 POST /api/categories

创建问题分类。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | string | 是 | 分类名称 |

**响应 201**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | CategoryDTO | 否 | 创建的分类 |

**行为**：companyId 取当前用户公司。

**授权**：管理员。

### 5.2 GET /api/categories

查询分类列表。

**响应 200**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | CategoryDTO[] | 否 | 分类列表 |

### 5.3 POST /api/assignment-rules

创建分配规则（分类→业务组映射）。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| categoryId | string | 是 | 分类 ID |
| groupId | string | 是 | 目标业务组 ID |

**响应 201**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | AssignmentRuleDTO | 否 | 创建的规则 |

**行为**：companyId 取当前用户公司。同一公司同一分类仅允许一条规则，重复返回 409。

**授权**：管理员。

### 5.4 GET /api/assignment-rules

查询分配规则列表。

**响应 200**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | AssignmentRuleDTO[] | 否 | 规则列表 |

## 6. 统计接口

### 6.1 GET /api/dashboard/stats

获取运营仪表盘指标。

**查询参数**：

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| startDate | string (ISO date) | 否 | 30天前 | 统计起始日期 |
| endDate | string (ISO date) | 否 | 今天 | 统计结束日期 |

**响应 200**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | DashboardStatsDTO | 否 | 指标数据 |

DashboardStatsDTO：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| totalTickets | integer | 否 | 工单总量 |
| pendingCount | integer | 否 | 待处理工单数 |
| completedCount | integer | 否 | 已完成工单数 |
| avgResponseTime | number | 否 | 平均响应时间（秒），定义为创建→首次回复的时间差均值 |
| satisfactionScore | number | 否 | 平均满意度评分（1-5） |
| hotCategories | CategoryStatDTO[] | 否 | 热点问题排名（按工单数量降序，取前10） |

CategoryStatDTO：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| categoryId | string | 否 | 分类 ID |
| categoryName | string | 否 | 分类名称 |
| ticketCount | integer | 否 | 该分类工单数 |

**行为**：自动按当前用户公司过滤。平均响应时间 = 各工单（首次回复时间 - 创建时间）的均值（秒）。热点问题 = 按分类工单频次降序取前10。

**授权**：处理人、管理员。

### 6.2 GET /api/dashboard/distribution

获取工单分布统计。

**查询参数**：

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| dimension | string | 是 | - | 统计维度：company/department |
| status | string | 否 | - | 按状态筛选 |

**响应 200**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| data | DistributionDTO[] | 否 | 分布数据 |

DistributionDTO：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| label | string | 否 | 维度名称（公司名或部门名） |
| count | integer | 否 | 工单数量 |

**行为**：
- `company` 维度：按公司分组统计工单数（管理员可见全公司维度，其他角色仅见自己公司）。
- `department` 维度：按提交人部门分组统计当前公司工单数。

**授权**：处理人、管理员。

## 7. 数据传输对象

### TicketDTO

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 工单 ID |
| subject | string | 否 | 主题 |
| description | string | 否 | 描述 |
| categoryId | string | 否 | 分类 ID |
| categoryName | string | 否 | 分类名称 |
| priority | string | 否 | 优先级 P0-P4 |
| status | string | 否 | 状态 |
| submitterId | string | 否 | 提交人 ID |
| submitterName | string | 否 | 提交人姓名 |
| handlerId | string | 是 | 处理人 ID |
| handlerName | string | 是 | 处理人姓名 |
| groupId | string | 是 | 业务组 ID |
| groupName | string | 是 | 业务组名称 |
| createdAt | string (ISO datetime) | 否 | 创建时间 |
| completedAt | string (ISO datetime) | 是 | 完成时间 |

### TicketDetailDTO

TicketDTO 全部字段 + 以下字段：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| replies | TicketReplyDTO[] | 否 | 回复列表（按时间升序） |
| evaluation | EvaluationDTO | 是 | 评价信息（未评价时为 null） |

### TicketReplyDTO

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 回复 ID |
| ticketId | string | 否 | 工单 ID |
| replierId | string | 否 | 回复人 ID |
| replierName | string | 否 | 回复人姓名 |
| content | string | 否 | 回复内容 |
| createdAt | string (ISO datetime) | 否 | 回复时间 |

### EvaluationDTO

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 评价 ID |
| ticketId | string | 否 | 工单 ID |
| rating | integer | 否 | 评分 1-5 |
| comment | string | 是 | 评价备注 |
| createdAt | string (ISO datetime) | 否 | 评价时间 |

### UserDTO

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 用户 ID |
| name | string | 否 | 姓名 |
| email | string | 否 | 邮箱 |
| companyId | string | 否 | 公司 ID |
| companyName | string | 否 | 公司名称 |
| department | string | 否 | 部门 |
| role | string | 否 | 角色：submitter/handler/admin |

### SubmitterInfoDTO

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| user | UserDTO | 否 | 提交人基本信息 |
| historyTickets | TicketDTO[] | 否 | 历史工单列表（同公司，排除当前工单） |

### BusinessGroupDTO

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 业务组 ID |
| name | string | 否 | 业务组名称 |
| companyId | string | 否 | 所属公司 ID |
| members | MemberDTO[] | 否 | 成员列表 |
| createdAt | string (ISO datetime) | 否 | 创建时间 |

### MemberDTO

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 成员关系 ID |
| groupId | string | 否 | 业务组 ID |
| userId | string | 否 | 用户 ID |
| userName | string | 否 | 用户姓名 |
| email | string | 否 | 用户邮箱 |

### CategoryDTO

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 分类 ID |
| name | string | 否 | 分类名称 |
| companyId | string | 否 | 所属公司 ID |

### AssignmentRuleDTO

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 规则 ID |
| companyId | string | 否 | 所属公司 ID |
| categoryId | string | 否 | 分类 ID |
| categoryName | string | 否 | 分类名称 |
| groupId | string | 否 | 目标业务组 ID |
| groupName | string | 否 | 业务组名称 |

### LogEntryDTO

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 日志 ID |
| ticketId | string | 否 | 工单 ID |
| action | string | 否 | 操作类型：ticket_created/ticket_assigned/ticket_transferred/ticket_replied/ticket_completed/ticket_cancelled |
| operatorId | string | 否 | 操作人 ID |
| operatorName | string | 否 | 操作人姓名 |
| createdAt | string (ISO datetime) | 否 | 操作时间 |

## 8. 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| PORT | 3000 | 后端监听端口 |
| DB_PATH | ./data/ticket-system.db | SQLite 数据库文件路径 |
| SMTP_HOST | - | SMTP 服务器地址 |
| SMTP_PORT | 587 | SMTP 端口 |
| SMTP_USER | - | SMTP 用户名 |
| SMTP_PASS | - | SMTP 密码 |
| SMTP_FROM | - | 发件人邮箱地址 |
