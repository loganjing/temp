# 实现报告：资产领用单（wi-t1000064 · implementation）

## 1. 执行概要

- 批准计划：`plan:c49be505-b660-4330-80d3-bf57034236c9`（计划视图 `docs/wi-t1000064/development-task-plan.md`，用户已批准）。
- 计划任务 2 个，均为 `completed`：
  - **T01（后端，工程实现）**：SQLite 三表迁移、保存权威校验、事务内取号、条件查询与详情 API、行为测试。
  - **T02（前端，工程实现）**：列表筛选、新建表单与分录编辑、详情回读、A4 打印视图。
- 两任务并行执行，写权互不重叠（T01：`src/server/`、`src/shared/`、`test/`；T02：`src/client/`、`index.html`、`vite.config.ts`）。
- 阶段范围：仅 implementation；浏览器端到端验收属后续验证阶段，不在本报告宣称范围内。

## 2. 交付产物

### T01 后端（提交证据含哈希）

| 文件 | 内容 |
| --- | --- |
| `app/asset-apply/src/server/migrations/sqlite/0001_init.sql` | 创建 `asset_apply_bill`、`asset_apply_bill_entry`（FK 级联删除）、`billno_seq` 三表；billno 唯一索引、分录 bill_id 索引；启动时经现有 dbkit `runMigrations` 自动应用 |
| `app/asset-apply/src/shared/asset-apply-bill.ts` | 平台中立契约：单据/摘要/分录/查询/创建类型、错误码常量（VALIDATION_FAILED/BILL_NOT_FOUND/BILLNO_CONFLICT）与提示文案常量 |
| `app/asset-apply/src/server/services/asset-apply-bill.ts` | 服务端权威：请求校验（主表必填、pick_date 格式与真实日期、分录非空、行级资产名称/数量）→ 事务内取号（`LYyyyyMMdd` + 4 位流水、超 9999 扩位）→ 主表与分录原子落库；单号冲突重试一次后 409 兜底；系统字段全部服务端生成 |
| `app/asset-apply/src/server/routes.ts` | 注册 `POST /api/asset-apply-bills`（201）、`GET /api/asset-apply-bills`（包含/精确/分页/降序）、`GET /api/asset-apply-bills/:id`（404 BILL_NOT_FOUND）；错误沿用平台 `{error:{code,message}}` 并扩展 `details` |
| `app/asset-apply/test/asset-apply-bill.test.mjs` | 5 个行为测试，复用 `with-http-server.mjs` 真实 HTTP 服务 + 每用例独立临时 SQLite 库 |

### T02 前端（提交证据含哈希）

| 文件 | 内容 |
| --- | --- |
| `app/asset-apply/src/client/api.ts` | 按技术契约的客户端消费类型与请求函数：请求体 snake_case wire 键；响应类型按 `api-client.ts` 规范化行为声明 |
| `app/asset-apply/src/client/pages/BillListPage.tsx` | `/`：三项筛选（billno/picker/pick_date）+ 查询/重试、分页、加载指示、空态引导 |
| `app/asset-apply/src/client/pages/BillNewPage.tsx` | `/bills/new`：主表必填字段 + 分录行编辑（数量默认 1、行增删、空分录引导行）；提交前本地预检（文案与服务端一致）；服务端错误按 `details` 字段级渲染；保存成功展示单号后跳转详情 |
| `app/asset-apply/src/client/pages/BillDetailPage.tsx` | `/bills/:id`：主表全字段 + 分录按 seq 展示；404 显示「领用单不存在」 |
| `app/asset-apply/src/client/pages/BillPrintPage.tsx` | `/bills/:id/print`：A4 纵向打印视图（`@page size: A4 portrait`，`@media print` 隐藏应用壳），主表信息 + 分录表格 + 三方签章区；仅 GET 回读 |
| `app/asset-apply/src/client/format.ts` | 日期时间展示格式化与状态徽标样式 |
| `app/asset-apply/src/client/styles.css` | Modern SaaS 全局样式 + 打印样式 |
| `app/asset-apply/src/client/platform/api-client.ts` | `ApiRequestError` 新增 `details` 安全解码（错误体保持原始 wire 形态），既有行为不变 |
| `app/asset-apply/src/client/App.tsx` | BrowserRouter 路由 + 顶部应用壳（应用名 +「新建领用单」主按钮） |
| `app/asset-apply/src/client/main.tsx` | 引入 `styles.css` |
| `app/asset-apply/index.html` | 标题「资产领用单」，`lang="zh-CN"` |

`vite.config.ts` 无需变更（现有 `/api` 代理与端口已符合架构基线）。

## 3. 验证证据（于 `app/asset-apply/` 实际执行）

| 任务 | 命令 | 退出码 | 结果 |
| --- | --- | --- | --- |
| T01 | `npm run typecheck:server` | 0 | 通过 |
| T01 | `npm test`（node --import tsx --test） | 0 | 8/8 通过：新增 5 项（保存成功回读与详情一致、含单号格式/系统字段忽略/保存 < 2 秒；三类校验失败 details 精确断言且不落库；连续取号唯一且流水号递增 1；条件查询含不命中排除与分页；详情 404）+ 既有 3 项回归 |
| T01（补充自检） | `npm run typecheck:client` | 0 | 确认新增共享契约不破坏客户端类型检查 |
| T02 | `npm run typecheck:client`（tsc strict） | 0 | 通过，无错误 |
| T02 | `npm run build:client`（vite build 5.4.21） | 0 | 42 模块转换成功，产出 dist/index.html + CSS 7.74 kB + JS 184.52 kB |

## 4. 验收证据状态（截至本阶段）

| AC | 服务端/API 层 | 用户界面 | 状态结论 |
| --- | --- | --- | --- |
| AC-01 创建并保存 | passed：保存回读一致、系统字段服务端生成、保存 < 2 秒（行为测试断言） | 代码交付，构建通过 | 部分：API 层 passed；浏览器入口 not-run（归验证阶段） |
| AC-02 无效数据阻止 | passed：三类校验阻断、details 精确、不落库 | 预检文案与服务端一致，字段级提示实现 | 部分：API 层 passed；浏览器入口 not-run（归验证阶段） |
| AC-03 自动单号 | passed：连续取号唯一、同前缀流水号递增、格式断言 | 成功横幅展示单号已实现 | 部分：API 层 passed；浏览器入口 not-run（归验证阶段） |
| AC-04 打印模板 | passed：详情回读 API 为打印数据源 | 打印视图代码交付，构建通过 | not-run（浏览器打印输出归验证阶段） |
| AC-05 条件查询 | passed：billno/picker 包含、pick_date 精确、组合、不命中排除、分页 | 列表筛选实现，构建通过 | 部分：API 层 passed；浏览器入口 not-run（归验证阶段） |

## 5. 边界与遗留事项

- 浏览器端到端验收（AC-01～AC-05 的 UI 入口、真实保存回读、打印输出效果、条件查询命中）按阶段边界归后续验证阶段，本阶段仅交付开发侧类型检查、构建与 API 行为测试证据。
- `BILLNO_CONFLICT` 409 兜底分支在单进程同步事务模型下无法自然触发，行为测试未覆盖该分支；按技术契约属兜底防线，正常负载不出现。
- 无已声明阻塞；两任务提交证据（文件路径、字节数、SHA-256）已登记于任务结算记录。
