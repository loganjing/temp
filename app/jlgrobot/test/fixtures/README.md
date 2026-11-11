# QA fixtures

`withQaEnvironment` gives each run a temporary SQLite database and a unique `QA_RUN_ID`, then closes and removes the database. Initialize the application platform inside its callback so it uses that database. 本工作项需求未规定用户角色与权限策略，未选择 authkit/userkit/permissionkit，因此 `qa-environment.mjs` 不提供登录身份种子。

`seedEquipment(platform, options?)` directly inserts a base equipment row into the platform database and returns the created equipment object. Use it when a QA scenario needs a pre-existing device before exercising the business API endpoints (状态、故障、升级、工单、履历)。

QA 流程建议：
1. 在 `withQaEnvironment` 内初始化平台并组装 Hono app（`protect` 使用 no-op `authBoundary`，业务路由通过 `registerProtectedRoutes` 注册）。
2. 启动隔离 HTTP 服务（`test/with-http-server.mjs`），通过真实 API 写入并读回验证。
3. 状态流转（故障、升级、工单）按契约定义的合法路径逐步推进，每步后读取详情验证状态与状态流转日志一致；非法路径应返回 400。
4. 履历接口验证状态、故障、升级、工单按时间倒序聚合。
5. 通过 `DB_PATH` 指定隔离测试数据库，验收后由 fixture 自动清理。

Check `/api/health` for the same `QA_RUN_ID` before starting browser acceptance. 不要将凭据或敏感运行配置写入报告或日志。
