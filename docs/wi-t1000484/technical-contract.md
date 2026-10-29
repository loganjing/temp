# 技术契约

> Work Item: wi-t1000484 | 项目: jlg-ticket

本文档定义后端 API 的完整接口契约，包括路径、方法、请求/响应字段、类型、可空性、错误码和状态映射。字段级细节以本文件为唯一来源。

## 1. ID 类型对照表

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---|---|---|---|---|---|---|
| Company | 服务端 UUID v4 | TEXT PK | — | string | string | 无转换 |
| User | 服务端 UUID v4 | TEXT PK | — | string | string | 无转换 |
| BusinessGroup | 服务端 UUID v4 | TEXT PK | — | string | string | 无转换 |
| BusinessGroupMember | 服务端 UUID v4 | TEXT PK | — | string | string | 无转换 |
| Category | 服务端 UUID v4 | TEXT PK | — | string | string | 无转换 |
| CategoryAssignmentRule | 服务端 UUID v4 | TEXT PK | — | string | string | 无转换 |
| Ticket | 服务端 UUID v4 | TEXT PK | — | string | string | 无转换 |
| TicketReply | 服务端 UUID v4 | TEXT PK | — | string | string | 无转换 |
| TicketTransfer | 服务端 UUID v4 | TEXT PK | — | string | string | 无转换 |
| TicketEvaluation | 服务端 UUID v4 | TEXT PK | — | string | string | 无转换 |

所有实体 ID 统一使用 TEXT 类型存储 UUID v4，由服务端在插入时生成。API 层和前端均使用 string 类型，无需转换。

## 2. 枚举值定义

### 2.1 工单状态 (TicketStatus)

| 值 | 说明 | 可流转到 |
|---|---|---|
| `created` | 已创建（短暂状态，创建后立即转为 pending_assign） | pending_assign |
| `pending_assign` | 待分配 | pending_process, cancelled |
| `pending_process` | 待处理 | completed, cancelled |
| `completed` | 已完成（终态） | — |
| `cancelled` | 已取消（终态） | — |

### 2.2 SLA 优先级 (Priority)

| 值 | 说明 |
|---|---|
| `P0` | 最高优先级 |
| `P1` | 高优先级 |
| `P2` | 中优先级 |
| `P3` | 低优先级 |
| `P4` | 最低优先级 |

### 2.3 满意度评分 (Rating)

| 值 | 说明 |
|---|---|
| 1 | 非常不满意 |
| 2 | 不满意 |
| 3 | 一般 |
| 4 | 满意 |
| 5 | 非常满意 |

## 3. API 接口契约

所有 API 以 `/api` 为前缀。请求体和响应体均为 JSON。时间戳使用 ISO 8601 字符串。

### 3.1 公司管理

#### POST /api/companies
创建公司。

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | string | 是 | 公司名称 |

**响应 201：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 公司 ID |
| name | string | 否 | 公司名称 |
| createdAt | string | 否 | 创建时间 |

**错误：**
- 400: `name` 为空

#### GET /api/companies
获取公司列表。

**响应 200：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| items | array\<Company\> | 否 | 公司列表 |

Company 对象：`{ id, name, createdAt }`

### 3.2 业务组管理

#### GET /api/companies/:companyId/business-groups
获取指定公司的业务组列表。

**路径参数：**
| 字段 | 类型 | 说明 |
|---|---|---|
| companyId | string | 公司 ID |

**响应 200：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| items | array\<BusinessGroup\> | 否 | 业务组列表 |

BusinessGroup 对象：`{ id, companyId, name, createdAt, memberCount }`

#### POST /api/companies/:companyId/business-groups
创建业务组。

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | string | 是 | 业务组名称 |

**响应 201：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 业务组 ID |
| companyId | string | 否 | 所属公司 ID |
| name | string | 否 | 业务组名称 |
| createdAt | string | 否 | 创建时间 |

### 3.3 业务组成员管理

