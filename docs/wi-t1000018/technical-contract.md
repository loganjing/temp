# 技术契约

本文件定义工单系统前后端共同遵循的 API 契约。字段级接口细节以此文件为唯一来源；架构基线只保留接口摘要。

## 1. 认证与授权

### 登录

`POST /api/auth/login`

请求体：
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| email | string | 否 | 登录邮箱 |
| password | string | 否 | 密码 |

响应 `200`：
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| token | string | 否 | Bearer Token |
| user.id | string | 否 | 用户 ID |
| user.name | string | 否 | 用户名 |
| user.email | string | 否 | 邮箱 |
| user.phone | string \| null | 是 | 电话 |
| user.roles | string[] | 否 | 角色列表 |
| user.passwordChangeRequired | boolean | 否 | 是否需修改密码 |

### 当前用户

`GET /api/auth/me`

响应 `200`：同登录响应的 `user` 对象，附加：
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| companyId | string \| null | 是 | 所属公司 ID |
| departmentId | string \| null | 是 | 所属部门 ID |

所有受保护路由需携带 `Authorization: Bearer <token>` 请求头。

## 2. 公司管理

### 公司列表

`GET /api/companies`

授权：admin

查询参数：`search`（string, 可空）、`limit`（number, 默认 50, 1-100）、`offset`（number, 默认 0）

响应 `200`：
| 字段 | 类型 | 说明 |
|---|---|---|
| companies | Company[] | 公司列表 |
| total | number | 总数 |

### 创建公司

`POST /api/companies`

授权：admin

请求体：
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| name | string | 否 | 公司名称，1-200 字符 |

响应 `201`：Company 对象

### 更新公司

`PATCH /api/companies/:id`

授权：admin

请求体：`name`（string, 否）

响应 `200`：Company 对象

### Company 对象

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | |
| name | string | 否 | |
| createdAt | string | 否 | ISO 8601 |
| updatedAt | string | 否 | ISO 8601 |

## 3. 部门管理

### 部门列表

`GET /api/companies/:companyId/departments`

授权：admin 或同公司用户

响应 `200`：
| 字段 | 类型 | 说明 |
|---|---|---|
| departments | Department[] | |

### 创建部门

`POST /api/companies/:companyId/departments`

授权：admin

请求体：`name`（string, 否, 1-200）

响应 `201`：Department 对象

### 更新部门

`PATCH /api/companies/:companyId/departments/:id`

授权：admin

请求体：`name`（string, 否）

响应 `200`：Department 对象

### Department 对象

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | |
| companyId | string | 否 | |
| name | string | 否 | |
| createdAt | string | 否 | |
| updatedAt | string | 否 | |

## 4. 业务组管理

### 业务组列表

`GET /api/companies/:companyId/groups`

授权：admin

响应 `200`：
| 字段 | 类型 | 说明 |
|---|---|---|
| groups | BusinessGroup[] | 含 members 数组 |

### 创建业务组

`POST /api/companies/:companyId/groups`

授权：admin

请求体：`name`（string, 否, 1-200）

响应 `201`：BusinessGroup 对象

### 更新业务组

`PATCH /api/groups/:id`

授权：admin

请求体：`name`（string, 否）

响应 `200`：BusinessGroup 对象

### 删除业务组

`DELETE /api/groups/:id`

授权：admin

响应 `200`：`{ ok: true }`

### 添加成员

`POST /api/groups/:groupId/members`

授权：admin

请求体：
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| userId | string | 否 | 用户 ID |

响应 `201`：`{ ok: true }`

### 移除成员

`DELETE /api/groups/:groupId/members/:userId`

授权：admin

响应 `200`：`{ ok: true }`

### BusinessGroup 对象

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | |
| companyId | string | 否 | |
| name | string | 否 | |
| members | GroupMember[] | 否 | 成员列表 |
| createdAt | string | 否 | |
| updatedAt | string | 否 | |

### GroupMember 对象

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| userId | string | 否 | |
| name | string | 否 | |
| email | string | 否 | |

## 5. 问题分类管理

### 分类列表

`GET /api/companies/:companyId/categories`

授权：admin 或同公司用户

响应 `200`：
| 字段 | 类型 | 说明 |
|---|---|---|
| categories | Category[] | |

### 创建分类

`POST /api/companies/:categoryId`

授权：admin

请求体：`name`（string, 否, 1-200）

响应 `201`：Category 对象

### 更新分类

`PATCH /api/categories/:id`

授权：admin

请求体：`name`（string, 否）

响应 `200`：Category 对象

### 删除分类

`DELETE /api/categories/:id`

授权：admin

响应 `200`：`{ ok: true }`

### Category 对象

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | |
| companyId | string | 否 | |
| name | string | 否 | |
| createdAt | string | 否 | |

## 6. 分类-业务组自动分配规则

### 规则列表

`GET /api/companies/:companyId/assignment-rules`

授权：admin

