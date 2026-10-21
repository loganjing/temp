# 工单系统架构基线（136-ticket）

> 工作项：wi-t1000334 · 阶段：design · 路线：fullstack-complex（Hono + React/Vite 全栈）

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 应用形态

工单系统为多公司服务台应用：提交人创建工单，系统按公司内"分类 → 业务组"分配规则自动分配；处理人在工作台逐单处理（回复、转派、完成）；完成后系统向提交人邮箱记录完成通知；提交人可进行满意度评价；运营侧提供按公司/部门的工单分布统计与运营仪表盘；全程关键操作记录审计日志。

应用类型为 fullstack-complex：需要服务端权威数据、跨用户协作、公司级授权隔离、完成通知与服务端聚合统计（对应 AC-02/03/07/08/10/12 的证据要求）。

### 1.2 技术栈（冻结）

| 维度 | 决策 |
|---|---|
| 服务端 | Node.js ≥20、TypeScript + Hono（ESM）；单进程同时提供 `/api/*` REST 接口与前端静态资源，服务入口 `app/ticket-system/src/server/index.ts`（npm workspace，根目录 `npm start`） |
| 前端 | React + Vite SPA（TypeScript，客户端路由 react-router）；Tailwind CSS；桌面 Web |
| 数据库 | SQLite 文件库，经 @commonapp/dbkit 访问；版本化 SQL 迁移（服务启动时幂等执行） |
| 操作日志 | @commonapp/auditkit 持久化审计事件（操作类型/操作人/时间/关联工单） |
| 身份认证 | 项目内本地账号：用户名 + 密码（scrypt 哈希）登录，Bearer 会话令牌（令牌哈希落库，7 天有效期） |
| 邮件通知 | 项目内事务性发件箱（mail_outbox）+ 可替换投递端口；默认"记录式投递"（可查询发送记录），真实 SMTP 外发为后续可选升级 |
| 字段命名 | 数据库列 snake_case；JSON 字段 camelCase；映射责任在服务端 API 层 |
| 端口/数据库 | 监听端口经 `PORT` 配置（默认 3000；Vite 开发端口 5173 并将 `/api` 代理至 3000）；数据库路径经 `DB_PATH` 配置，默认 `app/ticket-system/data/application.db`（相对应用包工作目录），父目录自动创建，支持 `:memory:` |

初始化已完成并核对：npm workspace（根 `package.json` + `app/*`），服务端与客户端均为 TypeScript，`vendor/@commonapp/*` 以 `file:` 依赖接入；目录职责与机器可读入口地图以根目录 `platform-baseline.json` 为准，包级约定见 `app/ticket-system/AGENTS.md`。

### 1.3 CommonApp 模块选择

| 模块 | 包/版本 | manifest SHA-256 | 需求匹配 | 集成边界 | 限制 |
|---|---|---|---|---|---|
| dbkit | @commonapp/dbkit 0.2.0 | sha256:f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | 服务端权威持久化、结构化查询、事务与版本化迁移（§5.1–5.8 全部域数据） | 服务启动时 `createDb(createDbConfig({driver:'sqlite', sqlitePath: DB_PATH ?? './data/application.db'}))` 并执行 `runMigrations`（迁移目录 `src/server/migrations/sqlite/`）；领域服务经 `queryAll/queryOne/run/transaction` 访问 | 仅支持 SQLite |
| auditkit | @commonapp/auditkit 0.1.0 | sha256:27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 工单操作日志（§5.8 / AC-12） | 服务端 `createAuditKit` 初始化（SQLite 驱动，`audit_events` 表由迁移 0003 安装）；领域服务统一经 OperationLog 端口调用 `auditKit.record` 写入事件 | 事件负载按 §2.2 契约映射 |

模块安装标记（单独记录）：

- `commonapp install: dbkit`
- `commonapp install: auditkit`

安装来源与边界：catalog 安装清单为 `modules/<id>/install-manifest.json`；安装目标 `vendor/@commonapp/<id>`（`file:` 本地依赖）；vendor 文件、包清单与锁文件由包管理器负责。实际安装清单与 packageRoot 以初始化后根目录 `platform-baseline.json` 为准。

未采用候选（影响本次决策的，其余不列出）：

