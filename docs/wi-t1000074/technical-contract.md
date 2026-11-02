# 技术契约

> Work Item: wi-t1000074 | 配套 architecture-baseline.md 的字段级 API 契约

## 实体 ID 类型对照

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|------|--------|---------------|----------|--------------|----------|-------------|
| Ticket | 服务端 UUID v4 | TEXT | TEXT | string | string | 无转换，全程字符串 |
| User | userkit 生成 | TEXT | TEXT | string | string | 无转换 |
| Company | 服务端 UUID v4 | TEXT | TEXT | string | string | 无转换 |
| Department | 服务端 UUID v4 | TEXT | TEXT | string | string | 无转换 |
| TicketCategory | 服务端 UUID v4 | TEXT | TEXT | string | string | 无转换 |
| BusinessGroup | 服务端 UUID v4 | TEXT | TEXT | string | string | 无转换 |
| BusinessGroupMember | 服务端 UUID v4 | TEXT | TEXT | string | string | 无转换 |
| AutoAssignRule | 服务端 UUID v4 | TEXT | TEXT | string | string | 无转换 |
| TicketReply | 服务端 UUID v4 | TEXT | TEXT | string | string | 无转换 |
| TicketTransfer | 服务端 UUID v4 | TEXT | TEXT | string | string | 无转换 |
| TicketEvaluation | 服务端 UUID v4 | TEXT | TEXT | string | string | 无转换 |
| AuditEvent | auditkit 生成 | TEXT | — | string | string | 无转换 |

所有实体主键统一使用 UUID v4 字符串，数据库存储为 TEXT，API 传输为 string，前端处理为 string，无需类型转换。

## 通用约定

- **认证：** 除 `/api/auth/login` 外，所有接口要求 `Authorization: Bearer <token>` 头
- **公司隔离：** 所有业务接口自动注入当前用户的 `company_id` 过滤；路径参数中的 `:companyId` 必须与当前用户公司一致，否则返回 403
- **时间格式：** 所有时间字段使用 ISO 8601 UTC 字符串（如 `2026-11-02T08:00:00Z`）
- **分页：** 列表接口支持 `page`（默认 1）和 `pageSize`（默认 20）查询参数，返回 `{ items: [], total: number, page: number, pageSize: number }`
- **错误响应：** `{ error: { code: string, message: string } }`，HTTP 状态码 400/401/403/404/500

## 枚举值定义

### TicketStatus

| 值 | 说明 |
|----|------|
| `created` | 已创建 |
| `pending_assignment` | 待分配 |
| `pending_processing` | 待处理 |
| `completed` | 已完成 |
| `cancelled` | 已取消 |

### SLAPriority

| 值 | 说明 |
|----|------|
| `P0` | 最高优先级 |
| `P1` | 高优先级 |
| `P2` | 中优先级 |
| `P3` | 低优先级 |
| `P4` | 最低优先级 |

### UserRole

| 值 | 说明 |
|----|------|
| `submitter` | 提交人 |
| `handler` | 处理人 |
| `admin` | 管理员 |

### TransferTargetType

| 值 | 说明 |
|----|------|
| `user` | 转派给处理人 |
| `group` | 转派给业务组 |

## API 接口定义

### 认证

#### POST /api/auth/login

登录并获取 Bearer token。

- 请求体：`{ username: string, password: string }`
- 响应 200：`{ token: string, user: UserInfo }`
- 响应 401：用户名或密码错误
- 授权：无

#### POST /api/auth/logout

注销当前会话。

- 请求体：无
- 响应 200：`{ success: true }`
- 授权：已登录

#### GET /api/auth/me

获取当前登录用户信息。

- 请求参数：无
- 响应 200：`UserInfo`

### UserInfo 类型

```typescript
interface UserInfo {
  id: string;
  username: string;
  email: string;
  fullName: string;
  companyId: string;
  companyName: string;
  departmentId: string | null;
  departmentName: string | null;
  role: UserRole;
  createdAt: string;
}
```

### 工单

#### POST /api/tickets

创建工单。创建后检查自动分配规则，匹配则自动分配到业务组。

- 请求体：
```typescript
{
  title: string;          // 必填，最长 200
  description: string;    // 必填
  categoryId: string;     // 必填，须属于当前公司
  slaPriority: SLAPriority; // 必填
}
```
- 响应 201：`Ticket`
- 授权：`submitter`、`admin`
- 副作用：写入 audit_event（action: `ticket_create`）；若匹配自动分配规则，写入 audit_event（action: `ticket_auto_assign`），状态流转为 `pending_processing`

#### GET /api/tickets

分页查询工单列表。

