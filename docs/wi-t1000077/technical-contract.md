# 技术契约

> WorkItem: wi-t1000077 | 架构基线: docs/wi-t1000077/architecture-baseline.md
> 修订: 实现阶段修正 ID 类型体系以匹配已 wiring 的 userkit/authkit/auditkit 平台实际实现（TEXT ID、email 登录、扁平 auth 响应）

## 1. ID 对照表

| 实体 | 生成方 | 数据库主键 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|------|--------|-----------|----------|--------------|---------|-------------|
| User | userkit (users 表) | TEXT PK | TEXT | string | string | 无转换 |
| Company | 项目 (companies 表) | TEXT PK | TEXT FK | string | string | 无转换 |
| Department | 项目 (departments 表) | TEXT PK | TEXT FK (company_id) | string | string | 无转换 |
| BusinessGroup | 项目 (business_groups 表) | TEXT PK | TEXT FK (company_id) | string | string | 无转换 |
| TicketCategory | 项目 (ticket_categories 表) | TEXT PK | TEXT FK (company_id) | string | string | 无转换 |
| Ticket | 项目 (tickets 表) | TEXT PK | TEXT FK (company_id, category_id, submitter_id, business_group_id, handler_id) | string | string | 无转换 |
| TicketReply | 项目 (ticket_replies 表) | TEXT PK | TEXT FK (ticket_id, replier_id) | string | string | 无转换 |
| TicketTransfer | 项目 (ticket_transfers 表) | TEXT PK | TEXT FK (ticket_id, from/to business_group_id) | string | string | 无转换 |
| TicketSatisfaction | 项目 (ticket_satisfactions 表) | TEXT PK | TEXT FK (ticket_id) | string | string | 无转换 |
| CategoryAssignmentRule | 项目 (category_assignment_rules 表) | TEXT PK | TEXT FK (company_id, category_id, business_group_id) | string | string | 无转换 |

所有 ID 为 TEXT PRIMARY KEY（UUID 或应用生成的唯一字符串），API 直接暴露为 string，无格式转换。

> **平台约束**：userkit 的 `users.id` 为 TEXT（UUID），`users.company_id` 为 TEXT。permissionkit 的 `user_role_assignments.user_id` 为 TEXT。auditkit 的 `audit_events.id` 为 TEXT、`actor_user_id` 为 TEXT。项目所有表的主键和外键均使用 TEXT，与平台一致。应用通过 `crypto.randomUUID()` 或等价方法生成 TEXT ID。

## 2. 认证与会话

### POST /api/auth/login

**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| email | string | 否 | 邮箱（平台 userkit 使用 email 登录） |
| password | string | 否 | 密码 |

**响应 200**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| token | string | 否 | Bearer Token |
| user | object | 否 | 用户信息（扁平结构，匹配 authkit responseTransform） |
| user.id | string | 否 | 用户 ID |
| user.name | string | 否 | 姓名（来自 users.name） |
| user.email | string | 否 | 邮箱 |
| user.phone | string | 是 | 电话 |
| user.companyId | string | 是 | 公司 ID |
| user.roles | string[] | 否 | 角色列表 |
| user.passwordChangeRequired | boolean | 否 | 是否需要改密 |

**响应 401**：`{ "error": { "code": "invalid_credentials", "message": "..." } }`

**幂等**：是（重复登录返回新 token）

> 平台 auth.ts 已配置 `loginField: 'email'`，登录使用邮箱。`responseTransform` 返回扁平 user 对象。

### POST /api/auth/logout

**授权**：Bearer Token
**响应 204**：无内容
**幂等**：是

### GET /api/auth/me

**授权**：Bearer Token
**响应 200**（扁平结构，匹配平台 userkit/authkit）：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | 用户 ID |
| name | string | 否 | 姓名（来自 users.name） |
| email | string | 否 | 邮箱 |
| phone | string | 是 | 电话 |
| companyId | string | 是 | 公司 ID |
| roles | string[] | 否 | 角色列表（来自 permissionkit user_role_assignments） |
| passwordChangeRequired | boolean | 否 | 是否需要改密 |

