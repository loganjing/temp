# 系统设计

> 工作项：wi-t1000333（业务任务 135-ticket 工单系统）。本文件将已批准需求基线 docs/wi-t1000333/requirements.md 落为最小可实施架构。接口与数据的字段级契约唯一来源为 docs/wi-t1000333/technical-contract.md；本文只保留接口摘要与架构结论。

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 应用类型与总体架构

- 分类结论：fullstack-complex。依据已批准需求：工单按公司隔离且其他公司直接访问不可见（需服务端权威边界与授权）；提交人与处理方对同一工单多轮回复（跨用户共享数据）；新工单按分类自动分配（服务端业务规则）；完成时发送通知邮件（外部集成）；操作日志审计；跨公司统计聚合。浏览器本地存储无法承载这些能力。
- 总体架构：单进程 Hono 服务承载 REST API 并托管前端静态资源；前端为 React/Vite 单页应用；SQLite 单文件数据库是唯一权威数据源；SMTP 邮件服务仅在工单完成通知时被同步调用。

### 1.2 技术栈（冻结）

| 层 | 选型 | 说明 |
|---|---|---|
| 运行时 | Node.js ≥ 20（ESM） | 单进程部署 |
| 后端 | Hono | REST API、静态资源、认证中间件 |
| 前端 | React + Vite SPA，Tailwind | 构建产物由服务端托管 |
| 数据 | SQLite（better-sqlite3，经 dbkit） | 单文件库；版本化 SQL 迁移 |
| 包管理 | npm（package-lock.json） | |
| 认证 | authkit + userkit（本地密码模式） | 密码登录、Bearer 认证、本地用户与凭证 |
| 审计 | auditkit | 操作日志持久化与敏感字段脱敏 |
| 邮件 | emailkit（nodemailer） | SMTP 完成通知 |

### 1.3 CommonApp 模块选择

已核查 CommonApp catalog 与各模块 manifest，所选模块状态均为 ready、依赖闭包与分发文件完整。选择闭包为 {dbkit, authkit, userkit, auditkit, emailkit}（userkit → dbkit + authkit；auditkit → dbkit；authkit/emailkit 无模块依赖）。

| 模块 | 包/版本 | 源路径（安装源） | 需求匹配 | 集成边界 | 限制 | manifest SHA-256 | 模块安装标记 |
|---|---|---|---|---|---|---|---|
| dbkit | @commonapp/dbkit 0.2.0 | modules/dbkit/install-manifest.json（分发目录 dbkit/distribution，安装到 vendor/@commonapp/dbkit） | 需要服务端权威数据、跨用户共享、关联查询与事务；选 SQLite 后由其提供配置、查询、事务与版本化迁移 | 全部数据访问经 dbkit；迁移位于应用包 src/server/migrations/sqlite/（含 userkit/auditkit 随包迁移） | 仅 SQLite 驱动；Node ≥ 20；better-sqlite3 ^11/^12 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | commonapp install: dbkit |
| authkit | @commonapp/authkit 0.1.2 | modules/authkit/install-manifest.json（分发目录 authkit/distribution，安装到 vendor/@commonapp/authkit） | 多角色身份是公司隔离与授权的前提；提供 Hono 密码登录与 Bearer 认证 | 认证中间件挂载于全部 /api 路由（登录除外） | hono ^4.6 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | commonapp install: authkit |
| userkit | @commonapp/userkit 0.1.0 | modules/userkit/install-manifest.json（分发目录 userkit/distribution，安装到 vendor/@commonapp/userkit） | 本地用户与密码凭证的唯一归属；随包迁移 0001_platform_users.sql | 账户/凭证 schema 由 userkit 拥有；工单域仅以 user_id 引用，不复制其表 | 依赖 dbkit + authkit；SQLite | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | commonapp install: userkit |
| auditkit | @commonapp/auditkit 0.1.0 | modules/auditkit/install-manifest.json（分发目录 auditkit/distribution，安装到 vendor/@commonapp/auditkit） | 需求 4.9 操作日志：持久化审计事件与脱敏 | 工单域通过其 API 写入事件；事件表由 auditkit 拥有（随包迁移 0003_platform_audit_events.sql） | 依赖 dbkit；SQLite | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | commonapp install: auditkit |
| emailkit | @commonapp/emailkit 0.1.0 | modules/emailkit/install-manifest.json（分发目录 emailkit/distribution，安装到 vendor/@commonapp/emailkit） | 需求 4.5 完成通知邮件：可配置 SMTP 发送 | 通知模块封装其客户端；SMTP 参数经环境变量 | nodemailer ^9.0.5 | a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | commonapp install: emailkit |

脚手架说明：authkit + userkit 本地密码组合由 workspace-init 生成登录、首个账户初始化与用户管理页面/API。已知限制：脚手架用户管理 API 仅要求登录、不校验角色，任何已登录用户可操作账户管理；公司/部门归属、业务组成员、分配规则等敏感写操作全部由本项目接口的授权检查控制，账户列表读取亦收敛到本公司管理员（见技术契约第 4 节）。审计与邮件的业务接线由本项目实现。

