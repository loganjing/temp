# 技术契约

- Work Item：wi-t1000312
- 阶段：design
- 关联：`docs/wi-t1000312/architecture-baseline.md`（架构与数据模型）
- 日期：2026-10-20

本文件是前后端共同遵循的 API 契约唯一来源，定义 method/path、请求/响应字段、类型、可空性、错误、授权、幂等性与数据映射责任。

## 1. 通用约定

- 基址：`/api`；除登录外全部接口要求 `Authorization: Bearer <token>`（authkit 签发）。未认证 `401 {error}`；token 失效 `401`；限流触发 `429`。
- 角色枚举：`submitter`（提交人）、`handler`（处理人）、`admin`（配置管理员）。角色经 `user_profiles.role` 解析。
- 公司隔离：`submitter` 的所有工单读取/操作强制限定 `companyId = 当前用户公司`（来自 userkit users.companyId）；`handler`/`admin` 可跨公司，接受可选公司过滤参数。访问不属于自己可见范围的工单资源返回 `404 {error:"ticket_not_found"}`（不泄露存在性）。
- 业务错误统一结构：`{"error": "<code>"}`，HTTP 状态见各接口；本设计覆盖脚手架默认错误形状 `{error:{code,message}}`（`src/server/app.ts` 的错误响应以本契约为准）。未列出的服务端异常为 `500 {"error":"internal"}`，不暴露内部细节。
- 时间：ISO 8601 UTC 字符串（`YYYY-MM-DDTHH:mm:ss.sssZ`）；时长类指标以分钟计，保留 1 位小数。
- 分页：列表接口支持 `page`（≥1，默认 1）、`pageSize`（1-100，默认 20），返回 `{items, page, pageSize, total}`。
- 幂等性：除 `POST /api/tickets/:id/rating`（一工单一评，重复提交 `409`）与登录外，写接口为状态流转型：对已处于目标状态的重复请求返回 `409 {"error":"invalid_state"}`，不产生重复日志或重复邮件。
- 写接口成功响应为操作后的资源读回（与对应 GET 单资源结构一致），保证提交后可读回。

## 2. 身份与用户

### 2.1 POST /api/auth/login

- 授权：匿名（登录限流：60 秒 10 次，超限 429）。
- 请求：`{ "email": string(email, 非空), "password": string(非空) }`
- 行为：authkit 密码登录路由（loginField=email，userkit `findByCredential`）校验凭证与用户启用状态。
- 响应 200：`{ "token": string, "user": { "id": string, "name": string, "email": string, "role": string, "companyId": string|null, "department": string|null, "status": string } }`
- 错误：`401 {"error":"invalid_credentials"}`；账号停用 `401 {"error":"account_disabled"}`。

### 2.2 GET /api/me

- 授权：任意已认证角色。
- 响应 200：同 2.1 的 `user` 对象（含 `companyName: string|null`）。

### 2.3 GET /api/users?companyId=&q=

- 授权：`handler`/`admin`（成员选择、统计对照）；`companyId` 可空（空=当前用户公司）。
- 响应 200：`{ "items": [ { "id", "name", "email", "companyId", "companyName", "department", "role", "enabled" } ] }`（不含凭证字段；无分页参数时返回全量）。
- `submitter` 调用返回 `403 {"error":"forbidden"}`。

## 3. 公司与配置管理

### 3.1 GET /api/companies

- 授权：`handler`/`admin`（公司筛选、统计维度）。
- 响应 200：`{ "items": [ { "id": string, "name": string } ] }`

### 3.2 POST /api/groups

- 授权：`admin`。
- 请求：`{ "companyId": string(非空), "name": string(1-100, 非空), "memberIds": string[]?(可空，全量初始成员) }`
- 行为：建组；成员须属于该公司且存在，否则 `400 {"error":"invalid_member"}`。
- 响应 201：`{ "id", "companyId", "name", "members": [ { "userId", "userName" } ] }`（下同）。
- 错误：公司不存在 `404 {"error":"company_not_found"}`；组名重复 `409 {"error":"group_name_conflict"}`。

### 3.3 GET /api/groups?companyId=

- 授权：`admin`/`handler`（分配/转派目标选择）。`companyId` 必填，返回该公司全部业务组及成员。
- 响应 200：`{ "items": [ { "id", "companyId", "companyName", "name", "members": [ { "userId", "userName" } ] } ] }`

