# 技术契约 — k11-robot

本文件定义后端 API 的字段级细节。架构基线只保留接口摘要，以本文件为字段、类型与状态机的唯一来源。

## 实体 ID 对照表

| 实体 | 生成方 | 数据库主键类型 | 外键引用类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---|---|---|---|---|---|---|
| device | 后端 (crypto.randomUUID) | TEXT (UUID) | — | string | string | 无转换 |
| fault | 后端 | TEXT (UUID) | TEXT (device_id) | string | string | 无转换 |
| upgrade_task | 后端 | TEXT (UUID) | TEXT (device_id) | string | string | 无转换 |
| work_order | 后端 | TEXT (UUID) | TEXT (device_id / fault_id) | string | string | 无转换 |
| device_event | 后端 | TEXT (UUID) | TEXT (device_id) | string | string | 无转换 |
| device_status_log | 后端 | TEXT (UUID) | TEXT (device_id) | string | string | 无转换 |

所有 ID 在数据库、API 和前端统一使用 UUID 字符串，无需类型转换。

## 通用约定

- 请求/响应均为 JSON（`Content-Type: application/json`）。
- 时间字段统一 ISO 8601 字符串（如 `2026-11-10T08:00:00.000Z`）。
- 列表接口支持 `?status=` 查询参数筛选。
- 错误响应格式：`{ "error": "错误描述" }`，HTTP 状态码 400/404/500。
- 创建/更新接口返回操作后的完整资源对象。

## 设备管理 API

### GET /api/devices

- 查询参数：`status`（可选，筛选设备状态）
- 响应：`{ "devices": Device[] }`

### POST /api/devices

- 请求：`{ "code": string, "name": string, "model"?: string }`
- 响应：`{ "device": Device }`（201）
- 副作用：写入 `device_events`（event_type: `device_registered`）

### GET /api/devices/:id

- 响应：`{ "device": Device }`

### PUT /api/devices/:id

- 请求：`{ "name"?: string, "model"?: string }`
- 响应：`{ "device": Device }`

### DELETE /api/devices/:id

- 响应：`{ "success": true }`（200）
- 行为：软删除（`deleted_at` 置为当前时间），关联履历数据保留

### PUT /api/devices/:id/status

- 请求：`{ "status": "idle" | "running" | "fault" | "upgrading" | "maintenance" | "offline" }`
- 响应：`{ "device": Device }`
- 副作用：写入 `device_status_logs`，写入 `device_events`（event_type: `status_changed`）

### GET /api/devices/:id/status-history

- 响应：`{ "logs": StatusLog[] }`

### GET /api/devices/:id/history

- 查询参数：`event_type`（可选，筛选事件类型）
- 响应：`{ "events": DeviceEvent[] }`（按 `created_at` 倒序）

## 故障诊断 API

### GET /api/faults

- 查询参数：`status`（可选：pending/diagnosed/resolved）
- 响应：`{ "faults": Fault[] }`

### POST /api/faults

- 请求：`{ "device_id": string, "description": string, "occurred_at": string }`
- 响应：`{ "fault": Fault }`（201）
- 副作用：写入 `device_events`（event_type: `fault_recorded`）

### GET /api/faults/:id

- 响应：`{ "fault": Fault }`

### PUT /api/faults/:id/diagnosis

- 请求：`{ "diagnosis_result": string, "diagnosis_advice"?: string }`
- 响应：`{ "fault": Fault }`
- 副作用：更新 `faults.status` 为 `diagnosed`，写入 `device_events`（event_type: `fault_diagnosed`）

## 远程升级 API

### GET /api/upgrade-tasks

- 查询参数：`status`（可选：pending/upgrading/success/failed）
- 响应：`{ "tasks": UpgradeTask[] }`

### POST /api/upgrade-tasks

- 请求：`{ "device_id": string, "content": string }`
- 响应：`{ "task": UpgradeTask }`（201）
- 副作用：写入 `device_events`（event_type: `upgrade_started`）

### GET /api/upgrade-tasks/:id

- 响应：`{ "task": UpgradeTask }`

### PUT /api/upgrade-tasks/:id/status