响应 `200`：
| 字段 | 类型 | 说明 |
|---|---|---|
| rules | AssignmentRule[] | |

### 创建规则

`POST /api/companies/:companyId/assignment-rules`

授权：admin

请求体：
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| categoryId | string | 否 | 分类 ID |
| groupId | string | 否 | 目标业务组 ID |

响应 `201`：AssignmentRule 对象

冲突（同公司同分类已有规则）返回 `409 CONFLICT`。

### 删除规则

`DELETE /api/assignment-rules/:id`

授权：admin

响应 `200`：`{ ok: true }`

### AssignmentRule 对象

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | |
| companyId | string | 否 | |
| categoryId | string | 否 | |
| categoryName | string | 否 | 分类名称（联查） |
| groupId | string | 否 | |
| groupName | string | 否 | 业务组名称（联查） |
| createdAt | string | 否 | |

## 7. 工单管理

### 工单列表

`GET /api/tickets`

授权：已认证用户（按角色过滤可见范围）

查询参数：
| 参数 | 类型 | 可空 | 默认 | 说明 |
|---|---|---|---|---|
| companyId | string | 是 | | 按公司筛选 |
| status | string | 是 | | 按状态筛选 |
| priority | string | 是 | | 按优先级筛选 |
| categoryId | string | 是 | | 按分类筛选 |
| groupId | string | 是 | | 按业务组筛选 |
| search | string | 是 | | 关键字搜索（主题/描述） |
| sort | string | 是 | createdAt | 排序字段（createdAt/updatedAt/priority） |
| order | string | 是 | desc | 排序方向（asc/desc） |
| limit | number | 是 | 50 | 1-100 |
| offset | number | 是 | 0 | |

响应 `200`：
| 字段 | 类型 | 说明 |
|---|---|---|
| tickets | TicketListItem[] | 工单列表 |
| total | number | 总数 |

### 创建工单

`POST /api/tickets`

授权：submitter

请求体：
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| subject | string | 否 | 工单主题，1-500 字符 |
| description | string | 否 | 工单描述，1-5000 字符 |
| categoryId | string | 否 | 问题分类 ID |
| slaPriority | string | 否 | SLA 优先级 P0-P4，默认 P3 |

响应 `201`：Ticket 对象

创建时自动从当前用户获取 `companyId`、`submitterName`、`submitterEmail`、`submitterDepartment`，不信任前端传入。创建后触发自动分配流程。

### 工单详情

`GET /api/tickets/:id`

授权：工单同公司用户

响应 `200`：Ticket 对象（含 replies 数组）

### 分配工单

`POST /api/tickets/:id/assign`

授权：admin 或 handler（同公司）

请求体：
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| groupId | string | 否 | 目标业务组 ID |

响应 `200`：Ticket 对象

前置状态：`created`、`pending_assignment`。成功后状态变为 `pending_processing`，设置 `group_id` 和 `assigned_at`（首次）。

### 转派工单

`POST /api/tickets/:id/transfer`

授权：handler（同组）

请求体：
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| toGroupId | string | 是 | 转入业务组 ID |
| toHandlerId | string | 是 | 转入处理人 ID |

至少提供 `toGroupId` 或 `toHandlerId` 之一。

响应 `200`：Ticket 对象

前置状态：`pending_processing`。转派后：换组则状态回到 `pending_assignment`；同组换人则保持 `pending_processing`。创建 ticket_transfers 记录。

### 完成工单

`POST /api/tickets/:id/complete`

授权：handler（同组）

请求体：无

响应 `200`：Ticket 对象

前置状态：`pending_processing`。成功后状态变为 `completed`，记录 `handler_id`、`handler_name`、`handled_at`，触发邮件通知和审计事件。

### 取消工单

`POST /api/tickets/:id/cancel`

授权：submitter（自己的工单）或 admin

请求体：无

响应 `200`：Ticket 对象

前置状态：除 `completed` 外的其他状态。成功后状态变为 `cancelled`。

### Ticket 对象

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | |
| companyId | string | 否 | |
| subject | string | 否 | |
| description | string | 否 | |
| categoryId | string \| null | 是 | |
| categoryName | string \| null | 是 | 联查 |
| submitterId | string | 否 | |
| submitterName | string | 否 | |
| submitterEmail | string | 否 | |
| submitterDepartment | string \| null | 是 | |
| slaPriority | string | 否 | P0-P4 |
| status | string | 否 | created/pending_assignment/pending_processing/completed/cancelled |
| groupId | string \| null | 是 | |
| groupName | string \| null | 是 | 联查 |
| handlerId | string \| null | 是 | |
| handlerName | string \| null | 是 | |
| assignedAt | string \| null | 是 | |
| handledAt | string \| null | 是 | |
| createdAt | string | 否 | |
| updatedAt | string | 否 | |
| replies | TicketReply[] | 否 | 详情接口返回，列表接口不含 |

### TicketListItem 对象

