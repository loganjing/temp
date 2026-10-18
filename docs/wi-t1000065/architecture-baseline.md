# 系统设计 — KWMS 仓储费用管理模块

> WorkItem：wi-t1000065（业务任务 cangchu-1）· 阶段：design · 路线：fullstack-complex
> 需求基线：`docs/wi-t1000065/requirements.md`（sha256:987f223e05dcdc9440f172a15d24283e498580f64e2975c34ed84e0066a463f5）

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 总体架构与技术栈

工作区无既有应用（根目录无 `package.json`/`app/`/`src/`/`client/`/`server/`），按新建单仓全栈应用交付，服务端为唯一数据权威：

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 服务端 | Node.js ≥ 20 + Hono（TypeScript，ESM；脚手架提供 tsx 运行与 server/client 双端类型检查） | REST API、认证鉴权、后台定时任务、Excel 导出 |
| 前端 | React + Vite SPA | 桌面 Web 业务后台（PC 端浏览器适配） |
| UI | Tailwind CSS | 配合展示模板 `saas-ops-console`（见第 4 节） |
| 数据库 | SQLite 文件库（better-sqlite3，经 `@commonapp/dbkit`） | 配置、查询、事务、版本化迁移统一走 dbkit |
| 调度 | node-cron（服务端进程内） | 按天计费、按月计费、合同过期检测三个任务 |
| 导出 | xlsx（SheetJS，服务端流式生成） | 计费/对账/结算 Excel 报表 |

```
┌────────────────────────────────────────────┐
│ React/Vite SPA（saas-ops-console）          │
│ 登录 · 五类单据工作台 · 报表导出 · 基础档案     │
└──────────────────┬─────────────────────────┘
                   │ REST/JSON（Bearer 会话）
┌──────────────────▼─────────────────────────┐
│ Hono 服务端                                  │
│ 认证/授权：authkit · userkit · permissionkit  │
│ 业务域：主数据 · 报价 · 计费 · 调整 · 对账 · 结算 │
│ 支撑域：单据编码 · 定时任务 · 报表 · 审计        │
└──────────────────┬─────────────────────────┘
                   │ dbkit（查询/事务/迁移）
┌──────────────────▼─────────────────────────┐
│ SQLite 文件库 + auditkit 审计事件 + change_logs │
└────────────────────────────────────────────┘
```

### 1.2 CommonApp 模块选择

核查方式：`commonapp-module-resolver.mjs catalog --summary` 与 `manifests --summary --module dbkit authkit userkit permissionkit auditkit`（catalogSchemaVersion 1）。五个模块状态均为 `ready`，manifest 校验通过。已选依赖闭包 = `{dbkit, authkit, userkit, permissionkit, auditkit}`，运行时依赖 `better-sqlite3` 与 `hono`，与所选技术栈一致；发行文件由批准初始化工具在合并前校验并安装。

| 模块 | 包/版本 | manifest SHA-256 | 需求匹配 | 集成边界与限制 | 模块安装标记 |
| --- | --- | --- | --- | --- | --- |
| dbkit | @commonapp/dbkit 0.2.0 | f343ad1fc6ceae6843b0c43efc72f6c59c568f826619570f0808c017ec06eec6 | 服务端权威数据、单据事务一致性、版本化迁移（计费/对账/结算闭环） | 服务端 Node ESM；仅 SQLite 驱动；查询/事务/迁移统一入口 | `commonapp install: dbkit` |
| authkit | @commonapp/authkit 0.1.2 | a91e927efd1cc7661dd23841070590f255686dd3dc6ae223de90621aefc62b02 | 四类角色登录与会话认证（需求第 2 节） | Hono 中间件，Bearer 认证，密码登录 | `commonapp install: authkit` |
| userkit | @commonapp/userkit 0.1.0 | 40b00dda1885792fb4a85a7d3734833174b577c3efca241523a5fe9e3dab1dc4 | 本地用户与凭证，承载角色账号与组织绑定 | 依赖 dbkit + authkit；SQLite | `commonapp install: userkit` |
| permissionkit | @commonapp/permissionkit 0.1.0 | 09b66531da01ee401dc5ea3a746a8a71910ec8d0eb304c84f8e00217db7f0228 | 角色操作矩阵与越权拒绝、角色数据权限配置（需求第 2 节，AC-11） | 依赖 dbkit；RBAC 注册表由项目定义权限点 | `commonapp install: permissionkit` |
| auditkit | @commonapp/auditkit 0.1.0 | 27697d5cfe82dafe1d362312079fe63e81f15a30c25a10305cba99166cff0ce1 | 操作日志与追溯、敏感字段脱敏（需求第 9 节，AC-12） | 依赖 dbkit；审计事件持久化 | `commonapp install: auditkit` |

