# 工单系统（137-ticket）系统设计

本设计以已批准需求基线 `docs/wi-t1000335/requirements.md` 为唯一产品范围来源，只给出技术承载方式。验收场景（AC-01～AC-12）作为内部覆盖清单，不在本文复制。

<!-- system-design: scope -->
## 1. 整体方案与设计基线

**交付形态**：新建单仓库全栈应用，服务端为唯一数据权威，前端为桌面 Web SPA，由服务端静态托管。

| 维度 | 冻结结论 |
| --- | --- |
| 后端 | Hono（Node ≥ 20，ESM），REST API；入口与脚本遵循 workspace 初始化器生成的 starter 约定 |
| 前端 | React + Vite SPA |
| UI 实现 | Tailwind CSS（承载 Modern SaaS 视觉方向） |
| 数据库 | SQLite（dbkit：配置/查询/事务/迁移），版本化 SQL 迁移，禁止 ORM 自动同步或手工改 schema |
| 认证 | authkit + userkit 本地密码模式（密码登录 + Bearer 令牌）；用户记录扩展公司与部门归属 |
| 操作日志 | auditkit 持久审计事件（敏感字段脱敏能力保留） |
| 邮件 | emailkit（SMTP / nodemailer），工单完成通知 |
| 包管理 | npm |

**核心设计结论（冻结）**：

1. **公司隔离是第一数据边界**。服务端一切工单读取与操作先校验 `工单.company_id == 当前用户.company_id`，不满足时按"不存在"返回 404，不泄露他公司工单存在性。列表、搜索、统计、工作台查询全部在 SQL 层带公司过滤；"按公司维度筛选"的可选项 = 当前用户有权查看的公司集合，当前最小模型下等于用户所属公司（需求未规定跨公司运营视角，记录为开放问题）。
2. **生命周期**：持久状态为 `待分配 / 待处理 / 完成 / 取消`；"创建"是入口操作事件（写入审计日志），创建后工单进入待分配，并在同一创建流程内同步执行自动分配——命中该公司"问题分类 → 业务组"规则则分配并转入待处理，未命中则停留待分配。取消仅允许在未完成状态（待分配/待处理）发起，取消后不再参与分配与处理。
3. **工作台范围**：待处理列表 = 当前用户所属业务组（多组取并集）中状态为待处理的工单；公司筛选、关键字搜索、排序在该范围内执行。
4. **处理视图信息**：处理人查看提交人完整信息（姓名、公司、部门、历史工单列表）由独立查询承载，同样受公司隔离约束。
5. **统计口径**（需求 4.6 冻结口径）：工单量 = 可见范围内工单计数；平均响应时间 = 处理方（非提交人）首次回复时间与工单创建时间之差的平均值；满意度 = 已完成且已评价工单的平均评分；热点问题 = 按问题分类聚合的工单量排名。无样本的指标返回 null，不臆造数值。
6. **完成通知**：完成动作触发一次邮件发送，收件人为工单记录的提交人邮箱；发送结果（含收件人、状态、时间、失败原因）写入通知记录表，可查询观察；发送失败不回滚完成状态。SLA 优先级（P0–P4）仅作为工单字段，不引入时限承诺（需求未规定）。
7. **操作留痕**：创建、分配、回复、转派、处理完成、取消、评价七类关键操作全部写审计日志，每条含操作类型、操作人、操作时间、相关工单编号及变更详情。

**明确不做**（需求未规定，本次不新增）：SLA 时限规则、公司 CRUD 管理界面（公司数据由种子与用户管理承载）、跨公司运营视角、已取消工单重开、附件、国际化、移动端/窄屏适配。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

系统分两层：浏览器中的 React SPA 通过 REST API 调用 Hono 服务端；SQLite 数据库仅服务端可访问，SPA 不直连数据层。下表按服务端模块说明职责、唯一数据归属与接口摘要（调用方向均为 前端 → 服务端）；字段级契约唯一来源为 `docs/wi-t1000335/technical-contract.md`。

| 模块 | 唯一职责 | 数据归属（唯一事实源） | 接口摘要 |
| --- | --- | --- | --- |
| identity | 登录认证、当前用户信息、用户管理（在 userkit 用户体系上扩展公司/部门字段） | users、companies | `POST /api/auth/login`；`GET /api/me`；userkit 用户管理端点 |
| ticket | 工单创建（含自动分配）、列表/搜索/排序、详情、回复、转派、完成、取消、评分 | tickets、replies、ratings | `POST/GET /api/tickets`；`GET /api/tickets/:no`；`POST /api/tickets/:no/replies·transfer·complete·cancel·rating`；`GET /api/tickets/:no/submitter` |
| workbench | 处理人待处理队列视图（按用户所属业务组） | 无（只读 ticket 数据） | `GET /api/workbench/tickets` |
| assignment | 业务组与成员管理、公司"分类 → 业务组"分配规则 | groups、group_members、assignment_rules | `/api/groups*`；`/api/groups/:id/members*`；`/api/assignment-rules*` |
| stats | 公司/部门维度分布统计、运营仪表盘指标计算 | 无（只读聚合） | `GET /api/stats/distribution`；`GET /api/stats/dashboard` |
| notification | 完成邮件发送与发送记录查询 | notification_log | `GET /api/tickets/:no/notifications` |
| audit | 工单关键操作审计事件的写入与查询 | auditkit 事件存储 | `GET /api/audit-logs`；`GET /api/tickets/:no/audit-logs` |

