# 技术契约（工单系统 · wi-t1000327）

本文是字段级 API 与数据契约的唯一来源；架构基线（`architecture-baseline.md`）仅保留接口摘要。

## 1. API 总则

- 基础路径 `/api`；请求与响应均为 UTF-8 JSON。
- 认证：AuthKit 本地密码会话（登录后 Cookie/Bearer）。除登录端点外均需认证；未认证返回 401 `{"error":{"code":"UNAUTHENTICATED","message":...}}`。
- 公司隔离：服务端按会话用户的 `user_profiles.company_id` 强制过滤所有业务查询与写入；引用或访问其他公司资源一律返回 404 `NOT_FOUND`（不泄露存在性）。
- 权限：端点级角色要求见各端点"授权"；角色不足返回 403 `FORBIDDEN`。
- 参数/状态错误返回 400 `INVALID_INPUT`；状态不满足前置条件返回 409 `INVALID_STATE`；本司唯一键冲突返回 409 `CONFLICT`。
- 错误格式统一为 `{"error":{"code":"<CODE>","message":"<人类可读信息>"}}`。
- 时间均为 ISO 8601 UTC 字符串（如 `2026-10-21T02:00:00.000Z`）。
- 幂等性：动作端点（assign/transfer/complete/cancel/rating）对已处于目标状态或已评价的重复请求返回 409 `INVALID_STATE`，不产生重复副作用；创建类端点不幂等。

## 2. 公共类型（TypeScript 记法）

```ts
type Priority = "P0" | "P1" | "P2" | "P3" | "P4";        // P0 最高
type Status = "pending_assign" | "processing" | "completed" | "cancelled";
type Role = "submitter" | "agent" | "company_admin" | "platform_ops";
type LogAction = "created" | "auto_assigned" | "assigned" | "transferred"
  | "replied" | "completed" | "cancelled" | "rated";

interface UserProfileSummary {
  id: number;                 // user_profiles.id
  displayName: string;
  email: string;
  department: string;
  companyName: string;
  role: Role;
}
interface UserProfileDetail extends UserProfileSummary {
  historyTickets: TicketSummary[];   // 该提交人历史工单（全部状态，当前统计范围内）
}
interface TicketSummary {
  id: number; ticketNo: string; subject: string;
  priority: Priority; status: Status; createdAt: string;
}
interface Ticket {
  id: number; ticketNo: string;
  companyId: number; companyName: string;
  subject: string; description: string;
  categoryId: number; categoryName: string;
  priority: Priority; status: Status;
  submitter: UserProfileSummary;
  groupId: number | null; groupName: string | null;
  handlerId: number | null; handlerName: string | null;
  firstReplyAt: string | null; completedAt: string | null; cancelledAt: string | null;
  createdAt: string;
  rating: Rating | null;
}
interface TicketReply { id: number; ticketId: number; author: UserProfileSummary; content: string; createdAt: string; }
interface TicketLog {
  id: number; ticketId: number;
  actor: { id: number; displayName: string } | null;   // null 表示系统操作（自动分配）
  action: LogAction; detail: string; createdAt: string;
}
interface Rating { score: number; comment: string | null; raterId: number; createdAt: string; }
interface BusinessGroup { id: number; companyId: number; name: string; memberCount: number; members?: UserProfileSummary[]; }
interface Category { id: number; companyId: number; name: string; }
interface AssignmentRule { id: number; categoryId: number; categoryName: string; groupId: number; groupName: string; }
interface Notification { id: number; ticketId: number; ticketNo: string; subject: string; body: string; createdAt: string; }
interface DashboardStats {
  totalTickets: number;
  byStatus: { pending_assign: number; processing: number; completed: number; cancelled: number };
  respondedTickets: number;                 // 有回复的工单数
  avgResponseSeconds: number | null;        // 平均响应时间，秒，保留 2 位；无回复工单为 null
  ratedTickets: number; avgRating: number | null;   // 满意度平均，1–5，保留 2 位
  topCategories: { categoryId: number; name: string; count: number }[];  // 热点问题，按工单量降序前 5
}
interface DistributionItem { key: string; label: string; count: number; }
```

## 3. 枚举口径

- `priority`：P0（最高）– P4（最低）；仅作优先级分级，不绑定 SLA 时限（需求未规定）。
- `status`：`pending_assign` 待分配 / `processing` 待处理 / `completed` 完成 / `cancelled` 取消；"创建"为提交动作，落库即 `pending_assign`；`completed`、`cancelled` 为终态。
- `role`：`submitter` / `agent` / `company_admin` / `platform_ops`（只读跨公司运营视角）。
- `logAction`：见第 7 节。
- 评分 `score`：整数 1–5（5 为最满意）；每张工单仅一条评价，提交后不可修改（需求未规定形式，取最小口径）。

