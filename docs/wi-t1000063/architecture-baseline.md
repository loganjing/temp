# 系统设计 · Helpdesk 企业工单系统（WorkItem: wi-t1000063）

> **设计依据**：`docs/wi-t1000063/requirements.md`（已批准需求基线，SHA-256 `55441ef7b5aeac1ba70a7617e5f7f844494d1cdf414a71808d1174216844762f`）。本文只确定技术承载方式：整体架构、模块边界、数据归属、运行约定与接口摘要。业务规则、状态机语义、验收场景一律以需求基线为准，本文不复制、不重裁。
>
> **结构化设计结论**：`mode=design`，`decision=ready`，`artifacts=[architecture-baseline.md, technical-contract.md]`，`internalArtifacts=[workspace-bootstrap.json]`。

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 应用类型与路线

应用分类为 **fullstack-complex**（routeId `full`，已由分类操作固定）。依据：需求明确要求服务端权威数据与后端强制权限校验（§2.3/§8/AC-17）、固定四角色登录（§2）、后台定时任务（AC-07）、异步 SMTP 邮件（§6.5/AC-20）、灵基 MCP 外部集成（§7.3/AC-22）以及跨用户/跨设备工单流转与重启不丢失的分配游标（§6.2/AC-03）。浏览器本地存储路线的全部前提不成立。

### 1.2 技术栈（冻结）

| 层 | 选型 | 冻结理由 |
|---|---|---|
| 服务端 | Node.js ≥20 + Hono 4（ESM） | 新建且需要服务端能力的应用采用 Hono；单进程承载 REST API、SPA 静态资源与 MCP 端点 |
| 前端 | React 18 + Vite SPA + Tailwind CSS | 标准工作台与嵌入式工作台同属一个 SPA，按路由区分外壳与否 |
| 数据库 | SQLite（better-sqlite3，经 dbkit） | 单机企业内部系统，服务端唯一权威数据源；需要事务与结构化查询，无外部数据库要求 |
| 通用能力 | CommonApp 模块（见 1.3） | 复用登录/凭证/附件/审计/i18n 通用能力；工单领域逻辑全部项目内实现 |

### 1.3 CommonApp 模块选择

所有候选已通过 manifest 与依赖闭包核查（catalog + manifests 一次性核查，全部 `ready`）。选择结果与集成边界：

| 模块 | 包 / 版本 | 需求匹配 | 集成边界 | manifest SHA-256 |
|---|---|---|---|---|
| `dbkit` | `@commonapp/dbkit` 0.2.0 | 服务端权威数据、事务（状态流转+活动日志原子写入）、版本化迁移（AC-03 游标持久化） | `createDb(createDbConfig({driver:'sqlite', sqlitePath: DB_PATH}))`；迁移目录 `src/server/migrations/sqlite/`（包内，平台模块迁移已随初始化就位）；所有业务 SQL 项目内编写，禁用 ORM 自动同步 schema | `sha256:f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6` |
| `authkit` | `@commonapp/authkit` 0.1.2 | 密码登录、Bearer API 认证、灵基 MCP 端点（AC-21/AC-22） | `createAuth` 挂载 Hono，提供登录/Bearer 中间件；MCP 端点注册项目内「创建工单」工具 | `sha256:a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02` |
| `userkit` | `@commonapp/userkit` 0.1.0 | 本地用户与密码凭证存储 | `createUserStore`/`createUserResolver` 承载登录凭证；业务属性（角色/公司/双语姓名/启停）在项目内用户表，与凭证按用户 ID 关联 | `sha256:40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4` |
| `attachment` | `@commonapp/attachment` 0.5.4 | 附件上传/下载/存储（单文件 10MB 上限，AC-01）+ React 上传组件 | `createAttachmentRoutes` 提供上传/下载路由；存储目录 `./data/attachments/`；MCP 附件 URL 下载复用同一存储与元数据表 | `sha256:6b8e8709a18f4837348ffe342f428b5117d268e2b73db21dd1f0f21a3059eb36` |
| `auditkit` | `@commonapp/auditkit` 0.1.0 | 配置审计日志（仅管理员可见，§6.12/AC-18） | `createAuditKit` 记录部门/用户/分类/SLA/日历/分配规则等配置类变更事件 | `sha256:27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1` |
| `i18n` | `@commonapp/i18n` 0.1.0 | 界面中英文切换（§6.13/AC-19） | `createI18n`（react-i18next）承载界面文案双语；双语业务字段的取值回退逻辑项目内实现 | `sha256:6c5ff081ef93bbb9f2244ede9304548c76a304ede016146460cabe4222ac36f6` |

