# 系统设计

- Work Item：wi-t1000327（业务任务 131-ticket 工单系统）
- 需求基线：`docs/wi-t1000327/requirements.md`（已批准，sha256:29e8b8f6f355510d47297db3ee4463de333f812b50032d2a8bd7b34e38dd1a05）
- 字段级 API 与数据契约见 `docs/wi-t1000327/technical-contract.md`（唯一来源）；本文只保留整体方案、模块边界与接口摘要。

<!-- system-design: scope -->

## 1. 整体方案与设计基线

### 1.1 路线结论

已按分类契约提交并固定为 `fullstack-complex`：工单需在提交人与处理人之间跨用户共享权威数据（多轮回复、自动分配、转派，AC-02/AC-06/AC-07），按公司隔离要求服务端权威数据边界与授权（AC-03），完成邮件通知为外部集成（AC-09），统计与运营指标需要服务端聚合（AC-11/AC-12）。浏览器本地存储无法满足上述能力，选择完整全栈路线。

### 1.2 技术栈（冻结）

| 维度 | 选择 |
| --- | --- |
| 后端框架 | Hono（Node ≥ 20，ESM） |
| 前端 | React + Vite 单页应用 |
| UI 样式 | Tailwind CSS |
| 数据库 | SQLite 文件库（默认 `data/application.db`，`DB_PATH` 可覆盖） |
| 数据访问 | dbkit（查询、事务、版本化迁移） |
| 身份认证 | authkit + userkit（本地密码模式，`identityMode: local-password`） |
| 包管理 | npm |

### 1.3 CommonApp 模块选择

已选模块（新项目初始化；安装目标 `vendor/@commonapp/<module>`，依赖声明 `file:./vendor/@commonapp/<module>`）：

| 模块 | 包/版本 | manifest SHA-256 | 需求匹配与集成边界 |
| --- | --- | --- | --- |
| dbkit | @commonapp/dbkit 0.2.0 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | 全部业务表的建库、查询、事务与版本化迁移（`src/server/migrations/sqlite/`，位于 `app/ticket-system` 包内），SQLite 驱动 |
| authkit | @commonapp/authkit 0.1.2 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | Hono 密码登录与会话/Bearer 认证；不含用户存储 |
| userkit | @commonapp/userkit 0.1.0 | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | platform_users 凭证表（自带迁移 `0001_platform_users.sql`）与登录用户解析；用户业务属性由项目 `user_profiles` 扩展承载 |

模块安装标记：

- commonapp install: dbkit
- commonapp install: authkit
- commonapp install: userkit

集成限制（遗留边界，另见第 6 节）：

- workspace-init 在本地密码模式下生成登录、首个账户初始化与用户管理页面/API；该用户管理 API 仅做登录校验、不区分角色。业务页面与业务 API 必须自行执行公司隔离与角色校验（见 2.4），starter 用户管理仅作为账户引导入口。
- `platform_users` 仅承载登录凭证与账户；姓名、公司、部门、角色等业务字段一律存于项目 `user_profiles`，不修改 userkit 自身表结构。

未选模块与理由：

- emailkit：需求未规定邮件渠道（未规定事项），验收环境无可用 SMTP；本地发件箱可完整支撑 AC-09 的通知闭环，SMTP 作为可选扩展点（见第 4 节）。
- auditkit：需求要的是与工单强绑定、可按工单聚合查看的操作流日志（AC-14），项目内 `ticket_logs` 更贴合且无脱敏需求，不引入额外模块依赖。
- permissionkit：权限模型为固定角色集合 + 公司隔离过滤，业务 API 层实现足够，无需通用 RBAC 注册表。
- attachment / i18n：需求无附件与多语言要求。

### 1.4 运行约定

- 常规启动：`npm start`（实际入口与脚本由 workspace-init starter 生成，以根目录 `platform-baseline.json` 与 `app/ticket-system/AGENTS.md` 为准）；开发模式 `npm run dev`。
- 端口：环境变量 `PORT`，默认 3000；服务监听就绪后可用。
- 数据库：环境变量 `DB_PATH`，默认 `./data/application.db`；打开前创建父目录；验收时可用 `DB_PATH` 指向隔离路径。
- 迁移：dbkit `runMigrations` 执行 `app/ticket-system/src/server/migrations/sqlite/` 下的版本化 SQL 迁移；schema 变更仅通过新增编号迁移文件，禁止 ORM 自动同步或手工改库。
- 验收：验收脚本自行负责启动与清理服务，不在验收流程中额外后台启动服务。

### 1.5 全局 UI 基线（冻结）