## 4. 端点契约

### 4.1 认证（starter 提供）

| 端点 | 授权 | 请求 | 响应 |
| --- | --- | --- | --- |
| POST /api/auth/login | 公开 | `{username, password}` | 会话建立（AuthKit） |
| POST /api/auth/logout | 已登录 | — | 204 |
| GET /api/auth/me | 已登录 | — | `{user: UserProfileSummary}` |

### 4.2 工单

| 端点 | 授权 | 说明 |
| --- | --- | --- |
| GET /api/tickets | 按角色（见下） | 列表查询，见查询参数表 |
| POST /api/tickets | submitter/agent/company_admin | 创建工单 |
| GET /api/tickets/:id | 本司用户（submitter 仅本人）或 platform_ops | 工单详情 |
| POST /api/tickets/:id/replies | submitter（本人工单）/agent/company_admin | 添加回复 |
| POST /api/tickets/:id/assign | agent/company_admin | 人工分配（pending_assign → processing） |
| POST /api/tickets/:id/transfer | agent/company_admin | 转派（processing → processing 换组） |
| POST /api/tickets/:id/complete | agent/company_admin | 完成并发送通知 |
| POST /api/tickets/:id/cancel | submitter（本人工单）/company_admin | 取消（终态） |
| POST /api/tickets/:id/rating | submitter（本人已完成工单，未评价） | 满意度评价 |
| GET /api/tickets/:id/logs | 本司用户（submitter 仅本人）或 platform_ops | 操作日志 |
| GET /api/tickets/:id/submitter | agent/company_admin/platform_ops | 提交人完整信息与历史工单 |

**GET /api/tickets 查询参数**：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| status | Status | 状态过滤 |
| priority | Priority | 优先级过滤 |
| categoryId | number | 分类过滤（本司） |
| groupId | number | 业务组过滤（本司） |
| companyId | number | 仅 platform_ops 有效；其他角色忽略并强制本公司 |
| q | string | ticketNo 精确或 subject 模糊搜索 |
| sort | created_at（默认）/ priority | 排序字段；priority 排序 P0 在前 |
| order | asc（默认）/ desc | 排序方向 |
| scope | group / company | agent 默认 group（所在组成员可见的工单），可传 company；company_admin 默认 company |
| mine | 0/1 | submitter 强制 mine=1（本人提交的全部状态工单，用于"我的工单"） |

响应：`{items: Ticket[], total: number}`。

**列表可见性**：submitter → 仅本人工单；agent → 本公司（scope=group 时限所在组成员处理的工单）；company_admin → 本公司全部；platform_ops → 全平台（可按 companyId 过滤）。终态工单默认不排除（工作台前端默认传 status=processing 实现待处理视图）。

**POST /api/tickets** 请求：`{subject: string(必填,1–200), description: string(必填,1–5000), categoryId: number(必填,本司分类), priority: Priority(必填)}`。
行为（单事务）：生成 `ticket_no`（TKT- + 6 位零填充自增，全局唯一）→ 写入工单（status=pending_assign、submitter=会话用户档案）→ 查 `assignment_rules(company, category)`，命中则置 groupId 并 status=processing，写日志 `auto_assigned`（actor 为系统）→ 未命中写日志 `created`。响应 201 `Ticket`。

**POST /api/tickets/:id/replies** 请求：`{content: string(必填,1–5000)}`。
行为（单事务）：插入回复（author=会话用户档案）→ 工单 `first_reply_at` 为空则置当前时间 → 写日志 `replied`。响应 201 `TicketReply`。前置：工单非终态，否则 409。

**POST /api/tickets/:id/assign** 请求：`{groupId: number(必填,本司业务组)}`。
行为（单事务）：置 groupId、status=processing → 写日志 `assigned`。前置：status=pending_assign，否则 409。响应 `Ticket`。

**POST /api/tickets/:id/transfer** 请求：`{groupId: number(必填,本司业务组), reason?: string(≤500)}`。
行为（单事务）：变更 groupId（status 保持 processing）→ 写日志 `transferred`（detail 含目标组名与理由）。前置：status=processing，否则 409。响应 `Ticket`。

**POST /api/tickets/:id/complete** 请求：`{resolution?: string(≤2000)}`。
行为（单事务）：置 status=completed、handler=会话用户档案、completed_at=当前时间 → 写发件箱邮件（见第 7 节模板）→ 写日志 `completed`。前置：status=processing，否则 409。响应 `Ticket`。

