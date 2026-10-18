# Land 地产投资测算与拿地决策平台 · 前后端技术契约

- WorkItem：wi-t1000062；配套文档：`docs/wi-t1000062/architecture-baseline.md`（架构、模块边界与接口摘要）
- 本文是 API 字段级契约的唯一来源；架构基线只保留接口摘要。实现须遵循本文，不得在页面或控制器中私改字段语义。

## 0. 通用约定

- Base URL `/api`；请求与响应均为 UTF-8 JSON。
- 认证：`Authorization: Bearer <token>`（authkit 登录获得）；除 `POST /api/auth/login` 外全部接口需要认证。
- 标准响应：成功直接返回资源或 `{ "items": [...], "page", "pageSize", "total" }`（列表分页，默认 page=1、pageSize=20）。
- 错误响应：`{ "error": { "code": "<machine-code>", "message": "<人读信息>", "details": [ ... ] } }`；`details` 可空，携带字段级校验失败项（字段名+原因）。
- 幂等性与副作用：GET 只读；POST 创建类非幂等；状态变更类（formalize/approve/return/confirm 等）按对象当前状态校验，重复提交同一动作返回当前状态（不重复产生业务效果，但审计记录每次尝试）。
- 类型约定：
  - `id`：服务端生成字符串标识；
  - `string`：UTF-8 文本；
  - `decimal`：十进制数字符串（全精度，如 `"123456.78"`），显示层四舍五入，不回写；
  - `int`：整数；`bool`：布尔；
  - `enum`：封闭枚举，取值以本文为准；
  - `datetime`：ISO 8601 UTC（服务端存储），前端本地化展示；
  - `source-type`：`government | historical-project | market-judgment | client-input | manual-estimate`（假设来源五类）；
  - `json`：结构随接口注明。
- 可空性：字段标注 `required` / `nullable`（可空字段显式传 `null` 或省略）；未标注默认 required。
- 权限码：请求方角色须持有接口标注的 permission code；不足返回 403 `FORBIDDEN`。

### 0.1 角色与权限码

| 角色（需求第 2 章） | 持有权限码 |
| --- | --- |
| investment-officer 投资业务人员 | parcels:write、parcel-profile:write、market:write、quick-assessments:write、plans:read、plans:copy、submissions:create |
| plan-owner 方案负责人 | 同上并 plans:write（限本人负责方案）、plans:formalize |
| market-researcher 市场/研究 | parcels:read、market:write |
| finance-cost 财务/成本 | parcels:read、plans:read、plans:costs:write、parameters:read |
| approver 管理层/审批人 | parcels:read、plans:read、submissions:approve、dashboards:read、handoff:read |
| downstream 下游部门 | handoff:read（只读交接，无投资基础数据编辑权限） |
| admin 业务规则管理员 | users:manage、roles:manage、parameters:manage、audit:read、parcels:read |

补充：`plans:write` 由服务端校验方案 `ownerId` 为当前用户或其被授权人（授权记录在方案上）；管理层默认只读（M15 推荐基线），调整需求经 `plans:copy` 复制提出。

## 1. 认证与用户

### POST /api/auth/login — 登录
- 授权：公开。请求：`{ "username": string, "password": string }`。
- 响应：`{ "token": string, "user": { "id", "username", "displayName", "roles": [string] } }`。
- 错误：401 `INVALID_CREDENTIALS`。

### POST /api/auth/logout — 注销
- 授权：已认证。使当前 token 失效。响应 `204`。

### GET /api/auth/me — 当前用户
- 响应同 login 的 `user`（含角色与权限码汇总 `permissions: [string]`）。

### GET /api/users、POST /api/users、PATCH /api/users/:id — 用户管理
- 授权：`users:manage`。列表支持 `?roleId=&active=`；创建 `{ "username", "displayName", "password", "roleIds": [id], "active": bool }`；PATCH 可改 displayName/roleIds/active（不改密码经此接口，密码重置单独提供）。

### GET /api/roles、POST /api/roles — 角色管理
- 授权：`roles:manage`。角色含 `{ "id", "code", "name", "permissionCodes": [string] }`；内置 7 类业务角色可调整权限码集合。