### 1.4 未选 CommonApp 模块

- permissionkit：本系统授权完全由数据驱动（公司隔离、业务组成员身份、公司管理员标记），在服务层实现检查即可；静态 RBAC 注册表无需求匹配收益。
- attachment（需求无附件）、i18n（需求无国际化）：无证据支持，不引入。

### 1.5 整体结构与调用方向

```
浏览器（React/Vite SPA）
   │  HTTP JSON（/api/**，Bearer 认证）
   ▼
Hono 单进程服务（Node ≥ 20）
   ├─ 身份与账户（authkit + userkit）
   ├─ 组织与权限（项目内实现）
   ├─ 工单领域（项目内实现）
   ├─ 统计分析（项目内实现）
   ├─ 审计（auditkit）
   └─ 通知（emailkit）
        │                      │
        ▼                      ▼
   SQLite 单文件库         SMTP 邮件服务
   （dbkit：查询/事务/迁移）  （仅工单完成通知）
```

调用方向：前端只调用 /api；工单领域调用组织与权限（授权计算）、审计（事件记录）、通知（完成邮件）；统计分析只读数据库；通知与审计不反向调用业务模块；不存在其他反向依赖。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

| 模块 | 唯一职责 | 唯一数据归属（权威） | 接口摘要（除注明外均为前端→服务） |
|---|---|---|---|
| 身份与账户（authkit + userkit） | 登录/登出/当前用户、账户与密码凭证管理 | userkit 拥有的用户与凭证表 | POST /api/auth/login、POST /api/auth/logout、GET /api/auth/me（经组织模块扩展组织档案与组信息）、用户管理接口（脚手架） |
| 组织与权限 | 公司、用户组织档案（公司/部门/管理员标记）、业务组与成员、问题分类、分类→业务组自动分配规则、可见范围与动作授权计算 | companies、user_org、business_groups、group_members、categories、assignment_rules | GET /api/categories；POST /api/groups、GET /api/groups；PUT /api/groups/:id/members；POST /api/assignment-rules、GET /api/assignment-rules；PUT /api/users/:id/org；GET /api/users |
| 工单领域 | 工单创建（事务内自动分配）、状态机强制、列表/详情/回复/转派/手工分配/完成/取消/评价、工作台查询、提交人完整信息与历史工单、工单日志读取 | tickets、ticket_replies、ticket_ratings | POST /api/tickets；GET /api/tickets；GET /api/tickets/:id；GET /api/tickets/:id/submitter-history；POST /api/tickets/:id/replies、/assign、/transfer、/complete、/cancel、/rating；GET /api/tickets/:id/logs |
| 统计分析 | 按公司/部门分布统计与运营指标聚合（只读） | 无独立表（聚合查询） | GET /api/stats/distribution；GET /api/stats/dashboard |
| 审计 | 工单关键操作事件持久化、查询、脱敏 | auditkit 拥有的事件表 | 工单领域→审计（内部写入）；GET /api/tickets/:id/logs（前端读取） |
| 通知 | 完成通知邮件（SMTP） | 无表 | 工单领域→通知（内部调用 sendCompletionEmail） |
| 前端 SPA | 页面、工作流与状态呈现 | 无（无数据权威） | 调用上述 /api |

### 2.1 数据隔离与授权摘要

- 全部 /api（登录除外）要求 Bearer 认证；身份来自 userkit 账户，组织档案来自 user_org。
- 公司隔离：提交人视图（列表/搜索/详情）仅返回本公司工单；越权直接访问按 404 响应，不区分"不存在"与"不可见"。
- 处理端可见性：处理人可见其作为成员的业务组所辖工单；组成员关系可跨公司（支撑跨公司工作台与统计的公司维度筛选）。公司配置管理员可见并管理本公司全部工单（含待分配）。
- 动作授权（回复/评价/完成/转派/手工分配/取消的执行者约束）与各状态前置由服务端在技术契约逐接口定义；服务端是唯一判定点，前端仅按返回能力呈现。

### 2.2 状态承载

- 工单状态（awaiting_assignment/pending/completed/cancelled，对应需求 3.2 的待分配/待处理/已完成/已取消）由工单领域模块在数据库事务内强制迁移合法性：创建后待分配，分配（自动或手工）后待处理，完成后终态；完成前可取消；非法迁移返回 409 且不落库。
- 平均响应时间口径所需的首次处理端回复时间（tickets.first_reply_at）在回复事务内维护；完成记录（处理人/处理时间）在完成事务内维护；完成邮件在事务提交后发送（见第 5 节）。

## 3. UI 全局基线

