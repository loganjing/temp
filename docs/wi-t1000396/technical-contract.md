# 技术契约

本文档定义访客系统跨组件 API 契约的字段级细节。架构基线只保留接口摘要，字段定义以本文档为唯一来源。

## 实体 ID 对照表

| 实体 | 生成方 | 数据库主键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|------|--------|----------------|---------------|----------|---------------|
| visitor.id | 后端应用层（UUID v4） | TEXT | string | string | 后端生成，前端原样传递和展示 |

## API 错误格式

所有 API 错误响应统一格式：

```json
{ "error": { "code": "ERROR_CODE", "message": "人类可读描述" } }
```

| HTTP 状态 | code | 说明 |
|-----------|------|------|
| 400 | VALIDATION_ERROR | 请求参数校验失败 |
| 404 | NOT_FOUND | 资源不存在 |
| 500 | INTERNAL_ERROR | 服务端内部错误 |

## POST /api/visitors — 创建访客登记

调用方：微信小程序

### 请求体

| 字段 | 类型 | 可空 | 校验规则 | 说明 |
|------|------|------|----------|------|
| name | string | 否 | 非空，1-50 字符 | 访客姓名 |
| phone | string | 否 | 11 位数字，1开头 | 手机号码 |
| idCard | string | 否 | 18 位，符合身份证校验规则 | 身份证号 |
| company | string | 否 | 非空，1-100 字符 | 公司信息 |
| visitReason | string | 否 | 非空，1-500 字符 | 访问事由 |
| hostName | string | 否 | 非空，1-50 字符 | 被访人姓名 |
| expectedVisitTime | string | 否 | ISO 8601 日期时间 | 预计到访时间 |
| photoUrl | string | 是 | URL 格式或 null | 访客照片 URL（选填） |

### 成功响应（201）

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | 访客记录 ID |
| name | string | 否 | 访客姓名 |
| phone | string | 否 | 手机号码 |
| idCard | string | 否 | 身份证号 |
| company | string | 否 | 公司信息 |
| visitReason | string | 否 | 访问事由 |
| hostName | string | 否 | 被访人姓名 |
| expectedVisitTime | string | 否 | 预计到访时间 |
| photoUrl | string\|null | 是 | 访客照片 URL |
| status | string | 否 | 固定为 `"pending"` |
| createdAt | string | 否 | 创建时间（ISO 8601） |

### 错误响应

| 状态 | code | 触发条件 |
|------|------|----------|
| 400 | VALIDATION_ERROR | 必填字段缺失、格式不合法 |

## GET /api/visitors — 查询访客列表

调用方：审批前端

### 查询参数

| 参数 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| status | string | 是 | 不筛选 | 筛选状态：`pending` / `approved` / `rejected` |
| page | number | 是 | 1 | 页码，从 1 开始 |
| limit | number | 是 | 20 | 每页条数，最大 100 |

### 成功响应（200）

| 字段 | 类型 | 说明 |
|------|------|------|
| items | array | 访客摘要数组 |
| items[].id | string | 访客记录 ID |
| items[].name | string | 访客姓名 |
| items[].phone | string | 手机号码 |
| items[].company | string | 公司信息 |
| items[].hostName | string | 被访人姓名 |
| items[].expectedVisitTime | string | 预计到访时间 |
| items[].status | string | 状态 |
| items[].createdAt | string | 创建时间 |
| total | number | 总记录数 |
| page | number | 当前页码 |
| limit | number | 每页条数 |

## GET /api/visitors/:id — 查询访客详情

调用方：审批前端

### 路径参数

| 参数 | 说明 |
|------|------|
| id | 访客记录 ID |

### 成功响应（200）

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | 访客记录 ID |
| name | string | 否 | 访客姓名 |
| phone | string | 否 | 手机号码 |
| idCard | string | 否 | 身份证号 |
| company | string | 否 | 公司信息 |
| visitReason | string | 否 | 访问事由 |
| hostName | string | 否 | 被访人姓名 |
| expectedVisitTime | string | 否 | 预计到访时间 |
| photoUrl | string\|null | 是 | 访客照片 URL |
| status | string | 否 | 状态 |
| reviewComment | string\|null | 是 | 审批意见 |
| reviewedAt | string\|null | 是 | 审批时间 |
| createdAt | string | 否 | 创建时间 |
| updatedAt | string | 否 | 更新时间 |

### 错误响应

| 状态 | code | 触发条件 |
|------|------|----------|
| 404 | NOT_FOUND | 指定 ID 的访客记录不存在 |

## POST /api/visitors/:id/approve — 审批通过

调用方：审批前端

### 路径参数

| 参数 | 说明 |
|------|------|
| id | 访客记录 ID |

### 请求体

| 字段 | 类型 | 可空 | 校验规则 | 说明 |
|------|------|------|----------|------|
| comment | string | 是 | 最多 500 字符 | 审批意见（选填） |

### 成功响应（200）

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | 访客记录 ID |
| status | string | 否 | 固定为 `"approved"` |
| reviewComment | string\|null | 是 | 审批意见 |
| reviewedAt | string | 否 | 审批时间（ISO 8601） |

### 错误响应

| 状态 | code | 触发条件 |
|------|------|----------|
| 400 | VALIDATION_ERROR | 当前状态非 `pending`，不可重复审批 |
| 404 | NOT_FOUND | 访客记录不存在 |

## POST /api/visitors/:id/reject — 审批驳回

调用方：审批前端

### 路径参数

| 参数 | 说明 |
|------|------|
| id | 访客记录 ID |

### 请求体

| 字段 | 类型 | 可空 | 校验规则 | 说明 |
|------|------|------|----------|------|
| comment | string | 是 | 最多 500 字符 | 审批意见（选填） |

### 成功响应（200）

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | string | 否 | 访客记录 ID |
| status | string | 否 | 固定为 `"rejected"` |
| reviewComment | string\|null | 是 | 审批意见 |
| reviewedAt | string | 否 | 审批时间（ISO 8601） |

### 错误响应

| 状态 | code | 触发条件 |
|------|------|----------|
| 400 | VALIDATION_ERROR | 当前状态非 `pending`，不可重复审批 |
| 404 | NOT_FOUND | 访客记录不存在 |

## 字段命名映射

API 使用 camelCase JSON 字段名，数据库使用 snake_case 列名。转换在后端路由层完成。

| API 字段 | 数据库列 | 转换方向 |
|----------|----------|----------|
| idCard | id_card | 双向 |
| visitReason | visit_reason | 双向 |
| hostName | host_name | 双向 |
| expectedVisitTime | expected_visit_time | 双向 |
| photoUrl | photo_url | 双向 |
| reviewComment | review_comment | 双向 |
| reviewedAt | reviewed_at | 双向 |
| createdAt | created_at | 响应 only |
| updatedAt | updated_at | 响应 only |
