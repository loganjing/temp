# 技术契约

## ID 对照表

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
|---|---|---|---|---|---|---|
| Plot ID | 后端 (UUID v4) | TEXT (UUID) | — | string | string | 无转换，前后端一致 |
| Assessment ID | 后端 (UUID v4) | TEXT (UUID) | — | string | string | 无转换 |
| Task ID | 后端 (UUID v4) | TEXT (UUID) | TEXT (UUID) | string | string | 无转换 |
| Progress Report ID | 后端 (UUID v4) | TEXT (UUID) | — | string | string | 无转换 |
| Exception Report ID | 后端 (UUID v4) | TEXT (UUID) | — | string | string | 无转换 |
| Task No | 后端 (日期序列) | TEXT | — | string | string | 后端生成，前端只读 |

## 通用约定

- 请求/响应 Content-Type: `application/json`
- 时间格式：ISO 8601 字符串（`2026-10-23T14:30:00.000Z`）
- 日期格式：`YYYY-MM-DD`
- 错误响应：`{ "error": { "code": string, "message": string } }`
- HTTP 状态码：200（成功）、201（创建）、400（参数错误）、404（未找到）、409（状态冲突）、500（服务器错误）

## API 契约

### 1. 地块

#### GET /api/plots

获取地块列表。

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| code | string | 否 | 按地块编号模糊筛选 |
| variety | string | 否 | 按品种筛选 |
| harvestable | boolean | 否 | 按可采摘状态筛选（true=可采摘） |

**响应 200**

```json
{
  "items": [
    {
      "id": "uuid",
      "code": "PLOT-001",
      "name": "东区1号地",
      "variety": "草莓",
      "area": 5.5,
      "currentMaturityLevel": "成熟",
      "harvestable": true,
      "createdAt": "2026-10-23T10:00:00.000Z",
      "updatedAt": "2026-10-23T14:00:00.000Z"
    }
  ]
}
```

- `currentMaturityLevel`：取该地块最新评估记录的等级；无评估记录时为 `null`。
- `harvestable`：`currentMaturityLevel` ∈ {接近成熟, 成熟, 过熟} 时为 `true`，否则 `false`。

#### POST /api/plots

创建地块。

**请求体**

| 字段 | 类型 | 必填 | 可空 | 说明 |
|---|---|---|---|---|
| code | string | 是 | 否 | 地块编号，唯一 |
| name | string | 是 | 否 | 地块名称 |
| variety | string | 是 | 否 | 品种 |
| area | number | 是 | 否 | 面积（亩），> 0 |

**响应 201**

```json
{
  "id": "uuid",
  "code": "PLOT-001",
  "name": "东区1号地",
  "variety": "草莓",
  "area": 5.5,
  "currentMaturityLevel": null,
  "harvestable": false,
  "createdAt": "2026-10-23T10:00:00.000Z",
  "updatedAt": "2026-10-23T10:00:00.000Z"
}
```

**错误**

| HTTP | code | 说明 |
|---|---|---|
| 400 | INVALID_PARAMS | 缺少必填字段或 area <= 0 |
| 409 | DUPLICATE_CODE | 地块编号已存在 |

---

### 2. 成熟度评估

#### GET /api/assessments

获取成熟度评估记录列表。

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| plotId | string | 否 | 按地块 ID 筛选 |
| plotCode | string | 否 | 按地块编号筛选 |
| maturityLevel | string | 否 | 按成熟度等级筛选（未成熟/接近成熟/成熟/过熟） |
| harvestable | boolean | 否 | 按可采摘状态筛选地块 |

**响应 200**

```json
{
  "items": [
    {
      "id": "uuid",
      "plotId": "uuid",
      "plotCode": "PLOT-001",
      "plotName": "东区1号地",
      "variety": "草莓",
      "maturityLevel": "成熟",
      "assessmentTime": "2026-10-23T10:00:00.000Z",
      "assessor": "张三",
      "notes": "果色均匀，可采摘",
      "createdAt": "2026-10-23T10:00:00.000Z"
    }
  ]
}
```

#### POST /api/assessments

创建成熟度评估记录。后端自动更新地块的可采摘状态（基于最新评估计算）。

**请求体**

