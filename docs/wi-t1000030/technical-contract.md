# 技术契约

> 工作项：wi-t1000030

本文档是前后端共享的 API 契约唯一来源。字段级类型、可空性、错误和映射责任在此定义；架构基线只保留接口摘要。

## ID 类型对照表

| 实体 | 生成方 | 数据库主键类型 | 外键类型 | API JSON 类型 | 前端类型 | 转换/校验位置 |
| --- | --- | --- | --- | --- | --- | --- |
| cleaning_areas.id | 服务端 (UUID v4) | TEXT | — | string | string | 服务端生成，前端透传 |
| scheduled_jobs.id | 服务端 (UUID v4) | TEXT | TEXT (area_id) | string | string | 服务端生成，前端透传 |
| task_instances.id | 服务端 (UUID v4) | TEXT | TEXT (job_id) | string | string | 服务端生成，前端透传 |
| obstacles.id | 服务端 (UUID v4) | TEXT | TEXT (task_instance_id) | string | string | 服务端生成，前端透传 |
| supply_items.id | 服务端 (UUID v4) | TEXT | — | string | string | 服务端生成，前端透传 |
| supply_alerts.id | 服务端 (UUID v4) | TEXT | TEXT (supply_item_id) | string | string | 服务端生成，前端透传 |

所有 ID 在数据库中存储为 TEXT，在 API JSON 中为 string，前端直接使用，不进行类型转换。UUID v4 由服务端 `crypto.randomUUID()` 生成。

## 通用约定

- 基础路径：`/api`
- 内容类型：`application/json`
- 成功响应：HTTP 2xx + JSON body
- 错误响应：HTTP 4xx/5xx + `{ "error": "message" }`
- 时间格式：ISO 8601 字符串（`2026-01-15T08:30:00.000Z`）
- 日期格式：`YYYY-MM-DD`
- 时间格式（调度）：`HH:MM`（24 小时制）

## 接口定义

### 1. 清洁区域

#### POST /api/areas

创建清洁区域。

| 请求字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| name | string | 否 | 区域名称 |
| location_desc | string | 否 | 位置描述 |
| requirements | string | 否 | 清洁要求（频次要求、标准说明） |

响应：`201 Created`

| 响应字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 区域 ID |
| name | string | 否 | 区域名称 |
| location_desc | string | 否 | 位置描述 |
| requirements | string | 否 | 清洁要求 |
| created_at | string | 否 | 创建时间 ISO 8601 |

错误：`400` 字段缺失或为空。

#### GET /api/areas

获取区域列表。

响应：`200 OK`

| 响应字段 | 类型 | 说明 |
| --- | --- | --- |
| (array) | Area[] | 区域数组，元素结构同 POST 响应 |

#### GET /api/areas/:id

获取单个区域。

响应：`200 OK` — Area 对象。
错误：`404` 区域不存在。

#### PUT /api/areas/:id

编辑区域。请求与 POST 相同字段（均可选，仅传需更新的字段）。

响应：`200 OK` — 更新后的 Area 对象。
错误：`404` 区域不存在；`400` 字段校验失败。

#### DELETE /api/areas/:id

删除区域。

响应：`204 No Content`。
错误：`404` 区域不存在。

---

### 2. 定时作业

#### POST /api/jobs

创建定时作业。

| 请求字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| area_id | string | 否 | 关联清洁区域 ID |
| assignee | string | 否 | 执行人 |
| schedule_type | string | 否 | `'daily'` 或 `'weekly'` |
| schedule_days | number[] | 是 | weekly 时必填，`[1..7]`（周一=1..周日=7）；daily 时为空 |
| start_time | string | 否 | `'HH:MM'` 起始时间 |

响应：`201 Created`