- **authkit / userkit**：本地登录能力本身匹配，但 userkit 的平台用户表不含公司/部门字段，而公司是本系统隔离与统计的中心维度，采用后需再建 profile 扩展表并在全部域查询中联接；其配套用户管理 API 仅做登录认证、不校验角色，在多公司场景会引入跨公司账户接管路径（UV-01 未规定角色模型不等于接受该风险）。身份改为项目内以 `users.company_id` 单表承载（见 §6.1）。
- **emailkit**：完成通知的验收口径是"系统邮件发送记录"可查询（AC-08；UV-04 未规定邮件模板与失败处理）；emailkit 需要外部 SMTP 服务，本环境不可用且不可验收。采用发件箱记录式投递，Mailer 投递端口后续可替换为 emailkit/SMTP（见 §6.2）。
- **permissionkit**：UV-01 未规定角色与权限模型，基线为"认证 + 同公司范围"；作为后续引入 RBAC 的升级路径（见 §6.5）。

### 1.4 数据归属总则

SQLite 单库为唯一事实源，前端不持有权威数据。公司（company_id）是隔离与统计的主体维度：工单域所有表直接携带 company_id 或经外键可达，服务层据此强制过滤。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 分层与调用方向

```
React SPA（工作台 / 我的工单 / 业务组 / 分配规则 / 统计仪表盘 / 邮件记录）
        │  HTTP/JSON + Bearer 会话令牌（同源，无 CORS）
        ▼
Hono API 层（路由 · 参数校验 · 鉴权上下文 · 错误映射）
        ▼
领域服务层
  IdentityService        登录与会话（scrypt 校验、令牌签发/注销）
  TicketService          工单生命周期与公司隔离（创建/回复/分配/转派/完成/取消/评价）
  AssignmentService      业务组、成员、分类分配规则、自动分配
  NotificationService    完成通知邮件组装与发件箱投递
  StatsService           分布与运营指标聚合
  OperationLog 端口      审计事件写入与按工单查询（auditkit 实现）
        ▼
dbkit（SQLite：users / tickets / groups / rules / outbox / … + 版本化迁移）
```

### 2.2 模块职责、唯一数据归属与接口摘要

| 模块 | 职责 | 唯一事实归属 | 接口摘要（名称 · 用途 · 调用方向） |
|---|---|---|---|
| 前端 SPA | 六个导航域视图与交互；不持有权威数据 | — | 调用 `/api/*`（字段级契约见 technical-contract.md）· 前端 → API 层 |
| Hono API 层 | Bearer 鉴权、参数校验、统一错误映射；不承载业务规则 | — | REST 路由 · API 层 → 领域服务 |
| IdentityService | 密码校验、会话签发/注销/过期检查 | `users`、`sessions` | `login / logout / me` · API 层 → Identity |
| TicketService | 工单创建（触发自动分配）、回复、分配、转派、完成（触发通知）、取消、评价；状态机与公司隔离 | `tickets`、`ticket_replies`、`ticket_ratings` | 工单操作接口 · API 层 → Ticket；完成事务内调用 NotificationService |
| AssignmentService | 业务组与成员管理、分类分配规则、按分类自动分配 | `business_groups`、`business_group_members`、`assignment_rules`、`categories` | `groups / rules` 接口 · API 层 → Assignment；供 TicketService 解析分配规则 |
| NotificationService | 完成通知邮件组装、发件箱写入、投递端口 | `mail_outbox` | 由 TicketService 完成事务调用；`mail-outbox` 查询接口 |
| StatsService | 工单量、平均响应时间、满意度、热点分类、公司/部门分布聚合 | 无（只读聚合） | `stats/dashboard` 接口 · API 层 → Stats |
| OperationLog 端口 | 8 类工单关键操作事件的写入与按工单查询；详情时间线数据源 | auditkit 事件表 | 领域服务 → 端口 → auditkit |

### 2.3 横切约束

- **公司隔离**：当前会话用户的 company_id 是全部工单域读写的过滤维度；列表与搜索天然过滤；跨公司详情与操作统一返回 404（"不存在或无权限"，不区分暴露，满足 AC-02）；统计接口仅输出聚合指标，不含跨公司工单明细。
- **事务边界**：工单创建（含自动分配与事件）、完成（状态 + 处理记录 + 发件箱 + 事件）、评价、转派、取消、回复均为单事务；审计事件与业务写同事务提交。
- **错误约定**：401 未认证 / 403 明确越权（如非提交人评价）/ 404 不存在或跨公司 / 409 状态机冲突或唯一性冲突 / 422 校验失败。字段、类型与可空性细节唯一来源为 technical-contract.md。