| 字段 | 类型 | 必填 | 可空 | 说明 |
|---|---|---|---|---|
| plotId | string | 是 | 否 | 关联地块 ID |
| maturityLevel | string | 是 | 否 | 未成熟 / 接近成熟 / 成熟 / 过熟 |
| assessmentTime | string (ISO 8601) | 是 | 否 | 评估时间 |
| assessor | string | 是 | 否 | 评估人 |
| notes | string | 否 | 是 | 备注 |

**响应 201**

```json
{
  "id": "uuid",
  "plotId": "uuid",
  "plotCode": "PLOT-001",
  "plotName": "东区1号地",
  "variety": "草莓",
  "maturityLevel": "成熟",
  "assessmentTime": "2026-10-23T10:00:00.000Z",
  "assessor": "张三",
  "notes": "果色均匀，可采摘",
  "createdAt": "2026-10-23T10:00:00.000Z"
}
```

**错误**

| HTTP | code | 说明 |
|---|---|---|
| 400 | INVALID_PARAMS | 缺少必填字段或 maturityLevel 不在枚举范围内 |
| 404 | PLOT_NOT_FOUND | 关联地块不存在 |

---

### 3. 采摘任务

#### GET /api/tasks

获取采摘任务列表。

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | string | 否 | 待执行 / 执行中 / 已完成 / 已取消 |
| plotId | string | 否 | 按地块 ID 筛选 |
| assignedWorker | string | 否 | 按作业人员筛选 |
| plannedDate | string (YYYY-MM-DD) | 否 | 按计划日期筛选 |

**响应 200**

```json
{
  "items": [
    {
      "id": "uuid",
      "taskNo": "PT-20261023-001",
      "plotId": "uuid",
      "plotCode": "PLOT-001",
      "plotName": "东区1号地",
      "variety": "草莓",
      "plannedQuantity": 100,
      "assignedWorker": "李四",
      "plannedDate": "2026-10-24",
      "priority": "紧急",
      "status": "待执行",
      "notes": "优先处理",
      "totalPickedQuantity": 0,
      "createdAt": "2026-10-23T10:00:00.000Z",
      "updatedAt": "2026-10-23T10:00:00.000Z"
    }
  ]
}
```

- `totalPickedQuantity`：该任务累计已采摘量（SUM progress_reports.picked_quantity）。
- 紧急任务（`priority: "紧急"`）前端在列表中视觉高亮显示。

#### POST /api/tasks

创建采摘任务。仅允许可采摘地块创建任务。

**请求体**

| 字段 | 类型 | 必填 | 可空 | 说明 |
|---|---|---|---|---|
| plotId | string | 是 | 否 | 关联地块 ID（必须可采摘） |
| plannedQuantity | number | 是 | 否 | 计划采摘量（kg），> 0 |
| assignedWorker | string | 是 | 否 | 分配作业人员 |
| plannedDate | string (YYYY-MM-DD) | 是 | 否 | 计划采摘日期 |
| priority | string | 是 | 否 | 普通 / 紧急 |
| notes | string | 否 | 是 | 备注 |

**响应 201**

```json
{
  "id": "uuid",
  "taskNo": "PT-20261023-001",
  "plotId": "uuid",
  "plotCode": "PLOT-001",
  "plotName": "东区1号地",
  "variety": "草莓",
  "plannedQuantity": 100,
  "assignedWorker": "李四",
  "plannedDate": "2026-10-24",
  "priority": "紧急",
  "status": "待执行",
  "notes": "优先处理",
  "totalPickedQuantity": 0,
  "createdAt": "2026-10-23T10:00:00.000Z",
  "updatedAt": "2026-10-23T10:00:00.000Z"
}
```

**错误**

| HTTP | code | 说明 |
|---|---|---|
| 400 | INVALID_PARAMS | 缺少必填字段或值不合法 |
| 409 | PLOT_NOT_HARVESTABLE | 地块不可采摘 |

#### PATCH /api/tasks/:id

更新任务状态。

**请求体**

| 字段 | 类型 | 必填 | 可空 | 说明 |
|---|---|---|---|---|
| status | string | 是 | 否 | 目标状态：执行中 / 已完成 / 已取消 |

**状态转换规则**

