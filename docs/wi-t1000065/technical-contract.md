# 技术契约 — KWMS 仓储费用管理模块（API）

> WorkItem：wi-t1000065 · 前后端共同遵循的字段级契约，唯一来源；架构见 `docs/wi-t1000065/architecture-baseline.md`。业务规则与计算语义以 `docs/wi-t1000065/requirements.md` 为准，本契约只定义承载。

## 1. 通用约定

- Base：`/api`；除登录外全部端点需 Bearer 会话（`Authorization: Bearer <token>`），authkit 承载
- 请求/响应 `application/json`；报表导出返回 xlsx 二进制流
- **金额单位：整数「分」**（全部 `*Amount`/`Price`/`Charge`/`Value(金额类)` 字段）；前端负责元↔分换算与展示（2 位小数）
- 日期：`YYYY-MM-DD`；时间戳：ISO 8601 UTC
- 分页：`page`（1 起，默认 1）、`pageSize`（默认 20，上限 200）；分页响应 `{items, total, page, pageSize}`，非分页响应对象或数组
- 组织隔离：org 过滤由会话用户绑定组织推导；访问非所属组织数据返回 `ORG_FORBIDDEN`；系统管理员角色（跨组织异常处理）例外
- 金额字段可见性：默认策略仅财务角色输出金额字段，其他角色该类字段置 `null`（策略点可由系统管理员调整，承载需求未决事项 4）
- 幂等性：GET 幂等；状态操作（审核/终止）按当前状态校验，已处于目标状态返回 200；重算与任务触发结果收敛可重复；单据创建、开票、核销为累加/新增语义，非幂等，客户端防重复提交
- 校验责任：前端做第一道必填/数值/置灰交互校验并给中文提示；后端对全部规则权威复验（双重校验）

错误结构（HTTP 400/401/403/404/409；与脚手架基线 `{error:{code,message}}` 兼容，`field` 为可选字段定位扩展）：

```json
{ "error": { "code": "VALIDATION_DATE_ORDER", "message": "合同开始日期必须早于结束日期", "field": "effectStart" } }
```

### 1.1 权限点与角色绑定（RBAC，permissionkit）

权限点：`quote:view` `quote:create` `quote:edit` `quote:terminate` `quote:audit` `discount:edit` `receivable:view` `receivable:recalc` `adjustment:view` `adjustment:create` `adjustment:edit` `adjustment:audit` `recon:view` `recon:generate` `recon:audit` `settlement:view` `settlement:adjust` `invoice:issue` `writeoff:record` `job:run` `job:view` `report:export` `masterdata:maintain` `user:manage` `role:config` `audit:view`

| 角色 | 默认绑定 |
| --- | --- |
| 仓储运营 | quote:view/create/edit/terminate、discount:edit、receivable:view、adjustment:view/create/edit、job:view |
| 财务 | quote:view、receivable:view/recalc、adjustment:view、recon:view/generate/audit、settlement:view/adjust、invoice:issue、writeoff:record、job:run/view、report:export、audit:view |
| 系统管理员 | masterdata:maintain、user:manage、role:config、job:run/view、audit:view、全单据 view、跨组织访问 |
| 客户经理（只读） | quote:view、receivable:view、adjustment:view、recon:view、settlement:view、job:view |

`quote:audit`、`adjustment:audit` 默认不绑定任何角色（需求未决事项 3），由系统管理员经角色配置授予后流程贯通。`job:run` 为验收与补偿触发端点，绑定可调整。

## 2. 认证与会话

| 端点 | 权限 | 请求 | 响应 | 错误 |
| --- | --- | --- | --- | --- |
| POST /api/auth/login | 公开 | `{username, password}` | `{token, user: {id, username, name, orgId, roles: [角色编码]}}` | 401 `UNAUTHENTICATED` 凭证错误 |
| POST /api/auth/logout | 登录用户 | — | `{ok: true}`（幂等） | — |
| GET /api/auth/me | 登录用户 | — | `{user: 同上, permissions: [权限点]}` | 401 |

## 3. 下拉数据与主数据

| 端点 | 权限 | 说明 |
| --- | --- | --- |
| GET /api/orgs | 登录用户 | 用户可见组织（管理员全量，其余=所属组织），`{items: [{id, code, name}]}` |
| GET /api/warehouses?orgId= | 登录用户 | 该组织下有效仓库 |
| GET /api/owners?orgId=&ownerType=business\|customer | 登录用户 | 按组织与货主类型过滤 |
| GET /api/contracts?orgId= | 登录用户 | 外部仓储合作合同引用 `{items: [{id, contractNo}]}` |
| GET /api/masterdata/fee-types | 登录用户 | 费用类型基础档案 |
| POST/PUT /api/masterdata/fee-types[/{id}] | masterdata:maintain | `{code, name}`，`code` 唯一；PUT 部分更新 |
| GET /api/masterdata/goods-categories | 登录用户 | 货品类别基础档案 |
| POST/PUT /api/masterdata/goods-categories[/{id}] | masterdata:maintain | 同上 |