- 查询参数：
```typescript
{
  page?: number;          // 默认 1
  pageSize?: number;      // 默认 20
  status?: TicketStatus;  // 按状态筛选
  slaPriority?: SLAPriority; // 按优先级筛选
  categoryId?: string;    // 按分类筛选
  keyword?: string;       // 搜索 title/description
  sortBy?: string;        // createdAt | slaPriority | status，默认 createdAt
  sortOrder?: string;     // asc | desc，默认 desc
}
```
- 响应 200：`{ items: Ticket[], total: number, page: number, pageSize: number }`
- 授权：已登录（仅返回当前公司工单）

#### GET /api/tickets/:id

获取工单详情。

- 响应 200：`TicketDetail`
- 响应 404：工单不存在或不属于当前公司
- 授权：已登录

#### PUT /api/tickets/:id

更新工单基本信息（仅待分配或待处理状态可更新）。

- 请求体：`{ title?: string, description?: string, categoryId?: string, slaPriority?: SLAPriority }`
- 响应 200：`Ticket`
- 授权：`submitter`（自己的工单）、`admin`

#### POST /api/tickets/:id/replies

添加回复。

- 请求体：`{ content: string }`
- 响应 201：`TicketReply`
- 授权：已登录（工单属于当前公司）
- 副作用：写入 audit_event（action: `ticket_reply`）

#### GET /api/tickets/:id/replies

获取工单回复列表（按时间升序）。

- 响应 200：`TicketReply[]`
- 授权：已登录

#### POST /api/tickets/:id/assign

手动分配工单到处理人或业务组。

- 请求体：`{ targetType: TransferTargetType, targetUserId?: string, targetGroupId?: string }`
- 响应 200：`Ticket`（状态变为 `pending_processing`）
- 授权：`admin`、`handler`（业务组成员）
- 副作用：写入 audit_event（action: `ticket_assign`）

#### POST /api/tickets/:id/transfer

转派工单。

- 请求体：`{ targetType: TransferTargetType, targetUserId?: string, targetGroupId?: string, reason?: string }`
- 响应 200：`Ticket`（更新分配信息）
- 授权：`handler`（当前处理人）
- 副作用：写入 ticket_transfer 记录；写入 audit_event（action: `ticket_transfer`）

#### POST /api/tickets/:id/complete

完成工单。

- 请求体：`{ summary?: string }`（处理摘要）
- 响应 200：`Ticket`（状态变为 `completed`，记录 handlerId 和 handledAt）
- 授权：`handler`（当前分配处理人）
- 副作用：写入 audit_event（action: `ticket_complete`）；异步发送邮件到提交人邮箱

#### POST /api/tickets/:id/cancel

取消工单。

- 请求体：`{ reason?: string }`
- 响应 200：`Ticket`（状态变为 `cancelled`）
- 授权：`submitter`（自己的工单）、`admin`
- 副作用：写入 audit_event（action: `ticket_cancel`）

#### GET /api/tickets/:id/submitter-info

获取提交人完整信息（含历史工单）。

- 响应 200：`SubmitterInfo`
- 授权：`handler`、`admin`

#### GET /api/tickets/:id/logs

获取工单操作日志。

- 响应 200：`OperationLog[]`
- 授权：已登录

### Ticket 类型

```typescript
interface Ticket {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  categoryName: string;
  companyId: string;
  submitterId: string;
  submitterName: string;
  slaPriority: SLAPriority;
  status: TicketStatus;
  assignedGroupId: string | null;
  assignedGroupName: string | null;
  assignedHandlerId: string | null;
  assignedHandlerName: string | null;
  handlerId: string | null;       // 最终处理人
  handlerName: string | null;
  handledAt: string | null;       // 处理完成时间
  createdAt: string;
  updatedAt: string;
}

interface TicketDetail extends Ticket {
  replies: TicketReply[];
  evaluation: TicketEvaluation | null;
}

interface TicketReply {
  id: string;
  ticketId: string;
  replierId: string;
  replierName: string;
  content: string;
  createdAt: string;
}
```

### SubmitterInfo 类型

```typescript
interface SubmitterInfo {
  id: string;
  fullName: string;
  email: string;
  companyId: string;
  companyName: string;
  departmentId: string | null;
  departmentName: string | null;
  ticketCount: number;
  historyTickets: {
    id: string;
    title: string;
    status: TicketStatus;
    slaPriority: SLAPriority;
    createdAt: string;
  }[];
}
```

### OperationLog 类型

```typescript
interface OperationLog {
  id: string;
  actorId: string;
  actorName: string;
  actionType: string;   // ticket_create | ticket_assign | ticket_auto_assign | ticket_transfer | ticket_reply | ticket_complete | ticket_cancel
  targetType: string;   // ticket
  targetId: string;     // ticketId
  detail: string | null; // JSON string with action-specific context
  createdAt: string;
}
```

### 业务组

#### GET /api/companies/:companyId/groups

- 响应 200：`BusinessGroup[]`
- 授权：已登录（companyId 须与当前用户公司一致）

#### POST /api/companies/:companyId/groups