| 当前状态 | 允许目标状态 | 不允许 |
|---|---|---|
| 待执行 | 执行中、已取消 | 已完成 |
| 执行中 | 已完成、已取消 | 待执行 |
| 已完成 | — | 任意 |
| 已取消 | — | 任意 |

**响应 200**

```json
{
  "id": "uuid",
  "taskNo": "PT-20261023-001",
  "status": "执行中",
  "updatedAt": "2026-10-23T11:00:00.000Z"
}
```

**错误**

| HTTP | code | 说明 |
|---|---|---|
| 400 | INVALID_PARAMS | status 不在枚举范围内 |
| 404 | TASK_NOT_FOUND | 任务不存在 |
| 409 | INVALID_STATUS_TRANSITION | 不允许的状态转换 |

---

### 4. 作业进度

#### POST /api/tasks/:id/progress

提交采摘进度上报。任务必须为"执行中"状态。

**请求体**

| 字段 | 类型 | 必填 | 可空 | 说明 |
|---|---|---|---|---|
| pickedQuantity | number | 是 | 否 | 本次采摘量（kg），> 0 |
| reportTime | string (ISO 8601) | 是 | 否 | 进度时间 |
| notes | string | 否 | 是 | 备注 |

**响应 201**

```json
{
  "id": "uuid",
  "taskId": "uuid",
  "pickedQuantity": 50,
  "reportTime": "2026-10-24T09:00:00.000Z",
  "notes": "上午采摘",
  "totalPickedQuantity": 50,
  "createdAt": "2026-10-24T09:00:00.000Z"
}
```

- `totalPickedQuantity`：返回提交后的累计采摘量。

**错误**

| HTTP | code | 说明 |
|---|---|---|
| 400 | INVALID_PARAMS | pickedQuantity <= 0 或缺少必填字段 |
| 404 | TASK_NOT_FOUND | 任务不存在 |
| 409 | TASK_NOT_IN_PROGRESS | 任务不在"执行中"状态 |

#### GET /api/tasks/:id/progress

查看指定任务的进度上报历史。

**响应 200**

```json
{
  "items": [
    {
      "id": "uuid",
      "taskId": "uuid",
      "pickedQuantity": 50,
      "reportTime": "2026-10-24T09:00:00.000Z",
      "notes": "上午采摘",
      "createdAt": "2026-10-24T09:00:00.000Z"
    },
    {
      "id": "uuid",
      "taskId": "uuid",
      "pickedQuantity": 30,
      "reportTime": "2026-10-24T14:00:00.000Z",
      "notes": "下午采摘",
      "createdAt": "2026-10-24T14:00:00.000Z"
    }
  ],
  "totalPickedQuantity": 80
}
```

---

### 5. 进度监控概览

#### GET /api/monitoring/overview

获取进度监控概览数据。

**响应 200**

```json
{
  "taskSummary": {
    "assigned": 5,
    "inProgress": 3,
    "completed": 8,
    "cancelled": 1
  },
  "inProgressTasks": [
    {
      "id": "uuid",
      "taskNo": "PT-20261023-001",
      "plotCode": "PLOT-001",
      "plotName": "东区1号地",
      "assignedWorker": "李四",
      "plannedQuantity": 100,
      "totalPickedQuantity": 80,
      "priority": "紧急",
      "status": "执行中",
      "hasPendingException": true
    }
  ],
  "pendingExceptionCount": 2
}
```

- `taskSummary`：各状态任务数量统计。
- `inProgressTasks`：当前执行中的任务列表及进度。
- `pendingExceptionCount`：待处理异常数量，前端据此在进度监控界面展示提示标识。
- `hasPendingException`：该任务是否存在待处理异常。

---

### 6. 异常报告

#### GET /api/exceptions

获取异常报告列表。

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | string | 否 | 待处理 / 处理中 / 已解决 |
| exceptionType | string | 否 | 天气 / 病虫害 / 设备故障 / 人员 / 其他 |
| taskId | string | 否 | 按关联任务筛选 |

**响应 200**