| 维度 | 结论 |
| --- | --- |
| 应用/业务模板 | helpdesk（工单逐条处理为核心业务能力） |
| 展示模板 | split-master-detail（工作台列表与当前工单详情并列协同；此 ID 同时作为实现资源 ID） |
| 视觉预设 | Modern SaaS：柔和中性色、细边界、少阴影、中等圆角、单一主色 + 状态色、清晰字体、短而有反馈的动效 |
| 应用壳 | 左侧导航（工作台、我的工单、统计、管理、我的通知）+ 顶部上下文栏（当前用户、公司、角色、登出）+ 主工作区 |
| 布局 | 工作台为"列表/筛选区 + 工单详情"双栏；统计页为 KPI 行 + 分布图表 + 明细；管理页为表格 + 表单；详情中长文本（描述、回复）完整可读 |
| 目标设备 | 桌面 Web（≥1280px 优先；需求未要求移动端/窄屏，不做窄屏验收） |
| 全局状态 | 加载（列表骨架、按钮等待）、空数据（引导文案）、错误（提示 + 重试）、无权限（403 文案）、成功（轻量 toast）；截断文本提供悬停标题或展开查看全文 |
| 依据 | 高频逐条处理工单（AC-02/AC-07/AC-13）、提交人与处理人协作、运营指标查看（AC-12）为需求核心事实 |

<!-- system-design: architecture-boundaries -->

## 2. 领域责任、模块边界与接口摘要

### 2.1 总体结构

```text
React/Vite SPA（app/ticket-system 前端）
    │  JSON over HTTP（/api/*，AuthKit 会话）
    ▼
Hono 服务（入口 app/ticket-system/src/server/index.ts，PORT 默认 3000）
    ├─ 身份与访问：authkit（登录/会话） + userkit（platform_users 凭证）
    ├─ 业务模块：工单核心 / 组织与分配 / 通知 / 统计分析
    │      └─ dbkit ──▶ SQLite（DB_PATH，默认 data/application.db）
    │             └── src/server/migrations/sqlite/ 版本化迁移
    └─ 本地发件箱：email_notifications（完成通知写入，提交人界面查看）
```

### 2.2 模块、数据归属与接口摘要

模块间只通过公开服务交互，不读取其他模块私有表；字段级契约见技术契约。

| 模块 | 唯一数据归属 | 接口摘要（调用方向：前端 → 服务端） |
| --- | --- | --- |
| 身份与访问 | platform_users（userkit 迁移）＝登录凭证；user_profiles＝姓名/邮箱/公司/部门/角色 | POST /api/auth/login、POST /api/auth/logout、GET /api/auth/me（starter 提供） |
| 组织与分配 | companies、business_groups、group_members、categories、assignment_rules | GET/POST /api/groups、POST/DELETE /api/groups/:id/members、GET/POST /api/categories、GET/POST/DELETE /api/assignment-rules、GET /api/companies（platform_ops） |
| 工单核心 | tickets、ticket_replies、ticket_logs、ticket_ratings | GET/POST /api/tickets、GET /api/tickets/:id、POST /api/tickets/:id/replies、POST /api/tickets/:id/assign、POST /api/tickets/:id/transfer、POST /api/tickets/:id/complete、POST /api/tickets/:id/cancel、POST /api/tickets/:id/rating、GET /api/tickets/:id/logs、GET /api/tickets/:id/submitter |
| 通知 | email_notifications（本地发件箱） | GET /api/notifications |
| 统计分析 | 无独立表，只读聚合自工单核心与组织数据 | GET /api/stats/distribution、GET /api/stats/dashboard |
| 前端页面 | — | 登录、工作台（split-master-detail 双栏）、我的工单、我的通知、统计仪表盘、管理（业务组/分类/规则）、starter 用户管理（账户引导） |

### 2.3 工单生命周期承载（技术口径）

- 状态枚举：`pending_assign`（待分配）、`processing`（待处理）、`completed`（完成）、`cancelled`（取消）；"创建"为提交动作本身，工单落库即为 `pending_assign`。
- 合法流转：`pending_assign → processing`（人工分配或规则自动分配）；`processing → processing`（转派换组）；`pending_assign|processing → completed`；`pending_assign|processing → cancelled`。`completed` 与 `cancelled` 为终态，不再出现在待处理列表。
- 自动分配在创建事务内执行：命中 `assignment_rules(company_id, category_id)` 即写入目标业务组并置 `processing`；未命中保持 `pending_assign` 等待人工分配。
- 完成时记录处理人与完成时间，并在同一事务写入完成通知（本地发件箱）；首次回复时记录 `first_reply_at` 供统计使用。
- 创建、回复、分配、转派、完成、取消、评价均在同一事务内写 `ticket_logs`（操作人、操作时间、操作内容）。

### 2.4 公司隔离与权限

- 所有业务查询与写入以会话用户的 `user_profiles.company_id` 强制过滤（服务端拼接，不信任前端传入的公司参数）；访问其他公司资源一律按 404 处理。
- 角色枚举 `role`：`submitter`（提交人）、`agent`（处理人）、`company_admin`（公司管理者）、`platform_ops`（平台运营）。
- `company_admin` 管理本公司业务组、成员、分类与分配规则；`agent` 查看与处理本公司工单（工作台默认过滤到所在业务组，可切换到本公司范围）；`submitter` 创建工单、回复自己的工单、评价自己已完成的工单、查看自己的通知。
- `platform_ops` 为跨公司只读视角（工作台按公司筛选、按公司/部门查看统计分布），用于承载需求中的公司维度统计与筛选（AC-11/AC-13）；不参与工单处理与任何写操作。
- starter 用户管理 API 不区分角色：仅作为账户与凭证引导；业务读写一律走本节受控的业务 API。

