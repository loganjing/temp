# 系统设计

<!-- system-design: scope -->
## 1. 整体方案与设计基线

**应用类型**：新建本地全栈应用（fullstack-complex）。服务端持有唯一权威数据，前端为 SPA，数据存于 SQLite 文件数据库，邮件经 SMTP 外部投递。

**技术栈（冻结）**：

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 服务端 | Hono（Node.js ≥20，ESM），入口 `app/ticket-system/src/server/index.ts` | REST API，Bearer 认证 |
| 前端 | React + Vite SPA | 桌面 Web，登录后进入应用壳 |
| UI 样式 | Tailwind CSS | 按展示模板 `split-master-detail` 实现 |
| 数据库 | SQLite 文件数据库，经 `@commonapp/dbkit` | 默认 `./data/application.db`，`DB_PATH` 可覆盖 |
| 认证 | `@commonapp/authkit` + `@commonapp/userkit`，本地密码模式 | 登录、Bearer token、用户存储 |
| 邮件 | `@commonapp/emailkit`（SMTP，nodemailer） | 空 `SMTP_HOST` 时投递降级为 skipped |
| 包管理 | npm | vendor 模块以 `file:` 依赖引入 |

**整体结构**：

```text
┌──────────────────┐  HTTP/JSON + Bearer  ┌───────────────────────────────┐
│  React SPA (Vite)│ ───────────────────▶ │  Hono 服务端 (index.ts)        │
│  登录 / 应用壳    │                      │  ┌─────────────────────────┐  │
│  工单 / 统计 / 配置│ ◀─────────────────── │  │ 应用模块                  │  │
└──────────────────┘                      │  │ auth-context / ticket    │  │
                                          │  │ assignment / notification│  │
                                          │  │ stats / admin            │  │
                                          │  ├─────────────────────────┤  │
                                          │  │ CommonApp vendor 模块     │  │
                                          │  │ authkit userkit dbkit    │  │
                                          │  │ emailkit                 │  │
                                          │  └─────────────────────────┘  │
                                          └──────────────┬────────────────┘
                                                         │
                                              ┌──────────▼──────────┐
                                              │ SQLite 数据库文件     │
                                              │ data/application.db  │
                                              └──────────┬──────────┘
                                                         │ 完成工单时
                                              ┌──────────▼──────────┐
                                              │ SMTP 邮件（emailkit） │
                                              └─────────────────────┘
```

**设计基线结论**：
- 公司隔离是所有数据访问的第一边界：每个用户归属唯一公司，服务端对所有工单域查询强制注入 `company_id` 过滤；跨公司资源访问统一返回 404，不泄露存在性。
- 工单状态机五态（创建、待分配、待处理、完成、取消）由服务端唯一裁决；分配流程拆为「进入分配」与「规则匹配」两步，保证每个状态可观察。
- 权威数据只在服务端 SQLite；前端不缓存跨页面状态，列表/详情均以服务端返回为准。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

模块职责、唯一数据归属与调用方向如下；method/path、字段、类型、错误与幂等细节以 `docs/wi-t1000316/technical-contract.md` 为唯一来源。

### 2.1 服务端模块（src/server/index.ts 装配）

| 模块 | 职责 | 唯一数据归属 | 对外公开能力 |
| --- | --- | --- | --- |
| auth-context | 集成 authkit 登录与 Bearer 校验；解析当前用户（公司、部门、角色）并构建请求上下文；路由角色守卫 | 无自有表（读取 userkit 用户 + `user_profiles` 扩展） | 认证中间件、`POST /api/auth/login`、`GET /api/auth/me` |
| ticket | 工单创建、列表查询（筛选/搜索/排序/分页）、详情（含提交人信息与历史工单）、多轮回复、完成、取消、评价 | `tickets`、`ticket_replies`、`ratings` | `/api/tickets` 及子资源 |
| assignment | 分配流程（进入待分配 + 公司级「分类→业务组」规则匹配）、转派 | `groups`、`group_members`、`company_categories`、`category_rules` | `POST /api/tickets/:id/dispatch`、`POST /api/tickets/:id/transfer`、`/api/groups`、`/api/category-rules`、`/api/categories` |
| notification | 完成通知邮件发送（emailkit）、发送记录落库与查询 | `notification_log` | 工单详情内嵌通知记录 |
| stats | 公司/部门维度分布、运营仪表盘指标聚合 | 无自有表（聚合查询 `tickets`/`ratings`/`ticket_replies`） | `GET /api/stats/dashboard`、`GET /api/stats/distribution` |
| activity | 工单关键操作日志（创建、分配、回复、转派、完成、取消、评价） | `ticket_activity` | `GET /api/tickets/:id/activity` |

调用方向：路由 → auth-context（认证与上下文）→ 业务模块 → dbkit 数据访问 → SQLite。业务模块之间只通过公开服务函数协作（如 ticket 完成时调用 notification 发送），不直读他模块私有表。

### 2.2 客户端模块（React SPA）

