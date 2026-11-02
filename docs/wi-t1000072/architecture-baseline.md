# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 方案结论

工单系统采用「Hono 服务端 + React/Vite 单页前端 + SQLite（dbkit）+ 本地账号（authkit/userkit）+ SMTP 邮件（emailkit）」的单体全栈结构。服务端是工单、业务组、分配规则、回复、日志、通知与统计的唯一权威来源；前端只负责界面与交互，不保存业务权威数据。

选择依据（来自批准需求）：多角色（提交人、处理人、管理员、平台运营）跨公司协作、按公司隔离、服务端统计口径、完成时向提交人邮箱发信，均要求服务端权威数据与真实认证；因此路由定为 `fullstack-complex`，不采用浏览器本地存储。

### 1.2 技术栈基线（冻结）

| 项 | 结论 |
| --- | --- |
| 应用类型 | 新建项目（工作区无既有应用） |
| 服务端 | Node.js ≥ 20 + Hono 4，ESM |
| 前端 | React 18 + Vite 5 + TypeScript，Tailwind CSS |
| 数据库 | SQLite（`@commonapp/dbkit` 0.2.0），版本化 SQL 迁移 |
| 身份 | `@commonapp/authkit` 0.1.2 + `@commonapp/userkit` 0.1.0，本地密码登录 + Bearer 会话 |
| 邮件 | `@commonapp/emailkit` 0.1.0，SMTP 可配置 |
| 包管理 | npm，`package-lock.json` 锁定；CommonApp 包以 `file:./vendor/@commonapp/*` 引入 |
| 应用包根 | `app/ticket-system`（由工作区初始化器生成，实际路径以根目录 `platform-baseline.json` 的 `packageRoot` 为准） |

### 1.3 CommonApp 模块选择

| 模块 | 版本 | 选择理由 | 集成边界 | 限制 | manifest SHA-256 |
| --- | --- | --- | --- | --- | --- |
| dbkit | 0.2.0 | 工单、回复、日志、通知、统计均需要事务化结构化持久化与迁移 | 仅提供 SQLite 连接、查询、事务与迁移；表结构、索引与业务 SQL 由本项目持有 | 仅 SQLite 驱动 | `sha256:f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6` |
| authkit | 0.1.2 | 需要真实登录会话与服务端鉴权中间件 | 提供 Bearer/灵基双通道认证、登录路由、密码哈希与限流；角色语义由本项目提供 | 不包含业务授权规则 | `sha256:a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02` |
| userkit | 0.1.0 | 本地账号、密码凭证、按邮箱登录查询 | 提供平台用户表与用户解析器；公司、部门、角色等业务档案由本项目扩展表维护 | 用户表不含部门与角色字段 | `sha256:40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4` |
| emailkit | 0.1.0 | 完成通知必须真实发信并记录可观察的发送结果 | 提供 SMTP 发送与 `sent/skipped/failed` 结果；模板、发送记录、重发策略由本项目实现 | 不读环境变量、不持久化、不重试 | `sha256:a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c` |

未采用的候选：`permissionkit`（本需求的权限边界是「公司 + 业务组成员 + 工单归属」的数据级规则，静态 RBAC 注册表无法表达，且会形成两套授权事实源）；`auditkit`（需求中的工单日志是绑定工单、按时间展示、含动作与结果字段的业务对象，由本项目 `ticket_events` 承担，避免同一日志存在两个写入路径）；`attachment`、`i18n`（需求明确不含附件与多语言）。

CommonApp 安装标记：`commonapp install: dbkit`、`commonapp install: authkit`、`commonapp install: userkit`、`commonapp install: emailkit`。模块安装、vendor 文件与锁文件由 npm 依赖管理，不手工改写 `vendor/`。

### 1.4 全局 UI 基线

- **应用/业务模板**：`helpdesk`（工单队列、详情、回复与处理是核心动作）。
- **展示模板**：`split-master-detail` —— 工单工作台以「筛选条 + 列表（主）」与「当前工单详情（从）」并列呈现；仪表盘采用顶部筛选 + KPI + 分布/热点明细；配置页（业务组、成员、分配规则）采用左导航下的表格与编辑面板。
- **视觉风格**：Modern SaaS —— 中性浅色表面、细边界、无重阴影、中等圆角、单一主色（蓝）+ 状态色（待分配/待处理/完成/取消/优先级 P0–P4）、紧凑表格与清晰数字层级。不使用紫蓝渐变、玻璃拟态、装饰性 3D 或大面积卡片墙。
- **应用壳与导航**：左侧导航（我的工单、工单工作台、统计分析、配置）、顶部公司/身份上下文栏、主工作区。导航项按当前用户角色与可见范围显示；无权限的入口不出现。
- **目标设备**：桌面 Web 优先（≥1280px 主工作区）。需求未声明移动端，本设计不承诺窄屏专用布局；工作台表格在小视口下横向滚动，关键列（工单 ID、主题、状态、优先级）固定在左侧可视区域。
- **关键全局状态**：加载态（骨架/行内占位）、空态（无工单、无匹配筛选、无业务组、无规则、无评价）、错误态（请求失败时保留已加载内容并给出可重试提示）、无权限态（越权访问工单详情显示拒绝说明且不渲染任何工单字段）、成功态（创建、分配、转派、完成、评价、规则保存后即时反映在列表与详情）。可能被截断的主题、描述、评价意见提供展开或悬停查看全文。

