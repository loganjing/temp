# 技术契约

## ID 类型对照表

| 实体 | 生成方 | 数据库主键 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验 |
| --- | --- | --- | --- | --- | --- | --- |
| Equipment | 后端自增 | INTEGER PK | — | number | number | 无需转换 |
| FaultRecord | 后端自增 | INTEGER PK | INTEGER FK → equipment.id | number | number | 无需转换 |
| UpgradeRecord | 后端自增 | INTEGER PK | INTEGER FK → equipment.id | number | number | 无需转换 |
| MaintenanceOrder | 后端自增 | INTEGER PK | INTEGER FK → equipment.id | number | number | 无需转换 |

所有 ID 均为 SQLite INTEGER AUTOINCREMENT，在 JSON API 和前端 TypeScript 中统一使用 number，无需类型转换。

## API 接口定义

### 设备管理

#### GET /api/equipment

获取设备列表。

**响应** `200 OK`

```json
{
  "items": [
    {
      "id": 1,
      "code": "EQ-001",
      "name": "1号机器人",
      "status": "running",
      "created_at": "2026-11-13T10:00:00",
      "updated_at": "2026-11-13T10:00:00"
    }
  ]
}
```

#### GET /api/equipment/:id

获取单台设备详情。

**路径参数**：`id` — number，必填

**响应** `200 OK`：单个设备对象（同列表项结构）

**错误**：`404` — 设备不存在

#### POST /api/equipment

创建设备。

**请求体**

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| code | string | 否 | 设备编号，唯一 |
| name | string | 否 | 设备名称 |
| status | string | 否 | running/standby/fault/offline，默认 standby |

**响应** `201 Created`：创建的设备对象

**错误**：`400` — 字段缺失或 code 重复

#### PATCH /api/equipment/:id

更新设备状态。

**路径参数**：`id` — number，必填

**请求体**

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| status | string | 否 | running/standby/fault/offline |

**响应** `200 OK`：更新后的设备对象

**错误**：`400` — status 值非法；`404` — 设备不存在

### 故障诊断

#### GET /api/equipment/:id/faults

获取指定设备的故障记录列表。

**路径参数**：`id` — number，必填（设备 ID）

**响应** `200 OK`

```json
{
  "items": [
    {
      "id": 1,
      "equipment_id": 1,
      "description": "关节电机过热",
      "occurred_at": "2026-11-13T09:30:00",
      "created_at": "2026-11-13T09:31:00"
    }
  ]
}
```

**错误**：`404` — 设备不存在

#### POST /api/equipment/:id/faults

为指定设备创建故障记录。

**路径参数**：`id` — number，必填（设备 ID）

**请求体**

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| description | string | 否 | 故障描述 |
| occurred_at | string | 否 | 发生时间（ISO 格式） |

**响应** `201 Created`：创建的故障记录对象

**错误**：`400` — 字段缺失；`404` — 设备不存在

### 远程升级

#### GET /api/equipment/:id/upgrades

获取指定设备的升级记录列表。

**路径参数**：`id` — number，必填（设备 ID）

**响应** `200 OK`

```json
{
  "items": [
    {
      "id": 1,
      "equipment_id": 1,
      "status": "success",
      "started_at": "2026-11-13T08:00:00",
      "completed_at": "2026-11-13T08:15:00",
      "created_at": "2026-11-13T08:00:00"
    }
  ]
}
```

**错误**：`404` — 设备不存在

#### POST /api/equipment/:id/upgrades

对指定设备发起远程升级。

**路径参数**：`id` — number，必填（设备 ID）

**请求体**：无（status 默认 `in_progress`，started_at 默认当前时间）

**响应** `201 Created`：创建的升级记录对象（status 为 `in_progress`）

**错误**：`404` — 设备不存在

#### PATCH /api/upgrades/:id

更新升级状态。

**路径参数**：`id` — number，必填（升级记录 ID）

**请求体**

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| status | string | 否 | in_progress/success/failed |

**响应** `200 OK`：更新后的升级记录对象（status 为 success/failed 时自动写入 completed_at）

**错误**：`400` — status 值非法；`404` — 升级记录不存在

### 维修工单

#### GET /api/work-orders

获取维修工单列表。

**查询参数**：`equipment_id` — number，可选（按设备过滤）

**响应** `200 OK`

```json
{
  "items": [
    {
      "id": 1,
      "equipment_id": 1,
      "status": "pending",
      "result": null,
      "created_at": "2026-11-13T10:00:00",
      "updated_at": "2026-11-13T10:00:00"
    }
  ]
}
```

#### GET /api/work-orders/:id

获取工单详情。

**路径参数**：`id` — number，必填

**响应** `200 OK`：单个工单对象

**错误**：`404` — 工单不存在

#### POST /api/equipment/:id/work-orders

为指定设备创建维修工单。

**路径参数**：`id` — number，必填（设备 ID）

**请求体**：无（status 默认 `pending`）

**响应** `201 Created`：创建的工单对象

**错误**：`404` — 设备不存在

#### PATCH /api/work-orders/:id

更新工单状态和维修结果。

**路径参数**：`id` — number，必填

**请求体**

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| status | string | 是 | pending/in_progress/completed |
| result | string | 是 | 维修结果描述（status 为 completed 时写入） |

至少传入 status 或 result 之一。

**响应** `200 OK`：更新后的工单对象（updated_at 自动更新）

**错误**：`400` — status 值非法或字段均为空；`404` — 工单不存在

### 设备履历

#### GET /api/equipment/:id/history

获取指定设备的聚合履历记录。

**路径参数**：`id` — number，必填（设备 ID）

**响应** `200 OK`

```json
{
  "equipment": {
    "id": 1,
    "code": "EQ-001",
    "name": "1号机器人",
    "status": "running"
  },
  "events": [
    {
      "type": "fault",
      "id": 1,
      "description": "关节电机过热",
      "timestamp": "2026-11-13T09:30:00"
    },
    {
      "type": "upgrade",
      "id": 1,
      "status": "success",
      "timestamp": "2026-11-13T08:00:00"
    },
    {
      "type": "work_order",
      "id": 1,
      "status": "completed",
      "result": "已更换电机",
      "timestamp": "2026-11-13T10:00:00"
    }
  ]
}
```

`events` 按 `timestamp` 降序排列。各事件类型的 `timestamp` 取值：fault → `occurred_at`，upgrade → `started_at`，work_order → `created_at`。

**错误**：`404` — 设备不存在

## 通用错误格式

所有错误响应统一格式：

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "设备不存在"
  }
}
```

| HTTP 状态 | code | 触发场景 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | 字段缺失、值非法 |
| 404 | NOT_FOUND | 资源不存在 |
| 500 | INTERNAL_ERROR | 服务端异常 |
