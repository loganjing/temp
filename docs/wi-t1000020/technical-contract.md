# 技术契约

本文件定义访客系统各端共同遵循的 API 契约，是接口字段级细节的唯一来源。

## 1. 实体 ID 对照表

| 实体 | 生成方 | 数据库主键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
| --- | --- | --- | --- | --- | --- |
| Visitor ID | 后端（ULID） | TEXT | string | string | 后端生成，前端原样传递；校验为非空字符串 |

## 2. API 端点定义

所有端点前缀 `/api`，响应均为 JSON，使用 UTF-8 编码。

### 2.1 POST /api/visitors — 提交访客登记

**调用方**：访客端

**请求体**：

| 字段 | 类型 | 必填 | 可空 | 说明 |
| --- | --- | --- | --- | --- |
| name | string | 是 | 否 | 访客姓名，1-50 字符 |
| phone | string | 是 | 否 | 手机号，11 位数字 |
| id_card | string | 是 | 否 | 身份证号，18 位（含校验位） |
| company | string | 是 | 否 | 公司信息，1-200 字符 |
| visit_reason | string | 是 | 否 | 访问事由，1-500 字符 |
| host_name | string | 否 | 是 | 被访人姓名 |
| expected_arrival_time | string | 否 | 是 | 预计到访时间，ISO 8601 |
| phone_source | string | 是 | 否 | `wechat` 或 `manual` |

**成功响应** `201 Created`：

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 登记记录 ULID |
| name | string | 否 | 访客姓名 |
| phone | string | 否 | 手机号 |
| id_card | string | 否 | 身份证号 |
| company | string | 否 | 公司信息 |
| visit_reason | string | 否 | 访问事由 |
| host_name | string \| null | 是 | 被访人 |
| expected_arrival_time | string \| null | 是 | 预计到访时间 |
| phone_source | string | 否 | 手机号来源 |
| status | string | 否 | `pending` |
| created_at | string | 否 | 提交时间 ISO 8601 |
| updated_at | string | 否 | 最后更新时间 ISO 8601 |

**错误响应** `400 Bad Request`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| error | object | 错误详情 |
| error.code | string | 错误码：`VALIDATION_ERROR` |
| error.message | string | 可读错误描述 |
| error.fields | object | 字段级错误，key 为字段名，value 为错误描述 |

### 2.2 GET /api/visitors — 查询登记列表

**调用方**：访客端、审批端

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| status | string | 否 | 按状态过滤：`pending` / `approved` / `rejected` |
| phone | string | 否 | 按手机号过滤（访客端查询自己的记录） |

两个参数可组合使用，也可都不传（返回全部记录）。

**成功响应** `200 OK`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| data | array | 登记记录数组，每项结构同 2.1 成功响应 |
| total | number | 匹配记录总数 |

**错误响应** `400 Bad Request`：结构同 2.1。

### 2.3 GET /api/visitors/{id} — 获取登记详情

**调用方**：审批端

**路径参数**：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 登记记录 ULID |

**成功响应** `200 OK`：结构同 2.1 成功响应。

**错误响应** `404 Not Found`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| error.code | string | `NOT_FOUND` |
| error.message | string | 可读错误描述 |

### 2.4 PATCH /api/visitors/{id}/status — 更新审核状态

**调用方**：审批端

**路径参数**：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 登记记录 ULID |

**请求体**：

| 字段 | 类型 | 必填 | 可空 | 说明 |
| --- | --- | --- | --- | --- |
| status | string | 是 | 否 | 目标状态：`approved` 或 `rejected` |

**成功响应** `200 OK`：结构同 2.1 成功响应（含更新后的 status 和 updated_at）。

**错误响应**：

| 状态码 | error.code | 说明 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | status 值非法 |
| 404 | `NOT_FOUND` | 记录不存在 |
| 409 | `INVALID_STATE_TRANSITION` | 当前状态不允许转换（如已通过记录不能再操作） |

### 2.5 POST /api/wechat/phone — 微信手机号解密

**调用方**：访客端

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| code | string | 是 | 微信 `getPhoneNumber` 回调返回的 code |

**成功响应** `200 OK`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| phone | string | 解密后的手机号 |

**错误响应**：

| 状态码 | error.code | 说明 |
| --- | --- | --- |
| 400 | `WECHAT_DECRYPT_FAILED` | 手机号解密失败 |
| 500 | `WECHAT_SERVICE_ERROR` | 微信服务端调用失败 |

## 3. 状态机

```
pending ──approved──→ approved (终态)
pending ──rejected──→ rejected (终态)
```

- `pending` → `approved`：审批人执行通过
- `pending` → `rejected`：审批人执行拒绝
- `approved` / `rejected` 为终态，不允许再变更

## 4. 校验规则

| 字段 | 规则 |
| --- | --- |
| phone | 11 位数字，正则 `^1[3-9]\d{9}$` |
| id_card | 18 位，前 17 位数字 + 末位数字或 X，正则 `^\d{17}[\dXx]$` |
| name | 非空，1-50 字符 |
| company | 非空，1-200 字符 |
| visit_reason | 非空，1-500 字符 |
| status（请求） | 仅接受 `approved` / `rejected` |

## 5. 通用错误格式

所有非 2xx 响应统一结构：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "可读错误描述",
    "fields": {}
  }
}
```

`fields` 仅在 `VALIDATION_ERROR` 时出现，为字段名到错误描述的映射。

## 6. 目录结构

```
jlgguest/
├── server/                    # 后端服务
│   ├── src/
│   │   ├── index.ts           # 入口，Hono app
│   │   ├── routes/
│   │   │   ├── visitors.ts    # 访客 CRUD 路由
│   │   │   └── wechat.ts      # 微信手机号解密路由
│   │   ├── services/
│   │   │   └── visitor-service.ts  # 业务逻辑
│   │   ├── db/
│   │   │   ├── connection.ts  # SQLite 连接
│   │   │   └── migrations/
│   │   │       └── 001-init.sql
│   │   └── utils/
│   │       └── validate.ts    # 校验工具
│   ├── package.json
│   └── tsconfig.json
├── admin/                     # 审批端 SPA
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── VisitorList.tsx    # 待审核列表
│   │   │   └── VisitorDetail.tsx  # 审批详情
│   │   ├── api/
│   │   │   └── client.ts      # API 调用
│   │   └── styles/
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── tsconfig.json
├── miniprogram/               # 访客端微信小程序
│   ├── pages/
│   │   ├── register/          # 登记页
│   │   └── my-visits/         # 我的登记页
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   └── config.js              # 后端地址配置
├── docs/
│   └── wi-t1000020/
│       ├── requirements.md
│       ├── architecture-baseline.md
│       └── technical-contract.md
└── package.json               # 根 workspace（可选）
```