与 Ticket 对象相同但不含 `replies` 和 `description`。

### TicketReply 对象

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | |
| ticketId | string | 否 | |
| replierId | string | 否 | |
| replierName | string | 否 | |
| content | string | 否 | |
| createdAt | string | 否 | |

## 8. 工单回复

### 回复列表

`GET /api/tickets/:id/replies`

授权：工单同公司用户

响应 `200`：`{ replies: TicketReply[] }`

### 添加回复

`POST /api/tickets/:id/replies`

授权：工单同公司用户

请求体：
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| content | string | 否 | 回复内容，1-5000 字符 |

响应 `201`：TicketReply 对象

## 9. 提交人信息

### 查看提交人完整信息

`GET /api/tickets/:id/submitter-info`

授权：handler 或 admin（同公司）

响应 `200`：
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| userId | string | 否 | |
| name | string | 否 | 姓名 |
| email | string | 否 | 邮箱 |
| phone | string \| null | 是 | 电话 |
| companyName | string \| null | 是 | 公司 |
| departmentName | string \| null | 是 | 部门 |
| historyTickets | TicketListItem[] | 否 | 历史工单列表（不含当前工单） |

## 10. 用户评价

### 获取评价

`GET /api/tickets/:id/evaluation`

授权：工单同公司用户

响应 `200`：Evaluation 对象，无评价时返回 `404`

### 提交评价

`POST /api/tickets/:id/evaluation`

授权：submitter（仅限自己创建的工单）

请求体：
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| rating | number | 否 | 满意度 1-5 |
| comment | string | 是 | 评价备注，最多 1000 字符 |

响应 `201`：Evaluation 对象

前置状态：`completed`。每个工单仅可评价一次，重复返回 `409 CONFLICT`。

### Evaluation 对象

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | |
| ticketId | string | 否 | |
| submitterId | string | 否 | |
| rating | number | 否 | 1-5 |
| comment | string \| null | 是 | |
| createdAt | string | 否 | |

## 11. 统计分析

### 工单分布

`GET /api/stats/distribution`

授权：admin

查询参数：
| 参数 | 类型 | 可空 | 默认 | 说明 |
|---|---|---|---|---|
| dimension | string | 否 | company | 统计维度（company/department） |
| companyId | string | 是 | | 按公司筛选 |

响应 `200`：
| 字段 | 类型 | 说明 |
|---|---|---|
| dimension | string | 统计维度 |
| items | DistributionItem[] | 分布项 |

### DistributionItem 对象

| 字段 | 类型 | 说明 |
|---|---|---|
| key | string | 公司名/部门名 |
| total | number | 工单总数 |
| byStatus | object | 按状态分布：{ created, pending_assignment, pending_processing, completed, cancelled } |

### 运营仪表盘

`GET /api/stats/dashboard`

授权：admin

查询参数：`companyId`（string, 可空）

响应 `200`：
| 字段 | 类型 | 说明 |
|---|---|---|
| totalTickets | number | 工单总量 |
| avgResponseTimeHours | number | 平均响应时间（小时），从创建到首次分配 |
| avgSatisfaction | number | 平均满意度（1-5），无评价数据时为 null |
| hotCategories | HotCategory[] | 热点问题（按工单量降序 Top 5） |

### HotCategory 对象

| 字段 | 类型 | 说明 |
|---|---|---|
| categoryId | string | 分类 ID |
| categoryName | string | 分类名称 |
| count | number | 工单数量 |

## 12. 工单工作台

### 待处理工单列表

`GET /api/workbench/tickets`

授权：handler

查询参数：
| 参数 | 类型 | 可空 | 默认 | 说明 |
|---|---|---|---|---|
| companyId | string | 是 | | 按公司筛选 |
| priority | string | 是 | | 按优先级筛选 |
| search | string | 是 | | 关键字搜索 |
| sort | string | 是 | createdAt | 排序字段 |
| order | string | 是 | desc | 排序方向 |
| limit | number | 是 | 50 | 1-100 |
| offset | number | 是 | 0 | |

默认返回当前用户所在业务组中 `pending_processing` 状态的工单。admin 可查看全部待处理工单。

响应 `200`：
| 字段 | 类型 | 说明 |
|---|---|---|
| tickets | TicketListItem[] | 工单列表 |
| total | number | 总数 |

## 13. 工单操作日志

### 日志列表

`GET /api/tickets/:id/logs`

授权：工单同公司用户

响应 `200`：
| 字段 | 类型 | 说明 |
|---|---|---|
| logs | AuditLogEntry[] | 操作日志列表（按时间倒序） |

### AuditLogEntry 对象

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | |
| eventType | string | 否 | 事件类型 |
| actorUserId | string \| null | 是 | 操作人 ID |
| actorName | string \| null | 是 | 操作人姓名（联查） |
| occurredAt | string | 否 | ISO 8601 |
| metadata | object | 否 | 事件附加数据（JSON 解析后） |