| 响应字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 作业 ID |
| area_id | string | 否 | 关联区域 ID |
| area_name | string | 否 | 关联区域名称（JOIN 查询） |
| assignee | string | 否 | 执行人 |
| schedule_type | string | 否 | `'daily'` 或 `'weekly'` |
| schedule_days | number[] | 是 | 周期日（weekly） |
| start_time | string | 否 | 起始时间 |
| active | boolean | 否 | 是否活跃 |
| created_at | string | 否 | 创建时间 |

错误：`400` 字段缺失或 `schedule_type` 与 `schedule_days` 不匹配；`404` 关联区域不存在。

#### GET /api/jobs

获取作业列表（含关联区域名称）。

响应：`200 OK` — Job 对象数组。

#### PUT /api/jobs/:id

编辑或停用作业。

| 请求字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| area_id | string | 是 | 关联区域 ID |
| assignee | string | 是 | 执行人 |
| schedule_type | string | 是 | 调度周期 |
| schedule_days | number[] | 是 | 周期日 |
| start_time | string | 是 | 起始时间 |
| active | boolean | 是 | 停用设为 false |

响应：`200 OK` — 更新后的 Job 对象。
错误：`404` 作业不存在；`400` 校验失败。

#### GET /api/task-instances

获取任务实例列表。

| 查询参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| job_id | string | 是 | 按作业筛选 |
| status | string | 是 | 按状态筛选 |

响应：`200 OK`

| 响应字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 实例 ID |
| job_id | string | 否 | 作业 ID |
| scheduled_date | string | 否 | 计划日期 |
| status | string | 否 | `pending`/`in_progress`/`completed`/`has_obstacle_completed` |
| assignee | string | 否 | 执行人（JOIN 查询） |
| area_name | string | 否 | 区域名称（JOIN 查询） |
| created_at | string | 否 | 创建时间 |
| updated_at | string | 否 | 更新时间 |

---

### 3. 障碍处理

#### POST /api/obstacles

上报障碍。

| 请求字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| task_instance_id | string | 否 | 关联作业实例 ID |
| description | string | 否 | 障碍描述 |

响应：`201 Created`

| 响应字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 障碍 ID |
| task_instance_id | string | 否 | 关联实例 ID |
| description | string | 否 | 障碍描述 |
| reported_at | string | 否 | 上报时间 ISO 8601 |
| status | string | 否 | `'pending'` |
| resolution_method | null | 是 | 初始为 null |
| resolution_result | null | 是 | 初始为 null |
| resolved_at | null | 是 | 初始为 null |

错误：`400` 字段缺失；`404` 任务实例不存在。

**副作用**：上报障碍时，将关联 `task_instances.status` 更新为 `has_obstacle_completed`。

#### GET /api/obstacles

获取障碍列表。

| 查询参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| status | string | 是 | `pending`/`resolved` |

响应：`200 OK` — Obstacle 对象数组。

#### PUT /api/obstacles/:id/resolve

标记障碍已处理。

| 请求字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| resolution_method | string | 否 | 处理方式 |
| resolution_result | string | 否 | 处理结果 |

响应：`200 OK`

| 响应字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 障碍 ID |
| task_instance_id | string | 否 | 关联实例 ID |
| description | string | 否 | 障碍描述 |
| reported_at | string | 否 | 上报时间 |
| status | string | 否 | `'resolved'` |
| resolution_method | string | 否 | 处理方式 |
| resolution_result | string | 否 | 处理结果 |
| resolved_at | string | 否 | 处理时间 ISO 8601 |

错误：`404` 障碍不存在；`400` 字段缺失；`409` 障碍已处理。

---

### 4. 耗材管理

#### POST /api/supplies

创建耗材。

| 请求字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| name | string | 否 | 耗材名称 |
| quantity | number | 否 | 当前库存数量 |
| unit | string | 否 | 单位 |
| threshold | number | 否 | 最低提醒阈值 |

响应：`201 Created` — SupplyItem 对象（含所有字段）。

**副作用**：创建时若 `quantity < threshold`，自动生成 `supply_alerts` 记录。

#### GET /api/supplies

获取耗材列表。

