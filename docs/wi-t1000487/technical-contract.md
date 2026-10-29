# 技术契约 — 工单系统 (T1000487)

本文档定义前后端共用的 API 契约。字段级类型、可空性、错误码以本文档为唯一来源。

## 通用约定

- 所有 API 返回 JSON，Content-Type: `application/json; charset=utf-8`
- 时间字段统一 ISO 8601 字符串（如 `2026-10-29T12:00:00.000Z`）
- 所有 ID 为 UUID v4 字符串
- 错误响应格式：`{ "error": string, "code": string }`
- 成功写操作返回创建/更新后的完整资源对象
- 未找到资源返回 404 `{ "error": "not_found", "code": "NOT_FOUND" }`
- 参数校验失败返回 400 `{ "error": "<detail>", "code": "VALIDATION_ERROR" }`

## 工单状态枚举

| 值 | 说明 |
|----|------|
| created | 刚创建（瞬时） |
| pending_assign | 待分配 |
| pending_process | 待处理 |
| completed | 完成 |
| cancelled | 取消 |

## SLA 优先级枚举

`P0` | `P1` | `P2` | `P3` | `P4`

---

## 1. 工单管理

### POST /api/tickets — 创建工单

创建工单并记录提交人信息。创建后根据 submitter_company_id + category 自动匹配分配规则：匹配成功则分配到目标业务组并状态转为 pending_process；未匹配则状态为 pending_assign。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| subject | string | 是 | 工单主题 |
| description | string | 是 | 工单描述 |
| category | string | 是 | 问题分类 |
| slaPriority | string | 是 | SLA优先级 P0-P4 |
| submitterName | string | 是 | 提交人姓名 |
| submitterCompanyId | string | 是 | 提交人所属公司ID |
| submitterDepartment | string | 是 | 提交人部门 |
| submitterEmail | string | 是 | 提交人邮箱 |

**响应 201：**

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | 工单ID |
| subject | string | 否 | |
| description | string | 否 | |
| category | string | 否 | |
| slaPriority | string | 否 | |
| submitterName | string | 否 | |
| submitterCompanyId | string | 否 | |
| submitterDepartment | string | 否 | |
| submitterEmail | string | 否 | |
| status | string | 否 | pending_assign 或 pending_process |
| currentGroupId | string | 是 | 自动分配时非空 |
| currentGroupName | string | 是 | 自动分配时非空 |
| handlerMemberId | string | 是 | 创建时为空 |
| handlerName | string | 是 | 创建时为空 |
| processedAt | string | 是 | 创建时为空 |
| createdAt | string | 否 | 创建时间 |

**错误：**
- 400 `VALIDATION_ERROR`：必填字段缺失或 slaPriority 值非法
- 404 `NOT_FOUND`：submitterCompanyId 不存在

---

### GET /api/tickets — 查询工单列表

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 否 | 按状态筛选 |
| slaPriority | string | 否 | 按优先级筛选 |
| category | string | 否 | 按分类筛选 |
| groupId | string | 否 | 按当前业务组筛选 |
| q | string | 否 | 搜索主题/描述 |

**响应 200：** `{ "items": TicketSummary[], "total": number }`

TicketSummary：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | |
| subject | string | 否 | |
| category | string | 否 | |
| slaPriority | string | 否 | |
| status | string | 否 | |
| submitterName | string | 否 | |
| currentGroupName | string | 是 | 未分配时为空 |
| createdAt | string | 否 | |

---

### GET /api/tickets/:id — 查询工单详情

**响应 200：** TicketDetail（同 POST 响应，额外包含以下字段）

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| submitterCompanyName | string | 否 | 提交人公司名称 |
| currentGroupName | string | 是 | |
| createdAt | string | 否 | |

**错误：** 404 `NOT_FOUND`

---

### PATCH /api/tickets/:id/status — 更新工单状态

用于取消工单。仅允许从 pending_assign / pending_process 转为 cancelled。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 是 | 目标状态，目前仅支持 cancelled |

**响应 200：** TicketDetail（同 GET /api/tickets/:id）

**错误：**
- 400 `VALIDATION_ERROR`：状态转换不合法
- 404 `NOT_FOUND`

---

### POST /api/tickets/:id/assign — 手动分配工单

将 pending_assign 状态的工单手动分配到指定业务组。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| groupId | string | 是 | 目标业务组ID |

**响应 200：** TicketDetail

**错误：**
- 400 `VALIDATION_ERROR`：工单状态非 pending_assign，或 groupId 不属于工单所属公司
- 404 `NOT_FOUND`

---

### POST /api/tickets/:id/transfer — 转派工单

将 pending_process 状态的工单转派到其他业务组。记录转派历史。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| toGroupId | string | 是 | 目标业务组ID |
| transferredBy | string | 是 | 操作人姓名 |

**响应 200：** TicketDetail（currentGroupId 变更为 toGroupId）

**错误：**
- 400 `VALIDATION_ERROR`：工单状态非 pending_process，或 toGroupId 等于当前业务组
- 404 `NOT_FOUND`

---

### POST /api/tickets/:id/complete — 标记工单完成

处理人标记工单完成，记录处理人和处理时间。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| handlerMemberId | string | 是 | 处理人成员ID |
| handlerName | string | 是 | 处理人姓名 |

**响应 200：** TicketDetail（status=completed, handlerMemberId/handlerName/processedAt 已填充）

**错误：**
- 400 `VALIDATION_ERROR`：工单状态非 pending_process
- 404 `NOT_FOUND`

---

### GET /api/tickets/:id/submitter-info — 查询提交人完整信息