**不选 `permissionkit`**：需求的后端权限校验是「角色 + 对象关系（本人提交/本人处理/本组）+ 工单当前状态」的三重门控，其中经理的「本组」范围需动态计算（所属 Team ∪ 管辖部门）。通用 RBAC 注册表只覆盖角色→权限点一层，无法承载对象级规则，双轨并存反而扩大口径不一致风险（§8 可对账原则）。全部写操作的后端校验由项目内统一权限 guard 模块实现（见 §2）。

**依赖闭包**（含传递依赖）：`dbkit`、`authkit`、`userkit`(→dbkit, authkit)、`attachment`(→dbkit)、`auditkit`(→dbkit)、`i18n`。闭包含 `dbkit` 且本项目为新建项目，`identityMode=local-password`，按 `docs/wi-t1000063/workspace-bootstrap.json` 执行一次性工作区初始化（脚手架、依赖安装、构建与测试由初始化工具在合并前完成检查）。

### 1.4 项目与入口布局

- 应用包根：`app/helpdesk/`（由 workspace 初始化生成的 `packageRoot`，npm workspaces 单包；包级 `AGENTS.md` 描述包内地图）。
- 服务端：`app/helpdesk/src/server/`（入口 `src/server/index.ts`，监听 `PORT` 默认 3000；路由/平台绑定/迁移均在服务分区，禁止引用客户端代码）。
- 前端：`app/helpdesk/src/client/`（Vite React，构建产物 `dist/` 由服务端静态托管并作 SPA 回退）；`/` 标准工作台、`/embed/workbench` 嵌入式工作台均为 SPA 路由。
- 共享契约：`app/helpdesk/src/shared/`（平台无关的类型/常量/语言资源，服务端与客户端共用，禁止引入 Node/React 特定 API）。
- 迁移：`app/helpdesk/src/server/migrations/sqlite/*.sql`（dbkit 约定目录），所有 schema 变更走版本化迁移。
- 运行时数据：`app/helpdesk/data/`（`application.db` 与 `attachments/`），已加入 git 忽略；服务打开数据库前自动创建父目录。

### 1.5 运行约定

| 项 | 约定 |
|---|---|
| 常规启动（开发） | 工作区根 `npm run dev`（并行 Vite dev server:5173 与 Hono 服务:3000，前端开发代理 `/api`） |
| 常规启动（生产） | 工作区根 `npm run build && npm start`（构建前端后由 `app/helpdesk/src/server/index.ts` 同时托管 API 与静态资源） |
| 端口 | `PORT` 环境变量，默认 3000；验收/联调使用空闲端口 |
| 数据库路径 | `DB_PATH` 环境变量，默认 `./data/application.db`（相对应用包运行目录）；打开前自动创建父目录；隔离测试用独立 `DB_PATH` 文件覆盖（`:memory:` 仅限测试） |
| 附件目录 | `app/helpdesk/data/attachments/`（attachment 模块存储，元数据入库） |
| 附件上限 | 单文件 10MB，服务端强制（超出 413） |
| 验收命令 | 与常规启动分开记录；验收脚本自行负责启动与清理（等待真实端口监听就绪，只清理本次启动的进程），验收时不额外执行 `npm start` 或后台常驻命令 |
| 干净目录 | 无需人工预建 `data/` 目录即可启动 |

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

### 2.1 整体结构