**跨模块协作方向**：ticket 在创建/转派/完成/取消时调用 assignment 的规则与组属查询；完成时调用 notification 发送；各业务写路径在事务提交后调用 audit 记录事件。模块间只经公开服务函数调用，不读取彼此私有表。

**前端模块**（沿用同一应用壳与全局 UI 基线）：登录与用户管理（authkit/userkit starter 生成）、工单列表+详情（split-master-detail）、工单创建表单、工单工作台、业务组与规则管理、统计分析（分布+仪表盘）、操作日志查询。

## 3. 数据模型与迁移

SQLite 表（应用领域表，列名 snake_case）：

- `companies(id PK, name TEXT NOT NULL UNIQUE, created_at)`
- `users`：userkit 提供的本地用户表，应用迁移扩展 `company_id INTEGER NOT NULL REFERENCES companies(id)`、`department TEXT NOT NULL`
- `groups(id PK, name TEXT NOT NULL, company_id NOT NULL REFERENCES companies(id), created_at)`，唯一键 `(company_id, name)`
- `group_members(group_id, user_id)` 复合主键，均外键
- `assignment_rules(id PK, company_id NOT NULL, category TEXT NOT NULL, group_id NOT NULL REFERENCES groups(id), created_at)`，唯一键 `(company_id, category)`
- `tickets(id PK, ticket_no TEXT NOT NULL UNIQUE, subject TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, priority TEXT NOT NULL CHECK (P0..P4), status TEXT NOT NULL CHECK (pending_assignment/processing/completed/cancelled), company_id NOT NULL REFERENCES companies(id), submitter_id NOT NULL REFERENCES users(id), current_group_id REFERENCES groups(id) NULL, handler_id REFERENCES users(id) NULL, handled_at NULL, created_at, updated_at)`
- `replies(id PK, ticket_id NOT NULL REFERENCES tickets(id), author_id NOT NULL REFERENCES users(id), content TEXT NOT NULL, created_at)`
- `ratings(id PK, ticket_id NOT NULL UNIQUE REFERENCES tickets(id), rater_id NOT NULL, score INTEGER NOT NULL CHECK (1..5), comment TEXT NULL, created_at)`
- `notification_log(id PK, ticket_id NOT NULL REFERENCES tickets(id), recipient_email TEXT NOT NULL, subject TEXT NOT NULL, status TEXT NOT NULL CHECK (sent/failed), sent_at NOT NULL, detail TEXT NULL)`
- 审计事件表由 auditkit 管理并提供迁移，应用只写事件，不修改其 schema

**关键索引**：`tickets(company_id, status)`、`tickets(current_group_id, status)`、`tickets(submitter_id)`、`replies(ticket_id, created_at)`。

**工单编号**：`TKT-` + 6 位零填充全局递增序列（如 `TKT-000001`），创建时服务端生成，全局唯一。

**迁移约定**：全部 schema 变更经 `migrations/sqlite/*.sql` 版本化文件（dbkit `runMigrations`），服务启动时执行；不使用自动建表或 ORM 同步。验收所需的多样本公司数据（公司、用户、业务组、规则、多状态工单）由验收脚本写入隔离测试库，不自动注入常规数据库。

## 4. UI 全局基线

- **应用/业务模板**：`helpdesk`（依据：工单生命周期、分配、处理、评价的客服工单业务形态）。
- **展示模板**：`split-master-detail`（依据：高频逐条处理记录，列表/队列与当前记录详情协同）。工作台与工单列表均采用左列表（可筛选/搜索/排序）+ 右详情分栏；统计页采用顶部筛选 + KPI 行 + 分布明细的仪表盘布局，作为同一应用壳内的次级布局。
- **视觉预设**：Modern SaaS——柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色（蓝）+ 状态色、短而有反馈的动效。
- **布局与设备**：桌面 Web；应用壳 = 左侧导航（工作台、工单、统计、业务组与规则、操作日志、用户管理）+ 顶部上下文栏（当前用户、所属公司）+ 主工作区。
- **全局状态**：加载（表格骨架）、空数据（各列表独立空态文案）、错误（请求失败 toast/内联提示）、无权限（404 不泄露 + 403 提示）、成功（操作反馈 toast）。回复提交、转派、完成、取消、评价均有成功反馈。
- **优先级与状态视觉**：P0 红 / P1 橙 / P2 黄 / P3 蓝 / P4 灰；状态徽标区分待分配/待处理/完成/取消。
- **详情页信息结构**：基本信息卡（编号、主题、描述、分类、优先级、状态、当前业务组、处理人、处理时间）+ 提交人信息卡（姓名、公司、部门、历史工单列表入口）+ 回复时间线（回复人/时间/内容）+ 操作区（回复、转派、完成、取消、评价，按权限与状态显隐）+ 内嵌操作日志时间线。
- **文本截断**：主题、描述、邮箱等可能截断的字段提供悬停 title 或展开查看全文。