### 1.5 范围与边界

- 业务对象仅来自批准需求：公司、部门、用户档案、业务组、业务组成员、问题分类、分类分配规则、工单、回复、转派记录、工单日志、完成通知、满意度评价。
- 不做需求中「未规定」的项：SLA 时限与超时升级、邮件之外的通知渠道、附件、知识库、外部系统集成、自助注册。SLA 仅保存 P0–P4 优先级取值。
- 公司/部门/人员视为已有基础数据：本项目以迁移 + 幂等种子数据提供演示用的两家公司与成员，不建设主数据维护模块。

## 2. 领域责任、模块边界与接口摘要

<!-- system-design: architecture-boundaries -->

### 2.1 系统分层与调用方向

```
React SPA (Vite, :5173 dev / 由服务端托管 dist)
   │  JSON over HTTP, Authorization: Bearer <token>
   ▼
Hono 应用 (src/server.js, PORT 默认 3000)
   ├── 认证中间件      authkit（Bearer 会话）→ userkit（平台用户）
   ├── 领域服务        访问范围解析 / 工单状态机 / 自动分配 / 转派 / 通知 / 统计
   ├── 数据访问        dbkit（SQLite + 版本化迁移）
   └── 邮件适配        emailkit（SMTP，发送结果落库）
```

服务端分层：`routes`（HTTP 解析与状态码）→ `services`（授权范围、状态机、事务、统计口径）→ `repositories`（SQL）。授权判断只在服务端完成，前端隐藏入口仅是体验优化。

### 2.2 模块职责与唯一事实归属

| 模块 | 职责 | 唯一事实归属 | 对外接口摘要 |
| --- | --- | --- | --- |
| 身份与档案 | 登录、会话、当前用户；维护用户所属公司、部门与角色 | `platform_users`（userkit）、`user_profiles`（部门、角色） | `POST /api/auth/login`、`GET /api/auth/me` |
| 可见范围与授权 | 依据角色与业务组成员关系计算可访问公司与工单集合 | 计算规则，无独立表 | 服务内中间层 `access-scope`，不对外暴露 |
| 业务组与成员 | 公司内多个业务组、成员增删 | `business_groups`、`business_group_members` | `GET/POST /api/groups`、`POST/DELETE /api/groups/:groupId/members[/:userId]` |
| 分类与分配规则 | 问题分类集合；公司内「分类 → 业务组」规则 | `categories`、`assignment_rules` | `GET /api/categories`、`GET/POST/PUT/DELETE /api/assignment-rules` |
| 工单台账 | 工单主体、状态、优先级、承接业务组、处理人、完成/取消时间、满意度 | `tickets` | `GET/POST /api/tickets`、`GET /api/tickets/:ticketId` |
| 工单协作 | 多轮回复、人工分配、转派、完成、取消、优先级调整 | `ticket_replies`、`ticket_transfers`、`tickets` | `POST /api/tickets/:ticketId/replies`、`.../assign`、`.../transfer`、`.../complete`、`.../cancel`、`PATCH .../priority` |
| 提交人上下文 | 处理人查看提交人姓名、公司、部门与该提交人历史工单 | 读取 `user_profiles`、`platform_users`、`tickets` | `GET /api/tickets/:ticketId/submitter` |
| 通知 | 完成邮件模板、发送、发送状态与重发 | `ticket_notifications` | `GET /api/tickets/:ticketId/notifications`、`POST .../notifications/:notificationId/resend` |
| 工单日志 | 动作、操作人、时间、结果的追加式记录与展示 | `ticket_events` | `GET /api/tickets/:ticketId/events` |
| 统计与分析 | 按公司/部门分布；工单量、平均响应时间、满意度、热点问题 | 基于 `tickets`、`ticket_replies` 的聚合查询 | `GET /api/stats/distribution`、`GET /api/stats/dashboard` |

模块之间通过上述 HTTP 接口或服务函数协作；任何模块不直接读写其他模块的私有表，领域内共享的 `tickets` 读写统一经工单服务的事务方法。

### 2.3 权限与可见范围（服务端强制）