### 3.4 PUT /api/groups/:id

- 授权：`admin`。
- 请求：`{ "name"?: string(1-100), "memberIds"?: string[] }`；两字段均可空，至少提供一个；`memberIds` 为全量覆盖设置。
- 行为：更新组名与/或成员（成员校验同 3.2）。
- 响应 200：组读回（同 3.3 单项）。
- 错误：组不存在 `404 {"error":"group_not_found"}`；组名重复 `409`。

### 3.5 POST /api/category-rules

- 授权：`admin`。
- 请求：`{ "companyId": string, "category": string(1-50), "groupId": string }`
- 行为：创建"分类 → 业务组"规则；业务组须属于该公司，否则 `400 {"error":"group_company_mismatch"}`。
- 响应 201：`{ "id", "companyId", "category", "groupId", "groupName" }`
- 错误：同公司同分类已存在规则 `409 {"error":"rule_conflict"}`。

### 3.6 GET /api/category-rules?companyId=

- 授权：`admin`/`handler`。`companyId` 必填。
- 响应 200：`{ "items": [ { "id", "companyId", "category", "groupId", "groupName" } ] }`

### 3.7 DELETE /api/category-rules/:id

- 授权：`admin`；幂等删除（不存在返回 404）。
- 响应 204；错误：`404 {"error":"rule_not_found"}`。

## 4. 工单

工单读回结构 `Ticket`（列表项为其子集）：

```
{
  "id": string,                      // 工单号 TK-xxxxxx
  "title": string,
  "description": string,
  "category": string,
  "priority": "P0"|"P1"|"P2"|"P3"|"P4",
  "status": "PENDING_ASSIGNMENT"|"PROCESSING"|"COMPLETED"|"CANCELLED",
  "companyId": string, "companyName": string,
  "submitter": { "id": string, "name": string, "email": string, "department": string|null },
  "assignedGroupId": string|null, "assignedGroupName": string|null,
  "assigneeId": string|null, "assigneeName": string|null,
  "completedById": string|null, "completedAt": string|null,
  "firstReplyAt": string|null,
  "rating": { "score": int(1-5), "comment": string|null, "ratedAt": string } | null,
  "createdAt": string
}
```

列表项额外含 `replyCount: int`、`unreadHint: false`（预留，当前恒 false）。

### 4.1 POST /api/tickets

- 授权：`submitter`（提交人创建；创建公司 = 提交人公司，服务端取当前用户，不信任请求体公司字段）。
- 请求：`{ "title": string(1-200, 非空), "description": string(1-5000, 非空), "category": string(1-50, 非空), "priority": "P0".."P4" }`
- 行为：单事务内——工单号发号（`TK-`+6 位零填充序列）；写 `tickets`（status=PENDING_ASSIGNMENT，submitter=当前用户）；按 `(公司, category)` 查分类规则，命中则置 `assignedGroupId` 且 status=PROCESSING 并写日志 `ticket.assigned`（detail=组名，自动分配）；写日志 `ticket.created`。
- 响应 201：`Ticket`。
- 请求中不出现业务组字段（自动分配，无需提交人选择）。

### 4.2 GET /api/tickets（工作台 / 我的工单）

- 授权：任意已认证角色。查询参数：
  - `status`: `PENDING_ASSIGNMENT|PROCESSING|COMPLETED|CANCELLED|ALL`；`handler`/`admin` 默认 `PROCESSING`（工作台待处理队列，可切 `PENDING_ASSIGNMENT` 执行人工分配），`submitter` 默认 `ALL`（我的工单）。
  - `company`: string?（公司维度筛选；仅 `handler`/`admin` 生效，`submitter` 传入即忽略并强制本公司）
  - `category`、`priority`: string?（等值筛选）
  - `q`: string?（关键词，匹配工单号/主题/描述，大小写不敏感）
  - `sort`: `createdAt|priority|firstReplyAt`，默认 `createdAt`；`order`: `asc|desc`，默认 `desc`；`priority` 排序按 P0→P4 升序（最紧急在前）。
- 响应 200：`{ "items": [Ticket 列表项], "page", "pageSize", "total" }`

### 4.3 GET /api/tickets/:id

