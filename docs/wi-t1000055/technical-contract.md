# 技术契约

本文件定义前后端共同遵循的 API 契约。字段级细节以本文件为唯一来源，架构基线只保留接口摘要和引用。

## 1. 通用约定

| 项目 | 约定 |
|---|---|
| 基础路径 | `/api` |
| 请求格式 | `application/json` |
| 响应格式 | `application/json` |
| ID 类型 | 所有实体 ID 为 TEXT 类型 UUID（字符串），由服务端 `crypto.randomUUID()` 生成 |
| 时间格式 | ISO 8601 字符串（如 `2026-11-11T08:30:00.000Z`） |
| 错误响应 | `{ "error": { "code": "<string>", "message": "<string>" } }` |
| 状态码 | 200 成功（GET/PATCH），201 创建成功（POST），400 请求错误，404 未找到，500 服务错误 |
| 幂等性 | 查询接口幂等；写入接口非幂等（每次生成新 ID） |

## 2. ID 对照表

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换位置 |
|---|---|---|---|---|---|---|
| equipment | 服务端 | TEXT (UUID) | — | string | string | 无需转换 |
| equipment_status | 服务端 | TEXT (UUID) | TEXT (equipment_id) | string | string | 无需转换 |
| faults | 服务端 | TEXT (UUID) | TEXT (equipment_id) | string | string | 无需转换 |
| upgrade_tasks | 服务端 | TEXT (UUID) | TEXT (equipment_id) | string | string | 无需转换 |
| work_orders | 服务端 | TEXT (UUID) | TEXT (equipment_id, fault_id) | string | string | 无需转换 |
| work_order_records | 服务端 | TEXT (UUID) | TEXT (order_id) | string | string | 无需转换 |

## 3. 设备管理 API

### 3.1 GET /api/equipment

查询设备列表。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| keyword | string | 否 | 按名称或标识模糊搜索 |

