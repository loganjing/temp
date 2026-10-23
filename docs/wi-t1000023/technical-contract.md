# 技术契约

## 1. ID 对照表

| 实体 ID | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
| --- | --- | --- | --- | --- | --- | --- |
| patrol_route_id | patrol-route 模块（服务端 UUID v4） | TEXT (UUID v4) | TEXT（video_events.route_id 引用） | string | string | 无需转换，全链路一致 |
| video_event_id | video-event 模块（后台任务 UUID v4） | TEXT (UUID v4) | TEXT（alerts.event_id 引用） | string | string | 无需转换，全链路一致 |
| alert_id | alert 模块（服务端 UUID v4） | TEXT (UUID v4) | — | string | string | 无需转换，全链路一致 |

## 2. REST API 接口定义

### 2.1 巡逻路线管理

#### POST /api/patrol-routes — 创建巡逻路线

**请求**

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| name | string | 否 | 路线名称，非空字符串 |
| waypoints | array | 否 | 路径点序列，至少 1 个 |
| waypoints[].name | string | 否 | 位置名称 |
| waypoints[].lat | number | 否 | 纬度 |
| waypoints[].lng | number | 否 | 经度 |

**响应** `201 Created`

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 路线 ID (UUID v4) |
| name | string | 否 | 路线名称 |
| waypoints | array | 否 | 路径点序列 |
| createdAt | string | 否 | 创建时间 (ISO 8601) |
| updatedAt | string | 否 | 更新时间 (ISO 8601) |

**错误**

| 状态码 | 说明 |
| --- | --- |
| 400 | name 为空或 waypoints 为空数组 |
| 500 | 数据库写入失败 |

#### GET /api/patrol-routes — 获取路线列表

**响应** `200 OK`

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| items | array | 否 | 路线数组，每项同创建响应结构 |

#### GET /api/patrol-routes/:id — 获取路线详情

**路径参数**

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 路线 ID (UUID v4) |

**响应** `200 OK`：同创建响应结构。

**错误**

| 状态码 | 说明 |
| --- | --- |
| 404 | 路线不存在 |

#### PUT /api/patrol-routes/:id — 更新路线

**请求**：同创建请求结构。**响应** `200 OK`：同创建响应结构。**错误**：404（路线不存在）、400（参数校验失败）。

#### DELETE /api/patrol-routes/:id — 删除路线

**响应** `204 No Content`（无响应体）。**错误**：404（路线不存在）。

---

### 2.2 视频事件

#### GET /api/video-events — 查询视频事件列表

**查询参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| routeId | string | 是 | 按路线筛选 |
| eventType | string | 是 | 按事件类型筛选 |

**响应** `200 OK`

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| items | array | 否 | 事件数组 |
| items[].id | string | 否 | 事件 ID |
| items[].eventType | string | 否 | 事件类型 |
| items[].occurredAt | string | 否 | 发生时间 (ISO 8601) |
| items[].routeId | string | 否 | 关联路线 ID |
| items[].location | string | 否 | 位置描述 |
| items[].videoSegmentRef | string | 是 | 视频片段引用 |
| items[].createdAt | string | 否 | 记录创建时间 |

---

### 2.3 告警管理

#### GET /api/alerts — 获取告警列表

**查询参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| status | string | 是 | pending / handled，不传则返回全部 |

**响应** `200 OK`

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| items | array | 否 | 告警数组 |
| items[].id | string | 否 | 告警 ID |
| items[].eventId | string | 否 | 关联视频事件 ID |
| items[].alertTime | string | 否 | 告警时间 (ISO 8601) |
| items[].status | string | 否 | 告警状态：pending / handled |
| items[].eventType | string | 否 | 事件类型（从关联视频事件冗余） |
| items[].location | string | 否 | 位置（从关联视频事件冗余） |
| items[].routeName | string | 否 | 路线名称（从关联路线冗余） |
| items[].handlerName | string | 是 | 处置人（未处置时为 null） |
| items[].handledAt | string | 是 | 处置时间（未处置时为 null） |

#### GET /api/alerts/:id — 获取告警详情

