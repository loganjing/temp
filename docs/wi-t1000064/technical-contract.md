# 技术契约：资产领用单 API（wi-t1000064）

本文件是前后端共同遵循的字段级 API 契约，是字段、类型、可空性、错误与编号规则的唯一来源。架构结论见 `docs/wi-t1000064/architecture-baseline.md`。

## 1. 通用约定

- Base 路径：`/api`；请求与响应体均为 `application/json; charset=utf-8`。
- 日期：`pick_date` 为 `yyyy-MM-dd`；日期时间（createtime、modifytime、modifydatefield）为 `yyyy-MM-ddTHH:mm:ss`（服务器本地时间，无时区后缀）。
- 主键：URL 使用内部 `id`（INTEGER）；对外展示与追溯使用 `billno`。
- 系统字段（billno、creator、createtime、modifier、modifytime、分录 modifierfield/modifydatefield）由服务端生成，请求中出现时忽略。
- 幂等性：创建接口非幂等，每次成功调用生成一张新单据与新单号；无更新/删除接口（需求未定义对应旅程）。

**统一错误结构**（HTTP 4xx/5xx）：

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "保存校验未通过",
    "details": [
      { "path": "picker", "message": "领用人不能为空" },
      { "path": "entries", "message": "明细分录不能为空" },
      { "path": "entries[2].asset_name", "message": "资产名称不能为空" }
    ]
  }
}
```

`path` 为请求体字段路径，分录行使用 `entries[行号]`（行号 0 起）。前端按 `path` 定位字段级提示；无 `details` 时按 `message` 汇总展示。

错误响应沿用应用脚手架的平台错误形状 `{error:{code,message}}`（根目录 `platform-baseline.json` 的 apiError 约定）；`details` 为本设计在其上的扩展，用于字段级定位，实现时不得破坏平台错误处理边界。

## 2. POST /api/asset-apply-bills（创建保存）

**请求体**：

```json
{
  "pick_date": "2026-10-18",
  "picker": "张三",
  "pick_dept": "行政部",
  "org": "示例公司",
  "purpose": "新员工办公设备领用",
  "remark": "",
  "entries": [
    {
      "asset_name": "笔记本电脑",
      "asset_code": "ZC-0001",
      "spec_model": "ThinkPad X1",
      "qty": 1,
      "unit": "台",
      "location": "A区库房",
      "line_remark": ""
    }
  ]
}
```

**请求字段定义**：

| 字段 | 类型 | 必填 | 校验 | 说明 |
| --- | --- | --- | --- | --- |
| pick_date | string(yyyy-MM-dd) | 是 | 合法日期格式 | 领用日期 |
| picker | string | 是 | 非空 | 领用人 |
| pick_dept | string | 是 | 非空 | 领用部门 |
| org | string | 是 | 非空 | 组织 |
| purpose | string | 否 | — | 用途说明，可空串视为 NULL |
| remark | string | 否 | — | 备注，可空串视为 NULL |
| entries | array | 是 | 非空数组 | 明细分录，至少 1 行 |
| entries[].asset_name | string | 是 | 非空 | 资产名称 |
| entries[].asset_code | string | 否 | — | 资产编码 |
| entries[].spec_model | string | 否 | — | 规格型号 |
| entries[].qty | number | 是 | 非空数值 | 数量，前端默认传 1 |
| entries[].unit | string | 否 | — | 单位 |
| entries[].location | string | 否 | — | 存放位置 |
| entries[].line_remark | string | 否 | — | 行备注 |

**服务端行为**：按上表执行权威校验 → 写事务内取号（见 §4）→ 插入主表与分录 → 提交。校验失败不产生任何数据。

**响应 201**（完整单据，字段与 GET /api/asset-apply-bills/:id 一致）：

```json
{
  "id": 1,
  "billno": "LY202610180001",
  "pick_date": "2026-10-18",
  "picker": "张三",
  "pick_dept": "行政部",
  "org": "示例公司",
  "purpose": "新员工办公设备领用",
  "remark": null,
  "billstatus": "创建",
  "creator": "系统用户",
  "createtime": "2026-10-18T09:40:00",
  "modifier": "系统用户",
  "modifytime": "2026-10-18T09:40:00",
  "auditor": null,
  "auditdate": null,
  "entries": [
    {
      "id": 1,
      "seq": 1,
      "asset_name": "笔记本电脑",
      "asset_code": "ZC-0001",
      "spec_model": "ThinkPad X1",
      "qty": 1,
      "unit": "台",
      "location": "A区库房",
      "line_remark": null,
      "modifierfield": "系统用户",
      "modifydatefield": "2026-10-18T09:40:00"
    }
  ]
}
```

可选字段为 NULL 或省略时，响应中一律输出 NULL（除 qty 恒有值）。`qty` 为数值，原样回显录入值。

**错误 400**（VALIDATION_FAILED），错误码与文案：

| code | 触发条件 | message / details 文案 |
| --- | --- | --- |
| VALIDATION_FAILED | 主表必填字段缺失/格式非法 | 按 path 输出「{字段名}不能为空」或格式提示 |
| VALIDATION_FAILED | entries 缺失或空数组 | path=entries，message=「明细分录不能为空」 |
| VALIDATION_FAILED | 某行 asset_name 为空 | path=entries[n].asset_name，message=「资产名称不能为空」 |
| VALIDATION_FAILED | 某行 qty 缺失/非数值 | path=entries[n].qty，message=「数量不能为空」 |

**错误 409**（BILLNO_CONFLICT，兜底）：单号唯一约束冲突（事务重试后仍失败），提示稍后重试；正常负载下不出现。

## 3. 查询与详情

### GET /api/asset-apply-bills（条件查询）

Query 参数（均可省略，省略时不参与过滤）：

| 参数 | 匹配方式 | 说明 |
| --- | --- | --- |
| billno | 包含匹配（LIKE %v%，忽略首尾空格） | 领用单号 |
| picker | 包含匹配 | 领用人 |
| pick_date | 精确等于（yyyy-MM-dd） | 领用日期 |
| page | 整数，默认 1 | 页码 |
| pageSize | 整数，默认 20，上限 100 | 每页条数 |

**响应 200**：

```json
{
  "items": [ { "id": 1, "billno": "LY202610180001", "pick_date": "2026-10-18", "picker": "张三", "pick_dept": "行政部", "org": "示例公司", "billstatus": "创建", "createtime": "2026-10-18T09:40:00", "modifier": "系统用户", "modifytime": "2026-10-18T09:40:00" } ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

`items` 为单据摘要（主表字段，不含 purpose/remark/auditor/auditdate 长文本与分录，详情接口获取）。按 createtime 降序排列（最新单据在前）。`total` 为符合条件的总条数。

非法 page/pageSize（非正整数或超上限）按默认值/上限处理，不报错。

### GET /api/asset-apply-bills/:id（详情回读）

**响应 200**：与 POST 响应结构一致（主表全字段 + entries 按 seq 升序）。

**错误 404**（BILL_NOT_FOUND）：`{ "error": { "code": "BILL_NOT_FOUND", "message": "领用单不存在" } }`。

## 4. 单号规则（权威生成）

- 格式：`LY` + `yyyyMMdd`（保存时服务器本地日期）+ 4 位十进制流水号，不足补零，如 `LY202610180001`。
- 事务内取号：`prefix = 'LY' + yyyyMMdd`；`INSERT OR IGNORE INTO billno_seq(prefix, next_seq) VALUES (prefix, 1)`；`UPDATE billno_seq SET next_seq = next_seq + 1 WHERE prefix = prefix RETURNING next_seq - 1` 得到流水号。
- 同日前缀共用序列递增；跨日新前缀从 0001 重新计数；单日流水超过 9999 时输出实际位数（如 10000），唯一性优先。
- `asset_apply_bill.billno` UNIQUE 约束为最终防线；序列变更随保存事务提交或回滚。
- 客户端不参与取号，任何请求传入的 billno 一律忽略。

## 5. 前端消费约定

- 表单提交前执行与 §2 相同的本地预检，提示文案与服务端 details 文案一致（「明细分录不能为空」「资产名称不能为空」等）；服务端错误仍按统一错误结构渲染。
- 列表页三个筛选项与 GET 查询参数一一对应（billno、picker、pick_date）。
- 详情页与打印视图均以 GET /api/asset-apply-bills/:id 为数据源；打印视图不发起写操作。