响应：`200 OK`

| 响应字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 耗材 ID |
| name | string | 否 | 名称 |
| quantity | number | 否 | 库存数量 |
| unit | string | 否 | 单位 |
| threshold | number | 否 | 阈值 |
| low_stock | boolean | 否 | `quantity < threshold` 计算值 |
| created_at | string | 否 | 创建时间 |
| updated_at | string | 否 | 更新时间 |

#### PUT /api/supplies/:id

更新耗材（含库存数量变更）。

| 请求字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| name | string | 是 | 名称 |
| quantity | number | 是 | 库存数量 |
| unit | string | 是 | 单位 |
| threshold | number | 是 | 阈值 |

响应：`200 OK` — 更新后的 SupplyItem 对象。

**副作用**：更新后检查库存与阈值关系：
- `quantity < threshold` 且无活跃提醒 → 创建 `supply_alerts` 记录。
- `quantity >= threshold` 且有活跃提醒 → 标记已有提醒为 `resolved`（自动消除，同时 `resolved_at` 记录当前时间）。

#### DELETE /api/supplies/:id

删除耗材。

响应：`204 No Content`。

#### GET /api/supply-alerts

获取未处理库存提醒列表。

响应：`200 OK`

| 响应字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| id | string | 否 | 提醒 ID |
| supply_item_id | string | 否 | 耗材 ID |
| supply_item_name | string | 否 | 耗材名称（JOIN 查询） |
| created_at | string | 否 | 提醒时间 |
| status | string | 否 | `active`/`resolved` |
| resolved_at | string | 是 | 消除时间 |

#### PUT /api/supply-alerts/:id/resolve

消除提醒（库存补充后手动标记）。

响应：`200 OK` — 更新后的 SupplyAlert 对象（`status` 变为 `resolved`）。
错误：`404` 提醒不存在；`409` 提醒已消除。

---

### 5. 作业质量报告

#### GET /api/reports/quality

生成作业质量报告。

| 查询参数 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| area_id | string | 是 | 按区域筛选，不传则全部区域 |
| from | string | 是 | 起始日期 `YYYY-MM-DD` |
| to | string | 是 | 结束日期 `YYYY-MM-DD` |

响应：`200 OK`

| 响应字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| area_id | string | 是 | 区域 ID（全部时为 null） |
| area_name | string | 是 | 区域名称 |
| from | string | 否 | 起始日期 |
| to | string | 否 | 结束日期 |
| task_completion_rate | number | 否 | 作业完成率（已完成数/总实例数） |
| total_task_instances | number | 否 | 任务实例总数 |
| completed_task_instances | number | 否 | 已完成实例数（含 has_obstacle_completed） |
| obstacle_count | number | 否 | 障碍上报总数 |
| obstacle_resolved_count | number | 否 | 已处理障碍数 |
| obstacle_resolution_rate | number | 否 | 障碍处理率（已处理/上报总数） |
| supply_consumption | array | 否 | 耗材消耗汇总，见下 |

`supply_consumption` 元素：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| supply_item_id | string | 耗材 ID |
| supply_item_name | string | 耗材名称 |
| consumed | number | 消耗量（时间段内 quantity 减少量，若无变更记录则取当前与初始差值） |

错误：`400` 日期格式无效或 `from > to`。

---

## 数据映射与转换责任

- **schedule_days**：数据库存储为 TEXT（JSON 字符串），API 返回和接收为 `number[]`。服务端负责 `JSON.stringify` / `JSON.parse`，前端直接使用数组。
- **active**：数据库存储为 INTEGER（0/1），API 返回为 `boolean`。服务端负责转换。
- **low_stock**：不持久化，API 响应时由 `quantity < threshold` 计算得出。
- **quantity / threshold**：数据库存储为 REAL，API 返回为 `number`。
- **日期/时间**：全部以 TEXT 存储 ISO 8601 或 `YYYY-MM-DD`，API 返回原始字符串。
