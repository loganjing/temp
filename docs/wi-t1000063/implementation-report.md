# Implementation Report — Helpdesk 企业工单系统（wi-t1000063）

## 1. 执行记录

- 阶段：implementation（交付档案 standard，专家团队 general-application-development）
- 任务计划：plan:01afd443-151c-4fc9-b39c-35c75116ccee（已批准，审批人 loganjing）
- 任务拆分与结算：

| 任务 | 范围 | 尝试 | 执行会话 | 结算 |
|---|---|---|---|---|
| T01 | 服务端全部业务能力 | 3（前两次会话异常终止且无产物；第 3 次经两次续跑完成） | ses_eb2971d25ffeNhJGwckcq4mtlq | completed |
| T02 | React SPA 全部界面 | 1 | ses_eb341e84dffeIq0sjs42KaEUYP | completed |

## 2. 交付内容

### 2.1 服务端（T01：app/helpdesk/src/server/、src/shared/、test/）

- **数据与迁移**：版本化业务迁移（组织/人员/分类与分配规则/SLA 与日历/工单域/评价/轮询游标/附件）；种子：初始管理员、默认工作日历（时区 Asia/Kuala_Lumpur）、系统骨架分类（isSkeleton 标记）。
- **权限与错误结构**：统一 guard（角色 + 对象关系 + 状态三重校验）；契约 §1 错误结构；越权读一律 404 防枚举，流转/指派/转派写路径越权 403。
- **工单状态机**：8 态全流转、回复例外副作用、回复即认领（pending_assign 下经理回复转处理中）、幂等提交（同键重放返回原单）。
- **分配引擎**：一级分类 → 分配规则 → 多 Team 轮询（游标持久化、服务重启续转）→ 成员过滤（启用/非部门经理/非休假）→ Team 经理兜底 → 待分配失败记录（pending_assign）。
- **SLA 双时钟引擎**：工作日历滚动计算、挂起暂停/恢复整体顺延/未响应补记、在线改分类从原起算点重算、完成判定 met/missed、预警阈值；列表/仪表盘/详情口径一致。
- **统计服务**：唯一「今日」口径、草稿排除、KPI/告警/下钻共用同一谓词。
- **通知**：仅工单提交与回复两个动作点异步邮件；无 SMTP 配置静默跳过、失败仅记日志不阻断主流程。
- **待确认超时自动关闭**：周期扫描（默认超时 24 小时、间隔 5 分钟，可用环境变量覆盖），关闭时补系统默认 5 星评分（提交人可覆盖）。
- **MCP**：公开区 JSON-RPC 2.0 端点（认证先于 RPC 体解析）；`create_ticket` 工具幂等建单，attachmentUrl(s) 尽力下载挂接（失败仅记录 `mcp_attachment_failed` 活动，不阻断创建）。
- **REST 接口**：契约 §2–§13 全部接口（认证会话、工单全组含时间线/活动/导出、组织与用户管理、分类与分配规则含 CSV 导入导出、SLA 策略/日历/节假日、Dashboard、审计、嵌入工作台聚合、附件上传/下载 canAccess 绑定）；分页/排序/双语序列化回退/角色数据范围/草稿隐私按契约。
- **过程中修复的实现缺陷**（对照契约修复，未削弱断言）：SLA 策略更新合并逻辑、改分类后重算、SQL UPDATE 占位符缺失、SMTP 会话读取完成判断（原实现导致全部邮件静默失败）、转派越权校验前移（403）、路由 UPDATE 列拼接等。

### 2.2 前端（T02：app/helpdesk/src/client/）