## 5. 外部集成：完成通知邮件

- 唯一外部依赖：SMTP 邮件发送（emailkit / nodemailer）。
- 触发点：`POST /api/tickets/:no/complete` 的工单状态事务提交后，组装并发送一次：收件人 = 工单提交人邮箱（取工单记录），主题含工单编号与主题，正文含处理人、完成时间与结果摘要。
- 配置：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`MAIL_FROM` 环境变量；未配置或发送失败时 `notification_log.status = failed` 并记录原因，工单完成状态不回滚。
- 失败可见性与重试：发送记录（收件人、状态、时间、原因）可经 `GET /api/tickets/:no/notifications` 查询；本基线不自动重试（需求仅要求"完成时发送一次"这一可观察结果）。

## 6. CommonApp 模块选择

| 模块 | 包/版本 | manifest SHA-256 | 需求匹配 | 集成边界与限制 | 模块安装标记 |
| --- | --- | --- | --- | --- | --- |
| dbkit | @commonapp/dbkit@0.2.0 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | SQLite 持久化、事务、版本化迁移承载工单/回复/评分/通知等全部领域数据 | 服务端数据库层唯一入口（`createDb`/`runMigrations`/事务）；仅支持 SQLite 驱动 | commonapp install: dbkit |
| authkit | @commonapp/authkit@0.1.2 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | 公司隔离前提下的身份识别：密码登录 + Bearer 认证 | Hono 中间件集成；提供登录端点与认证能力 | commonapp install: authkit |
| userkit | @commonapp/userkit@0.1.0 | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 本地用户存储（姓名、邮箱）并扩展公司/部门归属；提交人完整信息的数据来源 | 依赖 dbkit+authkit；应用迁移扩展公司/部门字段 | commonapp install: userkit |
| auditkit | @commonapp/auditkit@0.1.0 | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 工单关键操作日志（操作类型、操作人、操作时间、相关工单）持久留痕与查询 | 依赖 dbkit；应用只写事件，不改其 schema | commonapp install: auditkit |
| emailkit | @commonapp/emailkit@0.1.0 | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | 工单完成邮件通知（SMTP 发送） | 依赖 nodemailer；发送结果由应用侧 notification_log 记录 | commonapp install: emailkit |

**未选候选及理由**：permissionkit（公司隔离与业务组成员资格是本领域的内生判定，无需通用 RBAC 注册表；需求第 5 节明确权限模型未规定）；attachment（需求无附件能力）；i18n（需求无国际化）。上述模块均通过 catalog/manifest 核查（status=ready），发行文件与依赖闭包由 resolver 校验通过；所选项的模块依赖闭包为 dbkit + authkit（已全部显式选择）。

## 7. 运行与验证约定

- **常规启动**：根目录 `npm start`（执行 `node --import tsx app/ticketing/src/server/index.ts`），监听端口默认 `3000`，可用 `PORT` 环境变量覆盖；环境变量由根目录 `.env`（dotenv）加载。
- **开发启动**：根目录 `npm run dev`（同时启动 Vite 前端开发服务器，端口 5173，并将 `/api` 代理至 `localhost:3000` 的 Hono 后端）。
- **基础测试**：`app/ticketing` 下 `npm test`（`node --import tsx --test test/*.test.mjs`）覆盖 dbkit 启动/迁移与平台 HTTP 基线，由初始化器生成并通过；业务验收脚本由后续验证阶段交付。
- **数据库**：`DB_PATH` 环境变量覆盖测试库路径；默认 `./data/application.db`（相对服务进程工作目录），打开前自动创建父目录；干净目录无需人工准备即可启动。
- **验收命令与启动入口分离**：验收由独立验证脚本负责选择空闲端口、等待真实监听就绪、准备隔离测试数据库与种子数据（多公司、多部门、多分类、多状态工单），并只清理本次启动的进程；运行验收时只执行该脚本，不额外后台启动服务。
- **邮件环境变量**：见第 5 节；验收环境无真实 SMTP 时，允许 notification_log 记录 failed 状态（发送记录仍可观察），不影响其余验收结论。
- **冷启动检查**：Node/npm 与 `package-lock.json` 由内置冷启动检查覆盖（新建项目采用 npm）。

## 开放问题（不阻塞设计）

- 是否存在跨公司运营/平台方视角（可查看多公司工单与统计）：需求未规定，本设计以"用户有权查看的公司集合 = 所属公司"为最小实现，预留筛选与统计的公司维度参数。
- 已取消工单是否可重开：需求未规定，本次不设计。