## 2. 地块机会（parcel）

### GET /api/parcels — 台账列表
- 授权：全部已认证（`parcels:read` 默认授予）。查询参数：`query`（名称模糊，nullable）、`status`（enum `processing|in_review|completed|abandoned`，nullable）、`region`、`ownerId`、`updatedAfter`、`completed`（bool，nullable）。
- 响应 items：`{ "id", "name", "internalNo" nullable, "state", "city" nullable, "district" nullable, "areaSqft" decimal nullable, "status", "currentStageNote" nullable, "adoptedPlanId" nullable, "summary": { "gdv" nullable, "tdc" nullable, "pbt" nullable, "pm" nullable, "sourcePlanId" nullable } , "ownerName", "updatedAt" }`（summary 取采用方案或最新正式测算，未核算字段为 null 并带 `summaryIncomplete: bool` 标记）。

### POST /api/parcels — 新建地块机会
- 授权：`parcels:write`。请求：`{ "name": string required, "state" nullable, "city" nullable, "district" nullable, "areaSqft" decimal nullable, "ownerId" nullable }`（最少只需 name；其余逐步补齐）。
- 响应：地块资源（同 GET 单个）。错误：422 `VALIDATION_FAILED`（name 为空）。

### GET /api/parcels/:id — 地块详情（台账+状态+摘要）
- 响应：列表项全部字段 + `progress: { "profileCollected": bool, "marketResearched": bool, "assessmentDone": bool, "planFormalized": bool, "approvalDone": bool }`。

### PATCH /api/parcels/:id — 更新台账字段
- 授权：`parcels:write`。可更新 state/city/district/areaSqft/name/internalNo/ownerId；状态不经此接口（走状态变更接口）。档案字段变更经 audit 留痕。

### POST /api/parcels/:id/status — 状态变更（留痕）
- 授权：`parcels:write`（负责人或授权业务人员）。请求：`{ "to": enum, "reason": string required, "note": nullable }`。
- 服务端状态机校验：`processing→in_review|abandoned`、`in_review→processing|completed`、`completed→processing`（重新打开需填写理由，语义为“完成后调整”，采用方案仍保留）、`abandoned` 终态。
- `to=completed` 必须满足 `adoptedPlanId` 非空，否则 422 `ADOPTED_PLAN_REQUIRED`。
- 响应：新状态 + 变更记录 `{ "id", "fromStatus", "toStatus", "actor", "reason", "at" }`；写入 parcel_status_history 与 audit 事件。

### DELETE /api/parcels/:id — 删除（受限）
- 授权：`parcels:write`。仅 `processing` 且无正式化方案时可删除；`in_review/completed` 返回 409 `DELETE_FORBIDDEN_STATUS`（提示改用放弃/终止并保留原因）。

### GET /api/parcels/:id/audit — 审计查询
- 授权：`audit:read`（或地块相关人只读本地块）。查询 `?objectId=&action=&after=&before=`；返回 audit_events 脱敏后的条目 `{ "id", "actor", "action", "objectType", "objectId", "at", "summary" }`。

## 3. 地块档案（parcel-profile）

### GET /api/parcels/:id/profile — 读取档案
- 响应字段（全部业务字段，未填写为 null）：
  - 基础：`name`、`internalNo`、`state`、`city`、`district`、`address`、`lotInfo`、`tenure`（enum `freehold|leasehold` nullable）、`tenureYears` int nullable、`totalLandAreaSqft` decimal、`currentUse`、`plannedUse`、`zoning`、`allowedDevelopment`。
  - 地价：`vendorAskingPrice` decimal nullable、`totalLandPrice` decimal nullable、`unitLandPrice` decimal nullable、`landPriceLastEditedBasis`（enum `total|unit` nullable，见 D4 双向录入）、`paymentTerms`、`landFinancingNote`。
  - 转换与费用：`needsConversion` bool、`conversionPremium` decimal nullable、`developmentCharges` decimal nullable、`otherGovChargesNote`。
  - 核查清单：`checklist: [ { "item": enum（title-verified|use-supported|conversion-needed|plot-ratio-basis|school-contribution|cemetery-contribution|road-drainage|site-conditions|charges-in-landprice|charges-in-cost），"status": enum `confirmed|assumed|pending`, "note": nullable } ]`。
  - 归属：`ownershipCompany`、`assetAttribution`。