- **标准工作台 `/`**：应用壳（四角色裁剪导航、语言切换）、工单列表（筛选/分页/updatedAt 倒序）、工单详情（时间线合并倒序、回复、提交解决、确认/驳回、评价、挂起/恢复/取消、改分类/优先级、指派/转派）、草稿表单（幂等键持久化、附件上传）、部门工单箱、Dashboard（KPI/告警/排行与下钻）、组织与六个管理页（用户/公司/部门/Team/成员/休假/分类/分配规则/SLA 策略/工作日历/审计）。
- **嵌入式工作台 `/embed/workbench`**：无应用壳独立路由、仅提交人、看板/列表切换、顶部 KPI、条数截断提示、灵基智能体入口最外层窗口打开。
- **API 客户端与契约类型、错误解码**；中英文 i18n 资源（351 键，键集一致）；统一内联 SVG 图标家族；Modern SaaS 视觉基线与加载/空/错误/无权限反馈。

## 3. 验证结果（真实命令）

| 命令（在 app/helpdesk 下执行） | 结果 |
|---|---|
| `npm run typecheck:server` | 通过（tsc -p tsconfig.server.json，exit 0） |
| `npm test` | 通过：tests 62 / pass 62 / fail 0（约 5.1s，11 个测试文件） |
| `npm run typecheck:client` | 通过（tsc -p tsconfig.client.json，exit 0） |
| `npm run build:client` | 通过（vite build，88 modules，dist 378.10 kB JS / 20.85 kB CSS） |

说明：`typecheck:client` 与 `build:client` 为两任务结算后在协调会话复跑（包含 T01 后写入的 `src/shared/` 集成状态）；服务端测试以隔离 HTTP 服务与独立临时数据库运行，覆盖权限矩阵/状态机/分配链路（重启续转、经理兜底、休假排除）/SLA 双时钟（工作日、挂起顺延、补记、改分类重算、met/missed）/草稿隐私与统计排除/幂等提交/自动关闭/SMTP mock 触发点/MCP（含附件成功与失败路径）。

## 4. 种子凭证

- 初始管理员：`admin@helpdesk.local` / `Admin@Helpdesk2026`

## 5. 声明实现限制

1. 登出仅内存吊销：单进程内有效，服务重启后既有 token 失效。
2. 导入用户使用一次性随机密码，生成后无法再次查询。
3. 待确认超时自动关闭时补系统默认 5 星评分（提交人可覆盖）。
4. SMTP 通知与 MCP 附件下载均为尽力而为：失败仅记日志/活动，不阻断主流程。
5. MCP 认证失败粒度：缺 `x-lingee-code` 与无效 code 同返回 401 `AUTH_REQUIRED`。

## 6. 契约缺口与前端假设（T02 报告，共 9 项）

1. 灵基智能体入口 URL 需求未给定 → 实现为常量，以最外层窗口打开。
2. `can.start` 语义由前端推断实现（契约未逐字段定义）。
3. 契约无附件列表接口 → 详情页不展示历史附件；草稿编辑仅管理本次新上传（attachmentIds PATCH 语义未明确）。
4. `GET /api/tickets` 无日期参数 → Dashboard「今日新增」下钻以非草稿 + `created_at` 倒序近似，卡片数字与下钻明细无法严格对账。
5. `GET /api/org/departments` 表头标注 admin → 经理组织页按「服务端按角色返回管辖部门」实现。
6. TimelineItem 无备注双语字段 → 备注直显 body；动作文案缺失时回退原值。
7. 若干列表接口包裹形式未标注 → 兼容裸数组与 `{items}`；BreakdownRow.key 假定为数值 id。
8. 启停状态值未定义枚举 → 按 active/inactive 处理，未知值回退原值。
9. 客户端语言资源用 TS 模块（tsconfig.json 未开启 resolveJsonModule 且不在 T02 写入范围）。

## 7. 口径备注与后续阶段

- 权限拒绝口径：回复路径（addReply）越权为 404 对象级防枚举（与附件契约 §12 口径一致）；流转/指派/转派写路径为 403。两者均有测试覆盖。
- 本阶段不做浏览器验收与前后端真实联调（后续验证阶段负责）：前端以类型检查与构建验证，服务端以隔离 HTTP 测试验证。
