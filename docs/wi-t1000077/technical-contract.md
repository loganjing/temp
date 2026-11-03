# 技术契约

> WorkItem: wi-t1000077 | 架构基线: docs/wi-t1000077/architecture-baseline.md

## 1. ID 对照表

| 实体 | 生成方 | 数据库主键 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|------|--------|-----------|----------|--------------|---------|-------------|
| User | userkit (users 表自增) | INTEGER PK AUTOINCREMENT | INTEGER FK | number | number | 无转换 |
| UserProfile | 项目 (user_profiles 表自增) | INTEGER PK AUTOINCREMENT | INTEGER FK (user_id) | number | number | 无转换 |
| Company | 项目 (companies 表自增) | INTEGER PK AUTOINCREMENT | INTEGER FK | number | number | 无转换 |
| Department | 项目 (departments 表自增) | INTEGER PK AUTOINCREMENT | INTEGER FK (company_id) | number | number | 无转换 |
| BusinessGroup | 项目 (business_groups 表自增) | INTEGER PK AUTOINCREMENT | INTEGER FK (company_id) | number | number | 无转换 |
| TicketCategory | 项目 (ticket_categories 表自增) | INTEGER PK AUTOINCREMENT | INTEGER FK (company_id) | number | number | 无转换 |
| Ticket | 项目 (tickets 表自增) | INTEGER PK AUTOINCREMENT | INTEGER FK (company_id, category_id, submitter_id, business_group_id, handler_id) | number | number | 无转换 |
| TicketReply | 项目 (ticket_replies 表自增) | INTEGER PK AUTOINCREMENT | INTEGER FK (ticket_id, replier_id) | number | number | 无转换 |
| TicketTransfer | 项目 (ticket_transfers 表自增) | INTEGER PK AUTOINCREMENT | INTEGER FK (ticket_id, from/to business_group_id) | number | number | 无转换 |
| TicketSatisfaction | 项目 (ticket_satisfactions 表自增) | INTEGER PK AUTOINCREMENT | INTEGER FK (ticket_id) | number | number | 无转换 |
| CategoryAssignmentRule | 项目 (category_assignment_rules 表自增) | INTEGER PK AUTOINCREMENT | INTEGER FK (company_id, category_id, business_group_id) | number | number | 无转换 |

所有 ID 为 SQLite INTEGER PRIMARY KEY AUTOINCREMENT，API 直接暴露为 number，无格式转换。

## 2. 认证与会话

### POST /api/auth/login

**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| username | string | 否 | 用户名 |
| password | string | 否 | 密码 |

**响应 200**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| token | string | 否 | Bearer Token |
| user | object | 否 | 用户信息（含 profile） |

**响应 401**：`{ "error": "invalid_credentials" }`

**幂等**：是（重复登录返回新 token）

### POST /api/auth/logout

**授权**：Bearer Token
**响应 204**：无内容
**幂等**：是

### GET /api/auth/me

**授权**：Bearer Token
**响应 200**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | number | 否 | 用户 ID |
| username | string | 否 | 用户名 |
| profile | object | 否 | 业务档案 |
| profile.displayName | string | 否 | 姓名 |
| profile.email | string | 否 | 邮箱 |
| profile.companyId | number | 否 | 公司 ID |
| profile.companyName | string | 否 | 公司名称 |
| profile.departmentId | number | 是 | 部门 ID |
| profile.departmentName | string | 是 | 部门名称 |
| profile.role | string | 否 | 角色：submitter/handler/admin |

## 3. 用户

### GET /api/users/:userId

**授权**：Bearer Token（handler/admin 可查看同公司提交人信息）
**公司隔离**：仅可查询同公司用户，admin 可跨公司
**响应 200**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | number | 否 | 用户 ID |
| displayName | string | 否 | 姓名 |
| email | string | 否 | 邮箱 |
| companyId | number | 否 | 公司 ID |
| companyName | string | 否 | 公司名称 |
| departmentId | number | 是 | 部门 ID |
| departmentName | string | 是 | 部门名称 |
| role | string | 否 | 角色 |

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
| items[].id | number | 否 | 工单 ID |
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
| items[].id | number | 否 | 业务组 ID |
| items[].name | string | 否 | 业务组名称 |
| items[].companyId | number | 否 | 公司 ID |
| items[].members | array | 是 | 成员列表 |
| items[].members[].userId | number | 否 | 用户 ID |
| items[].members[].displayName | string | 否 | 姓名 |

