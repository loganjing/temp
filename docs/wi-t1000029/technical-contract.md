# 技术契约

本文件定义园区安防系统前后端共同遵循的 API 契约，是字段级定义的唯一来源。架构基线仅保留接口摘要和引用。

## ID 类型对照表

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
| --- | --- | --- | --- | --- | --- | --- |
| patrol_route | 后端服务 | TEXT (UUID v4) | — | string | string | 后端生成，前端透传 |
| patrol_point | 后端服务 | TEXT (UUID v4) | TEXT (route_id) | string | string | 后端生成，前端透传 |
| video_source | 迁移种子 | TEXT (UUID v4) | — | string | string | 迁移预置，只读 |
| event | 后端服务 | TEXT (UUID v4) | TEXT (video_source_id) | string | string | 后端生成，前端透传 |
| alert | 后端服务 | TEXT (UUID v4) | TEXT (event_id) | string | string | 后端生成，前端透传 |
| handling_record | 后端服务 | TEXT (UUID v4) | TEXT (alert_id) | string | string | 后端生成，前端透传 |
| event_trail | 后端服务 | TEXT (UUID v4) | TEXT (business_object_id) | string | string | 后端生成，前端透传 |

所有 ID 均为 UUID v4 字符串，从数据库到 API JSON 到前端类型一致，无需转换。

## 通用响应格式

### 成功响应

```json
{ "data": <结果> }
```

### 错误响应

```json
{ "error": { "code": "<错误码>", "message": "<人类可读说明>" } }
```

### 分页列表响应

```json
{ "data": { "items": [...], "total": <number> } }
```

## API 定义

### 巡逻路线

#### GET /api/patrol-routes

查询巡逻路线列表（含关联巡逻点位）。

**查询参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| — | — | — | 无筛选参数，返回全部路线 |

**响应 200**