主数据写操作记录审计事件；基础档案变更不需迁移（扩展性需求，后台维护）。

## 4. 仓储合同报价单（CCHT）

### 4.1 列表与详情

- GET /api/quotes?orgId=&warehouseId=&ownerId=&status=&page= — 权限 `quote:view`；`{items: [{id, billNo, contractNo, orgId, warehouseId, ownerType, ownerId, effectStart, effectEnd, rentFreeDays, billingPeriod, settlementMode, insuranceRequired, status, remark}], total, …}`
- GET /api/quotes/{id} — 详情含 `lines[]`（4.2 行结构 + `discounts[]`）

`billNo` 全端点只读（系统生成，格式 `CCHT-YYYYMMDD-NNNNN`）。

### 4.2 创建/编辑（quote:create / quote:edit，仅 draft 可编辑）

POST /api/quotes、PUT /api/quotes/{id} 请求体（整单提交）：

| 字段 | 类型 | 可空 | 约束 |
| --- | --- | --- | --- |
| contractId | string | 否 | 关联合同引用，支持多报价单绑定同一合同 |
| orgId | string | 否 | 须为用户所属组织 |
| warehouseId | string | 否 | 该组织下有效仓库 |
| ownerType | string | 否 | `business` \| `customer` |
| ownerId | string | 否 | 按 ownerType 过滤后的货主 |
| effectStart / effectEnd | date | 否 | 开始 < 结束（VALIDATION_DATE_ORDER） |
| rentFreeDays | integer | 否 | 0 \| 7 \| 15 \| 30；免租期结束日 ≤ 合同结束日（VALIDATION_FREE_RENT_END） |
| billingPeriod | string | 否 | `daily` \| `monthly` |
| settlementMode | string | 否 | `monthly` \| `prepaid`（默认 monthly，预留扩展） |
| insuranceRequired | boolean | 否 | 联动保险费计费 |
| remark | string | 是 | ≤ 500 字 |
| lines | array | 否 | 费用明细行，见下 |

明细行 `lines[]`：

| 字段 | 类型 | 可空 | 约束 |
| --- | --- | --- | --- |
| feeTypeId | string | 否 | 费用类型 |
| billingMode | string | 否 | `normal` \| `fixed_price` \| `max_value` |
| billingBasis | string | 普通模式否，其余是 | `stock_qty` \| `locations` \| `volume` \| `weight` |
| goodsCategoryId | string | 是 | 空=全货品共用 |
| unitPrice | integer 分 | 普通模式否，一口价是（置灰不传） | > 0 |
| minCharge | integer 分 | 是 | > 0，空=无保底 |
| fixedAmount | integer 分 | 一口价否，其余是 | > 0，固定总价 |
| discounts | array | 是 | 分段优惠，见下 |

分段优惠 `discounts[]`：`lowerLimit`（number ≥ 0）、`upperLimit`（number > lowerLimit）、`discountMode`（`percent` \| `fixed`）、`percentValue`（0–100，percent 必填）、`fixedValue`（integer 分 ≥ 0，fixed 必填）。区间集合不可重叠、无断层（VALIDATION_DISCOUNT_OVERLAP）。

保存校验（后端权威复验，逐条对应）：必填缺失 → `VALIDATION_REQUIRED`；日期先后 → `VALIDATION_DATE_ORDER`；免租期越界 → `VALIDATION_FREE_RENT_END`；同组织/仓库/货主/效期内同费用类型+货品类别生效明细重复 → `VALIDATION_DUPLICATE_LINE`；优惠区间交叉断层 → `VALIDATION_DISCOUNT_OVERLAP`；负数输入 → `VALIDATION_NEGATIVE`；同货主、仓库、周期多份生效合同 → `CONTRACT_CONFLICT`（提示终止旧合同）。

响应：`201 {id, billNo, status: "draft", …}`；编辑生效规则修改前后写 `change_logs`（前单价/优惠区间/计费规则、后值）。

### 4.3 状态操作

- POST /api/quotes/{id}/audit — `quote:audit`；draft→effective；参与自动计费；生效后规则不可修改（编辑接口返回 `INVALID_STATUS`）。已 effective 返回 200（幂等）
- POST /api/quotes/{id}/terminate — `quote:terminate`；effective→terminated（手动终止）；历史明细保留。已 terminated 返回 200

