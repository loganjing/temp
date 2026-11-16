# 技术契约

## 通用约定

- 所有 API 返回 JSON，Content-Type: `application/json`
- 时间字段使用 ISO 8601 字符串（如 `2026-11-16T08:30:00.000Z`）
- 错误响应格式：`{ "error": string, "message": string }`
- 成功响应直接返回数据对象或数组
- 创建接口返回 HTTP 201，读取接口返回 200，更新接口返回 200
- 所有写操作在数据库事务中执行，包含履历写入

## 设备接口

### GET /api/devices

获取设备列表。

- 请求：无
- 响应：200
```json
[
  { "id": "uuid", "name": "string", "identifier": "string", "status": "running|idle|fault|offline", "statusUpdatedAt": "ISO8601" }
]
```

### GET /api/devices/:id

获取单台设备详情。

- 路径参数：`id` — 设备 UUID
- 响应：200
```json
{ "id": "uuid", "name": "string", "identifier": "string", "status": "string", "statusUpdatedAt": "ISO8601" }
```
- 错误：404 `{ "error": "not_found", "message": "设备不存在" }`

### PATCH /api/devices/:id/status

更新设备状态。

- 路径参数：`id` — 设备 UUID
- 请求：
```json
{ "status": "running|idle|fault|offline" }
```
- 响应：200，返回更新后的设备对象（`statusUpdatedAt` 更新为当前时间）
- 副作用：在同一事务中写入 `equipment_history`（`event_type: status_change`）
- 错误：400 `{ "error": "invalid_status", "message": "状态值非法" }`；404 设备不存在

## 故障诊断接口

### POST /api/devices/:deviceId/fault-diagnoses

创建故障诊断记录。

- 路径参数：`deviceId` — 设备 UUID
- 请求：
```json
{ "description": "string" }
```
- 响应：201
```json
{ "id": "uuid", "deviceId": "uuid", "description": "string", "diagnosedAt": "ISO8601" }
```
- 副作用：在同一事务中写入 `equipment_history`（`event_type: fault_diagnosis`）
- 错误：400 `{ "error": "invalid_input", "message": "故障描述不能为空" }`；404 设备不存在

### GET /api/devices/:deviceId/fault-diagnoses

获取设备故障诊断历史，按时间降序。

- 路径参数：`deviceId` — 设备 UUID
- 响应：200
```json
[
  { "id": "uuid", "deviceId": "uuid", "description": "string", "diagnosedAt": "ISO8601" }
]
```

## 远程升级接口

### POST /api/devices/:deviceId/upgrade-tasks

创建升级任务。

- 路径参数：`deviceId` — 设备 UUID
- 请求：
```json
{ "packageId": "string" }
```
- 响应：201
```json
{ "id": "uuid", "deviceId": "uuid", "packageId": "string", "status": "pending", "initiatedAt": "ISO8601", "completedAt": null }
```
- 副作用：在同一事务中写入 `equipment_history`（`event_type: remote_upgrade`）
- 错误：400 `{ "error": "invalid_input", "message": "升级包标识不能为空" }`；404 设备不存在

### GET /api/devices/:deviceId/upgrade-tasks

获取设备升级任务列表，按时间降序。

- 路径参数：`deviceId` — 设备 UUID
- 响应：200，升级任务对象数组

### PATCH /api/upgrade-tasks/:id

更新升级任务状态。

- 路径参数：`id` — 升级任务 UUID
- 请求：
```json
{ "status": "executing|success|failed" }
```
- 响应：200，返回更新后的任务对象（`success`/`failed` 时设置 `completedAt`）
- 副作用：在同一事务中写入 `equipment_history`（`event_type: remote_upgrade`）
- 状态流转约束：`pending` → `executing` → `success` 或 `pending` → `executing` → `failed`；不可从终态（success/failed）回退
- 错误：400 `{ "error": "invalid_status", "message": "状态值非法或非法流转" }`；404 任务不存在

## 维修工单接口

### POST /api/maintenance-orders

创建维修工单。

- 请求：
```json
{ "deviceId": "uuid", "faultDescription": "string", "technician": "string|null" }
```
- 响应：201
```json
{ "id": "uuid", "deviceId": "uuid", "faultDescription": "string", "technician": "string|null", "status": "pending", "createdAt": "ISO8601", "updatedAt": "ISO8601" }
```
- 副作用：在同一事务中写入 `equipment_history`（`event_type: maintenance_order`）
- 错误：400 `{ "error": "invalid_input", "message": "设备ID和故障描述不能为空" }`；404 设备不存在

### GET /api/maintenance-orders

获取工单列表。

- 查询参数：`deviceId`（可选，按设备筛选）
- 响应：200
```json
[
  { "id": "uuid", "deviceId": "uuid", "faultDescription": "string", "technician": "string|null", "status": "pending|processing|completed", "createdAt": "ISO8601", "updatedAt": "ISO8601" }
]
```

### GET /api/maintenance-orders/:id

获取工单详情。

- 路径参数：`id` — 工单 UUID
- 响应：200，工单对象
- 错误：404 `{ "error": "not_found", "message": "工单不存在" }`

### PATCH /api/maintenance-orders/:id

更新工单状态。

- 路径参数：`id` — 工单 UUID
- 请求：
```json
{ "status": "processing|completed" }
```
- 响应：200，返回更新后的工单对象（`updatedAt` 更新为当前时间）
- 副作用：在同一事务中写入 `equipment_history`（`event_type: maintenance_order`）
- 状态流转约束：`pending` → `processing` → `completed`；已完成（completed）不可逆，不可回退
- 错误：400 `{ "error": "invalid_status", "message": "状态值非法或非法流转" }`；404 工单不存在

## 设备履历接口

### GET /api/devices/:deviceId/history

获取设备履历，按时间降序（最近事件在前）。

- 路径参数：`deviceId` — 设备 UUID
- 响应：200
```json
[
  { "id": "uuid", "deviceId": "uuid", "eventType": "status_change|fault_diagnosis|remote_upgrade|maintenance_order", "sourceId": "uuid", "description": "string", "occurredAt": "ISO8601" }
]
```
- 错误：404 设备不存在

## ID 类型对照表

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
| --- | --- | --- | --- | --- | --- | --- |
| Device | 后端（UUID v4） | TEXT | — | string | string | 无需转换 |
| FaultDiagnosis | 后端（UUID v4） | TEXT | device_id: TEXT | string | string | 无需转换 |
| UpgradeTask | 后端（UUID v4） | TEXT | device_id: TEXT | string | string | 无需转换 |
| MaintenanceOrder | 后端（UUID v4） | TEXT | device_id: TEXT | string | string | 无需转换 |
| EquipmentHistory | 后端（UUID v4） | TEXT | device_id: TEXT | string | string | 无需转换 |

所有实体 ID 统一使用 UUID v4 字符串，数据库字段命名使用 snake_case，API JSON 字段命名使用 camelCase。字段名映射在 API 序列化层统一处理。