模块发行文件安装于工作区 `vendor/@commonapp/*`，应用包经 `file:` 协议引用，包清单与锁文件由 npm 管理，vendor 源码目录只读。不引入 `attachment`（无文件上传需求）与 `i18n`（中文单语言）。

### 1.3 项目内实现能力（无匹配模块）

- 计费引擎与费用重算（三种计费模式 + 分段优惠 + 最低收费的统一计算管道）
- 单据编码服务（`CCHT/YSTZ/YSDZ/YSJS-YYYYMMDD-NNNNN`，事务内取号，页面只读）
- 定时任务调度、手动触发端点、job 执行与异常记录、库存缺失站内通知
- Excel 报表导出（按货主/仓库/业务周期）
- 应答金额字段级角色过滤（财务金额可见性策略承载点）

### 1.4 运行约定

- 运行根：`packageRoot = app/kwms-billing/`（以根目录 `platform-baseline.json` 为准）；常规服务入口 `app/kwms-billing/src/server/index.ts`，位于本工作区可写范围内
- 常规启动：packageRoot 内 `npm start`（`node --import tsx src/server/index.ts`）；开发：`npm run dev:server`（服务端 watch）与 `npm run dev:web`（Vite）；整体验收入口 `npm run build`（server/client 类型检查 + 客户端构建）；测试 `npm test`（`test/*.test.mjs`）；验收命令与常规启动分开，验收脚本自起服务并自清理，不额外后台常驻
- 端口：`PORT` 可配置，默认 3000；隔离验证使用空闲端口并等待真实监听就绪
- 数据库：SQLite 文件，默认 `./data/kwms-billing.db`（相对 packageRoot）；`DB_PATH` 覆盖用于隔离测试库；打开前自动创建父目录，干净目录无需手工准备
- 迁移：`app/kwms-billing/src/server/migrations/sqlite/*.sql` 版本化迁移，启动时经 dbkit `runMigrations` 执行；禁止 ORM 自动同步或手工改 schema

### 1.5 金额与精度基线

所有金额字段（单价、最低收费、固定优惠金额、原始计算金额、优惠后计费金额、最终计费金额、各汇总与累计金额）以**整数「分」**存储与传输，展示层换算为元（2 位小数）。日期为 `YYYY-MM-DD` 文本。业务量（数量/库位数）为整数；体积/重量为 NUMERIC 列，保留原始精度。需求第 12 节第 2 项舍入规则未规定，计算引擎设单一舍入策略点，不在设计中替需求决策。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

服务端按业务域划分模块，每域拥有唯一数据归属；跨域只经公开服务调用，不直读他域私有表。

| 模块 | 职责 | 唯一数据归属（表） | 主要对外接口（前端→服务端） |
| --- | --- | --- | --- |
| identity | 登录认证、会话、用户与角色绑定、RBAC 决策（authkit/userkit/permissionkit 承载） | users、credentials、roles、permissions（模块表） | `/api/auth/*`、`/api/users` |
| masterdata | 组织、仓库、货主、外部合同引用、费用类型、货品类别、货品与当前库存事实（计费度量源） | organizations、warehouses、owners、contracts、fee_types、goods_categories、goods、inventory | `/api/orgs`、`/api/warehouses`、`/api/owners`、`/api/contracts`、`/api/masterdata/*` |
| quotes | 仓储合同报价单头部/明细行/分段优惠的维护与全部保存校验、状态流转（审核生效/终止）、修改前快照日志 | cc_quotes、cc_quote_lines、cc_quote_discounts | `/api/quotes*` |
| billing | 计费引擎（度量→基础金额→分段优惠→最低收费）、按天/按月定时计费、合同过期检测、费用重算、任务执行与异常记录、库存缺失通知 | receivable_details、job_runs、notifications | `/api/receivables*`、`/api/jobs*` |
| adjustments | 应收费用调整单：周期加载暂存明细、手动新增空白行、审核生效后同步回写应收明细金额 | fee_adjustments、fee_adjustment_lines | `/api/adjustments*` |
| recon | 应收对账单：按组织/仓库/结算方/周期汇总暂存明细、审核锁定、明细状态更新、自动生成结算单 | recon_statements、recon_statement_lines | `/api/recon-statements*` |
| settlement | 应收结算单：对账总额同步、结算金额微调、开票与核销记录及累计约束 | settle_statements、invoices、writeoffs | `/api/settle-statements*` |
| audit | 审计事件与业务变更日志（前后金额、原因、操作人、时间） | 审计事件表（auditkit）、change_logs | `/api/audit/*` |
| reports | 计费/对账/结算 Excel 导出（按货主、仓库、业务周期） | 只读聚合，无独立事实表 | `/api/reports/export` |