## 5. 应收费用明细（系统生成）

- GET /api/receivables?periodStart=&periodEnd=&orgId=&warehouseId=&ownerId=&feeTypeId=&status=&page= — `receivable:view`；`items[]`：`{id, billDate, orgId, warehouseId, ownerId, feeTypeId, goodsCategoryId, billingMode, billingBasis, businessQty, rawAmount, discountedAmount, minCharge, finalAmount, quoteBillNo, status}`；金额字段按 1. 节可见性策略输出（不可见置 null）
- GET /api/receivables/{id} — 同上单条
- POST /api/receivables/recalc — `receivable:recalc`；请求 `{ids: [明细 id]}`；响应 `{recalculated: n, skipped: [{id, reason}]}`。已对账明细拦截（`RECONCILED_LOCKED`）；重算清空原金额并按最新生效规则与分段优惠重新核算，写 `change_logs`（前后金额）

## 6. 应收费用调整单（YSTZ）

- GET /api/adjustments?status=&page= / GET /api/adjustments/{id} — `adjustment:view`；详情含 `lines[]`
- POST /api/adjustments — `adjustment:create`；`{orgId, periodStart, periodEnd, remark?}` → `201 {id, billNo, status: "draft"}`（billNo 格式 `YSTZ-YYYYMMDD-NNNNN`，只读）
- POST /api/adjustments/{id}/details/load — `adjustment:edit`；按业务周期批量加载**仅暂存（未对账）**明细为调整行，已对账明细自动过滤；响应 `{lines: [{receivableDetailId, feeTypeId, businessQty, amountBefore}]}`；带出行 `feeTypeId` 锁定不可修改
- PUT /api/adjustments/{id} — `adjustment:edit`；行编辑：带出行 `{receivableDetailId, adjustmentAmount, reason}`（`amountBefore` 只读带出，`amountAfter` 自动计算）；手动空白行 `{feeTypeId 可自选, businessQty?, amountBefore: 0, adjustmentAmount, reason}`。`adjustmentAmount` 仅正整数分（`ADJUSTMENT_NEGATIVE`，提示调减须新增反向调整单）；`reason` 必填
- POST /api/adjustments/{id}/audit — `adjustment:audit`；draft→effective；事务内同步回写 `receivable_details.finalAmount`（调整后金额）并写 `change_logs`（前后金额、原因）

## 7. 应收对账单（YSDZ）

- POST /api/recon-statements — `recon:generate`；`{orgId, warehouseId, ownerId, periodStart, periodEnd}`；仅汇总**暂存**应收明细（已对账自动过滤不展示）；`201 {id, billNo, totalAmount, lineCount, status: "draft"}`（billNo `YSDZ-YYYYMMDD-NNNNN`，只读）
- GET /api/recon-statements?orgId=&status=&page= / GET /api/recon-statements/{id} — `recon:view`；详情含 `lines[]`：`{receivableDetailId, goodsCategoryName, billDate, feeTypeName, billingMode, businessQty, unitPrice, minCharge, rawAmount, finalAmount}`（快照）；`totalAmount` 只读自动汇总
- POST /api/recon-statements/{id}/audit — `recon:audit`；单事务：明细锁定（不可增删改）+ 关联 `receivable_details.status→reconciled` + 自动创建一一绑定结算单；响应 `{id, status: "approved", settlementId}`。重复审核返回 200（幂等）

## 8. 应收结算单（YSJS）

- GET /api/settle-statements?orgId=&status=&page= / GET /api/settle-statements/{id} — `settlement:view`；详情：`{id, billNo, reconStatementId, orgId, warehouseId, ownerId, reconTotalAmount, settleTotalAmount, invoiceTotalAmount, writeoffTotalAmount, status: "draft", lines: [对账明细快照], invoices: [{id, invoiceDate, invoicer, invoiceNo, amount}]}`（billNo `YSJS-YYYYMMDD-NNNNN`，只读；金额头部字段全部只读系统累加）
- PUT /api/settle-statements/{id}/settle-amount — `settlement:adjust`；`{settleTotalAmount}`（默认等于对账总额，支持少量抹零微调；校验 0 < 值 ≤ reconTotalAmount，`VALIDATION_NEGATIVE`/`VALIDATION_AMOUNT_EXCEED`）
- POST /api/settle-statements/{id}/invoices — `invoice:issue`；`{invoicer 必填, invoiceNo 必填, amount 正整数分}`；开票弹窗提交，新增开票明细并实时累加 `invoiceTotalAmount`；累计开票 > 结算总额拦截（`INVOICE_EXCEED_TOTAL`，前端弹窗禁止提交 + 后端复验）
- POST /api/settle-statements/{id}/writeoffs — `writeoff:record`；`{amount 正整数分}`；前置：存在有效开票记录（`NO_VALID_INVOICE`）；累计核销 > 累计开票拦截（`WRITEOFF_EXCEED_INVOICE`）；提交后 `writeoffTotalAmount` 累加；结算单无终态，记录永久留存

