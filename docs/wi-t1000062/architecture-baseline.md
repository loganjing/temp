# Land 地产投资测算与拿地决策平台 · 架构基线

- WorkItem：wi-t1000062（业务任务 land-1）
- 需求基线：`docs/wi-t1000062/requirements.md`（sha256:2b3c43cd74e089f467363da27a36807017364a25956bc59e110205d30791016d）
- 路线结论：`fullstack-complex`（routeId `full`）。分类证据：7 类用户角色与 RBAC（需求第 2 章、M18）、审批与权限隔离（M15，AC-06/AC-08/AC-10 均含 authorization 证据）、公司资产跨用户共享（横切规则 4）、采用方案与决策记录永久保留与审计（横切规则 3、M15）、口径参数版本化与历史复现（AC-14）。浏览器本地存储无法承载上述能力，走完整全栈路线。
- 字段级 API 契约：`docs/wi-t1000062/technical-contract.md`（本文仅保留接口摘要与调用方向）。

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 技术栈

新建应用，服务端承载权威数据、权限、审计与计算：

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 服务端 | Hono（Node ≥ 20，ESM） | REST API、角色权限校验、状态机、计算引擎 |
| 前端 | React + Vite SPA | 桌面 Web 单页应用 |
| UI 样式 | Tailwind CSS | 全局视觉与组件样式基线 |
| 包管理 | npm | 冷启动检查基于 `package-lock.json` |
| 数据库 | SQLite（dbkit，better-sqlite3） | 唯一权威数据存储；版本化 SQL 迁移 |
| 认证 | authkit + userkit（`identityMode: local-password`） | 本地用户与密码，Bearer 会话 |
| 权限 | permissionkit | 7 类角色的项目级 RBAC |
| 审计 | auditkit | 状态变更、审批、参数变更等审计事件（敏感字段脱敏） |
| 附件 | attachment | 地契、规划资料、报价、会议材料、照片等上传下载 |

测算计算引擎位于服务端：快速评估、正式测算、方案比较、敏感性与目标反算全部由服务端确定性计算，并在正式化/采用时冻结结果快照；前端只负责输入采集与结果展示（决策 D1）。

### 1.2 CommonApp 模块选择

全部候选模块 manifest 核查通过（状态 ready、依赖闭包与分发文件存在）：

| 模块 ID | 包/版本 | 需求匹配 | 集成边界 | manifest SHA-256 | 模块安装标记 |
| --- | --- | --- | --- | --- | --- |
| dbkit | @commonapp/dbkit 0.2.0 | 全部业务对象的权威持久化、事务、版本化迁移（横切规则 3 永久保留） | 服务端数据层；SQLite 驱动；`DB_PATH` 配置 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | commonapp install: dbkit |
| authkit | @commonapp/authkit 0.1.2 | 登录会话与 Bearer 认证（M18） | Hono 中间件；本地密码模式 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | commonapp install: authkit |
| userkit | @commonapp/userkit 0.1.0 | 本地用户与凭证（M18） | 依赖 dbkit+authkit；SQLite | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | commonapp install: userkit |
| permissionkit | @commonapp/permissionkit 0.1.0 | 7 类角色 RBAC 与授权（M15 权限原则、M18） | 依赖 dbkit；项目定义角色与权限码 | 09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 | commonapp install: permissionkit |
| auditkit | @commonapp/auditkit 0.1.0 | 审批、状态、参数变更审计留痕（M15 审计要求） | 依赖 dbkit；事件表+脱敏 | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | commonapp install: auditkit |
| attachment | @commonapp/attachment 0.5.4 | 地块附件上传下载（M01/M02） | 依赖 dbkit；Hono 路由挂载；本地文件存储+元数据 | 6b8e8709a18f4837348ffe342f428b5117d268e2b73db21dd1f0f21a3059eb36 | commonapp install: attachment |

限制：dbkit 仅支持 SQLite（不适用于 PostgreSQL）；`identityMode` 取 `local-password`（外部 SSO 属可选未来扩展，需求未规定）；i18n 模块未选用（需求为中文单语，无国际化要求）。

工作区初始化（workspace-init）：本 execution 的源码写入范围限定为 `docs/wi-t1000062` 与 `.expert-team/work-items/wi-t1000062`，应用脚手架的创建与批准初始化留待实施阶段由 Execution Agent 执行。初始化配置（与 `workspace-bootstrap` schema 一致）冻结如下，供实施阶段一次性执行：