- 请求：`{ "status": "upgrading" | "success" | "failed", "progress"?: number, "failure_reason"?: string }`
- 响应：`{ "task": UpgradeTask }`
- 副作用：
  - status=`success`：设 `completed_at`，写入 `device_events`（event_type: `upgrade_completed`）
  - status=`failed`：设 `completed_at` 和 `failure_reason`，写入 `device_events`（event_type: `upgrade_failed`）

## 维修工单 API

### GET /api/work-orders

- 查询参数：`status`（可选：pending/processing/completed/closed）
- 响应：`{ "orders": WorkOrder[] }`

### POST /api/work-orders

- 请求：`{ "device_id": string, "fault_id"?: string, "reason": string, "priority"?: "low" | "normal" | "high" | "urgent" }`
- 响应：`{ "order": WorkOrder }`（201）
- 副作用：写入 `device_events`（event_type: `work_order_created`）

### GET /api/work-orders/:id

- 响应：`{ "order": WorkOrder }`

### PUT /api/work-orders/:id/transition

- 请求：`{ "status": "processing" | "completed" | "closed" }`
- 响应：`{ "order": WorkOrder }`
- 副作用：status=`completed` 时设 `completed_at`，写入 `device_events`（event_type: `work_order_completed`）

### PUT /api/work-orders/:id/repair

- 请求：`{ "repair_content": string, "replaced_parts"?: string }`
- 响应：`{ "order": WorkOrder }`

## 数据类型定义

### Device

```json
{
  "id": "string (UUID)",
  "code": "string",
  "name": "string",
  "model": "string | null",
  "status": "idle | running | fault | upgrading | maintenance | offline",
  "deleted_at": "string | null",
  "created_at": "string (ISO 8601)",
  "updated_at": "string (ISO 8601)"
}
```

### StatusLog

```json
{
  "id": "string (UUID)",
  "device_id": "string (UUID)",
  "status": "string",
  "created_at": "string (ISO 8601)"
}
```

### Fault

```json
{
  "id": "string (UUID)",
  "device_id": "string (UUID)",
  "description": "string",
  "occurred_at": "string (ISO 8601)",
  "diagnosis_result": "string | null",
  "diagnosis_advice": "string | null",
  "status": "pending | diagnosed | resolved",
  "work_order_id": "string (UUID) | null",
  "created_at": "string (ISO 8601)",
  "updated_at": "string (ISO 8601)"
}
```

### UpgradeTask

```json
{
  "id": "string (UUID)",
  "device_id": "string (UUID)",
  "content": "string",
  "status": "pending | upgrading | success | failed",
  "progress": "number (0–100)",
  "failure_reason": "string | null",
  "started_at": "string (ISO 8601) | null",
  "completed_at": "string (ISO 8601) | null",
  "created_at": "string (ISO 8601)"
}
```

### WorkOrder

```json
{
  "id": "string (UUID)",
  "device_id": "string (UUID)",
  "fault_id": "string (UUID) | null",
  "reason": "string",
  "priority": "low | normal | high | urgent",
  "status": "pending | processing | completed | closed",
  "repair_content": "string | null",
  "replaced_parts": "string | null",
  "completed_at": "string (ISO 8601) | null",
  "created_at": "string (ISO 8601)",
  "updated_at": "string (ISO 8601)"
}
```

### DeviceEvent

```json
{
  "id": "string (UUID)",
  "device_id": "string (UUID)",
  "event_type": "device_registered | status_changed | fault_recorded | fault_diagnosed | upgrade_started | upgrade_completed | upgrade_failed | work_order_created | work_order_completed",
  "event_summary": "string",
  "event_data": "string (JSON) | null",
  "created_at": "string (ISO 8601)"
}
```

## 状态机

### 设备状态

```
idle ⇄ running
idle/running → fault
fault → upgrading (远程升级)
fault → maintenance (维修中)
upgrading → idle/running
maintenance → idle/running
任意 → offline
```

### 故障状态

```
pending → diagnosed → resolved
```

### 升级任务状态

```
pending → upgrading → success
pending → upgrading → failed
```

### 工单状态

```
pending → processing → completed → closed
```