| 模块 | 职责 |
| --- | --- |
| 登录 | 用户名密码登录，获取并保存 Bearer token |
| 工单创建 | 提交人填写主题、描述，选择公司分类与 SLA 优先级（P0–P4） |
| 工单工作台 | 待处理工单列表（master）与详情（detail）协同；筛选、搜索、排序 |
| 工单详情 | 状态与优先级展示、提交人信息面板（姓名、公司、部门、历史工单）、多轮回复流、转派/完成/取消操作、评价入口、操作日志 |
| 我的工单 | 提交人视角的工单列表与完成后的满意度评价 |
| 统计分析 | 仪表盘指标（工单量、平均响应时间、满意度、热点问题）与分布视图（公司、部门维度） |
| 业务组配置 | 业务组与成员管理、分类清单、分类→业务组规则维护 |
| 用户管理 | userkit starter 生成的用户管理界面，应用层叠加角色守卫 |

### 2.3 CommonApp 模块使用边界

- `dbkit`：数据库创建、参数化查询、事务、版本化迁移的唯一入口；应用不直接使用 better-sqlite3。
- `authkit`：登录与 Bearer 认证；应用在其上下文之上叠加公司/角色守卫。
- `userkit`：本地用户与密码凭证存储；用户的公司、部门、角色、显示名、邮箱由应用侧 `user_profiles` 扩展承载。
- `emailkit`：仅负责 SMTP 投递；配置加载、发送记录、失败处理由应用 notification 模块负责（模块本身不重试、不持久化 outbox）。

## 3. UI 全局基线

- **应用/业务模板**：`helpdesk`（工单受理与处理业务）。
- **展示模板**：`split-master-detail`。主工作流为「工单列表（左/上 master）＋ 当前工单详情（右/下 detail）」协同：列表承载筛选、搜索、排序；详情承载回复流、提交人信息面板与全部操作。
- **视觉风格**：Modern SaaS——柔和中性色、细边界、少阴影、中等圆角、清晰字体；一个主色与状态色（P0–P4 用递进强调色，状态用语义色：待处理蓝、完成绿、取消灰、待分配橙）。动效仅用于操作反馈。
- **应用壳**：左侧导航（工单工作台、我的工单、统计分析、业务组配置、用户管理）＋ 顶部上下文栏（当前用户、公司、退出）＋ 主工作区。默认桌面 Web（≥1280px 设计基准）；需求未要求窄屏/移动端，不做该范围验收。
- **全局状态**：加载（骨架/加载态）、空数据（各列表空态文案）、错误（统一错误条，含 401 跳登录、404 显示「资源不存在或无权访问」）、成功（操作后轻量提示并刷新数据）。可能截断的文本（主题、描述）提供展开或悬停查看全文。
- **选择依据**：需求以「高频逐条处理工单」为核心动作（工作台筛选/搜索/排序＋详情处理），匹配 split-master-detail；业务后台无营销叙事诉求，取 Modern SaaS 默认视觉。

## 4. 数据模型与迁移

所有业务表以 `company_id` 贯穿，作为隔离边界；数据字典与约束细节见技术契约。

| 表 | 归属模块 | 要点 |
| --- | --- | --- |
| `companies` | 基础 | 公司（隔离边界） |
| `users`（userkit） | auth-context | 登录名、密码凭证（模块自有实现，应用经公开 API 访问） |
| `user_profiles` | auth-context | 用户扩展：`display_name`、`email`、`company_id`、`department`、`role`（submitter/agent/company_admin） |
| `groups` | assignment | 业务组（公司级） |
| `group_members` | assignment | 业务组成员 |
| `company_categories` | assignment | 公司级问题分类清单 |
| `category_rules` | assignment | 公司级「分类→业务组」规则，`(company_id, category)` 唯一 |
| `tickets` | ticket | 工单主体：编号、主题、描述、分类、优先级（P0–P4）、状态、提交人快照（姓名/邮箱/部门）、归属业务组、受理人、处理人、各时间戳 |
| `ticket_replies` | ticket | 多轮回复：回复人、身份类别、时间、内容 |
| `ratings` | ticket | 满意度评价：1–5 分，一工单一条 |
| `ticket_activity` | activity | 工单操作日志：操作类型、操作人、时间、详情 |
| `notification_log` | notification | 完成通知邮件发送记录：收件人、主题、结果三态、时间 |

**迁移策略**：全部 schema 变更使用版本化 SQL 迁移（`app/ticket-system/src/server/migrations/sqlite/` 递增编号），经 dbkit `runMigrations` 在启动时执行；不使用 ORM 自动同步或手工改 schema。userkit/authkit 自带迁移由 workspace-init 安装；应用表迁移由项目内迁移文件承载。演示/验收用的公司、用户、业务组与规则种子以幂等种子脚本提供（`npm run seed`）。

## 5. 外部集成：邮件