## 3. 数据库模型与迁移

业务表由项目迁移建立（`app/ticket-system/src/server/migrations/sqlite/`，dbkit `runMigrations` 执行；字段级定义与 DDL 见技术契约第 5 节）：

- `companies`：公司。
- `user_profiles`：用户业务档案，`platform_user_id` 唯一关联 userkit 用户；含公司、姓名、邮箱、部门、角色。
- `business_groups`：业务组（公司内名称唯一）。
- `group_members`：组成员（组 × 用户档案唯一）。
- `categories`：问题分类（公司内名称唯一）。
- `assignment_rules`：分配规则（公司 × 分类唯一 → 业务组）。
- `tickets`：工单（`ticket_no` 唯一，如 TKT-000001；公司、主题、描述、分类、优先级 P0–P4、状态、提交人、当前业务组可空、处理人可空、首次回复时间可空、完成/取消时间可空、创建时间）。
- `ticket_replies`：多轮回复（工单、回复人、内容、回复时间）。
- `ticket_logs`：操作日志（工单、操作人可空-系统操作、动作、内容摘要、时间）。
- `ticket_ratings`：满意度评价（工单唯一、评价人、评分 1–5、备注可空、时间）。
- `email_notifications`：本地发件箱（收件人档案、收件邮箱、关联工单、主题、正文、时间）。

关系：公司 1—N（档案/业务组/分类/规则/工单）；业务组 1—N 成员（成员为公司内用户档案）；工单 N—1（分类、业务组、提交人档案），1—N（回复、日志），1—1 评价。

迁移约定：初始业务迁移建立上述表、外键与索引（company_id、status、ticket_no、created_at、组/分类外键）；userkit 的 `0001_platform_users.sql` 由模块安装提供；后续 schema 变更仅新增编号迁移文件。首次启动空库时执行种子脚本（见技术契约 4.7）。

## 4. 外部集成（邮件）

- 系统唯一外部触点为"工单完成邮件通知"（FR-08/AC-09）。渠道未在需求中规定且验收环境无 SMTP 服务，默认实现为本地发件箱：完成事务将通知（收件人邮箱、主题、正文、关联工单）写入 `email_notifications`，提交人在"我的通知"界面查看；该实现保证通知可被验证且不依赖外部网络。
- 失败可见性：发件箱写入与工单完成同事务提交，写入失败则完成操作整体回滚（通知与完成状态保持一致）；通知列表只返回当前登录用户作为收件人的记录。
- SMTP 扩展点：通知模块保留发送接口抽象；后续配置真实 SMTP 时引入 emailkit（catalog 状态 ready，可配置 SMTP 发送）替换本地实现，不影响业务模块与 API 契约。

## 5. 运行与可靠性

- 启动顺序：读取 `PORT`/`DB_PATH` → dbkit 打开数据库（自动创建父目录）→ 执行版本化迁移 → 空库时执行种子 → 挂载 authkit 会话 → 注册业务路由 → 监听端口。
- 事务边界：工单创建（含自动分配与日志）、回复（含首次回复时间与日志）、人工分配、转派、完成（含处理记录、日志、发件箱）、取消、评价均为单事务，失败整体回滚并返回错误码。
- 统计端点为只读聚合查询，不修改业务数据。
- 服务端校验全部枚举、必填、长度与角色权限；前端校验仅用于即时反馈。
- 首个账户初始化与登录由 starter 提供（userkit）；业务账号供给见技术契约 4.7 种子数据。

## 6. 架构决策记录

- **ADR-1 跨公司统计与公司隔离的调和**：需求同时要求公司隔离（AC-03）与按公司维度的统计/筛选（AC-11/AC-13）。决策：公司内角色严格隔离；引入 `platform_ops` 只读跨公司视角承载公司维度统计与工作台筛选，不授予任何业务写权限。影响：权限模型增加一个角色；列表与统计 API 增加公司维度参数（仅对 platform_ops 生效，其他角色服务端强制本公司）。
- **ADR-2 邮件通知采用本地发件箱**：邮件渠道未规定且验收环境无 SMTP。决策：默认本地发件箱（email_notifications 表 + 提交人通知视图）支撑 AC-09 闭环；真实 SMTP 作为后续可选扩展（引入 emailkit）。影响：不引入 nodemailer 依赖；通知送达以系统内可见为准，不承诺真实邮箱投递。

### 遗留边界与开放项

- starter 用户管理 API 仅做登录校验、不区分角色：业务读写一律走业务 API 并由服务端强制公司隔离与角色校验，用户管理仅作账户引导（见 1.3 与 2.4）。
- 邮件通知默认本地发件箱，不承诺真实邮箱投递；SMTP 为后续可选扩展（ADR-2）。
- P0–P4 仅作优先级分级，未绑定具体 SLA 时限与超时处理（需求未规定；后续可按优先级补充时限规则）。
