# 技术契约

本文件定义前后端共同遵循的 API 契约，包括实体 ID 类型对照、接口字段级定义和状态流转规则。架构基线只保留接口摘要，字段级细节以本文件为唯一来源。

## 实体 ID 类型对照

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---|---|---|---|---|---|---|
| Device | 服务端 `crypto.randomUUID()` | TEXT (UUID) | — | string | string | 服务端生成，API 原样返回，前端只读 |
| DeviceStatusLog | 服务端 `crypto.randomUUID()` | TEXT (UUID) | TEXT (device_id) | string | string | 服务端生成，随状态更新自动创建 |
| Fault | 服务端 `crypto.randomUUID()` | TEXT (UUID) | TEXT (device_id) | string | string | 服务端生成 |
| UpgradeTask | 服务端 `crypto.randomUUID()` | TEXT (UUID) | TEXT (device_id) | string | string | 服务端生成 |
| RepairOrder | 服务端 `crypto.randomUUID()` | TEXT (UUID) | TEXT (device_id), TEXT (fault_id, nullable) | string | string | 服务端生成 |

所有 ID 统一使用 UUID v4 字符串，从服务端生成后原样传递到前端，无需类型转换。前端通过 URL path 参数或请求体传递 ID，服务端校验格式。

## API 接口定义

### 设备模块

#### GET /api/devices

获取设备列表及当前状态。

**查询参数**：无

**响应**：`200 OK`

```json
[
  {
    "id": "uuid",
    "name": "string",
    "model": "string | null",
    "onlineStatus": "online" | "offline",
    "runningStatus": "idle" | "running" | "error" | "maintenance",
    "isAbnormal": boolean,
    "registeredAt": "ISO 8601",
    "updatedAt": "ISO 8601"
  }
]
```

#### GET /api/devices/:id

获取单台设备详情。

**路径参数**：`id` — Device UUID

**响应**：`200 OK`（同上单个对象）或 `404 Not Found`

#### POST /api/devices

注册新设备。

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| name | string | 否 | 设备名称 |
| model | string | 是 | 设备型号 |

**响应**：`201 Created`