- 请求体：`{ name: string }`
- 响应 201：`BusinessGroup`
- 授权：`admin`

#### GET /api/companies/:companyId/groups/:groupId/members

- 响应 200：`BusinessGroupMember[]`
- 授权：已登录

#### POST /api/companies/:companyId/groups/:groupId/members

- 请求体：`{ userId: string }`
- 响应 201：`BusinessGroupMember`
- 授权：`admin`

#### DELETE /api/companies/:companyId/groups/:groupId/members/:userId

- 响应 200：`{ success: true }`
- 授权：`admin`

### BusinessGroup / BusinessGroupMember 类型

```typescript
interface BusinessGroup {
  id: string;
  companyId: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

interface BusinessGroupMember {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: string;
}
```

### 自动分配规则

#### GET /api/companies/:companyId/auto-assign-rules

- 响应 200：`AutoAssignRule[]`
- 授权：`admin`

#### POST /api/companies/:companyId/auto-assign-rules

- 请求体：`{ categoryId: string, targetGroupId: string }`
- 响应 201：`AutoAssignRule`
- 授权：`admin`
- 幂等性：同一 companyId + categoryId 只能有一条规则，重复创建返回 409

### AutoAssignRule 类型

```typescript
interface AutoAssignRule {
  id: string;
  companyId: string;
  categoryId: string;
  categoryName: string;
  targetGroupId: string;
  targetGroupName: string;
  createdAt: string;
}
```

### 问题分类

#### GET /api/companies/:companyId/categories

- 响应 200：`TicketCategory[]`
- 授权：已登录

#### POST /api/companies/:companyId/categories

- 请求体：`{ name: string }`
- 响应 201：`TicketCategory`
- 授权：`admin`

### TicketCategory 类型

```typescript
interface TicketCategory {
  id: string;
  companyId: string;
  name: string;
  createdAt: string;
}
```

### 评价

#### GET /api/tickets/:id/evaluation

- 响应 200：`TicketEvaluation`（未评价时返回 404）
- 授权：已登录

#### POST /api/tickets/:id/evaluation

- 请求体：`{ rating: number, comment?: string }`（rating: 1-5 整数）
- 响应 201：`TicketEvaluation`
- 授权：`submitter`（工单提交人，且工单状态为 `completed`）
- 幂等性：同一工单只能评价一次，重复提交返回 409

### TicketEvaluation 类型

```typescript
interface TicketEvaluation {
  id: string;
  ticketId: string;
  evaluatorId: string;
  evaluatorName: string;
  rating: number;       // 1-5
  comment: string | null;
  createdAt: string;
}
```

### 统计分析

#### GET /api/statistics/distribution

按维度统计工单分布。

- 查询参数：`{ dimension: "company" | "department" }`
- 响应 200：
```typescript
{
  dimension: string;
  groups: {
    key: string;        // companyId 或 departmentId
    label: string;      // 公司名或部门名
    total: number;
    byStatus: Record<TicketStatus, number>;
  }[];
}
```
- 授权：`admin`（可查看全公司数据）

#### GET /api/statistics/dashboard

运营仪表盘指标。

- 查询参数：`{ companyId?: string }`（不传则当前公司）
- 响应 200：
```typescript
{
  totalTickets: number;
  byStatus: Record<TicketStatus, number>;
  averageResponseTimeHours: number;   // 平均响应时间（创建到完成）
  satisfactionScore: number;          // 平均满意度（1-5）
  totalEvaluations: number;
  topCategories: {                    // 热点问题
    categoryId: string;
    categoryName: string;
    count: number;
  }[];
}
```
- 授权：`admin`

### 工作台

#### GET /api/workbench/tickets

待处理工单列表，支持筛选/搜索/排序。

- 查询参数：
```typescript
{
  page?: number;
  pageSize?: number;
  status?: TicketStatus;       // 默认 pending_processing
  slaPriority?: SLAPriority;
  categoryId?: string;
  companyId?: string;          // 管理员可按公司筛选
  keyword?: string;            // 搜索 title/description
  sortBy?: string;             // slaPriority | createdAt | updatedAt
  sortOrder?: string;          // asc | desc
}
```
- 响应 200：`{ items: Ticket[], total: number, page: number, pageSize: number }`
- 授权：`handler`、`admin`
- 说明：handler 默认返回分配给自己的待处理工单；admin 可通过 companyId 筛选全公司待处理工单

### 转派记录

#### TicketTransfer 类型

```typescript
interface TicketTransfer {
  id: string;
  ticketId: string;
  transferredBy: string;
  transferredByName: string;
  targetType: TransferTargetType;
  targetUserId: string | null;
  targetUserName: string | null;
  targetGroupId: string | null;
  targetGroupName: string | null;
  reason: string | null;
  createdAt: string;
}
```

转派记录通过工单详情接口获取（`GET /api/tickets/:id` 可扩展返回 transfers 字段），或通过工单日志查看。