```json
{
  "schemaVersion": 1,
  "projectType": "new",
  "appName": "land",
  "framework": "hono",
  "frontendFramework": "react-vite",
  "uiFramework": "tailwind",
  "packageManager": "npm",
  "modules": ["dbkit", "attachment", "authkit", "userkit", "permissionkit", "auditkit"],
  "identityMode": "local-password"
}
```

### 1.3 UI 全局基线

- **展示模板**：`split-master-detail`。主工作流为“地块台账列表（搜索/筛选/核心摘要列）→ 当前地块详情工作区”；详情区内按业务对象切换子区（档案、地图、市场、快速评估、方案与测算、审批、看板）。
  - 详情区内的专用工作区变体：正式测算采用“输入区与结果区并列”（实时联动，约束校验提示内联显示）；方案比较采用多列并排差异表，可从任一列下钻该方案明细；管理层看板采用结论优先布局（结论/核心指标/推荐方案/风险/下一步在最前，明细与历史在后）；敏感性分析采用“维度与范围输入 + 结果矩阵”布局，目标利润率线颜色规则可配置。
- **视觉预设**：Modern SaaS——柔和中性色、细边界、少阴影、中等圆角、清晰字体、一个主色加状态色（成功/警告/危险/待确认），短而有反馈作用的动效；数据密度优先于装饰。
- **布局与设备**：桌面 Web。应用壳为左侧导航（按业务域分组：机会池、市场、测算与方案、决策、交接、管理后台）+ 顶部上下文栏（当前地块/方案上下文与关键状态徽标）+ 主工作区。管理层移动端问答属第三阶段（M17/P1 后续），不在本基线 UI 验收范围。
- **关键全局状态**：加载（骨架/进度）、空数据（引导下一步动作）、错误（可重试并显示原因）、无权限（只读提示与说明）、成功（轻提示）；表格截断文本提供悬停标题或展开查看全文（如方案名称、假设标签、来源说明）。
- **选择依据**：M01 台账列表+筛选+从列表进入各业务区；第 1.3 节两层使用体验（业务人员操作密集 vs 管理层结论优先）；M14 看板“结论与核心指标优先、详细计算在后续区域”。
- 实现阶段按展示模板 ID `split-master-detail` 读取对应 UI 实现资源；Builder 不得替换本基线。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

```text
┌─ React/Vite SPA（桌面 Web）─────────────┐        ┌─ Hono 服务端 ────────────────────────────┐
│ 左侧导航 + 上下文栏 + 主工作区            │  HTTP  │ identity   parcel    map      market     │
│ 台账/档案/地图/市场/快速评估/测算/比较/    │ ─────▶ │ assessment plan     analysis  approval    │
│ 敏感性/看板/审批/交接/参数与用户管理       │  JSON  │ report     parameters  ai(P1)            │
└─────────────────────────────────────────┘        │ └─ 计算引擎（服务端确定性计算+快照）        │
                                                   │ CommonApp：dbkit attachment authkit        │
                                                   │ userkit permissionkit auditkit             │
                                                   │ → SQLite（./data/land.db）+ 附件文件存储   │
                                                   └───────────────────────────────────────────┘
                                                   外部：开放地图瓦片/外部地图链接；AI provider（P1）
```

