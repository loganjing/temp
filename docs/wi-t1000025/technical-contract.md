# 技术契约

> **工作项**：wi-t1000025

## 1. 实体 ID 对照表

| 实体 | 生成方 | 数据库主键类型 | API JSON 字段 | JSON 类型 | 前端类型 | 转换/校验位置 |
|---|---|---|---|---|---|---|
| 搬运任务 | 后端 (POST /api/tasks) | INTEGER AUTOINCREMENT | taskId | string | string | 后端序列化：int→string；前端直接使用 |
| 搬运设备 | 后端 (POST /api/resources) | INTEGER AUTOINCREMENT | resourceId | string | string | 后端序列化：int→string；前端直接使用 |
| 库位 | 后端 (admin) | TEXT (code) | locationCode | string | string | 无转换，DB 主键即编码 |
| 路径 | 后端 (自动生成) | INTEGER AUTOINCREMENT | routeId | string | string | 后端序列化：int→string；前端只读 |
| 执行事件 | 后端 (自动生成) | INTEGER AUTOINCREMENT | eventId | string | string | 后端序列化：int→string；前端只读 |
| 交通冲突 | 后端 (自动生成) | INTEGER AUTOINCREMENT | conflictId | string | string | 后端序列化：int→string；前端只读 |

> 所有 INTEGER 主键在 API 响应中序列化为 string，避免前端精度丢失。前端提交的 ID 参数均为 string，后端解析为 integer。

## 2. 通用约定

### 2.1 请求格式

- Content-Type: `application/json`
- 所有请求体为 JSON 对象

### 2.2 错误响应

