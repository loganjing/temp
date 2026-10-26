# 技术契约

本文档定义前后端共同遵循的 API 契约。架构基线见 `architecture-baseline.md`。

## 通用约定

- 基础路径：`/api`
- 请求体：`application/json`
- 响应体：`application/json`
- 错误响应：`{ "error": string, "code": string }`
- 时间格式：ISO 8601 字符串（如 `"2026-10-26T08:30:00.000Z"`）
- 所有列表接口支持 `?status=` 查询参数过滤

## 任务接口

### POST /api/tasks

创建配送任务。

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| tableId | string | 否 | 目标桌位标识 |

**响应**（201）：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | number | 否 | 任务 ID |
| tableId | string | 否 | 目标桌位标识 |
| status | string | 否 | 固定 `"pending"` |
| robotId | number \| null | 是 | 固定 `null` |
| createdAt | string | 否 | 创建时间 |

**错误**：

| HTTP | code | 说明 |
|------|------|------|
| 400 | INVALID_TABLE_ID | tableId 为空或非字符串 |

### GET /api/tasks

查询任务列表。

**查询参数**：

| 参数 | 类型 | 可空 | 说明 |
|------|------|------|------|
| status | string | 是 | 过滤状态：pending / delivering / delivered / cancelled |

**响应**（200）：

| 字段 | 类型 | 说明 |
|------|------|------|
| tasks | Task[] | 任务列表，按 createdAt 升序 |

**Task 对象**：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | number | 否 | 任务 ID |
| tableId | string | 否 | 目标桌位标识 |
| status | string | 否 | pending / delivering / delivered / cancelled |
| robotId | number \| null | 是 | 分配的机器人 ID |
| createdAt | string | 否 | 创建时间 |
| assignedAt | string \| null | 是 | 分配时间 |
| deliveredAt | string \| null | 是 | 送达时间 |
| cancelledAt | string \| null | 是 | 取消时间 |

### POST /api/tasks/:id/cancel

取消任务。

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 任务 ID |

**响应**（200）：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | number | 否 | 任务 ID |
| status | string | 否 | 固定 `"cancelled"` |
| robotId | number \| null | 是 | 取消前的机器人 ID（配送中取消时为原机器人，待分配取消时为 null） |
| cancelledAt | string | 否 | 取消时间 |

**错误**：

| HTTP | code | 说明 |
|------|------|------|
| 404 | TASK_NOT_FOUND | 任务不存在 |
| 400 | TASK_ALREADY_DONE | 任务已送达或已取消 |

## 机器人接口

### POST /api/robots

注册机器人。

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| name | string | 否 | 机器人名称 |

**响应**（201）：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | number | 否 | 机器人 ID |
| name | string | 否 | 机器人名称 |
| status | string | 否 | 固定 `"idle"` |
| currentTaskId | number \| null | 是 | 固定 `null` |
| createdAt | string | 否 | 注册时间 |

**错误**：

| HTTP | code | 说明 |
|------|------|------|
| 400 | INVALID_NAME | name 为空或非字符串 |

### GET /api/robots

查询所有机器人。

**响应**（200）：

| 字段 | 类型 | 说明 |
|------|------|------|
| robots | Robot[] | 机器人列表 |

**Robot 对象**：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | number | 否 | 机器人 ID |
| name | string | 否 | 机器人名称 |
| status | string | 否 | idle / delivering / offline |
| currentTaskId | number \| null | 是 | 当前任务 ID |
| createdAt | string | 否 | 注册时间 |

### PATCH /api/robots/:id/status

更新机器人状态。

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 机器人 ID |

**请求体**：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| status | string | 否 | idle / delivering / offline |

**响应**（200）：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | number | 否 | 机器人 ID |
| status | string | 否 | 更新后的状态 |
| currentTaskId | number \| null | 是 | 当前任务 ID |

**副作用**：
- 设为 `idle` 时触发 Dispatcher 检查是否有待分配任务
- 设为 `offline` 时生成离线告警

**错误**：

| HTTP | code | 说明 |
|------|------|------|
| 404 | ROBOT_NOT_FOUND | 机器人不存在 |
| 400 | INVALID_STATUS | status 不在允许值内 |
| 400 | ROBOT_DELIVERING | 机器人正在配送中，不能直接设为空闲 |

### POST /api/robots/:id/arrive

机器人到达目标桌位，触发通知生成。

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 机器人 ID |

**响应**（200）：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| notificationId | number | 否 | 通知 ID |
| taskId | number | 否 | 关联任务 ID |
| tableId | string | 否 | 目标桌位标识 |
| robotId | number | 否 | 机器人 ID |
| sentAt | string | 否 | 通知时间 |

**副作用**：
- 任务状态变为 `delivered`
- 机器人状态变为 `idle`
- 释放该机器人所有路径段锁
- 触发 Dispatcher 检查下一个待分配任务