**POST /api/tickets/:id/cancel** 请求：`{reason?: string(≤500)}`。
行为（单事务）：置 status=cancelled、cancelled_at=当前时间 → 写日志 `cancelled`。前置：status ∈ {pending_assign, processing}，否则 409。响应 `Ticket`。

**POST /api/tickets/:id/rating** 请求：`{score: number(1–5, 必填), comment?: string(≤500)}`。
行为（单事务）：写 `ticket_ratings` → 写日志 `rated`。前置：会话用户为提交人、status=completed、未评价，否则 409/403。响应 `{rating: Rating}`。

**GET /api/tickets/:id/submitter** 响应：`UserProfileDetail`（历史工单=该提交人在当前可见范围内提交的全部工单列表，含各状态，按创建时间倒序）。

### 4.3 组织与分配（company_admin 管理；读端点对本司 agent 可见）

| 端点 | 授权 | 请求/行为 |
| --- | --- | --- |
| GET /api/groups | 本司用户 | 响应 `{items: BusinessGroup[]}`（含 memberCount；带 members=1 时附成员） |
| POST /api/groups | company_admin | `{name: string(1–50, 本司唯一)}`；409=本司重名；响应 201 |
| POST /api/groups/:id/members | company_admin | `{userProfileId: number(本司用户)}`；唯一约束冲突 409；响应 201 |
| DELETE /api/groups/:id/members/:userProfileId | company_admin | 204；移除成员不影响已分配工单的归属 |
| GET /api/categories | 本司用户 | `{items: Category[]}` |
| POST /api/categories | company_admin | `{name: string(1–50, 本司唯一)}`；409=重名 |
| GET /api/assignment-rules | company_admin | `{items: AssignmentRule[]}` |
| POST /api/assignment-rules | company_admin | `{categoryId, groupId}`（均为本司；同分类重复规则 409）；响应 201 |
| DELETE /api/assignment-rules/:id | company_admin | 204 |
| GET /api/companies | platform_ops | 全部公司 `{items: {id, name}[]}`（工作台/统计的公司筛选选项来源） |

### 4.4 统计分析（只读）

| 端点 | 授权 | 说明 |
| --- | --- | --- |
| GET /api/stats/distribution?dimension=company\|department | 本司用户（本公司）/ platform_ops（全平台） | 工单分布 |
| GET /api/stats/dashboard | 同上 | 运营指标仪表盘 `DashboardStats` |

- `dimension=company`：platform_ops 返回全平台各公司一行（可加 `companyId` 聚焦单公司）；公司内角色返回仅本公司一行。
- `dimension=department`：按提交人部门聚合本公司工单数；platform_ops 需传 `companyId` 指定公司。
- 响应：`{dimension, items: DistributionItem[]}`（company 维度 key=companyId；department 维度 key=部门名）。
- 仪表盘统计范围与分布一致（公司内角色=本公司；platform_ops=全平台或指定 companyId）。

### 4.5 通知

| 端点 | 授权 | 说明 |
| --- | --- | --- |
| GET /api/notifications | 已登录 | 当前用户为收件人的通知列表 `{items: Notification[]}`，按时间倒序 |

### 4.6 starter 用户管理

workspace-init 生成的用户管理页面/API 仅做登录校验、不区分角色，用于账户与凭证引导；业务读写一律走 4.1–4.5 受控端点。

### 4.7 种子数据（首次启动，空库时执行一次）

检测 `companies` 为空时执行；幂等（非空库跳过）。通过 userkit 用户存储创建 platform_users 并同步 user_profiles：

- 公司：示例公司 A（"华东科技"）、示例公司 B（"南方制造"）。
- 用户（用户名即登录名，统一演示密码 `demo-131`）：
  - A 公司：`a-admin`（company_admin）、`a-sub1`（submitter，部门"研发部"）、`a-sub2`（submitter，部门"运维部"）、`a-agent1`（agent）、`a-agent2`（agent）；
  - B 公司：`b-admin`（company_admin）、`b-sub1`（submitter，"研发部"）、`b-agent1`（agent）；
  - 平台：`ops1`（platform_ops）。
- 分类：每公司预置「账号权限」「功能故障」「数据问题」「其他」。
- 业务组：A 公司预置「一线支持组」（成员 a-agent1）与「二线专家组」（成员 a-agent2）；B 公司预置「综合支持组」（成员 b-agent1）。
- 分配规则示例：A 公司「功能故障」→「一线支持组」，「数据问题」→「二线专家组」；B 公司「账号权限」→「综合支持组」。
- 不种子任何工单数据（工单由验收操作创建）。