```text
┌──────────────────────────── 浏览器 ────────────────────────────┐
│  React SPA（Vite + Tailwind，i18n 界面双语）                    │
│   ├─ 标准工作台 /            左侧导航 + 主工作区（全角色）      │
│   ├─ 嵌入式工作台 /embed/workbench  无外壳独立视图（仅提交人）  │
│   └─ API 客户端（fetch + Bearer Token）                         │
└──────────────┬─────────────────────────────────────────────────┘
               │ REST /api/*（Bearer）        │ MCP 端点（灵基智能体）
┌──────────────▼─────────────────────────────────────────────────┐
│  Hono 服务端（单进程 Node ≥20）                                 │
│   ├─ authkit：登录 / Bearer 中间件 / 灵基 MCP 端点              │
│   ├─ REST 路由层：工单 · 组织用户 · 分类规则 · SLA 日历 · 统计  │
│   │                · 审计 · 附件 · 嵌入工作台聚合               │
│   ├─ 领域服务层（项目内）：权限 guard · 状态机 · 分配引擎       │
│   │                        · SLA 引擎 · 统计查询服务            │
│   ├─ 后台任务：待确认超时扫描 · 异步邮件发送                    │
│   └─ dbkit：SQLite 查询 / 事务 / 版本化迁移                    │
│         ├─ src/server/migrations/sqlite/*.sql                  │
│         └─ data/application.db（+ data/attachments/）           │
└──────────────┬──────────────────────────┬──────────────────────┘
               │ SMTP（可选，异步发送）   │ 附件 URL 下载（MCP 场景）
           邮件服务器                 外部文件源
```

### 2.2 模块职责、数据归属与接口摘要

所有 REST 接口的字段级契约（method/path、请求/响应字段、类型、可空性、错误码、授权语义、幂等行为）以 `docs/wi-t1000063/technical-contract.md` 为唯一来源，本节只保留职责、唯一事实归属与调用方向。

| # | 模块 | 职责（唯一事实归属） | 接口摘要（调用方向：前端/外部 → 服务端） |
|---|---|---|---|
| M1 | 认证与会话（authkit + userkit） | 登录、Bearer 令牌、会话用户读取；密码凭证唯一归属 | `POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me`；MCP 会话认证 |
| M2 | 权限 guard（项目内） | 全部写操作的后端强制校验：角色 + 对象关系（本人/本组动态=所属 Team ∪ 管辖部门）+ 工单状态；休假目标校验（409）；不拥有独立数据，读取组织与工单事实 | 被各写路由调用的内部守卫层，无独立 API |
| M3 | 组织与用户（项目内） | BG→公司树、部门（经理、分配模式配置项、启停）、Team/成员、用户（角色/公司/启停/双语名）、休假（区间+自动回复文案）；Team 候选池规则 | `/api/org/*`、`/api/admin/users*`（含批量导入导出） |
| M4 | 分类与分配规则（项目内） | 一级/二级分类（不含分配字段）、分配规则（一级分类→多目标 Team）、系统骨架分类过滤 | `/api/admin/categories*`、`/api/admin/assignment-rules*`（含 CSV） |
| M5 | 工单域（项目内） | 草稿（仅创建人可见）、幂等提交、8 态状态机、回复、待确认超时关闭、评价、时间线聚合；工单及回复/活动/评价数据的唯一归属 | `/api/tickets*` 全组接口；`GET /api/tickets/{id}/timeline` |
| M6 | 分配引擎（项目内） | 提交时一次执行：规则匹配（一级分类）→ 多 Team 轮询（游标持久化）→ 成员过滤（启用+非部门经理+非休假）→ 经理兜底 → 待分配失败记录；人工指派/转派的休假校验复用同一过滤 | 提交流程内部组件；`POST /api/tickets/{id}/assign`、`POST /api/tickets/{id}/transfer` |
| M7 | SLA 引擎（项目内） | 双时钟（首次响应/解决）起算与截止计算（工作日历：工作日集合+每日时段+节假日+时区）、挂起暂停/恢复顺延/未响应补记、在线改分类重算、完成结果判定（按时/超时）、预警阈值 | 嵌入工单读写流程；日历与节假日管理 `/api/admin/calendar*`；SLA 策略 `/api/admin/sla-policies*` |
| M8 | 统计服务（项目内） | Dashboard KPI/排行/告警卡片的统一查询构建：唯一「今日」口径（按工作日历时区的自然日）、数字与下钻明细共用同一查询谓词（可对账）、草稿排除 | `GET /api/dashboard/summary`、`GET /api/dashboard/breakdown` |
| M9 | 通知（项目内） | 仅两个动作点异步邮件（提交→提交人确认+当场分配成功→处理人；回复→对侧）；无 SMTP 配置静默跳过、失败仅记日志；不拥有业务数据 | 流程内部组件，无独立 API |
| M10 | 审计（auditkit + 项目内活动日志表） | 工单活动日志（项目内表，随工单查看权限开放）+ 配置审计日志（auditkit 事件，仅管理员） | `GET /api/tickets/{id}/activities`、`GET /api/audits/config*` |
| M11 | 嵌入工作台聚合（项目内） | 提交人视角 KPI/看板/列表聚合（看板条数上限与截断标记）；无独立数据，读工单域 | `GET /api/embed/summary`、`GET /api/embed/kanban` |
| M12 | MCP 集成（authkit + 项目内） | 灵基智能体创建工单工具：常规字段 + `attachmentUrl(s)` 下载挂接（下载尽力执行，失败记日志不阻塞工单创建） | authkit MCP 端点注册 `create_ticket` 工具 |
| M13 | 附件（attachment 模块） | 附件上传/下载/存储；元数据（归属工单/回复、来源 upload/mcp-download）；10MB 上限 | `POST /api/attachments`、`GET /api/attachments/{id}/download` |