### PATCH /api/parcels/:id/profile — 更新档案
- 授权：`parcel-profile:write`。请求为上述字段的部分更新；地价两字段同请求提交时，`landPriceLastEditedBasis` 自动取本次实际编辑的最后一项（前端提交编辑序，服务端记录标记并按该字段换算另一侧，全精度）。每次变更写 audit 事件（字段级前后值摘要）。
- 州属口径默认：读取时响应附 `defaultAreaConventionId`（由 parameters 域按 state 推导）；档案不锁定口径（方案级选择）。

### 附件（attachment 模块路由）
- `POST /api/parcels/:id/attachments`（multipart 上传，字段 `file`、`category` enum `title-deed|planning|vendor-quotation|meeting|photo|other`、`note` nullable）；`GET /api/parcels/:id/attachments` 列出 `{ "id", "category", "fileName", "size", "uploadedBy", "uploadedAt", "note" }`；`GET /api/parcels/:id/attachments/:fileId` 下载；`DELETE` 仅 `parcels:write` 且地块未完成。

## 4. 地图（map）

### GET /api/parcels/:id/map — 位置与边界
- 响应：`{ "location": { "lat" decimal, "lng" decimal } nullable, "boundaryGeojson" json nullable, "markers": [ { "id", "kind" enum `parcel|competitor|land-deal|poi`, "refId" nullable（联动市场资料）, "label", "color", "note" } ], "externalMapLinks": [ { "provider" enum `google-maps|other`, "url" } ] }`。

### PUT /api/parcels/:id/map — 保存位置/边界/标记
- 授权：`parcels:write`。请求同响应结构（markers 的 refId 需为本地市场资料 ID 或空）。

### POST /api/parcels/:id/map/views — 保存报告视图快照
- 请求：`{ "name", "view": { "center", "zoom" int, "layers" [string], "markerIds" [id], "boundaryIncluded": bool } }`。服务端返回 `viewId`；快照数据不可变（后续地图操作不影响已保存视图，AC-02）。
- `GET /api/parcels/:id/map/views/:viewId` 返回快照（含渲染所需静态数据）；`GET /api/parcels/:id/map/views` 列表。

## 5. 市场研究（market）

### 土地交易参考
- `GET /api/parcels/:id/market/land-refs?distanceKm=&from=&to=`；`POST` 创建。
- 条目字段：`{ "id", "parcelId", "projectName", "distanceKm" decimal nullable, "dealPrice" decimal nullable, "pricePerSqft" decimal nullable, "priceToRevenueRatio" decimal nullable, "transactedAt" datetime nullable, "dealCondition" nullable, "listingStatus` enum `transacted|listing|unknown`, `source` required, `sourceType`（source-type）, "collectedAt", "confidence` enum `verified|probable|unverified`, "note" nullable }`。