## 5. 数据库模式（业务表 DDL）

业务迁移文件：`app/ticket-system/src/server/migrations/sqlite/`（编号衔接 userkit 的 `0001_platform_users.sql`；列定义如下，约束以本节为准）：

```sql
CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_user_id INTEGER NOT NULL UNIQUE,      -- 关联 userkit platform_users
  company_id INTEGER NOT NULL REFERENCES companies(id),
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  department TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('submitter','agent','company_admin','platform_ops')),
  created_at TEXT NOT NULL
);

CREATE TABLE business_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES business_groups(id),
  user_profile_id INTEGER NOT NULL REFERENCES user_profiles(id),
  UNIQUE (group_id, user_profile_id)
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE assignment_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  group_id INTEGER NOT NULL REFERENCES business_groups(id),
  UNIQUE (company_id, category_id)
);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT NOT NULL UNIQUE,                -- 'TKT-' + 6 位零填充
  company_id INTEGER NOT NULL REFERENCES companies(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  priority TEXT NOT NULL CHECK (priority IN ('P0','P1','P2','P3','P4')),
  status TEXT NOT NULL CHECK (status IN ('pending_assign','processing','completed','cancelled')),
  submitter_id INTEGER NOT NULL REFERENCES user_profiles(id),
  group_id INTEGER REFERENCES business_groups(id),
  handler_id INTEGER REFERENCES user_profiles(id),
  first_reply_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tickets_company_status ON tickets (company_id, status);
CREATE INDEX idx_tickets_company_created ON tickets (company_id, created_at);
CREATE INDEX idx_tickets_group ON tickets (group_id);

CREATE TABLE ticket_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  author_id INTEGER NOT NULL REFERENCES user_profiles(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_replies_ticket ON ticket_replies (ticket_id, created_at);

CREATE TABLE ticket_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  actor_id INTEGER REFERENCES user_profiles(id),  -- NULL = 系统操作（自动分配）
  action TEXT NOT NULL CHECK (action IN ('created','auto_assigned','assigned','transferred','replied','completed','cancelled','rated')),
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_logs_ticket ON ticket_logs (ticket_id, created_at);

CREATE TABLE ticket_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL UNIQUE REFERENCES tickets(id),
  rater_id INTEGER NOT NULL REFERENCES user_profiles(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE email_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_user_id INTEGER NOT NULL REFERENCES user_profiles(id),
  recipient_email TEXT NOT NULL,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notifications_recipient ON email_notifications (recipient_user_id, created_at);
```

时间列统一存 ISO 8601 UTC 字符串。`platform_users` 由 userkit 迁移建立，本契约不修改其结构。

## 6. 统计口径（与需求推荐基线一致）

- 工单量：统计范围内工单总数，含按状态分解。
- 平均响应时间：`AVG(first_reply_at - created_at)`，单位秒，保留 2 位小数；仅计入有回复的工单（`respondedTickets`），无回复时返回 null。SQL 口径：`AVG((julianday(first_reply_at) - julianday(created_at)) * 86400)`。
- 满意度：已评价工单的评分平均 `AVG(score)`，保留 2 位小数；无评价返回 null。
- 热点问题：按分类统计工单量并降序取前 5。
- 分布：company 维度按 `companies`；department 维度按提交人 `user_profiles.department`。
- 全部统计遵守公司隔离：公司内角色=本公司；platform_ops=全平台或指定公司。

## 7. 日志事件与通知模板

日志 `detail` 文案（操作内容）：

| action | detail 模板 |
| --- | --- |
| created | `创建工单` |
| auto_assigned | `按分类规则自动分配至「{组名}」`（actor 为系统，actor_id=NULL） |
| assigned | `人工分配至「{组名}」` |
| transferred | `转派至「{组名}」`（附 reason，若有） |
| replied | `回复工单` |
| completed | `完成处理`（附 resolution 摘要，若有） |
| cancelled | `取消工单`（附 reason，若有） |
| rated | `满意度评价 {score}/5` |

完成通知（写入 email_notifications，收件人为提交人邮箱）：

- 主题：`[工单完成] {ticketNo} {subject}`
- 正文：包含工单号、主题、处理人姓名、完成时间（ISO 8601 UTC）、满意度评价引导语。
- 提交人在「我的通知」界面查看；`GET /api/notifications` 仅返回本人收件。