### 2.3 关键横切约定

- **写路径统一顺序**：REST 路由 → M2 权限 guard → 领域服务（状态机/分配/SLA）→ dbkit 事务（业务写入 + 活动日志）→ 事务提交后触发通知（异步）。校验失败在任何写入前返回。
- **读路径统一范围**：所有列表/统计查询先按角色计算数据范围（本人/本人处理/本组动态/全局；草稿恒为创建人本人），再叠加筛选参数；统计与明细共用同一范围与谓词构建器。
- **时间**：库内统一存 UTC（ISO 8601）；「今日」与 SLA 日历计算统一使用工作日历配置的时区（默认 Asia/Kuala_Lumpur）；接口输出的倒计时文案由服务端生成，避免前端各自计算。

## 3. UI 全局基线

| 维度 | 结论 | 依据（需求事实） |
|---|---|---|
| 应用/业务模板 | `helpdesk` | 工单系统（§1） |
| 展示模板 | `split-master-detail` | 高频逐条处理记录（工单箱、工单详情与回复流协同；§3/§6.3/AC-11） |
| 视觉预设 | **Modern SaaS**：柔和中性色、细边界、少阴影、中等圆角、一个主色 + 状态色（成功/警告/危险）、短而有反馈的动效 | 通用业务后台默认；无品牌叙事/沉浸需求 |
| 应用壳 | 左侧导航（按角色裁剪入口：提交人工单/草稿；专员处理队列；经理部门工单箱+团队管理；管理员全局+全部配置页）+ 顶部上下文栏（当前用户/语言切换）+ 主工作区 | §2 权限矩阵 |
| 嵌入式工作台 | `/embed/workbench` 独立路由：无侧边导航、无面包屑，看板 4 列 ↔ 列表视图切换；唯一外跳为灵基智能体入口且发生在最外层窗口 | §7/AC-21 |
| 设备策略 | 桌面 Web 优先；未要求移动端/窄屏验收范围 | 需求无窄屏要求 |
| 全局状态 | 加载（骨架/spinner）、空数据（含搜索无结果）、错误（可重试）、无权限（入口隐藏 + 后端 403 文案）、成功反馈（toast）；状态徽标体系（SLA 正常/预警/超期/按时/超时） | §6.3/§6.9/AC-15 |
| 截断处理 | 可能截断的长文本（主题、描述、备注、名称）提供悬停 title 或展开查看 | §6 列表展示 |
| 界面语言 | 中/英切换（i18n 模块）；双语业务字段展示按当前语言优先、缺失回退另一语言，不显示空白 | §6.13/AC-19 |

Dashboard 页在 split-master-detail 全局壳内呈现：KPI 卡行 + 双维度 SLA 告警卡 + 排行图表 + 下钻明细联动，下钻后进入主工作区的明细列表。

## 4. 数据模型与迁移

### 4.1 实体与关键关系（SQLite，经 dbkit）

- **组织**：`companies`（自引用树，编码唯一）；`departments`（含经理关联表 `department_managers`、分配模式配置项仅存储）；`teams`（归属部门）；`team_members`。
- **人员**：`users`（业务属性：双语姓名/邮箱/手机/角色/公司/启停；凭证由 userkit 承载，按用户 ID 关联）；`vacations`（用户休假区间 + 自动回复文案，仅存储）。
- **分类与规则**：`categories`（编码/双语名/所属部门/工单类型/排序/启停/骨架标记，**无任何分配字段**）；`subcategories`；`assignment_rules` + `assignment_rule_targets`（一级分类 → 多 Team）；`round_robin_cursors`（Team 级与 Team 成员级轮询游标，持久化）。
- **SLA 与日历**：`sla_policies`（挂一级分类：首次响应/解决时限 + 预警阈值）；`work_calendar`（单行：工作日集合/每日起止/时区）；`holidays`（节假日）。
- **工单域**：`tickets`（双语主题、描述、分类/二级分类、优先级、状态、提交人/处理人/Team/部门、幂等键唯一约束、首次响应/解决/关闭时间、两条 SLA 截止时间）；`ticket_sla_pauses`（挂起区间，用于顺延与补记）；`replies`（普通回复/解决提交说明/驳回原因，kind 区分）；`ticket_activities`（动作/操作人/前后状态/字段前后值/中英文备注/来源）；`ratings`（每工单一行，含系统默认好评标记）；附件元数据表（attachment 模块约定，含归属工单/回复、来源）。
- **审计**：配置审计事件表由 auditkit 管理。
- **通知**：无独立持久化（进程内异步发送，失败记日志）。

### 4.2 事务与一致性

- 状态流转、分配、挂起/恢复、改分类（重算 SLA）等复合写操作在单一 dbkit 事务内完成：工单行更新 + 活动日志插入 + 游标更新必须原子提交。
- 提交幂等：`tickets.idempotency_key` 唯一约束，重复提交键返回原工单，不重复路由。
- 后台扫描关闭与系统默认好评在同一事务内写入。

### 4.3 迁移策略

- 全部 schema 变更通过 `app/helpdesk/src/server/migrations/sqlite/` 版本化 SQL 文件交付（dbkit `runMigrations`），服务启动时执行；禁止 ORM 自动同步或手工改 schema。平台模块迁移（用户、审计事件）已随初始化就位，业务表迁移按序追加。
- 种子数据（管理员账号、默认工作日历、系统骨架分类）走迁移内的显式 INSERT，保证干净目录首启即可运行。

## 5. 外部集成

| 集成 | 触发 | 行为与失败可见性 |
|---|---|---|
| SMTP 邮件 | 工单提交（提交人确认邮件；当场自动分配成功时处理人分配邮件）、工单回复（通知对侧） | 进程内异步发送，不阻塞主流程；未配置 SMTP 主机静默跳过（debug 日志）；发送失败仅记 error 日志，工单操作仍成功；分配以外的状态流转与 SLA 预警/超期不发信 |
| 灵基 MCP | 智能体调用 `create_ticket` 工具 | 创建并提交工单（等价草稿创建+提交流程）；`attachmentUrl`/`attachmentUrls` 由服务端下载后挂到工单/回复名下（复用 attachment 存储）；下载失败记日志并在活动日志注明附件未挂接原因，不阻塞工单创建；不带链接时行为与常规创建一致 |
| 附件 URL 下载 | 仅 MCP 场景 | 服务端发起 HTTP 下载，受 10MB 单文件上限约束，超限或失败按上行的失败可见性处理 |

## 6. 运行与可靠性

- **待确认超时自动关闭**：服务进程内周期扫描（默认间隔 5 分钟，可配），将进入「待确认」超过配置时长（默认 24 小时）的工单关闭并生成系统默认好评；扫描周期性执行而非一次性；每轮扫描批量处理并在活动日志记录来源 `system`。
- **服务重启一致性**：轮询游标、SLA 截止时间、挂起区间均落库，重启不重置、不重算（挂起中的工单恢复时按区间顺延，与何时重启无关）。
- **后台任务失败**：扫描轮失败记 error 日志后下一轮继续，不影响 HTTP 服务。
- **可观测性**：结构化日志（请求日志 + 领域事件 + 邮件/下载失败）；配置审计事件（auditkit）。

> 字段级 API 契约、错误码表、CSV 格式与 MCP 工具入参详见 `docs/wi-t1000063/technical-contract.md`。