## 3. UI 全局基线

- **应用/业务模板**：helpdesk（工单服务台）。
- **展示模板**：`split-master-detail`。工单工作台与"我的工单"采用"左侧队列列表 + 右侧当前工单详情"协同布局（核心动作是高频逐条处理工单，AC-03/04/06/07/11）；业务组、分配规则、统计仪表盘、邮件记录为运营控制台式页面（表格、表单、KPI 区）。Builder 按该展示模板 ID 消费实现资源。
- **视觉预设**：Modern SaaS——柔和中性底色、细边界、少阴影、中等圆角；单一主色（靛蓝系）+ 语义状态色（优先级与工单状态徽标）；紧凑可扫读密度；只保留有反馈作用的短动效。
- **应用壳**：左侧主导航（工作台、我的工单、业务组、分配规则、统计仪表盘、邮件记录）+ 顶栏（当前用户姓名/公司、退出登录）+ 主工作区；图标统一使用 Lucide 线性图标族。
- **目标设备**：桌面 Web 优先（需求未规定移动端，UV-09 保持开放）。窄屏降级：表格横向滚动、主要操作常驻可达、截断文本可悬停查看全文；不做移动端专项验收。
- **全局状态**：加载（表格骨架/局部指示）、空数据（空态文案 + 下一步动作，如"暂无待处理工单"）、错误（接口错误内联提示 + 重试）、无权限（401 跳登录；404 显示"工单不存在或无权限"）、成功（操作后列表与详情即时刷新 + 轻量成功提示）。
- **文本溢出**：列表列内长文本（主题、描述摘要）截断加省略号并以悬停标题提供全文；详情页展示全文。
- **选择依据**：需求核心动作是逐条处理工单记录（列表/队列与详情协同），统计页为指标查看（KPI + 分布，不做营销式首屏，避免低信息密度卡片墙）。

## 4. 数据模型与迁移

### 4.1 表模型（SQLite；时间戳为 ISO-8601 UTC 文本）

- `companies(id PK, name UNIQUE, created_at)` —— 隔离与统计主体，种子固定两家。
- `users(id PK, username UNIQUE, password_hash, full_name, email, company_id FK→companies, department, created_at)` —— 公司成员（提交人与处理人同表；角色由业务组成员关系与操作上下文决定）。
- `categories(id PK, code UNIQUE, name)` —— 全局问题分类字典（种子 8 类）。
- `business_groups(id PK, company_id FK→companies, name, description, created_at, UNIQUE(company_id, name))` —— 公司私有。
- `business_group_members(group_id FK, user_id FK, created_at, PK(group_id, user_id))` —— 成员须属于组所属公司（服务层校验）。
- `assignment_rules(id PK, company_id FK, category_id FK→categories, group_id FK→business_groups, created_at, UNIQUE(company_id, category_id))` —— "分类 → 业务组"自动分配规则，公司私有。
- `tickets(id PK, ticket_no UNIQUE, subject, description, category_id FK, priority CHECK(P0–P4), status CHECK(五态), company_id FK→companies, submitter_id FK→users, assigned_group_id FK→business_groups NULL, completed_by FK→users NULL, completed_at NULL, first_reply_at NULL, created_at, updated_at)`。
- `ticket_replies(id PK, ticket_id FK, author_id FK→users, content, created_at)`。
- `ticket_ratings(ticket_id PK FK→tickets, rating CHECK(1–5), rated_by FK→users, rated_at)` —— 一单一条，插入即不可修改。
- `mail_outbox(id PK, ticket_id FK NULL, kind, to_email, subject, body, status, created_at)` —— 系统邮件发送记录（AC-08 的验收口径）。
- `sessions(token_hash PK, user_id FK→users, created_at, expires_at)` —— 令牌哈希存储，7 天有效期。

索引：`tickets(company_id, status)`、`tickets(submitter_id)`、`tickets(assigned_group_id)`、`ticket_replies(ticket_id, created_at)`、`assignment_rules(company_id, category_id)`、`mail_outbox(ticket_id)`、`sessions(expires_at)`。

### 4.2 状态与生命周期