- 授权：`submitter` 仅本公司（否则 404）；`handler`/`admin` 跨公司。
- 响应 200：`Ticket`（含 `rating`，不含回复/日志）。
- 错误：`404 {"error":"ticket_not_found"}`。

### 4.4 POST /api/tickets/:id/assign（人工分配）

- 授权：`handler`/`admin`。请求：`{ "groupId": string(非空), "assigneeId"?: string }`
- 行为：事务内置 `assignedGroupId`（校验组属于工单公司，否则 `400 {"error":"group_company_mismatch"}`），可选指定处理人；状态 → PROCESSING；写日志 `ticket.assigned`（detail=组名+处理人，人工）。
- 前置状态：仅 `PENDING_ASSIGNMENT`；其他状态 `409 {"error":"invalid_state"}`。
- 响应 200：`Ticket`。

### 4.5 POST /api/tickets/:id/reassign（转派）

- 授权：`handler`/`admin`。请求：`{ "groupId"?: string, "assigneeId"?: string }` 至少其一。
- 行为：事务内变更归属（组转派校验同 4.4；`assigneeId` 转派校验为 handler/admin 角色用户）；状态保持 PROCESSING；写日志 `ticket.reassigned`（detail=转派目标：组名或处理人姓名）。
- 前置状态：仅 `PROCESSING`；`409 {"error":"invalid_state"}`。
- 响应 200：`Ticket`。

### 4.6 POST /api/tickets/:id/complete

- 授权：`handler`/`admin`。请求：`{ "resolution"?: string(0-2000) }`（完成说明，可选，存日志 detail）。
- 行为：事务内置 status=COMPLETED、`completedById`=当前用户、`completedAt`=now；写日志 `ticket.completed`。事务提交后调用通知域：向提交人邮箱发送完成邮件（主题含工单号与主题）并落 `notifications` 记录；邮件失败不回滚（见 §6）。
- 前置状态：仅 `PROCESSING`；`409 {"error":"invalid_state"}`。
- 响应 200：`Ticket`。

### 4.7 POST /api/tickets/:id/cancel

- 授权：`submitter`（仅本人提交且本公司）或 `admin`（跨公司）。请求：`{ "reason"?: string(0-200) }`。
- 行为：事务内置 status=CANCELLED；写日志 `ticket.cancelled`（detail=原因）。
- 前置状态：`PENDING_ASSIGNMENT|PROCESSING`；终态 `409 {"error":"invalid_state"}`。
- 响应 200：`Ticket`。

### 4.8 GET /api/tickets/:id/submitter（提交人完整信息）

- 授权：`handler`/`admin`（处理视角；submitter 对他人工单本就 404）。
- 响应 200：
```
{
  "user": { "id", "name", "email", "companyName", "department": string|null },
  "historyTickets": [ Ticket 列表项 ]   // 该提交人提交的全部工单，按 createdAt desc
}
```

## 5. 回复、评价、日志、通知

### 5.1 GET /api/tickets/:id/replies

- 授权：工单可见者（同 4.3 边界）。
- 响应 200：`{ "items": [ { "id", "ticketId", "authorId", "authorName", "authorRole", "content", "createdAt" } ] }`（createdAt 升序，多轮回复按时间排列）。

### 5.2 POST /api/tickets/:id/replies

- 授权：工单可见者——`submitter`（仅本公司本人相关工单）或 `handler`/`admin`。
- 请求：`{ "content": string(1-5000, 非空) }`
- 行为：事务内写回复；若为该工单首条回复则回填 `tickets.firstReplyAt`；写日志 `ticket.replied`。
- 前置状态：`PENDING_ASSIGNMENT|PROCESSING`；终态工单回复 `409 {"error":"invalid_state"}`（完成后关闭回复）。
- 响应 201：单条回复对象（同 5.1 项）。

### 5.3 POST /api/tickets/:id/rating

- 授权：`submitter` 且为该工单提交人本人（否则 `403 {"error":"forbidden"}`）。
- 请求：`{ "score": int(1-5), "comment"?: string(0-1000) }`
- 前置状态：仅 `COMPLETED`（`409 {"error":"invalid_state"}`）；已有评价 `409 {"error":"rating_exists"}`（幂等拒绝）。
- 响应 201：`{ "score", "comment", "ratedAt" }`；写日志 `ticket.rated`。