| 角色 | 可见工单范围 | 可执行动作 |
| --- | --- | --- |
| 提交人 submitter | 仅本人提交的工单 | 创建工单、回复本人工单、评价已完成工单、取消本人在待分配/待处理的工单 |
| 处理人 handler | 本公司的待分配工单，以及承接业务组包含本人的工单 | 回复、认领/首次处理、转派本组工单、调整优先级、完成工单 |
| 管理员 admin | 本公司全部工单 | 处理动作 + 本公司业务组/成员/分配规则配置 + 人工分配本公司工单 |
| 平台运营 ops | 全部公司工单（只读） | 查看工作台、详情、日志与统计；不回复、不分配、不完成 |

越权判定统一在服务端：跨公司、非本人工单、非本组工单、终态工单的写操作分别返回 403/409，且响应体不包含工单字段。

### 2.4 关键状态机（与需求 R-5 / RB-4 一致）

```
创建 ──► 待分配 ──(人工分配)──► 待处理 ──(完成)──► 完成（终态）
              │                    │  ▲
              │                    │  └─(转派：仍为待处理，仅换承接业务组)
              └──(取消)──► 取消（终态）◄──(取消)──┘
创建 ──(命中自动分配规则)──► 待处理
```

- 创建瞬间即确定：命中本公司「分类 → 业务组」规则则 `待处理` 并记录承接业务组，否则 `待分配`。`创建` 作为生命周期起点写入状态历史与日志，不作为可停留状态。
- `完成`、`取消` 为终态：状态、回复、转派、优先级、分配全部不可再变更。
- 处理人在待处理阶段认领或首次回复时记录 `assignee_id`；完成时保留处理人并写 `completed_at`。

### 2.5 数据归属与一致性要点

- 工单的 `company_id`、`department_id`、提交人姓名与邮箱在创建时快照，后续档案变更不回溯改写历史工单的展示内容。
- 回复、转派、状态变更、分配、评价、邮件结果在同一数据库事务内与主表更新一起提交；日志写入与业务变更同事务，避免出现无日志的变更。
- 自动分配规则的唯一性由数据库约束保证：`UNIQUE(company_id, category_id)`。
- 工单 ID 采用服务端生成的业务编号（`TK-000001` 形式），由 `ticket_sequences` 在同一事务内自增，保证全局唯一且可检索。

### 2.6 外部集成与失败可见性

- SMTP：仅用于工单完成通知。发信配置来自环境变量（`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`、`SMTP_FROM_NAME`）。发送结果三态落库：`sent`（含 provider messageId）、`skipped`（未配置 SMTP）、`failed`（含错误码/错误信息）。UI 展示每条通知的状态与时间，并提供失败/跳过后的重发；重发不删除原记录，追加新的发送记录。邮件发送失败不回滚工单完成状态。
- 无其他外部系统依赖。

### 2.7 运行、迁移与验证约定

- 常规启动：在包根 `app/ticket-system` 执行 `npm start`（`node --import tsx src/server/index.ts`，Hono 监听 `PORT` 默认 `3000`，托管 `dist/` 构建产物与 SPA 回退）。开发：`npm run dev:server`（3000）+ `npm run dev:web`（Vite 5173，`/api` 代理到 3000）。
- 数据库：`DB_PATH` 默认 `./data/application.db`（相对包根），启动时由 `initializePlatform` 创建父目录并 `runMigrations`；迁移目录 `src/server/migrations/sqlite/`。禁止 ORM 自动同步或手工改表。隔离验证使用 `DB_PATH=/tmp/...` 的独立文件与空闲端口，测试经 `test/with-http-server.mjs` 与 `test/fixtures/qa-environment.mjs` 启动真实 HTTP 服务。
- 初始化：工作区初始化器已生成脚手架、根目录 `platform-baseline.json` 与包级 `AGENTS.md`；演示数据以幂等种子步骤在迁移后写入（两家公司、部门、四类角色账号、业务组、分类与一条分配规则），不依赖手工准备。
- 验收命令与启动入口分离：`npm run build`（typecheck + 前端构建）、`npm test`（Node 测试内的迁移与接口冒烟）与 `npm start` 分开记录。
- 可重复验证：本需求无定时任务、随机结果或外部异步事件参与验收判定。时间字段由服务端统一生成，验收时以「操作后重新查询」核对；邮件在无 SMTP 配置时返回 `skipped`，验收以通知记录的状态与收件人核对，不依赖真实收件箱。

### 2.8 设计决策记录（仅高影响取舍）

- **ADR-1 身份采用本地账号而非外部 SSO**：需求把公司/部门/人员视为既有基础数据但未提供身份源，本地密码账号可在工作区内完整验证多角色与公司隔离；后续可替换为 SSO，不影响工单领域模型。
- **ADR-2 公司隔离集中在服务端访问范围层**：可见范围由「角色 + 公司 + 业务组成员」实时计算而非冗余表，成员移除后立即失权，满足移除即不可见的验收语义。
- **ADR-3 工单日志由领域表承担，不引入通用审计模块**：日志需要在工单详情按时间展示动作与结果，并作为验收对象，领域表可直接保证同事务写入与字段语义。authkit 的认证审计仍走其默认 logger，不进入工单日志。