状态枚举 `created / pending_assignment / pending_process / completed / cancelled`（创建、待分配、待处理、完成、取消）。创建事务内完成 `created → pending_assignment`，随后按本公司分配规则尝试自动分配：命中则进入 `pending_process` 并记录归属组；未命中停留 `pending_assignment` 等待手动分配。全部流转写入操作事件（详情时间线可见，满足 AC-04 状态依次可见）。`completed / cancelled` 为终态；转派保持 `pending_process` 仅变更归属组。完整状态机与操作前置条件见 technical-contract.md §9。

### 4.3 迁移与种子

- 迁移文件置于 `app/ticket-system/src/server/migrations/sqlite/`，服务启动时经 dbkit `runMigrations` 幂等执行；`0003_platform_audit_events.sql` 为 auditkit 安装的审计表迁移，工单域自有迁移从 `0004` 起编号；schema 变更一律新增迁移，禁止运行时改表或 ORM 自动同步。
- 种子（迁移内固定）：2 家公司（示例科技有限公司、星辰控股集团）、8 个全局问题分类、每公司 2 个演示用户（密码哈希以预计算 scrypt 常量内嵌迁移）。业务组、分配规则、工单数据不种子化，均经 API 在验收场景中产生。
- 演示账号与密码在 technical-contract.md §8 登记（供验收登录使用）。

## 5. 运行与可靠性

- **依赖安装**：`npm install`（npm + package-lock.json；`vendor/@commonapp/*` 为本地 `file:` 依赖，由授权初始化器置入，本次设计阶段已完成安装并通过构建与测试）。
- **常规启动**：根目录 `npm start`（workspace 转发至应用包 `node --import tsx src/server/index.ts`）：自动创建数据父目录 → 打开 SQLite → 执行迁移 → 监听 `PORT`（默认 3000）→ 托管前端构建产物；前后端同源，无 CORS 需求。
- **开发模式**：根目录 `npm run dev` 并行启动 `dev:server`（tsx watch）与 `dev:web`（Vite，端口 5173，`/api` 代理至 3000）。
- **构建与测试**：根目录 `npm run build` / `npm run test`（转发至应用包：typecheck + vite build；node --import tsx --test）。
- **测试数据库隔离**：`DB_PATH` 指向独立临时文件即获得干净库（亦支持 `:memory:`）；默认 `app/ticket-system/data/application.db`，父目录自动创建，干净目录无需人工准备即可启动。
- **验收执行约定**（实现/验证阶段落实）：验收脚本自选空闲端口 + 临时 `DB_PATH`，等待真实监听就绪后执行场景校验，只清理本次启动的进程；常规 `npm start` 与验收命令分开记录，不叠加启动或固定 sleep。
- **可靠性**：无外部服务依赖（邮件为记录式投递）；业务写与审计事件同事务；SQLite 单文件即完整状态，重置与备份成本低；服务端错误输出到进程日志（控制台）。

## 6. 关键架构取舍

1. **身份项目内实现（不采用 authkit/userkit）**：公司隔离是本系统第一不变量，`users.company_id` 单表承载使所有查询的隔离条件直白、可审计；userkit 平台用户表缺公司/部门字段，其用户管理 API 无角色校验，多公司下存在跨公司账户接管路径。代价是自行维护 scrypt 哈希与会话令牌（Node 内置 crypto，实现面小、常量时间比较）。如未来需要 SSO/集中身份，可在 IdentityService 之后替换为 authkit 适配层，不影响领域层。
2. **完成通知采用事务性发件箱（不采用 emailkit）**：AC-08 的验收证据是"系统邮件发送记录"；emailkit 需外部 SMTP（本环境不可用、不可验收）。发件箱记录与完成事务原子提交（未完成工单不产生记录），Mailer 投递端口默认记录式投递，后续可替换为 SMTP/emailkit 实现真实外发。
3. **操作日志复用 auditkit**：能力与 §5.8 直接匹配（持久化审计事件），避免自建日志表；领域统一经 OperationLog 端口映射事件（类型/操作人/时间/关联工单/负载），使工单详情时间线与系统操作日志同源（AC-12）。
4. **公司隔离策略**：company_id 为工单域表的一等外键；服务层强制过滤；跨公司访问统一 404 语义；统计仅聚合不泄明细（UV-02 角色未规定，"登录可见聚合"为保守基线，记录为残余风险）。
5. **权限基线**：UV-01 未规定角色模型，基线为"已认证 + 同公司"；业务组承接是组织归属而非硬权限门（同公司用户可操作本公司工单）；permissionkit 为后续 RBAC 升级路径。