服务端内部调用方向：billing → masterdata（库存度量）与 quotes（生效规则快照）；adjustments → billing（回写明细金额）；recon → billing（锁定明细）→ settlement（生成结算单）；各业务域 → audit（写审计与变更日志）；reports → 各域只读查询。

接口摘要：认证登录/登出/会话；五类单据的查询、新建、编辑、状态操作（审核/终止/重算/开票/核销）；对账单生成与审核；定时任务手动触发与执行记录；报表导出；基础档案维护；用户角色与组织绑定管理；审计与变更日志查询。字段级契约唯一来源：`docs/wi-t1000065/technical-contract.md`。

## 3. 数据模型与迁移

### 3.1 核心表（SQLite，金额列为整数分）

主数据域：
- `organizations(id, code, name)`
- `warehouses(id, org_id, code, name, status)` — 有效仓库
- `owners(id, org_id, owner_type[业务组织|客户], code, name)`
- `contracts(id, org_id, contract_no, status)` — 外部仓储合作合同引用（下拉数据源）
- `fee_types(id, code, name)` — 管理员维护
- `goods_categories(id, code, name)` — 管理员维护
- `goods(id, org_id, category_id, code, name, unit_volume, unit_gross_weight)`
- `inventory(warehouse_id, owner_id, goods_id, quantity, occupied_locations)` — 当前库存事实，计费度量源；索引 `(warehouse_id, owner_id)`

报价域：
- `cc_quotes(id, bill_no 唯一, contract_id, org_id, warehouse_id, owner_type, owner_id, effect_start, effect_end, rent_free_days[0|7|15|30], billing_period[daily|monthly], settlement_mode[monthly|prepaid], insurance_required, status[draft|effective|terminated], remark, …)`
- `cc_quote_lines(id, quote_id, line_no, fee_type_id, billing_mode[normal|fixed_price|max_value], billing_basis[stock_qty|locations|volume|weight] 可空, goods_category_id 可空, unit_price, min_charge, fixed_amount)` — 计费约束由服务层校验
- `cc_quote_discounts(id, quote_line_id, lower_limit, upper_limit, discount_mode[percent|fixed], percent_value, fixed_value)` — 区间不重叠、无断层由服务层校验

计费域：
- `receivable_details(id, bill_date, org_id, warehouse_id, owner_id, fee_type_id, goods_category_id, billing_mode, billing_basis, business_qty, raw_amount, discounted_amount, min_charge, final_amount, quote_bill_no, status[draft|reconciled])` — 索引 `(org_id, warehouse_id, owner_id, status, bill_date)`
- `job_runs(id, job_type[daily_billing|monthly_billing|contract_expiry], target_date, status[success|failed], affected_count, error_message, started_at, finished_at)` — `(job_type, target_date, status)` 支撑防重与失败重跑
- `notifications(id, user_id, content, source_run_id, read_flag, created_at)` — 库存缺失等异常提醒

调整域：
- `fee_adjustments(id, bill_no 唯一, org_id, period_start, period_end, status[draft|effective], remark, …)`
- `fee_adjustment_lines(id, adjustment_id, receivable_detail_id 可空(手动新增行), fee_type_id, business_qty 可空, amount_before, adjustment_amount, amount_after, reason)`

对账域：
- `recon_statements(id, bill_no 唯一, org_id, warehouse_id, owner_id, period_start, period_end, total_amount, status[draft|approved], remark)`
- `recon_statement_lines(id, statement_id, receivable_detail_id, goods_category_id, bill_date, fee_type_id, billing_mode, business_qty, unit_price, min_charge, raw_amount, final_amount)` — 审核后快照锁定

结算域：
- `settle_statements(id, bill_no 唯一, recon_statement_id 唯一（一一绑定）, org_id, warehouse_id, owner_id, recon_total_amount, settle_total_amount, invoice_total_amount, writeoff_total_amount, status[draft])` — 无终态
- `invoices(id, settlement_id, invoice_date, invoicer, invoice_no, amount)`
- `writeoffs(id, settlement_id, writeoff_date, amount, operator)`

支撑域：
- `change_logs(id, entity_type, entity_id, change_type[编辑|重算|调整|审核|开票|核销], before_json, after_json, reason, operator_id, created_at)` — 各业务域经 audit 模块公开服务写入
- users/credentials/roles/permissions 表由 userkit/permissionkit 提供，绑定组织后用于数据隔离

### 3.2 关键事务边界

- 对账单审核：`recon_statements.status→approved` + 关联 `receivable_details.status→reconciled` + 插入 `settle_statements`，单事务提交（原子性，失败整体回滚）
- 开票/核销提交：事务内校验累计金额（开票 ≤ 结算总额；核销 ≤ 开票总额且存在有效开票）+ 插入记录 + 更新累计字段
- 单据编码取号：事务内按「前缀+当日序号」取号写入，保证并发唯一
- 费用重算：勾选明细在单事务内清空并重写金额，同时写 change_logs；已对账明细校验拦截
- 月度批量计费：分块事务（按仓库/货主分组提交），避免长事务阻塞交互请求