- 应用/业务模板：helpdesk（依据：需求为多公司工单服务台，核心动作是逐条处理工单记录）。
- 展示模板：split-master-detail（依据：工作台/工单页核心是列表队列与当前记录详情协同，含多轮回复时间线；实现阶段按该 ID 消费对应实现资源）。
- 视觉风格：Modern SaaS——柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色与状态色（状态色映射工单四状态与 P0-P4 优先级）、短而有反馈的动效。
- 应用壳与导航：左侧导航（工单、工作台、统计、配置[业务组/分配规则/用户]、用户管理）+ 顶部上下文栏（当前用户、所属公司、退出登录）+ 主工作区；工单列表/详情采用双栏协同布局（左列表右详情）。
- 主工作流：工单全流程（创建→自动分配→处理回复→完成→评价）、配置流（建业务组配成员、配分类规则）、运营流（工作台筛选检索、统计仪表盘）。
- 目标设备：桌面 Web（需求未要求移动端/窄屏，不做窄屏验收）。
- 全局状态：加载（列表骨架、操作进行中禁用）、空数据（含引导创建工单）、错误（网络/服务器错误与 403/404 无权限提示）、成功（操作反馈提示）；可能截断的主题/描述提供悬停标题与详情展开查看全文。
- 依据的需求事实：需求 4.1–4.9 的核心动作（创建、回复、分配/转派、完成、评价、统计、工作台）与界面验收场景。

## 4. 数据模型与迁移

- 权威数据源：SQLite 单文件库（默认 ./data/application.db，可用 DB_PATH 覆盖；打开前自动创建父目录）。表、列、约束、索引与事务清单见技术契约第 6 节。
- 迁移：全部 schema 变更经 dbkit 版本化 SQL 迁移（app/ticket-system/src/server/migrations/sqlite/，启动时执行 runMigrations），其中包含 userkit 随包迁移 0001_platform_users.sql、auditkit 随包迁移 0003_platform_audit_events.sql 及本项目工单域迁移；禁止 ORM 自动同步或手工改库绕过迁移。
- 种子：问题分类为固定集合，经迁移种子；公司（公司A/公司B）与示例账号（各公司提交人、处理人、公司配置管理员）由启动种子步骤在空库时幂等写入（经 userkit 用户 API 创建账户），保障干净目录可直接运行且验收身份就绪。公司生命周期不在需求范围内，不提供公司管理接口。
- 事务边界：工单创建（含自动分配与审计）、回复（含首次响应时间）、手工分配、转派、完成（状态与处理记录）、取消、评价均为单事务；完成邮件在事务提交后发送。

## 5. 外部集成（邮件）

- 触发：工单完成事务提交后，同步向提交人邮箱发送通知（emailkit/nodemailer；SMTP 参数经环境变量，见技术契约第 7 节）。
- 失败可见性：发送失败不回滚完成状态；完成接口响应携带通知结果（emailSent=false 与错误信息）；审计记录发送失败事件；不自动重试（限制，见技术契约）。

## 6. 运行与可靠性

- 应用包：app/ticket-system（packageRoot，机器可读事实见根目录 platform-baseline.json）；服务入口 app/ticket-system/src/server/index.ts，位于授权写入范围内。
- 常规启动（在应用包内执行）：`npm start`（node --import tsx src/server/index.ts，托管构建后的 SPA）；开发形态 `npm run dev:server`（tsx watch 热重启）与 `npm run dev:web`（vite 开发服务器）。
- 端口：服务监听端口经 PORT 环境变量配置。
- 数据库：默认 ./data/application.db；DB_PATH 环境变量覆盖（隔离验证使用独立路径）；启动时自动创建父目录并执行迁移与空库种子。
- 构建与验收命令：`npm run build`（typecheck + vite build，整体构建验收入口）与 `npm test`（node --import tsx --test test/*.test.mjs；测试自含隔离 HTTP 服务与数据库，验收时不额外后台启动服务）。验收使用空闲端口与独立 DB_PATH，等待真实监听就绪后执行，结束时仅清理本次启动的进程。
- 环境变量经 dotenv 加载（应用包依赖）；认证密钥（如 JWT_SECRET）经环境变量注入，脚手架在缺失时的默认值仅用于非生产环境。

### 6.1 工作区初始化记录

- 初始化输入：docs/wi-t1000333/workspace-bootstrap.json（新项目、hono + react-vite + tailwind、npm、模块 dbkit/authkit/userkit/auditkit/emailkit、本地密码身份模式）；文件 SHA-256 d87e45e902b0a23d3d95a6e4d23fdc7ae755776d8ee13ef76e4927c6523a1240。
- 初始化结果：成功（decision=initialized）。packageRoot app/ticket-system；planDigest sha256:d24c6a45d87a54db2109b6d6a2ecb6f9986561f5217b3294779d6fbe5cecc1e7；planSha256 sha256:d87e45e902b0a23d3d95a6e4d23fdc7ae755776d8ee13ef76e4927c6523a1240；scaffoldDigest sha256:0559b9e2dd940deddd63189736357e7fa8c3d81791c1d8c31f94e76e91426ca6。
- 通过的初始化校验：bootstrap-schema、module-distribution-files、scaffold-assets、source-layout-map、generated-scaffold-contract、npm install、npm run build、npm run test、workspace-merge、existing docs unchanged。
- 模块接线状态（platform-baseline.json，SHA-256 48c3fca4e954e3175555eaa618201cdd5bfe08679c7324f90699f6fe9c101ef8）：dbkit/authkit/userkit 为 wired，auditkit/emailkit 为 installed（工单域审计与邮件业务接线由本项目实现，见技术契约第 7、8 节）。