所有错误响应使用统一格式：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "人类可读的错误描述"
  }
}
```

| HTTP 状态码 | 说明 |
|---|---|
| 400 | 请求参数校验失败 |
| 404 | 资源不存在 |
| 409 | 业务冲突（如分配非空闲设备） |
| 500 | 服务器内部错误 |

### 2.3 时间格式

所有时间字段使用 ISO 8601 字符串 (UTC)，如 `2026-10-23T08:30:00.000Z`。

## 3. API 契约

### 3.1 任务管理接口

#### POST /api/tasks

创建搬运任务。

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| sourceLocationCode | string | 否 | 源库位编码 |
| targetLocationCode | string | 否 | 目标库位编码 |
| cargoName | string | 否 | 货物名称 |
| cargoQuantity | number | 否 | 货物数量（正整数） |
| priority | string | 否 | 优先级：normal/urgent/highest |
| remark | string | 是 | 备注说明 |
| createdBy | string | 否 | 创建人 |
| autoAssign | boolean | 是 | 是否自动分配，默认 false |

**响应** (201)：Task 对象。

**校验规则**：
- sourceLocationCode ≠ targetLocationCode
- sourceLocationCode 和 targetLocationCode 须在 locations 表中存在
- cargoQuantity > 0
- priority ∈ {normal, urgent, highest}

**幂等性**：非幂等，每次调用创建新任务。

#### GET /api/tasks

查询任务列表。

**查询参数**：

| 参数 | 类型 | 可空 | 说明 |
|---|---|---|---|
| status | string | 是 | 按状态筛选 |
| priority | string | 是 | 按优先级筛选 |
| resourceId | string | 是 | 按设备筛选 |
| page | number | 是 | 页码，默认 1 |
| pageSize | number | 是 | 每页条数，默认 20 |

**响应** (200)：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| tasks | Task[] | 否 | 任务列表 |
| total | number | 否 | 总数 |
| page | number | 否 | 当前页码 |
| pageSize | number | 否 | 每页条数 |

#### GET /api/tasks/:id

获取任务详情（含当前路径和最近事件）。

**响应** (200)：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| taskId | string | 否 | 任务ID |
| status | string | 否 | 任务状态 |
| sourceLocationCode | string | 否 | 源库位编码 |
| targetLocationCode | string | 否 | 目标库位编码 |
| cargoName | string | 否 | 货物名称 |
| cargoQuantity | number | 否 | 货物数量 |
| priority | string | 否 | 优先级 |
| remark | string | 是 | 备注 |
| createdBy | string | 否 | 创建人 |
| createdAt | string | 否 | 创建时间 |
| assignedResourceId | string | 是 | 分配设备ID |
| assignedAt | string | 是 | 分配时间 |
| assignmentMethod | string | 是 | 分配方式 |
| cancelledBy | string | 是 | 取消人 |
| cancelledAt | string | 是 | 取消时间 |
| completedAt | string | 是 | 完成时间 |
| currentRoute | Route | 是 | 当前活动路径 |
| recentEvents | ExecutionEvent[] | 是 | 最近执行事件 |

#### POST /api/tasks/:id/assign

分配搬运任务。

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| resourceId | string | 是 | 手动分配时指定设备ID；autoAssign=true 时忽略 |
| autoAssign | boolean | 是 | 是否自动分配，默认 false |

**响应** (200)：更新后的 Task 对象。

**校验规则**：
- 任务状态须为 pending
- 手动分配时设备状态须为 idle
- 自动分配时从 idle 设备中选择距源库位最近者
- 同一设备同一时间仅分配一个任务

**幂等性**：非幂等。对已分配任务重复调用返回 409。

#### POST /api/tasks/:id/cancel

取消搬运任务。

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| cancelledBy | string | 否 | 取消人 |
| confirm | boolean | 是 | 搬运中任务取消需确认，默认 false |

**响应** (200)：更新后的 Task 对象。

**校验规则**：
- pending/assigned 状态可直接取消
- in_transit 状态需 confirm=true
- completed/cancelled 不可取消，返回 409
- 取消后若设备在执行中，设备状态恢复为 idle

#### POST /api/tasks/:id/complete

确认任务完成。

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| completedBy | string | 否 | 完成确认人 |

**响应** (200)：更新后的 Task 对象。

**校验规则**：
- 任务状态须为 in_transit
- 完成后设备状态恢复为 idle
- 自动生成任务统计数据

#### POST /api/tasks/:id/recover

异常恢复。

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| recoveredBy | string | 否 | 恢复操作人 |
| action | string | 否 | 恢复动作：resume/cancel |

**响应** (200)：更新后的 Task 对象。

**校验规则**：
- 任务状态须为 error
- action=resume → 状态恢复为 in_transit
- action=cancel → 状态变为 cancelled，设备恢复 idle

### 3.2 设备管理接口

#### GET /api/resources

查询设备列表。

**查询参数**：

| 参数 | 类型 | 可空 | 说明 |
|---|---|---|---|
| status | string | 是 | 按状态筛选 |

**响应** (200)：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| resources | Resource[] | 否 | 设备列表 |

#### GET /api/resources/:id

获取设备详情。

**响应** (200)：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| resourceId | string | 否 | 设备ID |
| name | string | 否 | 设备名称 |
| type | string | 否 | 设备类型 |
| status | string | 否 | 设备状态 |
| currentLocationCode | string | 是 | 当前位置库位编码 |
| lastPositionAt | string | 是 | 最后位置上报时间 |
| currentTaskId | string | 是 | 当前关联任务ID |

#### POST /api/resources

创建设备。

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| name | string | 否 | 设备名称 |
| type | string | 否 | 设备类型：agv/forklift |
| initialLocationCode | string | 否 | 初始位置库位编码 |

**响应** (201)：Resource 对象。

**校验规则**：
- initialLocationCode 须在 locations 表中存在
- name 不可为空

#### PATCH /api/resources/:id/status

更新设备状态。

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| status | string | 否 | 新状态：idle/busy/offline/fault |

**响应** (200)：更新后的 Resource 对象。

#### POST /api/resources/:id/position

设备位置上报。

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| locationCode | string | 否 | 当前库位编码 |

**响应** (200)：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| acknowledged | boolean | 否 | 确认接收 |
| routeProgress | object | 是 | 路径进度信息 |

**幂等性**：幂等，相同位置重复上报不产生新事件。

**副作用**：
- 更新设备 current_location_code 和 last_position_at
- 触发交通冲突重评估
- 记录 position_update 执行事件（仅位置变化时）
- 推送 device_position_update WebSocket 消息

### 3.3 仓库地图接口

#### GET /api/locations

查询库位列表。

**响应** (200)：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| locations | Location[] | 否 | 库位列表 |

Location 结构：

| 字段 | 类型 | 说明 |
|---|---|---|
| locationCode | string | 库位编码 |
| name | string | 库位名称 |
| x | number | X 坐标 |
| y | number | Y 坐标 |
| type | string | 类型：storage/transit |

#### GET /api/maps/topology

获取地图拓扑图（节点和边）。

**响应** (200)：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| nodes | Location[] | 否 | 库位节点列表 |
| edges | MapEdge[] | 否 | 通道边列表 |

MapEdge 结构：

| 字段 | 类型 | 说明 |
|---|---|---|
| fromLocationCode | string | 起点库位编码 |
| toLocationCode | string | 终点库位编码 |
| distance | number | 通道距离 |
| direction | string | 方向：bidirectional/unidirectional |

### 3.4 路径规划接口

#### GET /api/routes/:taskId

获取任务当前活动路径。

**响应** (200)：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| routeId | string | 否 | 路径ID |
| taskId | string | 否 | 任务ID |
| resourceId | string | 否 | 设备ID |
| nodes | RouteNode[] | 否 | 路径节点序列 |
| plannedDistance | number | 否 | 预计距离 |
| plannedDuration | number | 否 | 预计时长（秒） |
| replanReason | string | 是 | 重规划原因 |

RouteNode 结构：

| 字段 | 类型 | 说明 |
|---|---|---|
| code | string | 库位编码 |
| x | number | X 坐标 |
| y | number | Y 坐标 |
| order | number | 节点顺序 |

### 3.5 交通协调接口

#### GET /api/traffic/conflicts

查询冲突列表。

**查询参数**：

| 参数 | 类型 | 可空 | 说明 |
|---|---|---|---|
| status | string | 是 | active/resolved，默认 active |

**响应** (200)：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| conflicts | Conflict[] | 否 | 冲突列表 |

Conflict 结构：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| conflictId | string | 否 | 冲突ID |
| conflictType | string | 否 | 冲突类型：node/oncoming/tailgating |
| resourceIds | string[] | 否 | 涉及设备ID列表 |
| locationCode | string | 否 | 冲突位置库位编码 |
| detectedAt | string | 否 | 检测时间 |
| resolvedAt | string | 是 | 解决时间 |
| strategy | string | 是 | 避让策略：priority_yield/first_arrive/detour |
| status | string | 否 | 冲突状态：active/resolved |

### 3.6 执行监控接口

#### GET /api/tasks/:id/events

获取任务执行事件序列。

**响应** (200)：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| events | ExecutionEvent[] | 否 | 事件列表（按时间升序） |

ExecutionEvent 结构：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| eventId | string | 否 | 事件ID |
| taskId | string | 否 | 任务ID |
| resourceId | string | 是 | 设备ID |
| eventType | string | 否 | 事件类型 |
| occurredAt | string | 否 | 发生时间 |
| description | string | 是 | 事件描述 |
| metadata | object | 是 | 附加数据 |

#### WS /ws/monitoring

实时监控 WebSocket 连接。

**连接**：前端通过 WebSocket 连接 `/ws/monitoring`，后端接受连接后推送实时事件。

**服务端推送消息**：

| 消息类型 | 说明 | payload |
|---|---|---|
| task_status_change | 任务状态变更 | { taskId, oldStatus, newStatus, timestamp } |
| device_position_update | 设备位置更新 | { resourceId, locationCode, timestamp } |
| device_status_change | 设备状态变更 | { resourceId, oldStatus, newStatus, timestamp } |
| traffic_alert | 交通冲突告警 | { conflictId, conflictType, resourceIds, locationCode, timestamp } |
| execution_event | 执行事件 | { eventId, taskId, eventType, description, timestamp } |
| anomaly_alert | 异常告警 | { taskId, resourceId, anomalyType, description, timestamp } |

所有 WebSocket 消息格式：

```json
{
  "type": "message_type",
  "payload": { ... }
}
```

**客户端消息**：

| 消息类型 | 说明 | payload |
|---|---|---|
| subscribe | 订阅特定类型 | { types: string[] } |
| ping | 心跳 | — |

### 3.7 任务统计接口

#### GET /api/statistics

查询统计指标。

**查询参数**：

| 参数 | 类型 | 可空 | 说明 |
|---|---|---|---|
| startDate | string | 是 | 开始日期 (YYYY-MM-DD) |
| endDate | string | 是 | 结束日期 (YYYY-MM-DD) |
| period | string | 是 | 周期：day/week/month |
| resourceId | string | 是 | 按设备筛选 |
| priority | string | 是 | 按优先级筛选 |

**响应** (200)：

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| totalTasks | number | 否 | 任务总量 |
| completedTasks | number | 否 | 已完成任务数 |
| cancelledTasks | number | 否 | 已取消任务数 |
| errorTasks | number | 否 | 异常任务数 |
| completionRate | number | 否 | 任务完成率 (0-1) |
| averageDuration | number | 否 | 平均搬运时长（秒） |
| anomalyRate | number | 否 | 异常率 (0-1) |
| resourceUtilization | object[] | 否 | 设备利用率列表 |
| priorityDistribution | object[] | 否 | 优先级分布 |
| resourceTaskDistribution | object[] | 否 | 设备任务分布 |

resourceUtilization 元素：

| 字段 | 类型 | 说明 |
|---|---|---|
| resourceId | string | 设备ID |
| resourceName | string | 设备名称 |
| busyDuration | number | 作业时长（秒） |
| onlineDuration | number | 在线时长（秒） |
| utilizationRate | number | 利用率 (0-1) |

priorityDistribution 元素：

| 字段 | 类型 | 说明 |
|---|---|---|
| priority | string | 优先级 |
| count | number | 任务数量 |
| percentage | number | 占比 (0-1) |

resourceTaskDistribution 元素：

| 字段 | 类型 | 说明 |
|---|---|---|
| resourceId | string | 设备ID |
| resourceName | string | 设备名称 |
| taskCount | number | 任务数量 |

#### GET /api/statistics/export

导出统计结果。

**查询参数**：同 GET /api/statistics。

**响应** (200)：
- Content-Type: `text/csv`
- Content-Disposition: `attachment; filename="task-statistics.csv"`
- 返回 CSV 格式文件，包含任务总量、完成率、平均搬运时长、异常率、各设备利用率和任务分布。

## 4. 枚举值定义

| 枚举 | 值 |
|---|---|
| 任务状态 | pending, assigned, in_transit, completed, cancelled, error |
| 设备状态 | idle, busy, offline, fault |
| 任务优先级 | normal, urgent, highest |
| 分配方式 | auto, manual |
| 冲突类型 | node, oncoming, tailgating |
| 避让策略 | priority_yield, first_arrive, detour |
| 冲突状态 | active, resolved |
| 事件类型 | task_assigned, route_planned, device_departed, position_update, yield_paused, yield_resumed, route_replanned, target_arrived, anomaly, task_completed, task_cancelled |
| 设备类型 | agv, forklift |
| 库位类型 | storage, transit |