> 平台 auth 中间件从 `currentUser` 上下文获取用户信息。角色通过 permissionkit 的 `getRoles(userId)` 加载。前端 `normalizeCurrentUser` 将 roles 映射为 submitter/handler/admin 业务角色。

### POST /api/auth/password

**授权**：Bearer Token
**请求**：`{ "password": string }`（新密码， minLength 12）
**响应 200**：更新后的用户信息
**用途**：更改临时密码

### POST /api/auth/bootstrap

**授权**：无（仅在无用户时可用）
**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| name | string | 否 | 姓名 |
| email | string | 否 | 邮箱 |
| password | string | 否 | 密码（minLength 12） |

**响应 201**：用户信息
**用途**：创建首个管理员账户

## 3. 用户

> 平台 userkit 的 `users` 表已包含 name、email、phone、company_id 字段。项目不创建独立 user_profiles 表。department 关联通过项目拥有的 `departments` 表（company_id → departments）间接查询。角色通过 permissionkit 管理。

### GET /api/users/:userId

**授权**：Bearer Token（handler/admin 可查看同公司提交人信息）
**公司隔离**：仅可查询同公司用户，admin 可跨公司
**响应 200**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | 用户 ID |
| name | string | 否 | 姓名 |
| email | string | 否 | 邮箱 |
| companyId | string | 否 | 公司 ID |
| companyName | string | 否 | 公司名称 |
| departmentId | string | 是 | 部门 ID |
| departmentName | string | 是 | 部门名称 |
| role | string | 否 | 业务角色：submitter/handler/admin |

### GET /api/users/:userId/tickets

**授权**：Bearer Token（handler/admin 查看提交人历史工单）
**公司隔离**：仅返回该用户同公司的工单
**查询参数**：
| 参数 | 类型 | 可空 | 说明 |
|------|------|------|------|
| page | number | 是 | 页码，默认 1 |
| pageSize | number | 是 | 每页条数，默认 20 |

**响应 200**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| items | array | 否 | 工单摘要列表 |
| items[].id | string | 否 | 工单 ID |
| items[].title | string | 否 | 主题 |
| items[].status | string | 否 | 状态 |
| items[].slaPriority | string | 否 | 优先级 |
| items[].createdAt | string | 否 | 创建时间 (ISO 8601) |
| total | number | 否 | 总数 |

## 4. 组织管理

### GET /api/business-groups

**授权**：Bearer Token
**公司隔离**：按当前用户公司过滤；admin 可通过 `companyId` 查询参数指定其他公司
**查询参数**：`companyId`（可选，admin 跨公司）
**响应 200**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| items | array | 否 | 业务组列表 |
| items[].id | string | 否 | 业务组 ID |
| items[].name | string | 否 | 业务组名称 |
| items[].companyId | string | 否 | 公司 ID |
| items[].members | array | 是 | 成员列表 |
| items[].members[].userId | string | 否 | 用户 ID |
| items[].members[].displayName | string | 否 | 姓名 |

### POST /api/business-groups

**授权**：Bearer Token（admin）
**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| name | string | 否 | 业务组名称 |
| companyId | string | 否 | 公司 ID（admin 指定，默认当前公司） |

**响应 201**：业务组对象（同 GET 单项）
**错误 403**：`{ "error": { "code": "forbidden", "message": "..." } }`

### POST /api/business-groups/:groupId/members

**授权**：Bearer Token（admin）
**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| userId | string | 否 | 用户 ID |

**响应 201**：`{ "id": string, "businessGroupId": string, "userId": string }`
**错误 409**：`{ "error": { "code": "already_member", "message": "..." } }`

### DELETE /api/business-groups/:groupId/members/:userId

**授权**：Bearer Token（admin）
**响应 204**：无内容

### GET /api/categories