**错误**：

| HTTP | code | 说明 |
|------|------|------|
| 404 | ROBOT_NOT_FOUND | 机器人不存在 |
| 400 | ROBOT_NOT_DELIVERING | 机器人不在配送中状态 |
| 400 | NO_CURRENT_TASK | 机器人没有当前任务 |

## 通知接口

### GET /api/notifications

查询通知记录。

**查询参数**：

| 参数 | 类型 | 可空 | 说明 |
|------|------|------|------|
| taskId | number | 是 | 按任务过滤 |

**响应**（200）：

| 字段 | 类型 | 说明 |
|------|------|------|
| notifications | Notification[] | 通知列表，按 sentAt 降序 |

**Notification 对象**：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | number | 否 | 通知 ID |
| taskId | number | 否 | 关联任务 ID |
| robotId | number | 否 | 机器人 ID |
| tableId | string | 否 | 目标桌位标识 |
| sentAt | string | 否 | 通知时间 |

## 监控接口

### GET /api/monitor/overview

**响应**（200）：

| 字段 | 类型 | 说明 |
|------|------|------|
| queueCount | number | 待分配任务数量 |
| activeTaskCount | number | 配送中任务数量 |
| idleRobotCount | number | 空闲机器人数量 |
| deliveringRobotCount | number | 配送中机器人数量 |
| offlineRobotCount | number | 离线机器人数量 |
| activeAlertCount | number | 未解决告警数量 |

### GET /api/monitor/queue

**响应**（200）：

| 字段 | 类型 | 说明 |
|------|------|------|
| pendingTasks | Task[] | 待分配任务列表（Task 对象同 GET /api/tasks） |
| activeTasks | ActiveTask[] | 配送中任务列表 |

**ActiveTask 对象**：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | number | 否 | 任务 ID |
| tableId | string | 否 | 目标桌位标识 |
| robotId | number | 否 | 机器人 ID |
| robotName | string | 否 | 机器人名称 |
| status | string | 否 | 固定 `"delivering"` |
| assignedAt | string | 否 | 分配时间 |
| pathProgress | object | 否 | 路径进度 |

**pathProgress 对象**：

| 字段 | 类型 | 说明 |
|------|------|------|
| totalSegments | number | 路径总段数 |
| completedSegments | number | 已通过段数 |

### GET /api/monitor/robots

**响应**（200）：

| 字段 | 类型 | 说明 |
|------|------|------|
| robots | Robot[] | 机器人列表（Robot 对象同 GET /api/robots） |

### GET /api/monitor/alerts

**查询参数**：

| 参数 | 类型 | 可空 | 说明 |
|------|------|------|------|
| resolved | boolean | 是 | 过滤已解决/未解决，默认 false |

**响应**（200）：

| 字段 | 类型 | 说明 |
|------|------|------|
| alerts | Alert[] | 告警列表，按 createdAt 降序 |

**Alert 对象**：

| 字段 | 类型 | 可空 | 说明 |
|------|------|------|------|
| id | number | 否 | 告警 ID |
| type | string | 否 | robot_offline / path_conflict_unresolved |
| message | string | 否 | 告警描述 |
| robotId | number \| null | 是 | 关联机器人 ID |
| resolved | boolean | 否 | 是否已解决 |
| createdAt | string | 否 | 告警时间 |

### GET /api/monitor/events

SSE 流，实时推送状态变更。

**事件类型**：

| 事件 | data 内容 | 说明 |
|------|----------|------|
| `task.created` | Task 对象 | 新任务创建 |
| `task.assigned` | { taskId, robotId } | 任务分配 |
| `task.delivered` | { taskId, robotId, tableId } | 任务送达 |
| `task.cancelled` | { taskId, robotId } | 任务取消 |
| `robot.status_changed` | { robotId, status } | 机器人状态变更 |
| `alert.created` | Alert 对象 | 新告警 |
| `path.conflict` | { robotIds, segmentId } | 路径冲突 |

## 状态码汇总

| code | HTTP | 说明 |
|------|------|------|
| INVALID_TABLE_ID | 400 | 桌位标识无效 |
| INVALID_NAME | 400 | 机器人名称无效 |
| INVALID_STATUS | 400 | 机器人状态值无效 |
| TASK_NOT_FOUND | 404 | 任务不存在 |
| ROBOT_NOT_FOUND | 404 | 机器人不存在 |
| TASK_ALREADY_DONE | 400 | 任务已送达或已取消 |
| ROBOT_DELIVERING | 400 | 机器人正在配送中 |
| ROBOT_NOT_DELIVERING | 400 | 机器人不在配送中 |
| NO_CURRENT_TASK | 400 | 机器人无当前任务 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |
