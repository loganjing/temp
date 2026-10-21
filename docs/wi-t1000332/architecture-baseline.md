# 工单系统（134-ticket）系统设计

批准需求基线：`docs/wi-t1000332/requirements.md`（SHA-256: ce7d453f9ab15bacda1a37d6a2670e5e45983b2e80c72784c709896592cc97cb）。本设计只承载需求语义与必要技术承载方式，不扩展或裁剪产品范围。字段级 API 契约见 `docs/wi-t1000332/technical-contract.md`。

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 应用形态

单体全栈 Web 应用：单个 Node.js 进程承载 Hono REST API 与 React/Vite SPA 静态资源；SQLite 单文件数据库为唯一权威持久层。除可选 SMTP 外发通道外无外部基础设施依赖，干净目录无需手工准备即可启动。

### 1.2 技术栈（冻结）

| 层 | 选择 | 用途 |
| --- | --- | --- |
| 服务端 | Hono（Node.js ≥ 20，ESM） | REST API、静态资源托管、公司隔离中间件 |
| 前端 | React + Vite SPA | 桌面 Web 单页应用 |
| UI 样式 | Tailwind CSS | Modern SaaS 视觉基线 |
| 数据库 | SQLite（better-sqlite3，经 dbkit） | 权威数据、事务、版本化迁移 |
| 认证 | authkit + userkit（local-password） | 登录、会话凭证、用户资料 |
| 审计 | auditkit | 工单操作日志持久化 |
| 邮件 | emailkit（nodemailer） | 完成通知邮件发送 |
| 包管理 | npm | Node/npm 与 package-lock.json 约定 |

### 1.3 核心设计决策（冻结）

1. **公司隔离（明细层强制）**：所有单据级读写（工单、回复、评价、业务组、成员、分配规则、用户、日志明细）由服务端按当前登录用户所属公司强制过滤；对其他公司工单的直接访问或操作返回 403 错误反馈，支撑 AC-02 的隔离与拒绝语义。
2. **跨公司聚合统计（需求授权例外）**：统计分析与仪表盘按需求 5.3/5.8 提供跨公司聚合视图（公司/部门分布数字与运营指标），只输出聚合结果，不提供跨公司工单明细下钻，不改变工单归属隔离。
3. **生命周期五态**：`created →（进入分配流程）→ pending_assignment →（分配到业务组）→ pending_processing →（处理完成）→ completed`；非终态（created/pending_assignment/pending_processing）可 `→ cancelled`；completed 与 cancelled 为终态。提交后同步执行自动分配：命中该公司分类规则 → 直接分配业务组进入 pending_processing；未命中 → 保持 pending_assignment 等待人工分配。
4. **邮件双通道**：完成通知由通知域发送。未配置 SMTP 时写入本地发件箱（email_outbox 表，立即可查询，作为可观察送达证据）；配置 SMTP 时经 emailkit 真实发送并记录投递状态；发送失败仅记录失败状态，不阻塞工单完成主流程。
5. **工单ID**：自增主键 + 展示工单号 `TK-` + 6 位零填充（如 `TK-000001`），全局唯一，作为用户可见的工单ID。
6. **操作权限边界（需求未规定权限模型，取自然语义）**：单据操作（回复、人工分配、转派、完成、取消）限工单所属公司的已登录用户；满意度评价限提交人本人；转派在 pending_processing 状态下变更处理归属。

## 2. 领域责任、模块边界与接口摘要

<!-- system-design: architecture-boundaries -->

```
React SPA ──HTTP(JSON, Bearer)──▶ Hono API ──▶ dbkit(SQLite 权威库)
                                     ├─▶ authkit / userkit（登录会话、用户资料）
                                     ├─▶ auditkit（工单操作日志）
                                     └─▶ emailkit(SMTP，可选) + email_outbox(本地发件箱)
```

| 模块 | 职责 | 唯一数据/事实归属 | 接口摘要（调用方向：SPA → API） |
| --- | --- | --- | --- |
| 认证与用户 | 本地密码登录、会话、用户资料（姓名、邮箱、公司、部门）、本公司用户列表 | `users`（userkit starter 基础上由工单域迁移扩展 `company_id`、`department`；`companies` 归本模块） | `POST /api/auth/login`、`GET /api/auth/me`、`POST /api/auth/logout`、`GET /api/users`；用户管理页面/端点由 workspace-init starter 生成并扩展公司/部门字段 |
| 工单域 | 工单提交（含自动分配）、状态机流转、多轮回复、转派、完成（触发通知）、取消、满意度评价、详情聚合（提交人完整信息+历史工单+回复+评价） | `tickets`、`ticket_replies`、`ticket_ratings` | `POST /api/tickets`、`GET /api/tickets`、`GET /api/tickets/:id`、`POST /api/tickets/:id/replies|assign|reassign|complete|cancel|rating` |
| 分配配置域 | 公司级业务组与成员维护、分类自动分配规则维护、公司可用分类集合查询 | `business_groups`、`group_members`、`category_rules` | `GET/POST/PUT /api/groups`、`GET/POST/PUT /api/category-rules`、`GET /api/categories` |
| 统计域 | 跨公司聚合：公司/部门维度工单分布；运营仪表盘指标（工单量、平均响应时间、满意度、热点问题） | 无自有表，只读聚合 `tickets`/`ticket_replies`/`ticket_ratings`/`users` | `GET /api/stats/distribution`、`GET /api/stats/dashboard` |
| 通知域 | 完成通知邮件发送（SMTP 真实发送或本地发件箱）、发件箱查询 | `email_outbox` | `GET /api/outbox` |
| 审计域 | 工单关键操作日志（创建、分配、回复、转派、完成、取消、评价及配置变更），含操作人与操作时间 | 审计事件存储（auditkit） | `GET /api/tickets/:id/logs`、`GET /api/logs` |

模块间调用：工单域完成操作调用通知域（写发件箱/发邮件）与审计域（写日志）；工单域读取分配配置域规则执行自动分配；统计域只读聚合工单域与用户数据。模块不解释其他模块私有表，一律经上述公开接口或模块导出的服务函数访问。

## 3. UI 全局基线

- **业务模板**：`helpdesk`（工单队列处理业务）；**展示模板**：`split-master-detail`（列表/队列与当前记录详情协同，高频逐条处理）。
- **视觉风格**：Modern SaaS —— 柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色（建议靛蓝系）加状态色（P0–P4 优先级、工单状态）、短而有反馈作用的动效。
- **应用壳**：左侧导航（工单工作台、我的工单、统计分析、业务组配置、分配规则、操作日志、发件箱）+ 顶部上下文栏（当前用户姓名/公司/部门、退出登录）+ 主工作区；默认桌面 Web（≥1280px 布局），不承诺窄屏优化。
- **主工作流**：工作台为左右分栏——左侧待处理工单列表（筛选：公司/业务组/优先级/分类；搜索：工单号/主题关键字；排序：创建时间/优先级/工单号）+ 右侧当前工单详情（提交人完整信息卡、历史工单列表、回复流、分配/转派/完成/取消操作）。
- **全局状态**：加载（列表骨架、按钮 busy）；空数据（列表空态文案与引导）；错误（请求失败提示与重试）；隔离反馈（访问其他公司工单返回 403 时提示"无权访问其他公司工单"）；成功（完成、评价等关键操作后的轻量成功反馈）。
- **长文本**：工单描述、回复内容超长截断时提供展开/收起与悬停 title 查看全文。
- **选择依据**：需求 5.9 工作台列表+筛选搜索排序、5.6 处理时查看提交人完整信息、5.8 统计仪表盘、AC-02 错误反馈。统计仪表盘页沿用同一应用壳，主区为 KPI 指标行 + 分布图 + 明细表，不做营销式首屏。

## 4. 数据模型与迁移

### 4.1 表与关系

```
companies 1─n users n─n business_groups (group_members)
companies 1─n business_groups 1─n category_rules (按 category 唯一)
companies 1─n tickets n─1 users(submitter)  n─1 business_groups(assigned, 可空)
tickets 1─n ticket_replies n─1 users(replier)
tickets 1─1 ticket_ratings n─1 users(submitter)
tickets 1─n email_outbox
tickets 1─n 审计事件(auditkit)
```

| 表 | 关键字段（snake_case） | 说明 |
| --- | --- | --- |
| `companies` | id, name(唯一), created_at | 公司；用户创建时按公司名引用，不存在则创建 |
| `users` | id, name, email(唯一), 凭证字段(userkit), company_id→companies, department, created_at | userkit starter 用户表 + 工单域迁移扩展 company_id/department |
| `business_groups` | id, company_id→companies, name, created_at；唯一(company_id, name) | 公司内业务组 |
| `group_members` | id, group_id→business_groups, user_id→users；唯一(group_id, user_id) | 业务组成员 |
| `category_rules` | id, company_id, category, group_id→business_groups；唯一(company_id, category) | 分类自动分配规则 |
| `tickets` | id(自增), ticket_no(唯一, TK-000001), subject, description, category, priority(P0–P4), status(created/pending_assignment/pending_processing/completed/cancelled), company_id, submitter_id→users, assigned_group_id(可空), handler_id(可空), handled_at(可空), completed_at(可空), created_at | 工单主表 |
| `ticket_replies` | id, ticket_id→tickets, replier_id→users, content, replied_at | 多轮回复 |
| `ticket_ratings` | id, ticket_id(唯一)→tickets, submitter_id→users, score(1–5), comment(可空), rated_at | 满意度评价，一单一评 |
| `email_outbox` | id, ticket_id(可空)→tickets, ticket_no, to_email, subject, body, channel(smtp/local), status(queued/sent/failed), error(可空), created_at, sent_at(可空) | 完成通知邮件记录（本地发件箱/SMTP 投递记录） |
| 审计事件表 | 由 auditkit 提供 | 事件类型、操作人、操作时间、关联工单、详情 JSON |

### 4.2 状态机与分配

提交 → `created` →（同步查该公司 category_rules 按 category 匹配）→ 命中：写 assigned_group_id，进入 `pending_processing`；未命中：进入 `pending_assignment`。人工分配（pending_assignment → pending_processing）。转派在 `pending_processing` 下变更 assigned_group_id/handler 归属，状态不变。完成 → `completed`（记录 handler_id=操作人、handled_at、completed_at，事务内写审计与发件箱记录，事务外真实发信）。取消（非终态 → `cancelled`）。评价在 `completed` 后写入，不改变状态。

### 4.3 迁移约定

- 全部 schema 变更使用版本化 SQL 迁移（packageRoot 下 `src/server/migrations/sqlite/` 编号文件，经 dbkit `runMigrations` 在服务启动时幂等执行，由 `src/server/platform/bootstrap.ts` 接线）；禁止 ORM 自动同步或手工改 schema。
- 已占用编号：`0001_platform_users.sql`（userkit）、`0003_platform_audit_events.sql`（auditkit）；工单域迁移（users 扩展 `company_id`/`department`、`companies`、`business_groups`、`group_members`、`category_rules`、`tickets`、`ticket_replies`、`ticket_ratings`、`email_outbox`）从 `0004` 起编号，依赖用户迁移先行。
- 种子数据：不预置业务数据；公司随用户创建（按公司名引用即建），保证干净目录可直接运行。

## 5. 外部集成：邮件

- 唯一外部集成为 SMTP 邮件外发，经 emailkit（nodemailer）执行。emailkit 本身不读取环境变量：通知域从应用配置读取 `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM`，构造 `EmailConfig{host, port(默认 587), username, password, from}` 传入 `createEmailClient`。
- 未配置 SMTP（默认开发与验收环境）：emailkit `send` 返回 `skipped/not_configured`，通知域据此将完成通知写入 `email_outbox`（channel=local，status=queued），立即可经 `GET /api/outbox` 查询——作为"已发送通知邮件"的可观察送达证据，支撑 AC-09 验证。
- 已配置 SMTP：真实发送；成功记录 status=sent 与 sent_at，失败记录 status=failed 与 error，不阻塞工单完成主流程（失败可见性：发件箱视图可见失败条目与原因）。

## 6. 运行与可靠性

- **常规启动**（工作区根目录）：开发 `npm run dev`（`scripts/dev.mjs` 并行启动 Vite 前端与 Hono API 热更新）；生产 `npm run build`（typecheck + vite build）后 `npm run start`（执行 `node --import tsx src/server/index.ts`）。应用包 `app/ticket-system` 内等价命令：`dev:web` / `dev:server` / `build` / `start`。
- **端口**：`PORT` 环境变量可配置，默认 3000（`src/server/index.ts` 读取）；开发模式 Vite 前端端口与 API 代理以 `vite.config.ts` 为准。
- **数据库**：`DB_PATH` 环境变量覆盖（默认 `./data/application.db`，`src/server/platform/bootstrap.ts` 已实现打开前自动创建父目录，支持 `:memory:`）；隔离验证时将 `DB_PATH` 指向独立测试库文件并选用空闲端口，等待真实监听就绪后验证，只清理本次启动的进程。
- **迁移**：服务启动时自动执行 `runMigrations`（幂等）。
- **验收命令**：工作区根 `npm run test`（应用包 `test/*.test.mjs`，经 `test/with-http-server.mjs` 启动隔离真实 HTTP 服务器并自行清理）；验收脚本负责启动与清理时只运行该脚本，不额外后台启动服务。
- **会话密钥**：authkit 需要 `JWT_SECRET`（见 `env.example`）；缺省时使用默认值并输出警告，生产部署必须配置。
- **冷启动检查**：Node/npm + package-lock.json 由内置冷启动检查覆盖（新项目 npm 约定成立）。
- 服务端入口 `app/ticket-system/src/server/index.ts` 位于授权可写范围内。

## 7. CommonApp 模块选择

| 模块 | 包/版本 | 需求匹配 | 源路径 | 集成边界 | 限制 | manifest SHA-256 | 模块安装标记 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dbkit | @commonapp/dbkit 0.2.0 | 5.x 全部持久化、AC-01/02/…权威数据与迁移 | 工作区 `vendor/@commonapp/<id>`（package.json 以 `file:` 引用，npm 管理安装与锁文件） | 工单域/分配配置域/统计域/通知域/审计域经 dbkit 执行查询、事务与迁移 | 仅 SQLite | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | commonapp install: dbkit |
| authkit | @commonapp/authkit 0.1.2 | AC-02 公司隔离需要用户身份与会话 | 同上 | Hono 登录/Bearer 中间件，工单域据此取当前用户与公司 | 无 RBAC（与需求一致） | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | commonapp install: authkit |
| userkit | @commonapp/userkit 0.1.0 | 提交人/处理人账户与资料（5.6 提交人完整信息） | 同上 | 本地用户与凭证；工单域迁移扩展 company_id/department | 用户管理 API 无角色检查（需求未规定权限模型） | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | commonapp install: userkit |
| auditkit | @commonapp/auditkit 0.1.0 | 5.10/AC-14 操作日志含操作人与时间 | 同上 | 审计域统一记录工单关键操作与配置变更事件；保留期限需求未规定，默认全量持久保留、不设过期清理 | 无独立查看界面（由工单域只读端点查询） | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | commonapp install: auditkit |
| emailkit | @commonapp/emailkit 0.1.0 | 5.6/AC-09 完成通知邮件 | 同上 | 通知域经 emailkit 发 SMTP；本地发件箱为项目内实现 | 需 SMTP 环境变量才真实外发 | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | commonapp install: emailkit |

未选候选：permissionkit（需求明确"权限模型未规定，本基线不做权限设计"，公司隔离由服务端过滤承担）；attachment（需求无附件要求）；i18n（需求无国际化要求）。

workspace-init 已按上述模块闭包（dbkit、authkit、userkit、auditkit、emailkit，其中 userkit 依赖 dbkit+authkit、auditkit 依赖 dbkit）完成初始化，生成登录、首个账户初始化与用户管理页面/API（本地密码模式）、平台迁移（0001 用户、0003 审计事件）与平台接线（`src/server/platform/`）；安装、构建与测试检查全部通过。根目录 `platform-baseline.json` 确认 packageRoot 为 `app/ticket-system`，模块状态 dbkit/authkit/userkit=wired、auditkit/emailkit=installed（后两者的业务接线在实现阶段完成）。