**授权**：Bearer Token
**公司隔离**：按当前用户公司过滤
**响应 200**：`{ "items": [{ "id": string, "name": string, "companyId": string }] }`

### POST /api/categories

**授权**：Bearer Token（admin）
**请求**：`{ "name": string }`
**响应 201**：分类对象

### GET /api/assignment-rules

**授权**：Bearer Token
**公司隔离**：按当前用户公司过滤
**响应 200**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| items | array | 否 | 规则列表 |
| items[].id | string | 否 | 规则 ID |
| items[].categoryId | string | 否 | 分类 ID |
| items[].categoryName | string | 否 | 分类名称 |
| items[].businessGroupId | string | 否 | 业务组 ID |
| items[].businessGroupName | string | 否 | 业务组名称 |

### POST /api/assignment-rules

**授权**：Bearer Token（admin）
**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| categoryId | string | 否 | 分类 ID |
| businessGroupId | string | 否 | 业务组 ID |

**响应 201**：规则对象
**错误 409**：`{ "error": { "code": "rule_exists", "message": "..." } }`（该分类已有规则）

## 5. 工单

### POST /api/tickets

**授权**：Bearer Token（submitter/handler/admin）
**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| title | string | 否 | 主题 |
| description | string | 否 | 描述 |
| categoryId | string | 否 | 分类 ID |
| slaPriority | string | 否 | 优先级：P0/P1/P2/P3/P4 |

**行为**：
1. 创建工单，状态设为 `pending_assignment`
2. 查询 `category_assignment_rules` 获取该分类对应的业务组
3. 若找到规则：分配业务组，状态变为 `pending_processing`，记录 `assigned_at`
4. 若无规则：保持 `pending_assignment`，等待手动分配
5. 自动记录提交人信息（userId, companyId）和创建时间
6. 写入审计日志（创建 + 分配）

**响应 201**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | 工单 ID |
| title | string | 否 | 主题 |
| description | string | 否 | 描述 |
| categoryId | string | 否 | 分类 ID |
| slaPriority | string | 否 | 优先级 |
| status | string | 否 | 状态 |
| businessGroupId | string | 是 | 业务组 ID（未分配时为 null） |
| createdAt | string | 否 | 创建时间 |

**错误 400**：`{ "error": { "code": "invalid_input", "message": "...", "details": [...] } }`

### GET /api/tickets

**授权**：Bearer Token
**公司隔离**：按当前用户公司过滤；admin 可通过 `companyId` 跨公司
**查询参数**：
| 参数 | 类型 | 可空 | 说明 |
|------|------|------|------|
| page | number | 是 | 页码，默认 1 |
| pageSize | number | 是 | 每页条数，默认 20 |
| status | string | 是 | 状态筛选 |
| slaPriority | string | 是 | 优先级筛选 |
| categoryId | string | 是 | 分类筛选 |
| companyId | string | 是 | 公司筛选（admin） |
| search | string | 是 | 关键词搜索（标题/描述） |
| sortBy | string | 是 | 排序字段：createdAt/slaPriority/status |
| sortOrder | string | 是 | 排序方向：asc/desc |

**响应 200**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| items | array | 否 | 工单列表 |
| items[].id | string | 否 | 工单 ID |
| items[].title | string | 否 | 主题 |
| items[].status | string | 否 | 状态 |
| items[].slaPriority | string | 否 | 优先级 |
| items[].categoryName | string | 否 | 分类名称 |
| items[].submitterName | string | 否 | 提交人姓名 |
| items[].createdAt | string | 否 | 创建时间 |
| total | number | 否 | 总数 |

### GET /api/tickets/:ticketId