**响应 200**：

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "机器人-A01",
      "identifier": "JLG-A01",
      "type": "mobile-robot",
      "created_at": "2026-11-11T08:00:00.000Z"
    }
  ]
}
```

### 3.2 POST /api/equipment

创建设备。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | string | 是 | 设备名称 |
| identifier | string | 是 | 设备标识（唯一） |
| type | string | 否 | 设备类型 |

**响应 201**：同设备对象。

**错误**：400（identifier 重复或字段缺失）。

### 3.3 GET /api/equipment/:id

查询单个设备详情。

**响应 200**：同设备对象。

**错误**：404（设备不存在）。

## 4. 设备状态监测 API

### 4.1 POST /api/equipment/:equipmentId/status

记录一条设备状态。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | string | 是 | 状态值：`online`/`offline`/`running`/`fault` |
| params | object | 否 | 关键运行参数键值对 |

**响应 201**：

```json
{
  "id": "uuid",
  "equipment_id": "uuid",
  "status": "running",
  "params": { "battery": 85, "speed": 1.2 },
  "recorded_at": "2026-11-11T08:30:00.000Z"
}
```

**错误**：400（状态值非法）、404（设备不存在）。

### 4.2 GET /api/equipment/:equipmentId/status

查询设备状态列表（含当前与历史）。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| limit | number | 否 | 返回条数，默认 50 |

**响应 200**：

```json
{
  "items": [
    {
      "id": "uuid",
      "equipment_id": "uuid",
      "status": "running",
      "params": { "battery": 85 },
      "recorded_at": "2026-11-11T08:30:00.000Z"
    }
  ]
}
```

## 5. 故障诊断 API

### 5.1 GET /api/faults

查询故障列表。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| equipment_id | string | 否 | 按设备筛选 |
| status | string | 否 | 按状态筛选 |

**响应 200**：

```json
{
  "items": [
    {
      "id": "uuid",
      "equipment_id": "uuid",
      "description": "左轮电机过热",
      "status": "recorded",
      "diagnosis": null,
      "suggestion": null,
      "created_at": "2026-11-11T09:00:00.000Z",
      "updated_at": "2026-11-11T09:00:00.000Z",
      "closed_at": null
    }
  ]
}
```

### 5.2 POST /api/faults

创建故障事件。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| equipment_id | string | 是 | 故障设备 ID |
| description | string | 是 | 故障描述 |

**响应 201**：同故障对象，`status` 为 `recorded`。

**错误**：400（字段缺失）、404（设备不存在）。

### 5.3 GET /api/faults/:id

查询故障详情（含状态流转记录）。

**响应 200**：

```json
{
  "id": "uuid",
  "equipment_id": "uuid",
  "description": "左轮电机过热",
  "status": "diagnosed",
  "diagnosis": "电机轴承磨损导致摩擦过热",
  "suggestion": "更换轴承组件",
  "created_at": "2026-11-11T09:00:00.000Z",
  "updated_at": "2026-11-11T10:00:00.000Z",
  "closed_at": null,
  "status_logs": [
    { "id": "uuid", "from_status": null, "to_status": "recorded", "changed_at": "2026-11-11T09:00:00.000Z" },
    { "id": "uuid", "from_status": "recorded", "to_status": "diagnosing", "changed_at": "2026-11-11T09:30:00.000Z" },
    { "id": "uuid", "from_status": "diagnosing", "to_status": "diagnosed", "changed_at": "2026-11-11T10:00:00.000Z" }
  ]
}
```

**错误**：404（故障不存在）。

### 5.4 PATCH /api/faults/:id

更新诊断信息。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| diagnosis | string | 否 | 诊断结论 |
| suggestion | string | 否 | 处理建议 |

**响应 200**：更新后的故障对象。

**错误**：400（无可更新字段）、404（故障不存在）。

### 5.5 POST /api/faults/:id/status

推进故障状态。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | string | 是 | 目标状态：`diagnosing`/`diagnosed`/`closed` |

**合法流转**：

| 当前状态 | 可流转到 |
|---|---|
| recorded | diagnosing |
| diagnosing | diagnosed |
| diagnosed | closed |

**响应 200**：更新后的故障对象（含 `status` 变更和 `updated_at`/`closed_at` 更新）。

**错误**：400（非法流转路径或字段缺失）、404（故障不存在）。

## 6. 远程升级 API

### 6.1 GET /api/upgrades

查询升级任务列表。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| equipment_id | string | 否 | 按设备筛选 |
| status | string | 否 | 按状态筛选 |

**响应 200**：

```json
{
  "items": [
    {
      "id": "uuid",
      "equipment_id": "uuid",
      "package_id": "firmware-v2.1.0",
      "status": "pending",
      "result": null,
      "failure_reason": null,
      "created_at": "2026-11-11T08:00:00.000Z",
      "updated_at": "2026-11-11T08:00:00.000Z"
    }
  ]
}
```

### 6.2 POST /api/upgrades

发起升级任务。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| equipment_id | string | 是 | 目标设备 ID |
| package_id | string | 是 | 升级包标识 |

**响应 201**：同升级任务对象，`status` 为 `pending`。

**错误**：400（字段缺失）、404（设备不存在）。

### 6.3 GET /api/upgrades/:id

查询升级任务详情（含状态流转记录）。

**响应 200**：

```json
{
  "id": "uuid",
  "equipment_id": "uuid",
  "package_id": "firmware-v2.1.0",
  "status": "success",
  "result": "升级完成，版本已更新至 v2.1.0",
  "failure_reason": null,
  "created_at": "2026-11-11T08:00:00.000Z",
  "updated_at": "2026-11-11T08:15:00.000Z",
  "status_logs": [
    { "id": "uuid", "from_status": null, "to_status": "pending", "changed_at": "2026-11-11T08:00:00.000Z" },
    { "id": "uuid", "from_status": "pending", "to_status": "executing", "changed_at": "2026-11-11T08:05:00.000Z" },
    { "id": "uuid", "from_status": "executing", "to_status": "success", "changed_at": "2026-11-11T08:15:00.000Z" }
  ]
}
```

**错误**：404（任务不存在）。

### 6.4 POST /api/upgrades/:id/status

推进升级状态。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | string | 是 | 目标状态：`executing`/`success`/`failed` |
| result | string | 否 | 升级结果说明（success/failed 时填写） |
| failure_reason | string | 否 | 失败原因（failed 时必填） |

**合法流转**：

| 当前状态 | 可流转到 |
|---|---|
| pending | executing |
| executing | success, failed |

**响应 200**：更新后的升级任务对象。

**错误**：400（非法流转路径、字段缺失或 failed 时未填 failure_reason）、404（任务不存在）。

## 7. 维修工单 API

### 7.1 GET /api/work-orders

查询工单列表。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| equipment_id | string | 否 | 按设备筛选 |
| status | string | 否 | 按状态筛选 |

**响应 200**：

```json
{
  "items": [
    {
      "id": "uuid",
      "equipment_id": "uuid",
      "fault_id": null,
      "description": "更换左轮轴承",
      "status": "pending",
      "created_at": "2026-11-11T09:00:00.000Z",
      "updated_at": "2026-11-11T09:00:00.000Z",
      "closed_at": null
    }
  ]
}
```

### 7.2 POST /api/work-orders

创建维修工单。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| equipment_id | string | 是 | 关联设备 ID |
| fault_id | string | 否 | 关联故障事件 ID |
| description | string | 是 | 工单描述 |

**响应 201**：同工单对象，`status` 为 `pending`。

**错误**：400（字段缺失）、404（设备或故障不存在）。

### 7.3 GET /api/work-orders/:id

查询工单详情（含处理记录与状态流转）。

**响应 200**：

```json
{
  "id": "uuid",
  "equipment_id": "uuid",
  "fault_id": "uuid",
  "description": "更换左轮轴承",
  "status": "closed",
  "created_at": "2026-11-11T09:00:00.000Z",
  "updated_at": "2026-11-11T11:00:00.000Z",
  "closed_at": "2026-11-11T11:00:00.000Z",
  "records": [
    { "id": "uuid", "content": "已拆解左轮组件", "created_at": "2026-11-11T09:30:00.000Z" },
    { "id": "uuid", "content": "更换轴承并重新组装", "created_at": "2026-11-11T10:30:00.000Z" }
  ],
  "status_logs": [
    { "id": "uuid", "from_status": null, "to_status": "pending", "changed_at": "2026-11-11T09:00:00.000Z" },
    { "id": "uuid", "from_status": "pending", "to_status": "processing", "changed_at": "2026-11-11T09:15:00.000Z" },
    { "id": "uuid", "from_status": "processing", "to_status": "completed", "changed_at": "2026-11-11T10:45:00.000Z" },
    { "id": "uuid", "from_status": "completed", "to_status": "closed", "changed_at": "2026-11-11T11:00:00.000Z" }
  ]
}
```

**错误**：404（工单不存在）。

### 7.4 POST /api/work-orders/:id/records

添加处理记录。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| content | string | 是 | 处理记录内容 |

**响应 201**：

```json
{
  "id": "uuid",
  "order_id": "uuid",
  "content": "已拆解左轮组件",
  "created_at": "2026-11-11T09:30:00.000Z"
}
```

**错误**：400（内容为空）、404（工单不存在）。

### 7.5 POST /api/work-orders/:id/status

推进工单状态。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | string | 是 | 目标状态：`processing`/`completed`/`closed` |

**合法流转**：

| 当前状态 | 可流转到 |
|---|---|
| pending | processing |
| processing | completed |
| completed | closed |

**响应 200**：更新后的工单对象（含 `status` 变更和 `updated_at`/`closed_at` 更新）。

**错误**：400（非法流转路径或字段缺失）、404（工单不存在）。

## 8. 设备履历 API

### 8.1 GET /api/equipment/:equipmentId/history

查询设备完整履历，聚合状态变更、故障事件、升级任务和维修工单记录，按时间倒序排列。

**响应 200**：

```json
{
  "equipment_id": "uuid",
  "events": [
    {
      "type": "status",
      "id": "uuid",
      "status": "running",
      "params": { "battery": 85 },
      "timestamp": "2026-11-11T08:30:00.000Z"
    },
    {
      "type": "fault",
      "id": "uuid",
      "description": "左轮电机过热",
      "status": "closed",
      "timestamp": "2026-11-11T09:00:00.000Z"
    },
    {
      "type": "upgrade",
      "id": "uuid",
      "package_id": "firmware-v2.1.0",
      "status": "success",
      "timestamp": "2026-11-11T08:00:00.000Z"
    },
    {
      "type": "work_order",
      "id": "uuid",
      "description": "更换左轮轴承",
      "status": "closed",
      "timestamp": "2026-11-11T09:00:00.000Z"
    }
  ]
}
```

**聚合规则**：
- `status` 类型：取 `equipment_status.recorded_at` 为时间戳
- `fault` 类型：取 `faults.created_at` 为时间戳
- `upgrade` 类型：取 `upgrade_tasks.created_at` 为时间戳
- `work_order` 类型：取 `work_orders.created_at` 为时间戳
- 所有事件按 `timestamp` 倒序排列

**错误**：404（设备不存在）。