#### GET /api/business-groups/:groupId/members
获取业务组成员列表。

**响应 200：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| items | array\<Member\> | 否 | 成员列表 |

Member 对象：`{ id, groupId, userId, userName, userEmail, createdAt }`

#### POST /api/business-groups/:groupId/members
添加业务组成员。

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| userId | string | 是 | 用户 ID |

**响应 201：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 成员记录 ID |
| groupId | string | 否 | 业务组 ID |
| userId | string | 否 | 用户 ID |
| createdAt | string | 否 | 添加时间 |

**错误：**
- 404: 业务组不存在
- 409: 用户已是该组成员

#### DELETE /api/business-groups/:groupId/members/:userId
移除业务组成员。

**响应 200：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| removed | boolean | 否 | 是否移除成功 |

### 3.4 分类管理

#### GET /api/categories
获取分类列表。

**响应 200：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| items | array\<Category\> | 否 | 分类列表 |

Category 对象：`{ id, name, createdAt }`

#### POST /api/categories
创建分类。

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | string | 是 | 分类名称 |

**响应 201：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 分类 ID |
| name | string | 否 | 分类名称 |
| createdAt | string | 否 | 创建时间 |

### 3.5 分类分配规则

#### GET /api/companies/:companyId/assignment-rules
获取公司的分类分配规则列表。

**响应 200：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| items | array\<AssignmentRule\> | 否 | 规则列表 |

AssignmentRule 对象：`{ id, companyId, categoryId, categoryName, groupId, groupName, createdAt }`

#### POST /api/companies/:companyId/assignment-rules
创建分类分配规则。

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| categoryId | string | 是 | 问题分类 ID |
| groupId | string | 是 | 目标业务组 ID |

**响应 201：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 规则 ID |
| companyId | string | 否 | 公司 ID |
| categoryId | string | 否 | 分类 ID |
| groupId | string | 否 | 业务组 ID |
| createdAt | string | 否 | 创建时间 |

**错误：**
- 404: 公司、分类或业务组不存在
- 409: 该公司该分类已有分配规则

### 3.6 工单管理

#### GET /api/tickets
获取工单列表，支持筛选。

**查询参数：**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | string | 否 | 按状态筛选 |
| priority | string | 否 | 按优先级筛选 |
| categoryId | string | 否 | 按分类筛选 |
| submitterId | string | 否 | 按提交人筛选 |
| assignedGroupId | string | 否 | 按分配业务组筛选 |

**响应 200：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| items | array\<TicketSummary\> | 否 | 工单摘要列表 |

TicketSummary 对象：`{ id, title, categoryName, priority, status, submitterName, assignedGroupName, createdAt }`

#### POST /api/tickets
创建工单。创建时自动触发分类分配规则匹配。

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| title | string | 是 | 工单主题 |
| description | string | 是 | 工单描述 |
| categoryId | string | 是 | 问题分类 ID |
| submitterId | string | 是 | 提交人用户 ID |
| priority | string | 是 | SLA 优先级（P0-P4） |

**响应 201：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 工单 ID |
| title | string | 否 | 主题 |
| description | string | 否 | 描述 |
| categoryId | string | 否 | 分类 ID |
| categoryName | string | 否 | 分类名称 |
| submitterId | string | 否 | 提交人 ID |
| submitterName | string | 否 | 提交人姓名 |
| submitterEmail | string | 否 | 提交人邮箱 |
| priority | string | 否 | 优先级 |
| status | string | 否 | 工单状态（pending_assign 或 pending_process） |
| assignedGroupId | string | 是 | 分配的业务组 ID（无匹配规则时为 null） |
| assignedGroupName | string | 是 | 分配的业务组名称（可空） |
| createdAt | string | 否 | 创建时间 |

**错误：**
- 400: 必填字段缺失或优先级值非法
- 404: 分类或提交人不存在

#### GET /api/tickets/:id
获取工单详情，包含回复列表、转派记录和评价信息。