```json
{
  "data": [
    {
      "id": "string",
      "name": "string",
      "points": [
        { "id": "string", "name": "string", "sequence_order": 1 }
      ],
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

#### GET /api/patrol-routes/:id

查询单条巡逻路线详情（含关联巡逻点位，按 sequence_order 排序）。

**路径参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 路线 ID |

**响应 200**

```json
{
  "data": {
    "id": "string",
    "name": "string",
    "points": [
      { "id": "string", "name": "string", "sequence_order": 1 }
    ],
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-01T00:00:00.000Z"
  }
}
```

**错误**

| 状态码 | code | 说明 |
| --- | --- | --- |
| 404 | not_found | 路线不存在 |

#### POST /api/patrol-routes

创建巡逻路线及关联巡逻点位。在单个事务中创建路线和所有点位。

**请求体**

```json
{
  "name": "string",
  "points": [
    { "name": "string", "sequence_order": 1 }
  ]
}
```

| 字段 | 类型 | 可空 | 校验 | 说明 |
| --- | --- | --- | --- | --- |
| name | string | 否 | 非空 | 路线名称 |
| points | array | 否 | 至少 1 个元素 | 巡逻点位列表 |
| points[].name | string | 否 | 非空 | 点位名称 |
| points[].sequence_order | integer | 否 | ≥ 1 | 顺序序号 |

**响应 201**

```json
{
  "data": {
    "id": "string",
    "name": "string",
    "points": [
      { "id": "string", "name": "string", "sequence_order": 1 }
    ],
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-01T00:00:00.000Z"
  }
}
```

**错误**

| 状态码 | code | 说明 |
| --- | --- | --- |
| 400 | validation_error | 请求体校验失败 |

#### PUT /api/patrol-routes/:id

更新巡逻路线。全量替换路线名称和点位列表（删除旧点位、插入新点位）。在单个事务中完成。

**路径参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 路线 ID |

**请求体**

```json
{
  "name": "string",
  "points": [
    { "name": "string", "sequence_order": 1 }
  ]
}
```

字段校验与 POST 相同。

**响应 200**

```json
{
  "data": {
    "id": "string",
    "name": "string",
    "points": [
      { "id": "string", "name": "string", "sequence_order": 1 }
    ],
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-01T00:00:00.000Z"
  }
}
```

**错误**

| 状态码 | code | 说明 |
| --- | --- | --- |
| 400 | validation_error | 请求体校验失败 |
| 404 | not_found | 路线不存在 |

#### DELETE /api/patrol-routes/:id

删除巡逻路线，级联删除关联巡逻点位。

**路径参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 路线 ID |

**响应 200**

```json
{ "data": { "deleted": true } }
```

**错误**

| 状态码 | code | 说明 |
| --- | --- | --- |
| 404 | not_found | 路线不存在 |

### 视频源

#### GET /api/video-sources

查询视频源列表。

**响应 200**

```json
{
  "data": [
    {
      "id": "string",
      "name": "string",
      "source_url": "string",
      "created_at": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

### 视频事件

#### POST /api/events/recognize

触发视频事件识别。系统从预置视频源中随机选取一个，模拟识别一个事件，在同一事务中创建事件记录、关联告警和留痕记录。

**请求体**

无（识别由系统自动执行，不接受外部参数）。

**响应 201**

```json
{
  "data": {
    "id": "string",
    "video_source_id": "string",
    "video_source_name": "string",
    "event_type": "string",
    "occurred_at": "2026-01-01T00:00:00.000Z",
    "created_at": "2026-01-01T00:00:00.000Z",
    "alert_id": "string"
  }
}
```

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 事件 ID |
| video_source_id | string | 否 | 关联视频源 ID |
| video_source_name | string | 否 | 关联视频源名称（冗余字段，便于前端展示） |
| event_type | string | 否 | 事件类型（如 intrusion、loitering、vehicle_violation） |
| occurred_at | string | 否 | 事件发生时间 |
| created_at | string | 否 | 记录创建时间 |
| alert_id | string | 否 | 自动生成的关联告警 ID |

**错误**

| 状态码 | code | 说明 |
| --- | --- | --- |
| 500 | recognition_failed | 识别过程内部错误 |

#### GET /api/events

查询事件记录列表。

**查询参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| video_source_id | string | 是 | 按视频源筛选 |

**响应 200**

```json
{
  "data": [
    {
      "id": "string",
      "video_source_id": "string",
      "video_source_name": "string",
      "event_type": "string",
      "occurred_at": "2026-01-01T00:00:00.000Z",
      "created_at": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

### 告警

#### GET /api/alerts

查询告警列表，可按状态筛选。

**查询参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| status | string | 是 | pending / handling / handled |

**响应 200**

```json
{
  "data": [
    {
      "id": "string",
      "event_id": "string",
      "event_type": "string",
      "video_source_name": "string",
      "status": "pending",
      "alert_time": "2026-01-01T00:00:00.000Z",
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

#### GET /api/alerts/:id

查询单条告警详情，包含关联事件信息和处置记录。

**路径参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 告警 ID |

**响应 200**

```json
{
  "data": {
    "id": "string",
    "event_id": "string",
    "event_type": "string",
    "video_source_name": "string",
    "occurred_at": "2026-01-01T00:00:00.000Z",
    "status": "pending",
    "alert_time": "2026-01-01T00:00:00.000Z",
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-01T00:00:00.000Z",
    "handling_records": [
      {
        "id": "string",
        "handler": "string",
        "action": "confirm",
        "handling_result": "string",
        "handled_at": "2026-01-01T00:00:00.000Z",
        "created_at": "2026-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

**错误**

| 状态码 | code | 说明 |
| --- | --- | --- |
| 404 | not_found | 告警不存在 |

### 告警处置

#### POST /api/alerts/:id/handling

对告警进行处置操作，在同一事务中创建处置记录、更新告警状态并写入留痕记录。

**路径参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 告警 ID |

**请求体**

```json
{
  "handler": "string",
  "action": "confirm",
  "handling_result": "string"
}
```

| 字段 | 类型 | 可空 | 校验 | 说明 |
| --- | --- | --- | --- | --- |
| handler | string | 否 | 非空 | 处置人 |
| action | string | 否 | confirm / complete | 处置操作类型 |
| handling_result | string | action=complete 时必填，action=confirm 时可空 | action=complete 时非空 | 处置结果说明 |

**状态流转规则**

| 当前状态 | action | 目标状态 | 留痕 operation_type |
| --- | --- | --- | --- |
| pending | confirm | handling | alert_confirmed |
| handling | complete | handled | alert_completed |

其他状态转换返回 400 错误。

**响应 200**

```json
{
  "data": {
    "id": "string",
    "alert_id": "string",
    "handler": "string",
    "action": "confirm",
    "handling_result": "string",
    "handled_at": "2026-01-01T00:00:00.000Z",
    "created_at": "2026-01-01T00:00:00.000Z",
    "alert_status": "handling"
  }
}
```

**错误**

| 状态码 | code | 说明 |
| --- | --- | --- |
| 400 | validation_error | 请求体校验失败 |
| 400 | invalid_state_transition | 当前状态不允许该操作 |
| 404 | not_found | 告警不存在 |

### 事件留痕

#### GET /api/trails

查询留痕记录列表，可按操作类型筛选。

**查询参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| operation_type | string | 是 | event_created / alert_created / alert_confirmed / alert_completed |

**响应 200**

```json
{
  "data": [
    {
      "id": "string",
      "operation_type": "event_created",
      "business_object_type": "event",
      "business_object_id": "string",
      "operation_time": "2026-01-01T00:00:00.000Z",
      "detail": "string",
      "created_at": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

## 状态码汇总

| 状态码 | 使用场景 |
| --- | --- |
| 200 | 查询成功、更新成功、删除成功 |
| 201 | 创建成功（路线、事件识别） |
| 400 | 请求体校验失败、非法状态转换 |
| 404 | 资源不存在 |
| 500 | 内部错误 |