| 模块 | 职责 | 唯一数据归属 | 公开接口（摘要） |
| --- | --- | --- | --- |
| identity | 认证会话、用户与角色管理 | users、roles、user_roles、permission_rules（CommonApp 表） | `POST /api/auth/login`、`GET /api/auth/me`、`/api/users`、`/api/roles` |
| parcel | 地块机会台账、状态机、地块档案与核查清单、状态变更留痕 | parcels、parcel_profile、parcel_status_history | `/api/parcels`（列表/新建）、`/api/parcels/:id`、`POST /api/parcels/:id/status`、`/api/parcels/:id/profile`、`/api/parcels/:id/audit` |
| map | 地块位置/边界/标记与报告地图视图快照 | parcel_map（GeoJSON、标记、视图快照） | `/api/parcels/:id/map`、`/api/parcels/:id/map/views` |
| market | 土地交易参考与竞品资料（来源、日期、成交/挂牌、可信度） | market_land_refs、market_comps | `/api/parcels/:id/market/land-refs`、`/api/parcels/:id/market/comps` |
| assessment | 快速评估输入、服务端试算、多机会组合视图 | quick_assessments | `/api/parcels/:id/quick-assessments`、`POST /api/quick-assessments/:id/compute`、`GET /api/quick-assessments`（组合视图） |
| plan | 方案（期次/业态产品/车位/九类成本/公共分摊）、版本链、正式化校验、冻结快照 | plans、plan_phases、plan_products、plan_cost_items、plan_parking、plan_common_pools、plan_snapshots | `/api/parcels/:id/plans`、`/api/plans/:id`、`POST /api/plans/:id/copy`、`POST /api/plans/:id/formalize`、`GET /api/plans/:id/results` |
| analysis | 方案比较、敏感性矩阵、目标利润率反算 | 无权威数据（读 plan 域输入，服务端实时计算） | `POST /api/plans/compare`、`POST /api/plans/:id/sensitivity`、`POST /api/plans/:id/back-solve` |
| approval | 审批提交、审批动作（采用/退回）、决策记录、地块状态联动 | submissions、submission_actions、decision_records | `POST /api/parcels/:id/submissions`、`POST /api/submissions/:id/approve`、`POST /api/submissions/:id/return`、`GET /api/parcels/:id/decision-record` |
| report | 管理层看板、投资报告聚合、下游交接与受控导出 | handoff_exports（看板/报告为实时聚合只读） | `GET /api/parcels/:id/dashboard`、`GET /api/parcels/:id/report`、`/api/parcels/:id/handoff`、`GET /api/parcels/:id/handoff/export` |
| parameters | 州属面积口径、成本套餐、政策比例、费用项的版本化参数 | parameter_sets | `GET/POST /api/parameters`、`GET /api/parameters/:id`、`POST /api/plans/:id/area-convention` |
| ai（P1 预留） | AI 资料整理与方案建议的“待确认→确认”流转 | ai_suggestions | `POST /api/ai/suggestions`、`POST /api/ai/suggestions/:id/confirm`、`POST /api/ai/suggestions/:id/dismiss` |

调用方向约束：

- `report` 只读聚合 `parcel/map/market/plan/approval/parameters`，不产生权威数据；交接导出内容来自采用方案快照。
- `plan` 保存时引用 `parameters` 具体版本（口径、套餐、政策），历史方案按引用版本复现。
- `approval` 变更 `plan` 状态并触发快照冻结与地块状态联动；只有 `approval` 能把方案置为 adopted/not_selected。
- `assessment/analysis` 调用服务端计算引擎，不落权威数据（快速评估输入/结果作为评估记录保存）。
- 全部模块经 `identity` 鉴权；写操作经 `auditkit` 留痕。

## 3. 数据与迁移

- 数据库为 SQLite（dbkit），默认路径 `./data/land.db`，`DB_PATH` 可覆盖；服务启动时自动创建父目录；启动时执行版本化迁移（`migrations/sqlite/` 编号 SQL，`runMigrations`）；禁止 ORM 自动同步或手工改 schema。
- 金额与面积以十进制字符串（decimal）存储，计算引擎全精度运算，显示层四舍五入且不回写（横切规则 5）。

核心表概览（字段级形状见技术契约；DDL 属实施迁移）：

| 域 | 表 | 关键关系/说明 |
| --- | --- | --- |
| 身份权限（CommonApp） | users、roles、user_roles、permission_rules | 7 类角色与权限码映射 |
| 审计（CommonApp） | audit_events | 档案/参数/审批/状态变更事件，敏感字段脱敏 |
| 附件（CommonApp） | attachments | 文件元数据；文件本体在本地存储目录 |
| 地块 | parcels、parcel_profile、parcel_status_history、parcel_map | parcels 1—1 profile；1—N status_history（from/to/actor/reason/at）；adopted_plan_id 关联采用方案 |
| 市场 | market_land_refs、market_comps | 挂 parcels；来源/日期/成交或挂牌/可信度 |
| 快速评估 | quick_assessments | 挂 parcels；inputs/results 快照+初筛结论 |
| 方案 | plans、plan_phases、plan_products、plan_cost_items、plan_parking、plan_common_pools、plan_snapshots | plans 1—N phases（单期方案＝1 个 phase）；phase 1—N products；成本行挂 plan 或 phase（phase_id 可空＝全项目公共）；common_pools 分摊规则；snapshots 保存 formalized/adopted 完整输入与结果 |
| 审批 | submissions、submission_actions、decision_records | submission 含 plan_ids 集合；动作含 approve/return/select+理由 |
| 交接 | handoff_exports | 采用方案快照+口径说明+审批结论 |
| 参数 | parameter_sets | kind/region/version/effective_at/content；只增版本不改历史 |
| AI（P1） | ai_suggestions | 待确认建议；确认后派生候选方案 |