**响应 200：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 工单 ID |
| title | string | 否 | 主题 |
| description | string | 否 | 描述 |
| categoryId | string | 否 | 分类 ID |
| categoryName | string | 否 | 分类名称 |
| submitterId | string | 否 | 提交人 ID |
| submitterName | string | 否 | 提交人姓名 |
| submitterEmail | string | 否 | 提交人邮箱 |
| priority | string | 否 | 优先级 |
| status | string | 否 | 工单状态 |
| assignedGroupId | string | 是 | 分配的业务组 ID（可空） |
| assignedGroupName | string | 是 | 分配的业务组名称（可空） |
| assignedHandlerId | string | 是 | 分配的处理人 ID（可空） |
| assignedHandlerName | string | 是 | 分配的处理人姓名（可空） |
| processedBy | string | 是 | 处理人 ID（可空） |
| processedByName | string | 是 | 处理人姓名（可空） |
| processedAt | string | 是 | 处理完成时间（可空） |
| createdAt | string | 否 | 创建时间 |
| replies | array\<Reply\> | 否 | 回复列表（按时间升序） |
| transfers | array\<Transfer\> | 否 | 转派记录列表（按时间升序） |
| evaluation | Evaluation | 是 | 评价信息（无评价时为 null） |

Reply 对象：`{ id, ticketId, replierId, replierName, content, createdAt }`

Transfer 对象：`{ id, ticketId, fromGroupName, fromHandlerName, toGroupName, toHandlerName, transferredByName, createdAt }`

Evaluation 对象：`{ id, ticketId, submitterId, rating, comment, createdAt }`

### 3.7 工单回复

#### POST /api/tickets/:ticketId/replies
添加工单回复。

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| replierId | string | 是 | 回复人用户 ID |
| content | string | 是 | 回复内容 |

**响应 201：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 回复 ID |
| ticketId | string | 否 | 工单 ID |
| replierId | string | 否 | 回复人 ID |
| replierName | string | 否 | 回复人姓名 |
| content | string | 否 | 回复内容 |
| createdAt | string | 否 | 回复时间 |

**错误：**
- 404: 工单不存在
- 400: content 为空

### 3.8 工单分配

#### POST /api/tickets/:ticketId/assign
手动分配工单到业务组或处理人。

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| groupId | string | 否 | 目标业务组 ID（groupId 与 handlerId 至少传一个） |
| handlerId | string | 否 | 目标处理人 ID |

**响应 200：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 工单 ID |
| status | string | 否 | 更新后的状态（pending_process） |
| assignedGroupId | string | 是 | 分配的业务组 ID |
| assignedHandlerId | string | 是 | 分配的处理人 ID |

**错误：**
- 404: 工单不存在
- 400: groupId 和 handlerId 同时为空
- 409: 工单状态不允许分配（非 pending_assign）

### 3.9 工单转派

#### POST /api/tickets/:ticketId/transfer
转派工单到其他业务组或处理人。

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| transferredBy | string | 是 | 操作人用户 ID |
| toGroupId | string | 否 | 目标业务组 ID |
| toHandlerId | string | 否 | 目标处理人 ID |

**响应 200：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 工单 ID |
| status | string | 否 | 工单状态（保持 pending_process） |
| assignedGroupId | string | 是 | 更新后的业务组 ID |
| assignedHandlerId | string | 是 | 更新后的处理人 ID |
| transferRecord | Transfer | 否 | 转派记录 |

**错误：**
- 404: 工单不存在
- 400: toGroupId 和 toHandlerId 同时为空
- 409: 工单状态不允许转派（非 pending_process）

### 3.10 工单完成

#### POST /api/tickets/:ticketId/complete
完成工单处理。

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| processedBy | string | 是 | 处理人用户 ID |

**响应 200：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 工单 ID |
| status | string | 否 | 工单状态（completed） |
| processedBy | string | 否 | 处理人 ID |
| processedAt | string | 否 | 处理完成时间 |