### 5.4 GET /api/tickets/:id/logs

- 授权：工单可见者。
- 响应 200：`{ "items": [ { "id", "ticketId", "actorId": string|null, "actorName": string|null, "action": string, "detail": string|null, "createdAt" } ] }`（createdAt 升序）。action 枚举：`ticket.created|ticket.assigned|ticket.reassigned|ticket.replied|ticket.completed|ticket.cancelled|ticket.rated`。

### 5.5 GET /api/tickets/:id/notifications

- 授权：`handler`/`admin` 及该工单提交人（验证邮件送达记录）。
- 响应 200：`{ "items": [ { "id", "ticketId", "toEmail", "subject", "status": "sent"|"skipped"|"failed", "error": string|null, "createdAt" } ] }`（createdAt 升序）。

## 6. 通知域行为（服务端内部契约）

- 触发：工单完成事务提交后。收件人：`users.email`（提交人）。主题：`[工单完成] {工单号} {主题}`；正文含工单号、主题、完成时间、处理人姓名。
- emailkit `send()` 返回 `sent|skipped|failed`：`sent` → 记录 status=sent；`SMTP_HOST` 为空 → status=skipped（未配置不投递）；异常 → status=failed + error 文本。三种结果均落 `notifications`（失败可见性）。
- 邮件结果不影响工单完成状态；写接口响应不等待重试，无自动重试。

## 7. 统计分析

### 7.1 GET /api/stats/distribution?dimension=company|department&company=?

- 授权：`handler`/`admin`；`company` 可空（空=全公司；传入则限定该公司；`submitter` 无权限 `403`）。
- 响应 200（dimension=company）：
```
{ "dimension": "company", "items": [ { "key": "公司名", "companyId": string, "count": int } ] }  // count 降序
```
- dimension=department：`{ "dimension": "department", "items": [ { "key": "部门名|null", "count": int } ] }`（按提交人 user_profiles.department 聚合全部工单；限定 company 时聚合该公司工单）。
- 错误：`dimension` 非法 `400 {"error":"invalid_dimension"}`。

### 7.2 GET /api/stats/dashboard?company=?

- 授权：`handler`/`admin`；参数语义同 7.1。
- 响应 200：
```
{
  "totalTickets": int,                        // 工单量（当前过滤范围）
  "avgResponseMinutes": number|null,          // 平均响应时间=创建→首次回复，仅计 firstReplyAt 非空工单；无样本为 null
  "satisfaction": { "avgScore": number|null, "ratedCount": int },  // 已评价工单平均分与评价数；无样本 avgScore=null
  "hotCategories": [ { "category": string, "count": int } ]       // 热点问题：按分类聚合工单量 Top 5
}
```
- 数值保留 1 位小数；空数据返回空列表/0/null，不报错。

## 8. 状态机与映射责任

- 状态流转与服务端校验（唯一状态字段）：

| 动作 | 接口 | 前置状态 | 后置状态 |
| --- | --- | --- | --- |
| 提交（创建） | POST /api/tickets | — | PENDING_ASSIGNMENT（命中规则直接 PROCESSING） |
| 自动分配 | 创建事务内 | — | PROCESSING |
| 人工分配 | POST assign | PENDING_ASSIGNMENT | PROCESSING |
| 转派 | POST reassign | PROCESSING | PROCESSING（仅变更归属） |
| 完成 | POST complete | PROCESSING | COMPLETED（终态，触发邮件） |
| 取消 | POST cancel | PENDING_ASSIGNMENT/PROCESSING | CANCELLED（终态） |
| 评价 | POST rating | COMPLETED | COMPLETED（不变，仅写评价） |

- 前端仅按角色与状态渲染可用操作（submitter：取消/回复/评价；handler/admin：分配/转派/回复/完成）；服务端始终独立校验，不信任前端。
- 名称映射（响应组装）责任：组名/公司名/人名经 join 读取；`Ticket` 结构中的派生字段（companyName、assignedGroupName、assigneeName、rating）由服务端组装，前端不二次拼接。
- 工单号生成责任：服务端 `ticket_sequence` 发号表，事务内原子取号，格式 `TK-` + 6 位零填充（如 `TK-000123`），系统内唯一。