**授权**：Bearer Token
**公司隔离**：仅可查看同公司工单
**响应 200**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | 工单 ID |
| title | string | 否 | 主题 |
| description | string | 否 | 描述 |
| categoryId | string | 否 | 分类 ID |
| categoryName | string | 否 | 分类名称 |
| slaPriority | string | 否 | 优先级 |
| status | string | 否 | 状态 |
| companyId | string | 否 | 公司 ID |
| submitter | object | 否 | 提交人信息 |
| submitter.id | string | 否 | 提交人 ID |
| submitter.name | string | 否 | 姓名 |
| submitter.email | string | 否 | 邮箱 |
| submitter.companyName | string | 否 | 公司名称 |
| submitter.departmentName | string | 是 | 部门名称 |
| businessGroupId | string | 是 | 业务组 ID |
| handlerId | string | 是 | 处理人 ID |
| handlerName | string | 是 | 处理人姓名 |
| replies | array | 否 | 回复列表 |
| replies[].id | string | 否 | 回复 ID |
| replies[].replierId | string | 否 | 回复人 ID |
| replies[].replierName | string | 否 | 回复人姓名 |
| replies[].content | string | 否 | 回复内容 |
| replies[].createdAt | string | 否 | 回复时间 |
| createdAt | string | 否 | 创建时间 |
| assignedAt | string | 是 | 分配时间 |
| processedAt | string | 是 | 处理开始时间 |
| completedAt | string | 是 | 完成时间 |
| cancelledAt | string | 是 | 取消时间 |
| satisfaction | object | 是 | 满意度评价 |
| satisfaction.rating | number | 是 | 评分 (1-5) |
| satisfaction.comment | string | 是 | 评价内容 |
| satisfaction.createdAt | string | 是 | 评价时间 |

**错误 404**：`{ "error": { "code": "not_found", "message": "..." } }`

### POST /api/tickets/:ticketId/replies

**授权**：Bearer Token（submitter/handler/admin，同公司）
**请求**：`{ "content": string }`
**响应 201**：回复对象（含 replierName, createdAt）
**错误 403**：`{ "error": { "code": "forbidden", "message": "..." } }`

### POST /api/tickets/:ticketId/transfer

**授权**：Bearer Token（handler/admin）
**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| toBusinessGroupId | string | 否 | 目标业务组 ID |
| reason | string | 是 | 转派原因 |

**行为**：
1. 记录转派记录（from → to）
2. 更新工单 business_group_id，清空 handler_id
3. 状态变为 `pending_assignment`
4. 写入审计日志

**响应 200**：工单对象（更新后）
**错误 409**：`{ "error": { "code": "invalid_status", "message": "..." } }`（已完成/已取消的工单不可转派）

### POST /api/tickets/:ticketId/complete

**授权**：Bearer Token（handler/admin，当前工单处理人或同组 handler）
**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| summary | string | 是 | 处理摘要 |

**行为**：
1. 记录处理人（handler_id）、处理时间（completed_at）
2. 状态变为 `completed`
3. 异步发送邮件通知提交人（emailkit）
4. 写入审计日志

**响应 200**：工单对象（更新后）
**错误 409**：`{ "error": { "code": "invalid_status", "message": "..." } }`

### POST /api/tickets/:ticketId/cancel

**授权**：Bearer Token（submitter/handler/admin，同公司）
**请求**：`{ "reason": string }`（可选）
**行为**：状态变为 `cancelled`，记录 cancelled_at，写入审计日志
**响应 200**：工单对象
**错误 409**：`{ "error": { "code": "invalid_status", "message": "..." } }`（已完成的工单不可取消）

### POST /api/tickets/:ticketId/satisfaction

**授权**：Bearer Token（submitter，仅工单提交人可评价）
**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| rating | number | 否 | 评分 (1-5) |
| comment | string | 是 | 评价内容 |

**行为**：保存满意度评价，写入审计日志
**响应 201**：评价对象
**错误 403**：`{ "error": { "code": "forbidden", "message": "..." } }`（非提交人）
**错误 409**：`{ "error": { "code": "already_rated", "message": "..." } }` 或 `{ "error": { "code": "invalid_status", "message": "..." } }`（非完成状态）

## 6. 工单工作台

### GET /api/workbench/tickets

**授权**：Bearer Token（handler/admin）
**查询参数**：同 GET /api/tickets，默认 `status=pending_processing`
**响应 200**：同 GET /api/tickets