### POST /api/business-groups

**授权**：Bearer Token（admin）
**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| name | string | 否 | 业务组名称 |
| companyId | number | 否 | 公司 ID（admin 指定，默认当前公司） |

**响应 201**：业务组对象（同 GET 单项）
**错误 403**：`{ "error": "forbidden" }`

### POST /api/business-groups/:groupId/members

**授权**：Bearer Token（admin）
**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| userId | number | 否 | 用户 ID |

**响应 201**：`{ "id": number, "businessGroupId": number, "userId": number }`
**错误 409**：`{ "error": "already_member" }`

### DELETE /api/business-groups/:groupId/members/:userId

**授权**：Bearer Token（admin）
**响应 204**：无内容

### GET /api/categories

**授权**：Bearer Token
**公司隔离**：按当前用户公司过滤
**响应 200**：`{ "items": [{ "id": number, "name": string, "companyId": number }] }`

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
| items[].id | number | 否 | 规则 ID |
| items[].categoryId | number | 否 | 分类 ID |
| items[].categoryName | string | 否 | 分类名称 |
| items[].businessGroupId | number | 否 | 业务组 ID |
| items[].businessGroupName | string | 否 | 业务组名称 |

### POST /api/assignment-rules

**授权**：Bearer Token（admin）
**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| categoryId | number | 否 | 分类 ID |
| businessGroupId | number | 否 | 业务组 ID |

**响应 201**：规则对象
**错误 409**：`{ "error": "rule_exists" }`（该分类已有规则）

## 5. 工单

### POST /api/tickets

**授权**：Bearer Token（submitter/handler/admin）
**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| title | string | 否 | 主题 |
| description | string | 否 | 描述 |
| categoryId | number | 否 | 分类 ID |
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
| id | number | 否 | 工单 ID |
| title | string | 否 | 主题 |
| description | string | 否 | 描述 |
| categoryId | number | 否 | 分类 ID |
| slaPriority | string | 否 | 优先级 |
| status | string | 否 | 状态 |
| businessGroupId | number | 是 | 业务组 ID（未分配时为 null） |
| createdAt | string | 否 | 创建时间 |

**错误 400**：`{ "error": "invalid_input", "details": [...] }`

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
| categoryId | number | 是 | 分类筛选 |
| companyId | number | 是 | 公司筛选（admin） |
| search | string | 是 | 关键词搜索（标题/描述） |
| sortBy | string | 是 | 排序字段：createdAt/slaPriority/status |
| sortOrder | string | 是 | 排序方向：asc/desc |

**响应 200**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| items | array | 否 | 工单列表 |
| items[].id | number | 否 | 工单 ID |
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
| id | number | 否 | 工单 ID |
| title | string | 否 | 主题 |
| description | string | 否 | 描述 |
| categoryId | number | 否 | 分类 ID |
| categoryName | string | 否 | 分类名称 |
| slaPriority | string | 否 | 优先级 |
| status | string | 否 | 状态 |
| companyId | number | 否 | 公司 ID |
| submitter | object | 否 | 提交人信息 |
| submitter.id | number | 否 | 提交人 ID |
| submitter.displayName | string | 否 | 姓名 |
| submitter.email | string | 否 | 邮箱 |
| submitter.companyName | string | 否 | 公司名称 |
| submitter.departmentName | string | 是 | 部门名称 |
| businessGroupId | number | 是 | 业务组 ID |
| handlerId | number | 是 | 处理人 ID |
| handlerName | string | 是 | 处理人姓名 |
| replies | array | 否 | 回复列表 |
| replies[].id | number | 否 | 回复 ID |
| replies[].replierId | number | 否 | 回复人 ID |
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