## 9. 定时任务（job）

- POST /api/jobs/{type}/run — `job:run`；type ∈ `daily-billing` | `monthly-billing` | `contract-expiry`；可选 `{targetDate}`（默认按任务定义的账期日期，格式 YYYY-MM-DD）；同步执行并返回 `{jobRunId, jobType, targetDate, status, generatedCount, affectedCount, failedCount, errors: [{orgId, warehouseId, ownerId, message}]}`。计费任务执行过滤：仅 effective 合同、记账日期超出免租期、在效期内；异常（库存缺失）记录 `job_runs.error_message` 并写 `notifications` 提醒运营
- GET /api/jobs/runs?type=&page= — `job:view`；执行记录与异常日志 `{items: [{id, jobType, targetDate, status, affectedCount, failedCount, errorMessage, startedAt, finishedAt}]}`

## 10. 报表导出

- GET /api/reports/export?type=billing|recon|settlement&ownerId=&warehouseId=&periodStart=&periodEnd= — `report:export`；响应 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` 流 + `Content-Disposition: attachment`；行内容由对应单据只读聚合生成，万行级别服务端流式输出；参数缺省按全量（限本组织）

## 11. 审计与变更日志

- GET /api/audit/events?entityType=&entityId=&page= — `audit:view`；操作日志 `{items: [{id, operatorName, operatedAt, action[新增|编辑|审核|重算|开票|核销|终止], entityType, entityId}]}`
- GET /api/audit/change-logs?entityType=&entityId= — `audit:view`；变更日志 `{items: [{id, changeType, before, after, reason, operatorName, operatedAt}]}`（重算/调整含前后金额与原因；合同修改含前后单价、优惠区间、计费规则）

## 12. 用户与权限管理

- GET /api/users?page= — `user:manage`；`{items: [{id, username, name, roles: [角色编码], orgId, status}]}`（凭证只写不读）
- POST /api/users — `user:manage`；`{username 唯一, password, name, roles: [角色编码], orgId}`
- PUT /api/users/{id} — `user:manage`；`{name?, roles?, orgId?, status?}`（部分更新；角色/数据权限配置入口，承载 `role:config`）

## 13. 错误码总表

| code | HTTP | 中文提示模板 |
| --- | --- | --- |
| VALIDATION_REQUIRED | 400 | {字段名}为必填项 |
| VALIDATION_DATE_ORDER | 400 | 合同开始日期必须早于结束日期 |
| VALIDATION_FREE_RENT_END | 400 | 免租期结束日期不可晚于合同结束日期 |
| VALIDATION_DUPLICATE_LINE | 400 | 同一组织、仓库、货主、效期内已存在同费用类型+同货品类别的生效明细 |
| VALIDATION_DISCOUNT_OVERLAP | 400 | 分段优惠区间禁止交叉或断层，请调整业务量区间 |
| VALIDATION_NEGATIVE | 400 | 禁止输入负数 |
| VALIDATION_AMOUNT_EXCEED | 400 | 金额超出允许范围 |
| ADJUSTMENT_NEGATIVE | 400 | 调整金额仅支持正数，调减请新增反向调整单 |
| INVALID_STATUS | 409 | 当前单据状态不允许该操作 |
| RECONCILED_LOCKED | 409 | 已对账明细禁止重算 |
| CONTRACT_CONFLICT | 409 | 同一货主、仓库、周期已存在生效合同，请先终止旧合同 |
| INVOICE_EXCEED_TOTAL | 409 | 累计开票金额不可超过结算总金额 |
| NO_VALID_INVOICE | 409 | 无有效开票记录，不可核销 |
| WRITEOFF_EXCEED_INVOICE | 409 | 累计核销金额不可超过累计开票金额 |
| PERMISSION_DENIED | 403 | 当前角色无权执行该操作 |
| ORG_FORBIDDEN | 403 | 禁止跨组织访问数据 |
| UNAUTHENTICATED | 401 | 未登录或会话已失效 |
| NOT_FOUND | 404 | 单据不存在或不可见 |