版本化、审计与事务策略：

- 方案持久引用参数版本（plans.parameter_refs 记录 area_convention/cost_package/policy 的版本 ID）；参数修改生成新版本并记录生效时间、修改人、适用范围，只影响后续新建或重新选择的方案（AC-14）。
- formalize 与 approve 在 dbkit 事务内完成“校验→快照→状态变更→审计”一致性；方案输入保存（产品/成本/车位/期次）同样整事务提交。
- 审计事件记录操作人、时间、对象、动作与前后值摘要；结构化业务留痕由 parcel_status_history 与 submission_actions 承载。
- 删除约束由服务端强制：审批中/已完成地块不可删除（409），只能放弃/终止并保留原因。

## 4. 外部集成

- **地图渲染**：Leaflet + 开放瓦片服务（OpenStreetMap 官方瓦片或等价开放服务，遵守其使用条款）；地块位置与边界以 GeoJSON 存储于服务端；报告中保存“地图视图快照”（中心/缩放/边界/标记渲染数据），历史报告视图不随后续地图操作变化（AC-02）。
- **外部地图跳转**：仅为链接生成（路线与现场位置查看），不依赖商业授权。
- **商业地图授权未确认**（需求第 8 章第 16 条〔未规定〕）：地图渲染走 MapProvider 抽象层，未来可替换为付费地图服务而不影响数据结构。
- **AI（P1 预留）**：LLM provider 适配层（实施阶段配置化接入，来源与抓取规则依赖第 8 章第 15 条业务确认）；平台内建“建议→确认→候选方案”流转管道，AI 输出不直接写正式方案（D2 状态机强制）。
- **未来财务系统衔接**（M16，后续阶段）：交接导出 CSV/XLSX 附口径说明，字段与采用方案快照对齐；金蝶对接不在本期范围。
- **失败可见性**：地图瓦片加载失败降级为占位与重试提示，不阻塞档案与其他功能；AI 调用失败返回明确错误且不产生部分写入。

## 5. 运行与可靠性

- 实施阶段按 1.2 节冻结配置创建标准 Hono + React/Vite 项目；常规服务入口 `src/server.js`（Hono 同时提供 API 与托管前端构建产物）。
- 常规启动：`npm start`（生产，先 `npm run build`）；开发：`npm run dev`。启动命令与验收命令分开记录。
- `PORT` 环境变量配置监听端口（默认 3000）；`DB_PATH` 配置数据库路径（默认 `./data/land.db`），隔离验证用独立 `DB_PATH` 路径覆盖，父目录自动创建，干净目录无需手工准备。
- 附件文件存储目录位于 `data/` 下（实施时按 attachment 模块说明配置，随 `DB_PATH` 同域隔离）。
- 验收脚本负责启动与清理服务（空闲端口、独立测试数据库、等待真实监听就绪、只清理本次启动的进程）；验证时只运行该脚本，不额外后台启动服务。

## 6. 高影响架构决策

| ID | 决策 | 依据与影响 |
| --- | --- | --- |
| D1 | 全部测算由服务端计算引擎确定性计算并快照 | 口径一致、结果可解释可复现（AC-04/AC-05/AC-14）；审批与冻结基于可信结果；前端不可篡改计算 |
| D2 | 方案版本状态机（草稿→已保存→正式化→审批中→采用/未采用/退回）由服务端强制 | 版本不可覆盖（AC-06/AC-08）：formalized 之后普通编辑被拒绝（403/409），一切调整经复制产生新方案；采用方案永久只读 |
| D3 | 参数只增版本，方案持久引用参数版本 ID | 历史正式方案按原口径复现（AC-14）；新规则仅影响后续方案 |
| D4 | 地价双向录入以“最后编辑字段”为计算输入 | 存储总地价/单位地价双字段+last_edited_basis 标记，全精度换算，显示精度不反写（AC-04） |
| D5 | 单期与多期统一模型：方案内 phases 数组，单期＝1 个 phase | 避免两套测算模型；公共成本池+分摊规则+总额一致性校验（AC-11） |
| D6 | AI 建议经独立表与确认工作流流转 | AI 输出待确认，不进入正式方案库，确认后派生可追溯候选方案（AC-15） |
| D7 | 开放地图 + MapProvider 抽象 | AC-02 地图能力可交付且不绑定未确认的商业授权；未来可替换 |
