# 技术契约

## 1. 实体 ID 类型对照

| 实体 | 生成方 | 数据库主键类型 | 外键引用类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
| --- | --- | --- | --- | --- | --- | --- |
| device | 后端 `crypto.randomUUID()` | TEXT (UUID) | — | string | string | 后端生成，前端透传 |
| fault_diagnosis | 后端 `crypto.randomUUID()` | TEXT (UUID) | TEXT (device_id) | string | string | 后端生成，前端透传 |
| upgrade_record | 后端 `crypto.randomUUID()` | TEXT (UUID) | TEXT (device_id) | string | string | 后端生成，前端透传 |
| repair_order | 后端 `crypto.randomUUID()` | TEXT (UUID) | TEXT (device_id) | string | string | 后端生成，前端透传 |

所有 ID 在数据库、API 和前端间类型一致，无需转换。`device_id` 作为外键在所有引用表中为 TEXT 类型 UUID。

## 2. API 契约

所有 API 返回 JSON。成功返回 HTTP 200（或 201 创建成功），失败返回对应状态码和 `{ error: { code: string, message: string } }` 体。未要求认证和授权。

### 2.1 设备管理

#### GET /api/devices

获取设备列表。

**响应** `200 OK`

```json
{
  "devices": [
    {
      "id": "string",
      "name": "string",
      "model": "string | null",
      "current_status": "string",
      "created_at": "string (ISO 8601)",
      "updated_at": "string (ISO 8601)"
    }
  ]
}
```

#### GET /api/devices/:id

获取单个设备详情。

**路径参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string (UUID) | 否 | 设备 ID |

**响应** `200 OK`

```json
{
  "id": "string",
  "name": "string",
  "model": "string | null",
  "current_status": "string",
  "created_at": "string (ISO 8601)",
  "updated_at": "string (ISO 8601)"
}
```

**错误** `404` — 设备不存在

#### POST /api/devices

创建设备。

**请求体**

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| name | string | 否 | 设备名称 |
| model | string | 是 | 设备型号 |
| current_status | string | 是 | 初始状态，默认 'unknown' |

**响应** `201 Created`

```json
{
  "id": "string",
  "name": "string",
  "model": "string | null",
  "current_status": "string",
  "created_at": "string (ISO 8601)",
  "updated_at": "string (ISO 8601)"
}
```

**错误** `400` — name 为空

#### PATCH /api/devices/:id/status

更新设备当前状态。

**路径参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string (UUID) | 否 | 设备 ID |

**请求体**

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| current_status | string | 否 | 新状态值 |

**响应** `200 OK`

```json
{
  "id": "string",
  "name": "string",
  "model": "string | null",
  "current_status": "string",
  "created_at": "string (ISO 8601)",
  "updated_at": "string (ISO 8601)"
}
```

**错误** `400` — current_status 为空；`404` — 设备不存在

### 2.2 故障诊断

#### GET /api/devices/:deviceId/faults

获取指定设备的故障诊断记录列表。

**路径参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| deviceId | string (UUID) | 否 | 设备 ID |

**响应** `200 OK`

```json
{
  "faults": [
    {
      "id": "string",
      "device_id": "string",
      "fault_description": "string",
      "diagnosis_result": "string | null",
      "created_at": "string (ISO 8601)"
    }
  ]
}
```

**错误** `404` — 设备不存在

#### POST /api/devices/:deviceId/faults

为指定设备创建故障诊断记录。

**路径参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| deviceId | string (UUID) | 否 | 设备 ID |

**请求体**

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| fault_description | string | 否 | 故障描述 |
| diagnosis_result | string | 是 | 诊断结果 |

**响应** `201 Created`

```json
{
  "id": "string",
  "device_id": "string",
  "fault_description": "string",
  "diagnosis_result": "string | null",
  "created_at": "string (ISO 8601)"
}
```

**错误** `400` — fault_description 为空；`404` — 设备不存在

