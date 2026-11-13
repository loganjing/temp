# 技术契约

本文档定义 API 接口字段级细节，是前后端共同遵循的唯一来源。架构基线仅保留接口摘要。

## 实体 ID 类型对照

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验 |
|---|---|---|---|---|---|---|
| Device | 后端 `crypto.randomUUID()` | TEXT (UUID) | — | string | string | 无转换 |
| StatusLog | 后端 `crypto.randomUUID()` | TEXT (UUID) | device_id: TEXT | string | string | 无转换 |
| Fault | 后端 `crypto.randomUUID()` | TEXT (UUID) | device_id: TEXT | string | string | 无转换 |
| Upgrade | 后端 `crypto.randomUUID()` | TEXT (UUID) | device_id: TEXT | string | string | 无转换 |
| WorkOrder | 后端 `crypto.randomUUID()` | TEXT (UUID) | device_id: TEXT, fault_id: TEXT (nullable) | string | string | 无转换 |

所有 ID 在数据库、API 和前端中均为字符串类型 UUID，无需类型转换。

## 设备状态监测

### GET /api/devices

获取设备列表。

- 查询参数：`status`（可选，按 current_status 筛选）
- 响应 200：`{ devices: Device[] }`

```typescript
interface Device {
  id: string;
  name: string;
  model: string;
  location: string | null;
  current_status: string;
  created_at: string;   // ISO 8601
  updated_at: string;   // ISO 8601
}
```

### POST /api/devices

创建设备。

- 请求体：
```typescript
{
  name: string;        // 必填
  model: string;       // 必填
  location?: string;   // 可选
}
```
- 响应 201：`{ device: Device }`
- 错误 400：`{ error: string }`（name 或 model 为空）

### GET /api/devices/:id

获取单个设备详情。

- 路径参数：`id` — 设备 UUID
- 响应 200：`{ device: Device }`
- 错误 404：`{ error: string }`（设备不存在）

### GET /api/devices/:id/status-logs

获取设备状态变化历史，按时间降序。

- 响应 200：`{ logs: StatusLog[] }`

```typescript
interface StatusLog {
  id: string;
  device_id: string;
  status: string;
  previous_status: string | null;
  recorded_at: string;  // ISO 8601
}
```
- 错误 404：`{ error: string }`（设备不存在）

### POST /api/devices/:id/status-logs

记录设备状态变化。同时更新 devices.current_status。

- 请求体：
```typescript
{
  status: string;  // 必填，新状态
}
```
- 响应 201：`{ log: StatusLog }`
- 错误 400：`{ error: string }`（status 为空）
- 错误 404：`{ error: string }`（设备不存在）

## 故障诊断

### GET /api/faults

获取故障列表，支持按设备筛选。

- 查询参数：`device_id`（可选）
- 响应 200：`{ faults: Fault[] }`

```typescript
interface Fault {
  id: string;
  device_id: string;
  fault_type: string;
  severity: 'low' | 'medium' | 'high';
  description: string | null;
  occurred_at: string;   // ISO 8601
  created_at: string;    // ISO 8601
}
```

### POST /api/devices/:id/faults

记录设备故障。

- 请求体：
```typescript
{
  fault_type: string;                          // 必填
  severity: 'low' | 'medium' | 'high';        // 必填
  description?: string;                        // 可选
  occurred_at?: string;                        // 可选，默认当前时间
}
```
- 响应 201：`{ fault: Fault }`
- 错误 400：`{ error: string }`（fault_type 或 severity 为空或非法）
- 错误 404：`{ error: string }`（设备不存在）

### GET /api/devices/:id/faults

获取设备故障列表，按时间降序。

- 响应 200：`{ faults: Fault[] }`
- 错误 404：`{ error: string }`（设备不存在）

## 远程升级

### GET /api/upgrades

获取升级列表，支持按设备筛选。

- 查询参数：`device_id`（可选）、`status`（可选）
- 响应 200：`{ upgrades: Upgrade[] }`