```json
{
  "items": [
    {
      "id": "uuid",
      "taskId": "uuid",
      "taskNo": "PT-20261023-001",
      "exceptionType": "设备故障",
      "description": "采摘剪刀损坏，需要更换",
      "reporter": "李四",
      "reportTime": "2026-10-24T10:00:00.000Z",
      "status": "待处理",
      "resolutionNotes": null,
      "createdAt": "2026-10-24T10:00:00.000Z",
      "updatedAt": "2026-10-24T10:00:00.000Z"
    }
  ]
}
```

- `taskId` 和 `taskNo`：可空，未关联任务时均为 `null`。

#### POST /api/exceptions

提交异常报告。

**请求体**

| 字段 | 类型 | 必填 | 可空 | 说明 |
|---|---|---|---|---|
| taskId | string | 否 | 是 | 关联采摘任务 ID（可选） |
| exceptionType | string | 是 | 否 | 天气 / 病虫害 / 设备故障 / 人员 / 其他 |
| description | string | 是 | 否 | 异常描述 |
| reporter | string | 是 | 否 | 上报人 |
| reportTime | string (ISO 8601) | 是 | 否 | 上报时间 |

**响应 201**

```json
{
  "id": "uuid",
  "taskId": "uuid",
  "taskNo": "PT-20261023-001",
  "exceptionType": "设备故障",
  "description": "采摘剪刀损坏，需要更换",
  "reporter": "李四",
  "reportTime": "2026-10-24T10:00:00.000Z",
  "status": "待处理",
  "resolutionNotes": null,
  "createdAt": "2026-10-24T10:00:00.000Z",
  "updatedAt": "2026-10-24T10:00:00.000Z"
}
```

**错误**

| HTTP | code | 说明 |
|---|---|---|
| 400 | INVALID_PARAMS | 缺少必填字段或 exceptionType 不在枚举范围 |
| 404 | TASK_NOT_FOUND | taskId 不为空但任务不存在 |

#### PATCH /api/exceptions/:id

更新异常处理状态和说明。

**请求体**

| 字段 | 类型 | 必填 | 可空 | 说明 |
|---|---|---|---|---|
| status | string | 是 | 否 | 处理中 / 已解决 |
| resolutionNotes | string | 否 | 是 | 处理说明 |

**状态转换规则**

| 当前状态 | 允许目标状态 |
|---|---|
| 待处理 | 处理中、已解决 |
| 处理中 | 已解决 |
| 已解决 | — |

**响应 200**

```json
{
  "id": "uuid",
  "status": "处理中",
  "resolutionNotes": "已联系设备维修",
  "updatedAt": "2026-10-24T11:00:00.000Z"
}
```

**错误**

| HTTP | code | 说明 |
|---|---|---|
| 400 | INVALID_PARAMS | status 不在枚举范围 |
| 404 | EXCEPTION_NOT_FOUND | 异常报告不存在 |
| 409 | INVALID_STATUS_TRANSITION | 不允许的状态转换 |

---

### 7. 产量统计

#### GET /api/statistics

获取产量统计数据。基于状态为"已完成"的任务及其进度上报数据聚合。

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| plotId | string | 否 | 按地块筛选 |
| variety | string | 否 | 按品种筛选 |
| startDate | string (YYYY-MM-DD) | 否 | 起始日期（按任务 plannedDate 筛选） |
| endDate | string (YYYY-MM-DD) | 否 | 结束日期（按任务 plannedDate 筛选） |

**响应 200**

```json
{
  "summary": {
    "totalPickedQuantity": 850,
    "completedTaskCount": 8,
    "workerCount": 5
  },
  "byPlot": [
    {
      "plotId": "uuid",
      "plotCode": "PLOT-001",
      "plotName": "东区1号地",
      "variety": "草莓",
      "totalPickedQuantity": 300,
      "completedTaskCount": 3
    },
    {
      "plotId": "uuid",
      "plotCode": "PLOT-002",
      "plotName": "西区2号地",
      "variety": "蓝莓",
      "totalPickedQuantity": 550,
      "completedTaskCount": 5
    }
  ]
}
```

- `summary.totalPickedQuantity`：所有已完成任务的采摘量总和。
- `summary.completedTaskCount`：已完成任务数量。
- `summary.workerCount`：参与已完成任务的去重作业人员数。
- `byPlot`：按地块维度的产量明细。