### 2.3 远程升级

#### GET /api/devices/:deviceId/upgrades

获取指定设备的升级记录列表。

**路径参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| deviceId | string (UUID) | 否 | 设备 ID |

**响应** `200 OK`

```json
{
  "upgrades": [
    {
      "id": "string",
      "device_id": "string",
      "target_version": "string",
      "status": "string",
      "result": "string | null",
      "created_at": "string (ISO 8601)",
      "completed_at": "string | null (ISO 8601)"
    }
  ]
}
```

**错误** `404` — 设备不存在

#### POST /api/devices/:deviceId/upgrades

为指定设备发起远程升级。

**路径参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| deviceId | string (UUID) | 否 | 设备 ID |

**请求体**

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| target_version | string | 否 | 目标升级版本 |

**响应** `201 Created`

```json
{
  "id": "string",
  "device_id": "string",
  "target_version": "string",
  "status": "string",
  "result": "string | null",
  "created_at": "string (ISO 8601)",
  "completed_at": "string | null (ISO 8601)"
}
```

创建时 `status` 默认为 `'pending'`，`result` 和 `completed_at` 为 null。

**错误** `400` — target_version 为空；`404` — 设备不存在

### 2.4 维修工单

#### GET /api/devices/:deviceId/work-orders

获取指定设备的维修工单列表。

**路径参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| deviceId | string (UUID) | 否 | 设备 ID |

**响应** `200 OK`

```json
{
  "work_orders": [
    {
      "id": "string",
      "device_id": "string",
      "content": "string",
      "result": "string | null",
      "status": "string",
      "created_at": "string (ISO 8601)",
      "updated_at": "string (ISO 8601)"
    }
  ]
}
```

**错误** `404` — 设备不存在

#### POST /api/devices/:deviceId/work-orders

为指定设备创建维修工单。

**路径参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| deviceId | string (UUID) | 否 | 设备 ID |

**请求体**

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| content | string | 否 | 维修内容 |
| result | string | 是 | 处理结果 |

**响应** `201 Created`

```json
{
  "id": "string",
  "device_id": "string",
  "content": "string",
  "result": "string | null",
  "status": "string",
  "created_at": "string (ISO 8601)",
  "updated_at": "string (ISO 8601)"
}
```

创建时 `status` 默认为 `'open'`。

**错误** `400` — content 为空；`404` — 设备不存在

### 2.5 设备履历

#### GET /api/devices/:deviceId/history

获取指定设备的完整履历，聚合状态、故障诊断、升级记录和维修工单。

**路径参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| deviceId | string (UUID) | 否 | 设备 ID |

**响应** `200 OK`

```json
{
  "device": {
    "id": "string",
    "name": "string",
    "model": "string | null",
    "current_status": "string",
    "created_at": "string (ISO 8601)",
    "updated_at": "string (ISO 8601)"
  },
  "events": [
    {
      "event_type": "fault | upgrade | work_order | status",
      "event_id": "string",
      "timestamp": "string (ISO 8601)",
      "summary": "string"
    }
  ]
}
```

`events` 按 `timestamp` 降序排列。`summary` 为人类可读的事件摘要。`event_type` 标识事件来源模块。`status` 类型事件使用 devices 记录的 `updated_at` 作为时间戳，摘要包含状态值。

**错误** `404` — 设备不存在

## 3. 数据库迁移约定

- 迁移文件位于 `src/server/migrations/sqlite/` 目录
- 文件名格式：`NNN_description.sql`（如 `001_initial_schema.sql`）
- 使用 dbkit `runMigrations(db, { directory: '../migrations/' })` 从 `bootstrap.ts` 执行
- 初始迁移创建 devices、fault_diagnoses、upgrade_records、repair_orders 四张表
- 外键约束启用 `PRAGMA foreign_keys = ON`
- 不通过 ORM 自动同步或手工改 schema 绕过迁移