**响应** `200 OK`：在列表项基础上增加关联视频事件详情和视频片段引用。

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 告警 ID |
| eventId | string | 否 | 关联视频事件 ID |
| alertTime | string | 否 | 告警时间 |
| status | string | 否 | 告警状态 |
| handlerName | string | 是 | 处置人 |
| handlingResult | string | 是 | 处置结果 |
| handlingNote | string | 是 | 处置说明 |
| handledAt | string | 是 | 处置时间 |
| event | object | 否 | 关联视频事件完整信息 |
| event.id | string | 否 | 事件 ID |
| event.eventType | string | 否 | 事件类型 |
| event.occurredAt | string | 否 | 事件发生时间 |
| event.routeId | string | 否 | 关联路线 ID |
| event.location | string | 否 | 位置描述 |
| event.videoSegmentRef | string | 是 | 视频片段引用 |
| routeName | string | 否 | 关联路线名称 |

**错误**：404（告警不存在）。

#### PATCH /api/alerts/:id/handle — 处置告警

**请求**

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| handlerName | string | 否 | 处置人姓名 |
| handlingResult | string | 否 | 处置结果（如：resolved / escalated / false-alarm） |
| handlingNote | string | 否 | 处置说明 |

**响应** `200 OK`：同告警详情结构，status 更新为 `handled`。

**错误**

| 状态码 | 说明 |
| --- | --- |
| 404 | 告警不存在 |
| 409 | 告警已被处置（状态冲突） |
| 400 | 处置人、结果或说明为空 |

---

### 2.4 事件留痕

#### GET /api/audit-trail — 查询留痕记录

**查询参数**

| 参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| startTime | string | 是 | 起始时间 (ISO 8601) |
| endTime | string | 是 | 截止时间 (ISO 8601) |
| eventType | string | 是 | 按事件类型筛选（video_event_detected / alert_created / alert_handled） |

**响应** `200 OK`

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| items | array | 否 | 留痕记录数组 |
| items[].id | string | 否 | 留痕记录 ID |
| items[].eventType | string | 否 | 事件类型 |
| items[].timestamp | string | 否 | 时间戳 |
| items[].entityId | string | 否 | 关联实体 ID |
| items[].summary | string | 否 | 摘要信息 |
| items[].details | object | 是 | 详细数据 |

#### GET /api/audit-trail/:id — 查看留痕详情

**响应** `200 OK`：同列表项结构，details 字段包含完整关联信息。**错误**：404（记录不存在）。

---

## 3. WebSocket 事件定义

### 连接

- **URL**：`ws://<host>/ws/alerts`
- **协议**：WebSocket
- **认证**：无（需求未要求认证）

### 服务端推送消息

#### alert:new — 新告警推送

告警生成时推送给所有已连接客户端。

```json
{
  "type": "alert:new",
  "data": {
    "id": "string",
    "eventId": "string",
    "alertTime": "string (ISO 8601)",
    "status": "pending",
    "eventType": "string",
    "location": "string",
    "routeName": "string"
  }
}
```

### 客户端消息

#### alert:subscribe — 订阅告警推送

连接建立后客户端发送，确认订阅。

```json
{
  "type": "alert:subscribe"
}
```

## 4. 字段命名与映射约定

| 数据库字段 (snake_case) | API JSON 字段 (camelCase) | 说明 |
| --- | --- | --- |
| id | id | 直接映射 |
| event_type | eventType | 转换 |
| occurred_at | occurredAt | 转换 |
| route_id | routeId | 转换 |
| video_segment_ref | videoSegmentRef | 转换 |
| created_at | createdAt | 转换 |
| updated_at | updatedAt | 转换 |
| alert_time | alertTime | 转换 |
| handler_name | handlerName | 转换 |
| handling_result | handlingResult | 转换 |
| handling_note | handlingNote | 转换 |
| handled_at | handledAt | 转换 |

后端在序列化响应时统一将 snake_case 转为 camelCase；前端直接使用 camelCase。请求体使用 camelCase，后端在解析时转为 snake_case。
