# 实现报告：机器人巡逻告警系统（160-robotwarning）

## 阶段

Development Implementation（开发实现）

## 实现摘要

完成了巡逻机器人告警系统的全栈实现，覆盖巡逻路线配置、视频事件识别、实时告警、人工处置和事件留痕五个业务模块。

## 任务执行

| 任务 | 说明 | 状态 |
| --- | --- | --- |
| T01 后端 | API、WebSocket 推送、后台视频事件识别、审计留痕 | 已完成 |
| T02 前端 | 巡逻路线配置、告警处置工作台、事件留痕查询 | 已完成 |

两个任务并行执行。子任务创建了数据库迁移文件、共享类型定义和前端页面组件。协调会话完成了后端路由、WebSocket hub、后台任务、bootstrap 集成和前端路由壳的完整实现。

## 验收标准达成情况

### AC-01：巡逻路线可配置并读回 — 通过

- **后端**：实现 `GET/POST/PUT/DELETE /api/patrol-routes` 全套 CRUD 接口，包含参数校验（name 非空、waypoints 至少 1 个）和 404 错误处理。
- **前端**：巡逻路线配置页支持创建、编辑、查看详情和删除（带确认提示），列表表格展示已配置路线。
- **验证**：冒烟测试创建路线后，列表和详情均返回一致的名称和路径点信息。`typecheck:server`、`typecheck:client`、`build`、`test` 全部通过。

### AC-02：视频事件识别结果生成告警 — 通过

- **后端**：后台定时任务（15 秒间隔）自动为已配置路线生成随机类型（intrusion/fire/obstacle/anomaly）的视频事件，并自动创建关联告警。
- **验证**：启动服务后创建路线，等待 15 秒后 GET /api/video-events 返回自动生成的事件记录，GET /api/alerts 返回关联告警。

### AC-03：告警实时推送至操作人员 — 通过

- **后端**：实现 `WS /ws/alerts` WebSocket 端点，告警生成时通过 WsHub 广播 `alert:new` 消息给所有已连接客户端。
- **前端**：useWebSocket hook 连接 `/ws/alerts`，发送 `alert:subscribe` 订阅消息，收到 `alert:new` 后更新未处置告警列表和顶部计数，断线 3 秒自动重连。
- **验证**：API 层面验证告警包含告警时间、事件类型和关联路线/位置信息。

### AC-04：操作人员可处置告警 — 通过

- **后端**：实现 `PATCH /api/alerts/:id/handle`，含 404 告警不存在、409 已处置冲突、400 参数校验三种错误处理，处置后状态更新为 `handled`。
- **前端**：告警处置工作台采用 split-master-detail 布局，左侧未处置告警列表，右侧告警详情含关联视频事件信息，处置表单包含处置人、处置结果和处置说明。
- **验证**：冒烟测试 PATCH 处置后告警状态更新为 `handled`，处置记录包含处置人、处置结果和处置说明。

### AC-05：事件全流程留痕可查 — 通过

- **后端**：通过 auditkit 在视频事件生成（video_event_detected）、告警创建（alert_created）、告警处置（alert_handled）三个节点自动写入审计记录。实现 `GET /api/audit-trail`（支持时间范围和事件类型筛选）和 `GET /api/audit-trail/:id` 查询接口。
- **前端**：事件留痕查询页支持按日期范围和事件类型检索，列表展示事件类型、时间戳、关联实体 ID 和摘要，详情弹窗展示完整信息，记录只读不可编辑。
- **验证**：冒烟测试完成完整流程后，GET /api/audit-trail 返回三条留痕记录，时间线从事件识别到告警处置，信息完整一致。

## 验证结果

| 检查项 | 命令 | 结果 |
| --- | --- | --- |
| 服务端类型检查 | `npm run typecheck:server` | 通过 |
| 客户端类型检查 | `npm run typecheck:client` | 通过 |
| 构建 | `npm run build` | 通过（40 模块，dist 产物正常） |
| 测试 | `npm test` | 3/3 通过 |
| API 冒烟测试 | 手动 curl | 全部端点响应正确 |

## 实现文件清单

### 后端

| 文件 | 说明 |
| --- | --- |
| `src/server/ws/hub.ts` | WebSocket 连接管理器，支持 noServer 模式 upgrade 和广播 |
| `src/server/platform/bootstrap.ts` | 初始化 dbkit + auditkit + WsHub |
| `src/server/routes.ts` | 全部 REST API 路由实现（巡逻路线、视频事件、告警、留痕） |
| `src/server/index.ts` | 服务入口，WebSocket upgrade 处理 + 后台视频事件识别任务 |
| `src/server/migrations/sqlite/0001_patrol_routes.sql` | patrol_routes 表迁移 |
| `src/server/migrations/sqlite/0002_video_events_alerts.sql` | video_events + alerts 表迁移 |
| `src/shared/types.ts` | 平台无关共享类型定义 |
| `vite.config.ts` | 添加 /ws WebSocket 代理 |

### 前端

| 文件 | 说明 |
| --- | --- |
| `src/client/App.tsx` | 应用壳：左侧导航 + 路由 |
| `src/client/main.tsx` | 入口：添加 BrowserRouter |
| `src/client/hooks/useWebSocket.ts` | WebSocket 客户端 hook（自动重连） |
| `src/client/pages/PatrolRoutes.tsx` | 巡逻路线配置页（CRUD + 表单 + 删除确认） |
| `src/client/pages/AlertWorkbench.tsx` | 告警处置工作台（master-detail + WebSocket + 处置表单） |
| `src/client/pages/AuditTrail.tsx` | 事件留痕查询页（筛选 + 列表 + 详情弹窗） |

## 技术决策

- **WebSocket**：使用 `ws` 包（noServer 模式），通过 HTTP server upgrade 事件手动处理 WebSocket 连接，与 Hono 的 HTTP 路由解耦。
- **审计查询**：auditkit 的 `list` 方法不支持时间范围和 ID 查询，因此直接查询 `audit_events` 表实现 `GET /api/audit-trail` 的筛选和详情接口。
- **后台任务**：使用 `setInterval` 实现 15 秒间隔的视频事件模拟，在 SIGINT/SIGTERM 时清理定时器。
- **snake_case ↔ camelCase**：后端在序列化响应时统一转换，前端 apiRequest 的 camelCaseResponse 为幂等安全转换。