```json
{
  "id": "uuid",
  "name": "string",
  "model": "string | null",
  "onlineStatus": "offline",
  "runningStatus": "idle",
  "isAbnormal": false,
  "registeredAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

**错误**：`400 Bad Request`（name 为空或格式无效）

#### PATCH /api/devices/:id/status

更新设备状态。服务端在事务中更新 `devices` 表并插入 `device_status_logs` 记录。当 `runningStatus` 为 `error` 时，`isAbnormal` 自动置为 `true`。

**路径参数**：`id` — Device UUID

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| onlineStatus | string | 否 | online / offline |
| runningStatus | string | 否 | idle / running / error / maintenance |

**响应**：`200 OK`（更新后的设备对象）或 `404 Not Found`

**错误**：`400 Bad Request`（状态值无效）

### 故障模块

#### GET /api/faults

获取故障列表，可按设备筛选。

**查询参数**：

| 参数 | 类型 | 可空 | 说明 |
|---|---|---|---|
| deviceId | string (UUID) | 是 | 按设备筛选 |

**响应**：`200 OK`

```json
[
  {
    "id": "uuid",
    "deviceId": "uuid",
    "deviceName": "string",
    "description": "string",
    "occurredAt": "ISO 8601",
    "createdAt": "ISO 8601",
    "repairOrderId": "uuid | null"
  }
]
```

`repairOrderId` 通过 LEFT JOIN `repair_orders` 获取，未关联工单时为 null。

#### POST /api/faults

记录新故障。

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| deviceId | string (UUID) | 否 | 故障设备 |
| description | string | 否 | 故障描述 |
| occurredAt | string (ISO 8601) | 否 | 故障发生时间 |

**响应**：`201 Created`

```json
{
  "id": "uuid",
  "deviceId": "uuid",
  "description": "string",
  "occurredAt": "ISO 8601",
  "createdAt": "ISO 8601"
}
```

**错误**：`400 Bad Request`（字段缺失或 deviceId 不存在）

### 升级模块

#### GET /api/upgrades

获取升级任务列表，可按设备筛选。

**查询参数**：

| 参数 | 类型 | 可空 | 说明 |
|---|---|---|---|
| deviceId | string (UUID) | 是 | 按设备筛选 |

**响应**：`200 OK`

```json
[
  {
    "id": "uuid",
    "deviceId": "uuid",
    "deviceName": "string",
    "status": "pending" | "in_progress" | "success" | "failed",
    "result": "string | null",
    "createdAt": "ISO 8601",
    "updatedAt": "ISO 8601"
  }
]
```

#### POST /api/upgrades

创建升级任务，初始状态为 `pending`。

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| deviceId | string (UUID) | 否 | 升级设备 |

**响应**：`201 Created`

```json
{
  "id": "uuid",
  "deviceId": "uuid",
  "status": "pending",
  "result": null,
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

**错误**：`400 Bad Request`（deviceId 缺失或不存在）

#### PATCH /api/upgrades/:id/status

推进升级任务状态。

**路径参数**：`id` — UpgradeTask UUID

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| status | string | 否 | in_progress / success / failed |
| result | string | 是 | 升级结果描述（终态时填写） |

**响应**：`200 OK`（更新后的升级任务对象）或 `404 Not Found`

**错误**：`400 Bad Request`（状态值无效或非法状态流转）

### 维修工单模块

#### GET /api/repair-orders

获取维修工单列表，可按状态筛选。

**查询参数**：

| 参数 | 类型 | 可空 | 说明 |
|---|---|---|---|
| status | string | 是 | created / in_progress / completed |

**响应**：`200 OK`

```json
[
  {
    "id": "uuid",
    "deviceId": "uuid",
    "deviceName": "string",
    "faultId": "uuid | null",
    "description": "string",
    "requirement": "string | null",
    "status": "created" | "in_progress" | "completed",
    "result": "string | null",
    "createdAt": "ISO 8601",
    "updatedAt": "ISO 8601"
  }
]
```

#### POST /api/repair-orders

创建维修工单，初始状态为 `created`。

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| deviceId | string (UUID) | 否 | 关联设备 |
| faultId | string (UUID) | 是 | 关联故障（可空） |
| description | string | 否 | 故障/维护描述 |
| requirement | string | 是 | 维修要求 |

**响应**：`201 Created`

```json
{
  "id": "uuid",
  "deviceId": "uuid",
  "faultId": "uuid | null",
  "description": "string",
  "requirement": "string | null",
  "status": "created",
  "result": null,
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

**错误**：`400 Bad Request`（字段缺失、deviceId 不存在或 faultId 不存在）

#### PATCH /api/repair-orders/:id/status

推进工单状态。

**路径参数**：`id` — RepairOrder UUID

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| status | string | 否 | in_progress / completed |
| result | string | 是 | 处理结果（终态时填写） |

**响应**：`200 OK`（更新后的工单对象）或 `404 Not Found`

**错误**：`400 Bad Request`（状态值无效或非法状态流转）

### 设备履历模块

#### GET /api/devices/:id/history

获取设备完整履历，按时间倒序聚合所有生命周期记录。

**路径参数**：`id` — Device UUID

**响应**：`200 OK`

```json
{
  "device": {
    "id": "uuid",
    "name": "string",
    "model": "string | null",
    "onlineStatus": "online" | "offline",
    "runningStatus": "idle" | "running" | "error" | "maintenance",
    "isAbnormal": boolean,
    "registeredAt": "ISO 8601"
  },
  "timeline": [
    {
      "type": "status_change" | "fault" | "upgrade" | "repair_order",
      "id": "uuid",
      "timestamp": "ISO 8601",
      "summary": "string",
      "details": {}
    }
  ]
}
```

`timeline` 聚合自 `device_status_logs`、`faults`、`upgrade_tasks`、`repair_orders` 四张表，按 `timestamp` 倒序排列。每条记录的 `summary` 由服务端生成，`details` 包含对应记录的关键字段。

**错误**：`404 Not Found`（设备不存在）

## 状态流转规则

### 设备运行状态

```
idle ←→ running ←→ error ←→ maintenance
```

任意状态间可转换。`running_status` 为 `error` 时 `is_abnormal` 置为 `true`，其他状态置为 `false`。

### 升级任务状态

```
pending → in_progress → success
                      → failed
```

- `pending` → `in_progress`：开始执行升级
- `in_progress` → `success`：升级成功，填写 `result`
- `in_progress` → `failed`：升级失败，填写 `result`
- 终态（`success` / `failed`）不可再变更

### 维修工单状态

```
created → in_progress → completed
```

- `created` → `in_progress`：开始处理工单
- `in_progress` → `completed`：工单完成，填写 `result`
- 终态（`completed`）不可再变更

## 错误响应格式

所有错误响应统一使用平台基线格式 `{error:{code,message}}`：

```json
{
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

常见错误码与 HTTP 状态码：

| HTTP 状态码 | code | 说明 |
|---|---|---|
| 400 | `bad_request` | 请求参数无效、状态流转非法 |
| 404 | `not_found` | 资源不存在 |
| 500 | `internal_error` | 服务端内部错误（不暴露内部细节） |