### 住宅/商业竞品
- `GET /api/parcels/:id/market/comps?distanceKm=&format=&priceRange=&status=`（status 指项目销售状态）；`POST` 创建。
- 条目字段：`{ "id", "parcelId", "projectName", "distanceKm" nullable, "format` enum `residential|apartment|service-apartment|hotel|office|retail|other`, `typeTier` nullable, `unitAreaFrom/To` decimal nullable, `askingPrice` decimal nullable, `pricePerSqft` decimal nullable, "totalUnits" int nullable, "soldUnits" int nullable, "absorptionRate" decimal nullable, "positioning" nullable, "incentives" nullable, "affordableFlag" bool, "source" required, "collectedAt", "confidence" enum, "note" nullable }`。

- 规则（服务端强制）：土地成交价与住宅售价分表存储与展示；AI 或导入产生的资料 `confidence` 必须为 `unverified` 且 `sourceType` 标注来源，不得进入正式方案唯一依据（前端并列展示但打“待确认”标记）。

## 6. 快速评估（assessment）

### POST /api/parcels/:id/quick-assessments — 保存评估输入
- 授权：`quick-assessments:write`。请求 `inputs`：`{ "locationNote", "landAreaSqft" decimal, "useOrZoning", "plotRatioOrDensity" decimal, "productMixNote", "estimatedUnitsOrSaleableArea", "unitPriceOrPricePerSqft" decimal, "landCostTotal" decimal nullable, "landCostPerSqft" decimal nullable, "landCostLastEditedBasis" enum, "constructionCostPerSqft" decimal, "miscGovPerSqft" decimal nullable, "professionalFeePct" decimal nullable, "salesMarketingPct" decimal nullable, "financeCostPct" decimal nullable, "policyAssumptions" json nullable（土著配额/折扣、可负担比例）, "costPackageId" nullable（引用 parameters 版本） }`。
- 响应：`{ "id", "parcelId", "inputs", "results": null, "verdict": null, "createdAt", "createdBy", "updatedAt" }`。

### POST /api/quick-assessments/:id/compute — 试算（服务端计算引擎）
- 授权：`quick-assessments:write`。无请求体（按当前 inputs 计算）；响应更新 `results`：`{ "gdv" decimal, "bumiQuotaDiscount" decimal, "netGdv" decimal, "constructionCost" decimal, "miscGov" decimal, "professionalFee" decimal, "salesMarketing" decimal, "financeCost" decimal, "tdc" decimal, "pbt" decimal, "pm" decimal, "landCostPerSqft" decimal, "landCostToNetRevenueRatio" decimal, "tdcToRevenueRatio" decimal }`、`verdict` enum `PASS|REJECT|DROP|INSUFFICIENT`、`verdictNote`、`nextAction` enum `market-research|title-verification|site-visit|price-negotiation|jv|abandon` + `nextActionNote`。
- 输入缺失导致无法计算时 `verdict=INSUFFICIENT` 并在 `verdictNote` 列出缺失项，不输出伪造精确结论。修改 inputs 后重新 compute，结果同步覆盖该评估记录（评估本身可快速修改）。

### GET /api/quick-assessments — 多机会组合视图
- 查询 `?state=&verdict=&ownerId=`；返回多地块评估并列：`{ "id", "parcelId", "parcelName", "state", "verdict", "results"（同上核心字段）, "updatedAt" }`，用于横向比较（AC-03）。

## 7. 开发方案与正式测算（plan）

### 方案资源形状（GET /api/plans/:id）
- 元数据：`{ "id", "parcelId", "phaseCount" int, "name" required（含业务假设描述）, "kind" enum `baseline|candidate`, "status" enum `draft|saved|formalized|in_review|adopted|not_selected|returned`, "sourcePlanId" nullable, "copiedAt" nullable, "copiedBy" nullable, "changeNote" nullable, "ownerId", "assumptionTags" [string]（如 “容积率 4.0”“不含会所”“含可负担 15%”）, "parameterRefs": { "areaConventionId" nullable, "costPackageIds" [id] nullable, "policyRefs" [id] nullable }, "createdAt", "updatedAt" }`。
- 输入 `inputs`（按状态可编辑）：
  - `areaBasis`：`{ "landAreaSqft" decimal, "plotRatioOrDensity" decimal, "densityBasis" enum `plot-ratio|units-per-acre`, "areaConventionId" id, "areaConventionReason" string（手动切换时 required）, "gfaIncludesParking": bool, "nfaMode": enum `convention-default|manual`, "manualEfficiency" decimal nullable }`。
  - `phases`: [ `{ "id", "name", "seq" int, "landAllocation": { "method": enum `by-land-area|by-gfa|manual`, "value": decimal nullable }, "products": [ { "id", "format" enum（同竞品 format + `mixed-use`）, "tier" nullable（Type A/B/C/D、可负担、Madani/SAMM/RSKU 等）, "sharePct" decimal, "units" int, "unitAreaSqft" decimal, "saleableAreaSqft" decimal, "price" decimal nullable, "pricePerSqft" decimal nullable, "priceBasis" enum `unit-price|per-sqft|policy-fixed`（政策价格用于可负担产品）, "bumiQuotaPct" decimal nullable, "bumiDiscountPct" decimal nullable, "affordableQuota" json nullable, "parkingPerUnit" decimal nullable } ], "gfaBreakdown": json（塔楼/停车楼/裙房/配套分类面积） } ]`。
  - `parking`：`{ "govMin" int required, "internalTarget" int required, "usedBasis": enum `gov|internal` required（测算明确采用哪一组）, "visitorSlots" int nullable, "extraInternalSlots" int nullable, "areaPerSlotSqft" decimal }`（政府要求与内部目标分离，AC-12）。
  - `costs`: [ `{ "id", "phaseId" nullable（null=全项目公共）, "category" enum `land|construction|infrastructure|furniture-equipment|contingency-tax|misc-gov|professional-pm|sales-marketing|finance`（九类）, "itemName", "basis" enum `fixed|per-land-area|per-gfa|per-saleable|pct-revenue|pct-cost|per-unit|per-parking|per-year`, "value" decimal, "sourceType`（source-type）, "status" enum `confirmed|zero|pending`, "note" nullable } ]`（全量列出可停用填 0，未知用 pending+Others 项，AC-05）。
  - `commonPools`: [ `{ "id", "category"（同上枚举）, "amount" decimal, "allocationBasis": enum `saleable-area|gfa|units|custom-ratio`, "customRatios" json nullable（期次→比例）, "ruleNote" } ]`（AC-11 分摊）。
  - 地价录入：`inputs.landPrice`: `{ "total" decimal nullable, "perSqft" decimal nullable, "lastEditedBasis" enum `total|per-sqft` }`（D4）。

### POST /api/parcels/:id/plans — 新建基准方案
- 授权：`plans:write`。请求：`{ "name" required, "initialAreaConventionId" nullable（默认取州属口径）, "copyFromQuickAssessmentId" nullable }`。创建 status=draft、kind=baseline、单 phase 骨架。

### POST /api/plans/:id/copy — 复制方案（版本链）
- 授权：`plans:copy`。请求：`{ "changeNote" required, "asKind": enum `candidate|baseline` default candidate }`。
- 任何状态均可复制（含 adopted，用于冻结后再研究）；副本 status=draft，保留 `sourcePlanId/copiedAt/copiedBy/changeNote` 与完整输入（引用同名参数版本）。响应新方案资源。AC-06：原方案内容不变。

### PATCH /api/plans/:id/inputs — 更新测算输入（受限状态）
- 授权：`plans:write`（且 ownerId 匹配）。请求为 `inputs` 任意子对象（areaBasis/phases/parking/costs/commonPools/landPrice 整体替换式提交）。
- 状态限制：`formalized/in_review/adopted/not_selected/returned` 返回 403 `PLAN_LOCKED`（提示复制新方案）；`plans:costs:write` 角色仅可提交 costs/commonPools 子对象。
- 校验（422 `VALIDATION_FAILED`，details 列字段+原因）：产品 `sharePct` 合计须为 100；`units×unitArea` 与 saleable 面积一致性；车位低于 `usedBasis` 对应组数值；`phaseId` 引用存在；分摊比例合计为 1；地价 lastEditedBasis 与两字段一致性。
- 每次保存事务内完成输入+重算当前结果（服务端计算引擎），联动更新（AC-04）。

### POST /api/plans/:id/formalize — 正式化
- 授权：`plans:formalize`（方案负责人）。前置：校验全部通过（占比/约束/地价/口径引用），未通过返回 422 `FORMALIZE_CHECKS_FAILED` + details。
- 效果（事务）：status draft/saved→formalized；生成 `plan_snapshots(kind=formalized)`（完整 inputs+results 冻结快照）；audit 记录。响应方案资源+`snapshotId`。

### GET /api/plans/:id/results — 计算结果（可展开）
- 响应：`{ "results": { "gfaTotal" decimal, "gfaExParking" decimal, "nfaTotal" decimal, "efficiencyExParking" decimal, "efficiencyInclParking" decimal, "totalUnits" int, "unitsPerAcre" decimal, "revenue": { "byProduct": [ { "productId", "format", "revenue" decimal, "bumiAdjustment" decimal } ], "gdv" decimal, "bumiQuotaDiscount" decimal, "netGdv" decimal, "parkingRevenue" decimal, "otherSaleableRevenue" decimal }, "costs": { "byCategory": [ { "category", "amount", "items": [ { "costItemId", "itemName", "amount", "sourceType", "status" } ] } ], "commonPoolAllocations": [ { "poolId", "phaseId", "amount", "basis" } ], "tdc" decimal }, "profit": { "pbt" decimal, "pat" decimal nullable（财务口径未确认时 null）, "pm" decimal, "perUnit" json, "perSqft" json, "perAcre" json } }, "computedAt", "basis": { "areaConventionId", "landPriceBasis" } }`。
- 展开规则：每层汇总可下钻到组成项（前端按此树渲染；`status=pending` 项显示“待确认”，AC-05）；“销售收入与净销售收入同时保留”。

### GET /api/parcels/:id/plans — 方案列表
- 查询 `?status=&kind=`；返回方案元数据列表（不含输入明细）。

### POST /api/plans/:id/area-convention — 切换口径
- 授权：`plans:write`。请求 `{ "areaConventionId" required, "reason" required }`；更新 parameterRefs.areaConventionId 并重算；州属默认仅作为初始值（地址与口径独立字段，AC-14）。

## 8. 敏感性与反算（analysis）

### POST /api/plans/:id/sensitivity — 敏感性矩阵
- 授权：`plans:read`（管理层可触发分析）。请求：`{ "dimensions": [ { "variable": enum `land-price|unit-price|construction-cost|plot-ratio|efficiency|conversion-premium|finance-rate|finance-term|affordable-ratio|parking-count|product-mix`, "values": [decimal]（逗号解析后提交，或批量粘贴解析为数组） } ]（1–2 个维度）, "targetPm": decimal nullable, "colorRule": { "targetLine": decimal, "zones": [ { "aboveTarget": string, "nearTarget": string, "belowTarget": string } ] } nullable（颜色规则参数化，不写死页面，AC-13） }`。
- 响应：`{ "matrix": [ { "coord": [decimal], "pm" decimal, "pbt" decimal, "tdc" decimal, "netGdv" decimal, "feasibility": enum `feasible|marginal|infeasible`, "riskNote" nullable } ], "colorRuleApplied" }`。服务端按方案输入逐组合重算（含建筑成本维度）；不可行组合带风险提示，不输出零利润线作为主要结论。
- 状态限制：方案处于任意状态均可分析（分析不修改方案）。

### POST /api/plans/:id/back-solve — 目标反算
- 请求：`{ "targetPm" decimal required, "solveFor": enum `max-land-price|min-unit-price|max-construction-cost` }`。
- 响应：`{ "targetPm", "solveFor", "resultValue" decimal, "basisNote" }`。

### POST /api/plans/compare — 方案比较
- 请求：`{ "planIds": [id]（≥2） }`。响应：`{ "rows": [ { "dimension", "values": [decimal|string|null] } ], "plans": [方案元数据] }`，维度含土地面积/容积率/效率/总单位数、产品组合/可负担比例/车位、各售价/GDV/净 GDV、九类成本、TDC/PBT/PM/单位指标、风险与未确认事项；前端多列并列展示，支持列头下钻 `GET /api/plans/:id`（AC-07）。仅比较同一地块下的方案。

## 9. 审批与决策（approval）

### POST /api/parcels/:id/submissions — 提交审批
- 授权：`submissions:create`（方案负责人）。请求：`{ "planIds": [id]（≥1，全部须为 formalized）, "note" nullable }`。
- 校验：任一方案非 formalized 返回 422 `NOT_FORMALIZED`（草稿不能提交，AC-08）。效果（事务）：创建 `submissions(status=pending)`；所选方案 status→in_review；地块 status→in_review；audit 留痕。响应 submission 资源。

### GET /api/submissions/:id — 审批详情
- 响应：`{ "id", "parcelId", "plans": [方案元数据+formalized 快照摘要], "submittedBy", "submittedAt", "status": enum `pending|approved|returned`, "actions": [ { "id", "actor", "action": enum `approve|return`, "reason" nullable, "selectedPlanId" nullable, "at" } ], "returnCount" int }`。审批人可经 `GET /api/plans/:id` 查看完整明细与市场依据（M15 审批人可查不可改）。

### POST /api/submissions/:id/approve — 通过并选择采用方案
- 授权：`submissions:approve`。请求：`{ "selectedPlanId": id required, "reason" nullable }`。
- 效果（事务）：选中方案 status→adopted 并生成 `plan_snapshots(kind=adopted)`（永久冻结快照）；同批其余方案 status→not_selected；submission status→approved；地块 adoptedPlanId 置位、status→completed（决策记录 creation）；写 decision_records 与 audit。
- 多审批人规则〔未规定〕：本期按单人审批实现，权限码可授予多人（先到先生效，后到的重复 approve 幂等返回当前状态）。

### POST /api/submissions/:id/return — 退回
- 授权：`submissions:approve`。请求：`{ "reason": string required }`（无原因 422）。效果（事务）：同批方案 status→returned（不可直接编辑，须复制调整再提交，推荐基线）；submission status→returned；地块回 processing；audit 留痕。

### GET /api/parcels/:id/decision-record — 决策记录
- 响应：`{ "parcelId", "adoptedPlanId" nullable, "action": enum `continue|abandon|negotiate|site-visit|jv` nullable, "reason", "decidedAt", "decidedBy", "handoffTo" nullable }`；放弃/终止地块同样生成决策记录（含当时判断依据）。

## 10. 报告、看板与交接（report）

### GET /api/parcels/:id/dashboard — 管理层看板（结论优先）
- 授权：`dashboards:read`。响应：`{ "conclusion": { "recommendation": enum（同 decision-record action）, "oneLineReason" } nullable（未核算时 null 且 `incomplete: true`，不伪装成最终结论）, "coreMetrics": { "gdv", "netGdv", "tdc", "pbt", "pm", "landCostRatio" } nullable, "recommendedPlan": 方案元数据 nullable, "risks": [ { "text", "source": enum `pending-item|sensitivity|checklist` } ], "nextSteps": [ { "action", "owner" nullable, "doneWhen" } ], "links": { "planDetail": url nullable, "report": url, "marketBasis": url } }`（结论/核心指标/推荐/风险/下一步在前，历史成交与详细计算在后续区域，AC-09；所有核心数字可跳回方案明细与业务依据）。

### GET /api/parcels/:id/report — 投资报告数据
- 响应按需求 M14 十段结构聚合：`{ "sections": [ { "key": enum `conclusion|site-overview|location|market|dev-plan|financial-summary|cost-structure|sensitivity-risk|jv-phasing|recommended-actions`, "data": json（含对应明细与来源引用、地图视图快照 ID、口径说明） } ] }`；报告数据来自快照与档案，标注“市场事实/业务判断/测算假设”分层。

### POST /api/parcels/:id/handoff — 生成交接快照
- 授权：`parcels:write`（业务负责人）。前置：地块 completed 且 adoptedPlanId 存在，否则 422 `ADOPTED_PLAN_REQUIRED`。效果：生成 `handoff_exports`（采用方案快照+版本号+全部假设+口径+分摊规则+待确认事项+审批结论+意见+决策日期+附件清单），不可变。
- `GET /api/parcels/:id/handoff/latest`（授权 `handoff:read`，下游只读）：返回交接内容（只读，不含编辑入口）；`GET /api/parcels/:id/handoff/export?format=csv|xlsx`：受控导出（附口径说明 sheet/附录；带公式导出〔未规定〕本期不提供，先提供带依据结果导出）。
- 下游修改请求不经此通道：调整须由下游发起业务变更/新版本申请（人工流程+decision-record 变更记录），冻结版本不被改动（AC-10）。

## 11. 参数与口径（parameters）

### GET /api/parameters — 参数版本查询
- 授权：已认证（写操作才需 `parameters:manage`）。查询 `?kind=&region=&effectiveAt=`（不传 effectiveAt 返回当前生效版本，传日期返回该时点版本）。
- 条目：`{ "id", "kind": enum `area-convention|cost-package|policy|fee-item|option-list`, "region" nullable（州/适用地区）, "version" int, "effectiveAt" datetime, "createdBy", "scope": json（适用业态/产品/州）, "content": json（口径公式描述/成本套餐明细/政策比例/费用项定义/选项列表）, "changeNote" }`。

### POST /api/parameters — 发布新版本
- 授权：`parameters:manage`。请求：`{ "kind", "region" nullable, "content": json, "effectiveAt" required, "scope": json, "changeNote" required }`。效果：同 kind+region 生成新 version（历史版本不可修改）；audit 记录生效时间/修改人/适用范围；仅影响新建或重新选择规则的方案（AC-14）。

### GET /api/parameters/:id — 历史版本读取
- 用于历史方案按原口径复现计算（快照渲染与审计追溯）。

## 12. AI 建议（ai，P1 预留）

### POST /api/ai/suggestions — 生成建议
- 授权：`quick-assessments:write` 或 `plans:read`（按 kind）。请求：`{ "parcelId" required, "kind": enum `market-summary|plan-adjustment`, "prompt" nullable, "targetPlanId" nullable（plan-adjustment 时 required） }`。
- 响应：`{ "id", "status": enum `pending|confirmed|dismissed`, "kind", "content": json（市场归纳或调整建议，含参数变化建议）, "sources": [ { "refType": enum `market-land-ref|market-comp|parameter|public-clue`, "refId" nullable, "confidence": enum（AI 抓取/推断默认 unverified）, "note" } ], "createdAt" }`。
- 边界：AI 建议不写正式方案；所有来源 `unverified` 待确认；provider 调用失败返回 502 `AI_PROVIDER_UNAVAILABLE`，无部分写入。

### POST /api/ai/suggestions/:id/confirm — 确认采纳
- 授权：`plans:write`（目标方案负责人）。效果：plan-adjustment 建议派生候选方案（copy 语义，sourcePlanId=目标方案，assumptionTags 注明 AI 建议）；market-summary 建议转入市场资料（confidence 由确认人复核后标注）；audit 留痕。确认前的基准/正式/采用方案内容不变（AC-06/AC-15）。

### POST /api/ai/suggestions/:id/dismiss — 驳回
- 效果：status→dismissed，留痕。

## 13. 错误码清单

| HTTP | code | 场景 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | 请求体格式错误 |
| 401 | `UNAUTHENTICATED` / `INVALID_CREDENTIALS` | 未登录 / 登录失败 |
| 403 | `FORBIDDEN` / `PLAN_LOCKED` | 权限码不足 / 方案状态禁止编辑（复制新方案） |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `DELETE_FORBIDDEN_STATUS` / `STATUS_CONFLICT` | 审批中/完成地块删除 / 非法状态迁移 |
| 422 | `VALIDATION_FAILED` / `NOT_FORMALIZED` / `FORMALIZE_CHECKS_FAILED` / `ADOPTED_PLAN_REQUIRED` / `RETURN_REASON_REQUIRED` | 字段与约束校验、正式化前置、完成需采用方案、退回需原因 |
| 502 | `AI_PROVIDER_UNAVAILABLE` | AI provider 失败（无部分写入） |

## 14. 服务端实现责任（映射与转换）

- 计算引擎唯一负责：面积/口径换算、收入链（产品销售额→GDV→政策折扣→净 GDV）、九类成本归集与分摊、TDC/PBT/PM 与单位指标、敏感性矩阵与反算；前端不得实现业务公式。
- 状态机唯一负责：地块与方案的全部状态迁移、锁定与冻结判定（D2）；前端仅展示状态与受限提示。
- 精度与舍入唯一负责：服务端全精度计算与快照存储；前端仅做展示舍入且不得回写（D4 含地价双向录入）。
- 权限判定唯一负责：permissionkit 角色权限码 + 方案 owner 校验；前端按钮显隐仅为体验层，服务端强制。
- 审计写入唯一负责：服务端在各写操作事务内写 audit_events；前端不直接写审计。