### 3.3 迁移策略

全部 schema 变更经 `app/kwms-billing/src/server/migrations/sqlite/*.sql` 版本化迁移（dbkit `runMigrations`），启动时执行；平台模块已安装 0001–0003（用户、权限、审计事件表），本设计业务表迁移自 0004 起编号追加。种子数据（四类角色与权限点绑定、费用类型与货品类别基础档案、示例主数据与库存）作为迁移后的 seed 脚本提供，不内嵌于表结构。

## 4. UI 全局基线

- 展示模板 ID：`saas-ops-console`（管理大量配置和业务数据：导航、筛选、表格与操作密集，符合五类单据的工作台形态）
- 视觉风格：Modern SaaS — 柔和中性色、细边界、少阴影、中等圆角、单一主色 + 状态色、清晰字体、短而有反馈的动效
- 应用壳：左侧导航（一级菜单「仓储费用管理」，子菜单：仓储合同报价单、应收费用明细、应收费用调整单、应收对账单、应收结算单、报表导出、基础档案、系统管理）+ 顶部上下文栏（当前用户、所属组织、角色）+ 主工作区（列表 + 筛选 + 表格 + 行操作/弹窗表单）
- 目标设备：桌面 Web（PC 端浏览器），主目标宽度 ≥ 1280px；不设计移动端/窄屏验收范围
- 全局状态：加载（表格骨架/加载指示）、空数据（空态提示 + 主操作入口）、错误（中文提示，校验错误定位到字段，数值超限/区间冲突/状态冲突给出明确原因）、无权限（403 提示并引导返回）、成功（操作成功轻提示）
- 截断内容：单元格超长文本（备注、调整原因、单号）提供悬停标题或展开查看
- 选择依据：需求第 4 节一级菜单结构、第 5 节单据列表/表单/弹窗密集操作、第 11 节 PC 端适配与中文交互提示

## 5. 运行与可靠性

- 定时任务：`daily_billing`（每日 00:00，计算前一日费用）、`monthly_billing`（每月 1 日 00:00，计算上月费用）、`contract_expiry`（每日凌晨，将到期生效合同置为已终止）；node-cron 进程内调度，进程重启后依据 `job_runs` 的 `(job_type, target_date)` 防重：当日已成功则跳过，失败允许重跑
- 手动触发：`POST /api/jobs/{type}/run`（可带 targetDate）供验收与补偿，返回执行摘要（生成明细数、异常数、job_run id）
- 异常处理：任务中库存数据缺失等失败单据记录于 `job_runs.error_message` 并写入 `notifications` 提醒仓储运营人工触发重算
- 性能（10 万条库存、月度任务 5 分钟预算）：计费按 `inventory(warehouse_id, owner_id)` 聚合索引查询度量；明细生成按仓库/货主分组、分块事务批量写入；better-sqlite3 同步驱动下聚合与批量插入远低于预算
- 并发模型：单进程 Hono + SQLite 单写者；写操作全部事务化，任务执行不长时间持锁

## 6. 高影响架构决策

1. **金额整数分存储与传输**：消除浮点表示误差，所有金额列与 API 字段统一整数分，展示层换算；这是全局性取舍，影响数据模型与契约（见第 1.5、3.1 节）
2. **计费度量提供者抽象**：按天（前一日库存）与按月（月度口径）在 `MeasureProvider` 策略点分实现；需求第 12 节第 1 项月度口径未规定，实现前固定策略选择，计算管道不因口径变化改动
3. **单据编码事务内取号**：`前缀-YYYYMMDD-NNNNN` 当日序号在事务内分配，保证并发唯一与只读性
4. **复用与自建边界**：认证/RBAC/用户/审计/持久化复用 CommonApp 模块（第 1.2 节）；计费引擎、单据域、调度、导出项目内实现（无匹配模块，见第 1.3 节）

## 7. 未决事项的技术承载点

需求第 12 节四项未规定事项不替产品决策，设计仅提供承载点：

- 月度业务量口径 → `MeasureProvider` 策略点（两种口径实现可切换，实现前确认）
- 金额舍入规则 → 计费引擎单一舍入策略点（存储精度已由整数分消除表示误差）
- 报价单/调整单审核角色 → 独立权限点 `quote:audit`、`adjustment:audit`，由系统管理员经角色配置绑定，不硬编码
- 运营查询明细的金额可见性 → 应答金额字段级过滤策略点（按角色输出金额字段）
