# 技术契约

> Work Item: wi-t1000026 | 配套文档: architecture-baseline.md

## 1. API 契约

### POST /api/visitors

提交访客登记。

**请求体**

| 字段 | 类型 | 可空 | 必填 | 校验规则 | 说明 |
|------|------|------|------|----------|------|
| name | string | 否 | 是 | 非空，长度 1-50 | 访客姓名 |
| phone | string | 否 | 是 | 非空，长度 1-20 | 手机号码 |
| id_card | string | 否 | 是 | 非空，长度 1-32 | 身份证号 |
| company | string | 否 | 是 | 非空，长度 1-100 | 公司信息 |
| visit_reason | string | 否 | 是 | 非空，长度 1-500 | 访问事由 |
| host_person | string | 否 | 是 | 非空，长度 1-50 | 被访人 |
| expected_arrival_time | string | 否 | 是 | ISO 8601 格式 | 预计到访时间 |
| license_plate | string | 是 | 否 | 长度 0-20（传入空字符串视为 null） | 车牌号 |

**响应 201**

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | integer | 否 | 登记记录 ID |
| name | string | 否 | 访客姓名 |
| phone | string | 否 | 手机号码 |
| id_card | string | 否 | 身份证号 |
| company | string | 否 | 公司信息 |
| visit_reason | string | 否 | 访问事由 |
| host_person | string | 否 | 被访人 |
| expected_arrival_time | string | 否 | 预计到访时间（ISO 8601） |
| license_plate | string \| null | 是 | 车牌号 |
| status | string | 否 | 固定值 `"pending"` |
| created_at | string | 否 | 创建时间（ISO 8601） |
| updated_at | string | 否 | 更新时间（ISO 8601） |
| reviewed_at | string \| null | 是 | 审批时间，提交时为 null |

**响应 400**

| 字段 | 类型 | 说明 |
|------|------|------|
| error | string | 错误描述 |
| fields | string[] | 缺失或校验失败的必填字段名列表 |

### GET /api/visitors

查询访客登记列表，支持按状态筛选。

**查询参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| status | string | 否 | 无（返回全部） | `pending` / `approved` / `rejected` |
| page | integer | 否 | 1 | 页码，从 1 开始 |
| limit | integer | 否 | 20 | 每页条数，最大 100 |

**响应 200**

| 字段 | 类型 | 说明 |
|------|------|------|
| items | Visitor[] | 访客登记记录数组（字段同 POST 响应） |
| total | integer | 符合筛选条件的记录总数 |
| page | integer | 当前页码 |
| limit | integer | 每页条数 |

### GET /api/visitors/:id

查询单条访客登记详情。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| id | integer | 访客登记记录 ID |

**响应 200**

字段同 POST /api/visitors 的 201 响应。

**响应 404**

| 字段 | 类型 | 说明 |
|------|------|------|
| error | string | `"visitor not found"` |

### PATCH /api/visitors/:id/status

更新访客审批状态。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| id | integer | 访客登记记录 ID |

**请求体**

| 字段 | 类型 | 必填 | 校验规则 | 说明 |
|------|------|------|----------|------|
| status | string | 是 | `approved` 或 `rejected` | 目标审批状态 |

**响应 200**

字段同 POST /api/visitors 的 201 响应，`status` 为更新后的值，`reviewed_at` 为审批操作时间。

**响应 400**

| 字段 | 类型 | 说明 |
|------|------|------|
| error | string | 错误描述（无效状态值或记录已处理） |

**响应 404**

| 字段 | 类型 | 说明 |
|------|------|------|
| error | string | `"visitor not found"` |

## 2. 实体 ID 对照表

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|------|--------|----------------|----------|---------------|----------|--------------|
| Visitor ID | 数据库 AUTOINCREMENT | INTEGER PRIMARY KEY | —（无外键引用） | integer (JSON number) | number | 后端 API 响应直接返回；前端作为路径参数 `/:id` 传递，后端 `parseInt` 校验为正整数 |

## 3. 状态流转规则

| 当前状态 | 允许的目标状态 | 触发方 |
|----------|----------------|--------|
| pending | approved | 审批人通过 PATCH /api/visitors/:id/status |
| pending | rejected | 审批人通过 PATCH /api/visitors/:id/status |
| approved | （终态，不可变更） | — |
| rejected | （终态，不可变更） | — |

对终态记录执行 PATCH 应返回 400 错误，提示记录已处理。