## 7. 统计分析

### GET /api/statistics/distribution

**授权**：Bearer Token（admin）
**查询参数**：
| 参数 | 类型 | 可空 | 说明 |
|------|------|------|------|
| dimension | string | 否 | 统计维度：company/department |
| companyId | string | 是 | 指定公司（admin 跨公司） |

**响应 200**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| items | array | 否 | 分布数据 |
| items[].name | string | 否 | 公司/部门名称 |
| items[].count | number | 否 | 工单数量 |
| items[].pendingCount | number | 否 | 待处理数量 |
| items[].completedCount | number | 否 | 已完成数量 |

### GET /api/statistics/dashboard

**授权**：Bearer Token（admin）
**查询参数**：
| 参数 | 类型 | 可空 | 说明 |
|------|------|------|------|
| companyId | string | 是 | 指定公司（admin 跨公司） |
| startDate | string | 是 | 起始日期 (ISO 8601) |
| endDate | string | 是 | 截止日期 (ISO 8601) |

**响应 200**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| totalTickets | number | 否 | 工单总量 |
| avgResponseTime | number | 否 | 平均响应时间（秒） |
| avgSatisfaction | number | 否 | 平均满意度 (1-5) |
| hotCategories | array | 否 | 热点问题（按分类聚合 Top 5） |
| hotCategories[].categoryId | string | 否 | 分类 ID |
| hotCategories[].categoryName | string | 否 | 分类名称 |
| hotCategories[].count | number | 否 | 工单数量 |

**平均响应时间定义**：从工单创建时间（created_at）到首次回复时间（ticket_replies 第一条 created_at）的平均间隔（秒）。需求未规定计算口径，此为设计基线。

## 8. 操作日志

### GET /api/logs

**授权**：Bearer Token（admin）
**查询参数**：
| 参数 | 类型 | 可空 | 说明 |
|------|------|------|------|
| ticketId | string | 是 | 按工单筛选 |
| action | string | 是 | 按操作类型筛选 |
| startDate | string | 是 | 起始时间 |
| endDate | string | 是 | 截止时间 |
| page | number | 是 | 页码 |
| pageSize | number | 是 | 每页条数 |

**操作类型枚举**：`ticket_created`, `ticket_assigned`, `ticket_transferred`, `ticket_processed`, `ticket_completed`, `ticket_cancelled`, `ticket_rated`, `ticket_replied`

**响应 200**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| items | array | 否 | 日志列表 |
| items[].id | string | 否 | 日志 ID |
| items[].action | string | 否 | 操作类型 |
| items[].ticketId | string | 否 | 关联工单 ID |
| items[].userId | string | 否 | 操作人 ID |
| items[].userName | string | 否 | 操作人姓名 |
| items[].createdAt | string | 否 | 操作时间 |
| items[].details | object | 是 | 操作详情 (JSON) |
| total | number | 否 | 总数 |

> 日志通过 auditkit 的 `record(event)` 写入，存储在 `audit_events` 表（id TEXT, actor_user_id TEXT）。查询时从 audit_events 读取并映射为上述响应格式。

## 9. 错误码汇总

| HTTP | error.code | 说明 |
|------|------------|------|
| 400 | invalid_input | 请求参数校验失败 |
| 401 | unauthorized | 未认证或 token 无效 |
| 403 | forbidden | 无权限或公司隔离拒绝 |
| 403 | PASSWORD_CHANGE_REQUIRED | 需要更改临时密码 |
| 404 | not_found | 资源不存在 |
| 409 | invalid_status | 工单状态不允许该操作 |
| 409 | already_member | 已是业务组成员 |
| 409 | rule_exists | 该分类已有分配规则 |
| 409 | already_rated | 工单已评价 |
| 500 | internal_error | 服务内部错误 |

> 错误响应格式：`{ "error": { "code": string, "message": string } }`，匹配平台 `apiError.shape`。