**错误：**
- 404: 工单不存在
- 409: 工单状态不允许完成（非 pending_process）

### 3.11 工单取消

#### POST /api/tickets/:ticketId/cancel
取消工单。

**响应 200：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 工单 ID |
| status | string | 否 | 工单状态（cancelled） |

**错误：**
- 404: 工单不存在
- 409: 工单状态不允许取消（completed 或 cancelled）

### 3.12 工单评价

#### POST /api/tickets/:ticketId/evaluation
提交满意度评价。

**请求体：**
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| submitterId | string | 是 | 评价人（提交人）用户 ID |
| rating | integer | 是 | 满意度评分 1-5 |
| comment | string | 否 | 评价备注 |

**响应 201：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 评价 ID |
| ticketId | string | 否 | 工单 ID |
| submitterId | string | 否 | 评价人 ID |
| rating | integer | 否 | 评分 |
| comment | string | 是 | 备注（可空） |
| createdAt | string | 否 | 评价时间 |

**错误：**
- 404: 工单不存在
- 400: rating 不在 1-5 范围
- 409: 工单状态不允许评价（非 completed）或已存在评价

#### GET /api/tickets/:ticketId/evaluation
获取工单评价。

**响应 200：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 是 | 评价 ID（无评价时为 null） |
| ticketId | string | 是 | 工单 ID |
| submitterId | string | 是 | 评价人 ID |
| rating | integer | 是 | 评分 |
| comment | string | 是 | 备注 |
| createdAt | string | 是 | 评价时间 |

### 3.13 用户信息

#### GET /api/users/:userId
获取用户详情。

**响应 200：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| id | string | 否 | 用户 ID |
| name | string | 否 | 姓名 |
| email | string | 否 | 邮箱 |
| companyId | string | 否 | 公司 ID |
| companyName | string | 是 | 公司名称（可空） |
| department | string | 是 | 部门名称（可空） |
| createdAt | string | 否 | 创建时间 |

#### GET /api/users/:userId/tickets
获取用户历史工单列表。

**响应 200：**
| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| items | array\<TicketSummary\> | 否 | 工单摘要列表 |

TicketSummary 对象同 3.6 节定义。

## 4. 统一错误响应格式

所有错误响应使用统一格式：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "人类可读的错误描述"
  }
}
```

| 错误码 | HTTP 状态码 | 说明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | 请求参数校验失败 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `CONFLICT` | 409 | 状态冲突或重复操作 |
| `INTERNAL_ERROR` | 500 | 服务端内部错误 |

## 5. 数据库事务约定

以下操作必须使用数据库事务（`db.transaction`）：

| 操作 | 事务范围 | 说明 |
|---|---|---|
| 创建工单 + 自动分配 | tickets INSERT + tickets UPDATE(assigned_group_id, status) | 原子性保证：工单创建和分配要么同时成功，要么同时回滚 |
| 工单转派 | tickets UPDATE + ticket_transfers INSERT | 原子性保证：工单分配更新和转派记录要么同时成功，要么同时回滚 |
| 工单完成 | tickets UPDATE(status, processed_by, processed_at) | 单表更新，使用事务保证状态一致性 |

## 6. API JSON 字段命名映射

数据库列名使用 snake_case（如 `created_at`、`company_id`），API JSON 字段使用 camelCase（如 `createdAt`、`companyId`）。映射在服务端路由层统一转换。

| 数据库列 | API JSON 字段 |
|---|---|
| id | id |
| company_id | companyId |
| category_id | categoryId |
| group_id | groupId |
| submitter_id | submitterId |
| assigned_group_id | assignedGroupId |
| assigned_handler_id | assignedHandlerId |
| processed_by | processedBy |
| processed_at | processedAt |
| created_at | createdAt |
| transferred_by | transferredBy |
| from_group_id | fromGroupId |
| from_handler_id | fromHandlerId |
| to_group_id | toGroupId |
| to_handler_id | toHandlerId |
| replier_id | replierId |
| ticket_id | ticketId |