**错误 404**：`{ "error": "not_found" }`

### POST /api/tickets/:ticketId/replies

**授权**：Bearer Token（submitter/handler/admin，同公司）
**请求**：`{ "content": string }`
**响应 201**：回复对象（含 replierName, createdAt）
**错误 403**：`{ "error": "forbidden" }`

### POST /api/tickets/:ticketId/transfer

**授权**：Bearer Token（handler/admin）
**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| toBusinessGroupId | number | 否 | 目标业务组 ID |
| reason | string | 是 | 转派原因 |

**行为**：
1. 记录转派记录（from → to）
2. 更新工单 business_group_id，清空 handler_id
3. 状态变为 `pending_assignment`
4. 写入审计日志

**响应 200**：工单对象（更新后）
**错误 409**：`{ "error": "invalid_status" }`（已完成/已取消的工单不可转派）

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
**错误 409**：`{ "error": "invalid_status" }`

### POST /api/tickets/:ticketId/cancel

**授权**：Bearer Token（submitter/handler/admin，同公司）
**请求**：`{ "reason": string }`（可选）
**行为**：状态变为 `cancelled`，记录 cancelled_at，写入审计日志
**响应 200**：工单对象
**错误 409**：`{ "error": "invalid_status" }`（已完成的工单不可取消）

### POST /api/tickets/:ticketId/satisfaction

**授权**：Bearer Token（submitter，仅工单提交人可评价）
**请求**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| rating | number | 否 | 评分 (1-5) |
| comment | string | 是 | 评价内容 |

**行为**：保存满意度评价，写入审计日志
**响应 201**：评价对象
**错误 403**：`{ "error": "forbidden" }`（非提交人）
**错误 409**：`{ "error": "already_rated" }` 或 `{ "error": "invalid_status" }`（非完成状态）

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
| companyId | number | 是 | 指定公司（admin 跨公司） |

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
| companyId | number | 是 | 指定公司（admin 跨公司） |
| startDate | string | 是 | 起始日期 (ISO 8601) |
| endDate | string | 是 | 截止日期 (ISO 8601) |

**响应 200**：
| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| totalTickets | number | 否 | 工单总量 |
| avgResponseTime | number | 否 | 平均响应时间（秒） |
| avgSatisfaction | number | 否 | 平均满意度 (1-5) |
| hotCategories | array | 否 | 热点问题（按分类聚合 Top 5） |
| hotCategories[].categoryId | number | 否 | 分类 ID |
| hotCategories[].categoryName | string | 否 | 分类名称 |
| hotCategories[].count | number | 否 | 工单数量 |

**平均响应时间定义**：从工单创建时间（created_at）到首次回复时间（ticket_replies 第一条 created_at）的平均间隔（秒）。需求未规定计算口径，此为设计基线。

## 8. 操作日志

### GET /api/logs

**授权**：Bearer Token（admin）
**查询参数**：
| 参数 | 类型 | 可空 | 说明 |
|------|------|------|------|
| ticketId | number | 是 | 按工单筛选 |
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
| items[].id | number | 否 | 日志 ID |
| items[].action | string | 否 | 操作类型 |
| items[].ticketId | number | 否 | 关联工单 ID |
| items[].userId | number | 否 | 操作人 ID |
| items[].userName | string | 否 | 操作人姓名 |
| items[].createdAt | string | 否 | 操作时间 |
| items[].details | object | 是 | 操作详情 (JSON) |
| total | number | 否 | 总数 |

## 9. 错误码汇总

| HTTP | error | 说明 |
|------|-------|------|
| 400 | invalid_input | 请求参数校验失败 |
| 401 | unauthorized | 未认证或 token 无效 |
| 403 | forbidden | 无权限或公司隔离拒绝 |
| 404 | not_found | 资源不存在 |
| 409 | invalid_status | 工单状态不允许该操作 |
| 409 | already_member | 已是业务组成员 |
| 409 | rule_exists | 该分类已有分配规则 |
| 409 | already_rated | 工单已评价 |
| 500 | internal_error | 服务内部错误 |