返回提交人信息和该提交人的历史工单列表。

**响应 200：**

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| name | string | 否 | 提交人姓名 |
| company | string | 否 | 公司名称 |
| companyId | string | 否 | 公司ID |
| department | string | 否 | 部门 |
| email | string | 否 | 邮箱 |
| historyTickets | TicketSummary[] | 否 | 该邮箱提交的所有工单（含当前） |

**错误：** 404 `NOT_FOUND`

---

## 2. 回复管理

### GET /api/tickets/:id/replies — 查询回复列表

**响应 200：** `{ "items": Reply[] }`

Reply：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | |
| ticketId | string | 否 | |
| replierName | string | 否 | 回复人 |
| content | string | 否 | 回复内容 |
| createdAt | string | 否 | 回复时间 |

---

### POST /api/tickets/:id/replies — 添加回复

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| replierName | string | 是 | 回复人姓名 |
| content | string | 是 | 回复内容 |

**响应 201：** Reply

**错误：**
- 400 `VALIDATION_ERROR`：content 为空
- 404 `NOT_FOUND`：工单不存在

---

## 3. 转派记录

### GET /api/tickets/:id/transfers — 查询转派历史

**响应 200：** `{ "items": TransferRecord[] }`

TransferRecord：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | |
| ticketId | string | 否 | |
| fromGroupName | string | 否 | 来源业务组名称 |
| toGroupName | string | 否 | 目标业务组名称 |
| transferredBy | string | 否 | 操作人 |
| createdAt | string | 否 | 转派时间 |

---

## 4. 评价

### GET /api/tickets/:id/evaluation — 查询评价

**响应 200：**

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | |
| ticketId | string | 否 | |
| rating | number | 否 | 1-5 |
| comment | string | 是 | 评价备注 |
| createdAt | string | 否 | |

**错误：** 404 `NOT_FOUND`：工单未评价

---

### POST /api/tickets/:id/evaluation — 提交满意度评价

仅允许对 completed 状态的工单提交评价。每个工单仅允许一次评价。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| rating | number | 是 | 1-5 |
| comment | string | 否 | 评价备注 |

**响应 201：** Evaluation

**错误：**
- 400 `VALIDATION_ERROR`：rating 不在 1-5 范围，或工单状态非 completed，或已存在评价
- 404 `NOT_FOUND`

---

## 5. 公司管理

### GET /api/companies — 查询公司列表

**响应 200：** `{ "items": Company[] }`

Company：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | |
| name | string | 否 | |
| createdAt | string | 否 | |

---

### POST /api/companies — 创建公司

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 公司名称 |

**响应 201：** Company

**错误：** 400 `VALIDATION_ERROR`：name 为空

---

## 6. 业务组管理

### GET /api/companies/:id/groups — 查询公司下业务组

**响应 200：** `{ "items": BusinessGroup[] }`

BusinessGroup：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | |
| companyId | string | 否 | |
| name | string | 否 | |
| createdAt | string | 否 | |

---

### POST /api/companies/:id/groups — 创建业务组

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 业务组名称 |

**响应 201：** BusinessGroup

**错误：**
- 400 `VALIDATION_ERROR`：name 为空
- 404 `NOT_FOUND`：公司不存在

---

## 7. 成员管理

### GET /api/groups/:id/members — 查询业务组成员

**响应 200：** `{ "items": GroupMember[] }`

GroupMember：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | |
| groupId | string | 否 | |
| name | string | 否 | |
| email | string | 否 | |
| createdAt | string | 否 | |

---

### POST /api/groups/:id/members — 添加业务组成员

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 成员姓名 |
| email | string | 是 | 成员邮箱 |

**响应 201：** GroupMember

**错误：**
- 400 `VALIDATION_ERROR`：name 或 email 为空
- 404 `NOT_FOUND`：业务组不存在

---

## 8. 分配规则管理

### GET /api/assignment-rules — 查询分配规则列表

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| companyId | string | 否 | 按公司筛选 |

**响应 200：** `{ "items": AssignmentRule[] }`

AssignmentRule：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | |
| companyId | string | 否 | |
| companyName | string | 否 | |
| category | string | 否 | 匹配分类 |
| targetGroupId | string | 否 | |
| targetGroupName | string | 否 | |
| createdAt | string | 否 | |

---

### POST /api/assignment-rules — 创建分配规则

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| companyId | string | 是 | 适用公司 |
| category | string | 是 | 匹配分类 |
| targetGroupId | string | 是 | 目标业务组 |

**响应 201：** AssignmentRule

**错误：**
- 400 `VALIDATION_ERROR`：必填字段缺失，或 (companyId, category) 已存在规则，或 targetGroupId 不属于 companyId
- 404 `NOT_FOUND`：公司或业务组不存在

---

## 字段命名映射

数据库使用 snake_case，API JSON 使用 camelCase。转换在后端 API 层完成。

| 数据库字段 | API JSON 字段 |
|------------|---------------|
| sla_priority | slaPriority |
| submitter_name | submitterName |
| submitter_company_id | submitterCompanyId |
| submitter_department | submitterDepartment |
| submitter_email | submitterEmail |
| current_group_id | currentGroupId |
| handler_member_id | handlerMemberId |
| handler_name | handlerName |
| processed_at | processedAt |
| created_at | createdAt |
| company_id | companyId |
| group_id | groupId |
| target_group_id | targetGroupId |
| from_group_id | fromGroupId |
| to_group_id | toGroupId |
| transferred_by | transferredBy |
| ticket_id | ticketId |
| replier_name | replierName |