```typescript
interface Upgrade {
  id: string;
  device_id: string;
  version: string;
  status: 'pending' | 'in_progress' | 'success' | 'failed';
  progress: number;        // 0-100
  started_at: string | null;
  completed_at: string | null;
  created_at: string;      // ISO 8601
}
```

### POST /api/devices/:id/upgrades

发起设备远程升级。初始状态为 `pending`，progress=0。

- 请求体：
```typescript
{
  version: string;  // 必填，目标升级版本
}
```
- 响应 201：`{ upgrade: Upgrade }`
- 错误 400：`{ error: string }`（version 为空）
- 错误 404：`{ error: string }`（设备不存在）

### GET /api/devices/:id/upgrades

获取设备升级列表，按时间降序。

- 响应 200：`{ upgrades: Upgrade[] }`
- 错误 404：`{ error: string }`（设备不存在）

### PATCH /api/upgrades/:id

更新升级状态和进度。

- 请求体：
```typescript
{
  status?: 'pending' | 'in_progress' | 'success' | 'failed';
  progress?: number;  // 0-100
}
```
- 响应 200：`{ upgrade: Upgrade }`
- 行为：status 为 `in_progress` 时设置 `started_at`（如未设置）；status 为 `success` 或 `failed` 时设置 `completed_at` 并将 progress 设为 100（success）或保持当前（failed）
- 错误 400：`{ error: string }`（字段非法）
- 错误 404：`{ error: string }`（升级不存在）

### POST /api/test/upgrades/:id/advance

测试控制入口，仅用于验证环境。手动推进升级至下一状态。

- 无请求体
- 响应 200：`{ upgrade: Upgrade }`
- 行为：`pending` → `in_progress`（progress=50, started_at=now）；`in_progress` → `success`（progress=100, completed_at=now）
- 错误 404：`{ error: string }`（升级不存在）
- 错误 409：`{ error: string }`（升级已终态，无法推进）

## 维修工单

### GET /api/work-orders

获取工单列表，支持筛选。

- 查询参数：`device_id`（可选）、`status`（可选）
- 响应 200：`{ workOrders: WorkOrder[] }`

```typescript
interface WorkOrder {
  id: string;
  device_id: string;
  fault_id: string | null;
  status: 'open' | 'in_progress' | 'completed';
  description: string;
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601
  completed_at: string | null;
}
```

### POST /api/work-orders

创建维修工单。

- 请求体：
```typescript
{
  device_id: string;       // 必填
  fault_id?: string;       // 可选，关联故障
  description: string;     // 必填
}
```
- 响应 201：`{ workOrder: WorkOrder }`
- 错误 400：`{ error: string }`（device_id 或 description 为空）
- 错误 404：`{ error: string }`（设备或故障不存在）

### PATCH /api/work-orders/:id

更新工单状态。

- 请求体：
```typescript
{
  status: 'open' | 'in_progress' | 'completed';
}
```
- 响应 200：`{ workOrder: WorkOrder }`
- 行为：status 为 `completed` 时设置 `completed_at`
- 错误 400：`{ error: string }`（status 非法）
- 错误 404：`{ error: string }`（工单不存在）

## 设备履历

### GET /api/devices/:id/history

获取设备完整履历，按时间降序聚合各模块事件。

- 响应 200：
```typescript
{
  device: Device,
  events: HistoryEvent[]
}

interface HistoryEvent {
  id: string;
  type: 'status_change' | 'fault' | 'upgrade' | 'work_order';
  timestamp: string;    // ISO 8601，按各事件的 occurred_at/recorded_at/created_at
  summary: string;      // 人类可读摘要
  detail: Record<string, unknown>;  // 原始事件数据
}
```
- 错误 404：`{ error: string }`（设备不存在）

## 错误响应统一格式

所有错误响应使用统一 JSON 结构（与平台基线一致）：

```typescript
{ error: { code: string, message: string } }
// code: 机器可读错误码（如 "NOT_FOUND"、"VALIDATION_ERROR"）
// message: 人类可读错误描述
```

## 时间格式

所有时间字段使用 ISO 8601 字符串（如 `2026-01-15T08:30:00.000Z`），由服务端生成。