- 工单完成时由 notification 模块调用 `emailkit.send()`，向工单记录的提交人邮箱发送完成通知（主题含工单编号，正文含处理人与完成时间）。
- SMTP 参数经环境变量映射为显式配置对象：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`、`SMTP_FROM_NAME`；**`SMTP_HOST` 为空时投递自动降级为 skipped**，应用不报错、不阻塞完成操作。
- 每次发送（含 sent/skipped/failed）写入 `notification_log`，作为通知行为的可观察记录（emailkit 不持久化 outbox，此为应用职责）。发送失败不回滚工单完成，失败记录可查询。

## 6. 运行与可靠性

- **常规启动**：工作区根目录 `npm install` → `npm run build`（类型检查 + 构建前端）→ `npm start`（Hono 同时提供 API 与前端静态资源）。监听端口经 `PORT` 环境变量配置（默认 3000）。
- **数据库**：默认 `./data/application.db`；启动前自动创建父目录；`DB_PATH` 环境变量覆盖（隔离验证指向独立测试库，或 `:memory:` 临时检查）。
- **开发模式**：工作区根 `npm run dev`（同时启动 Vite dev（5173，`/api` 代理至 3000）与服务端 watch）。
- **种子数据**：`npm run seed`（实现阶段在应用包新增的脚本）幂等写入两家演示公司（A/B）、各公司提交人/处理人/配置用户、业务组、分类清单与自动分配规则，支撑公司隔离与统计验收。
- **隔离验证约定**：使用空闲端口、`DB_PATH` 指向临时库、运行种子脚本后执行验收动作；验收脚本负责启动与清理时不额外手动后台启动服务。
- **可观察性**：关键操作写 `ticket_activity`；邮件发送写 `notification_log`；服务端错误统一 JSON 错误结构，不向客户端暴露堆栈。

## 7. CommonApp 模块选择

已选模块（均为 `ready`，vendor 安装至 `vendor/@commonapp/<id>`，以 `file:` 依赖接入）：

| 模块 ID | 包/版本 | manifest SHA-256 | 需求匹配 | 集成边界与限制 |
| --- | --- | --- | --- | --- |
| dbkit | @commonapp/dbkit 0.2.0 | sha256:f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | 权威数据、结构化查询、事务、版本化迁移 | 仅支持 SQLite；应用只用其公开 API |
| authkit | @commonapp/authkit 0.1.2 | sha256:a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | 登录与 Bearer 认证（区分提交人/处理人身份） | 不含授权语义；公司/角色守卫由应用实现 |
| userkit | @commonapp/userkit 0.1.0 | sha256:40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 本地用户与密码凭证 | 依赖 dbkit+authkit；公司/部门/角色经应用 `user_profiles` 扩展 |
| emailkit | @commonapp/emailkit 0.1.0 | sha256:a9ccc93ac2553ad540e825b361d63d528ce888dcc3f749a83dead80c3563896c | 完成通知邮件（AC 邮件通知） | 不重试、不持久化 outbox；空 SMTP_HOST 降级为 skipped |

模块安装标记：`commonapp install: dbkit`、`commonapp install: authkit`、`commonapp install: userkit`、`commonapp install: emailkit`。

**未选模块及理由**：
- `permissionkit`：需求未规定 RBAC 体系；角色集合小且静态（submitter/agent/company_admin），以 `user_profiles.role` + 路由守卫的最小角色模型闭合，避免引入无对应需求的权限注册表配置。
- `auditkit`：其事件查询接口不支持按业务实体（工单）过滤，而验收要求按工单查询操作日志；工单级日志以项目内 `ticket_activity` 表实现，语义与查询完全匹配。
- `attachment`、`i18n`：需求无附件与国际化要求。

**已知的 starter 限制**：workspace-init 在同时选择 authkit+userkit 时生成的用户管理 API 仅做登录认证、不校验角色（任何登录用户可操作）。工单应用在实现阶段必须对用户管理路由叠加 `company_admin` 角色守卫（应用层中间件），并在架构基线中作为固定约束传递给实现与验证阶段。

## 8. 关键设计取舍

1. **两步分配流程**：创建 API 落库为「创建」态并返回；前端创建成功后自动调用 dispatch（进入分配流程：置「待分配」并执行规则匹配，命中则归属业务组置「待处理」，未命中停留「待分配」）。拆步保证五个状态各自可观察，同时保持「提交后自动分配」的用户体验；dispatch 幂等（仅「创建」态可执行）。
2. **公司隔离实现**：服务端在认证上下文中携带用户公司，所有工单域查询强制 `company_id` 等值过滤；跨公司资源访问返回 404（不确认存在性），列表天然不含他司数据。
3. **工单级操作日志**：`ticket_activity` 表 + `GET /api/tickets/:id/activity` 按工单查询（覆盖创建、分配、回复、转派、完成、取消、评价），替代 auditkit（其查询维度不匹配按工单过滤的验收语义）。
4. **邮件通知可观察性**：emailkit 只投递不记录；应用以 `notification_log` 记录收件人、主题与三态结果（sent/skipped/failed），使「完成并发送邮件」在无 SMTP 的验证环境下仍可核验（skipped 记录 + 可选真实 SMTP）。
5. **统计口径**（需求推荐口径的技术承载）：平均响应时间 = 创建→首次回复的平均分钟数（无回复工单不计入）；满意度 = 已评价工单平均分；热点问题 = 按分类聚合工单量降序前十；分布统计在公司隔离范围内聚合（公司维度呈现本公司聚合，部门维度按提交人部门聚合）。
