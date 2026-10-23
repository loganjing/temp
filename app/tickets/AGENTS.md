# 应用包约定

本文件约定 `app/tickets/` 内的源码放置、依赖方向和基线模板文件职责。工作区级规则见根目录 `AGENTS.md`；包根目录、模块状态和机器可读入口地图见根目录 `platform-baseline.json`。包内保留完整 `build` 作为整体验收入口，同时提供 server/client 局部类型检查命令供可并行实现任务独立验证。

## 简洁优先

优先用最少的代码解决当前问题，不为假想需求增加实现。编码前检查方案是否过度复杂；若明显可以用更直接的方式实现，就先简化，同时保持可读性和正确性。

- 不添加需求之外的功能。
- 不为只使用一次的逻辑创建抽象。
- 不添加需求未要求的灵活性、扩展点或可配置项。
- 不为按现有约束不可能发生的情况增加错误处理；真实可能发生的错误仍需妥善处理。
- 修改现有代码时，只改完成需求所必需的部分；避免无关重构、格式化或清理既有问题，并遵循现有代码风格。

自检：资深工程师会不会认为实现过度复杂？如果会，尝试简化；不要为了减少行数牺牲可读性或正确性。

## 控制改动范围

修改现有代码时，只触及完成当前需求所必需的部分。

- 不要顺手改进相邻代码、注释或格式。
- 不要重构没有问题的代码。
- 遵循项目现有风格，即使你个人更偏好另一种写法。
- 发现与当前需求无关的无用代码时，指出即可，不要删除。
- 本次改动导致导入、变量或函数变得无用时，应清理这些由本次改动造成的遗留；不要借机清理原本就存在的无用代码。

自检：每一处改动都应能直接对应到用户的需求；无法说明关联的改动应从本次变更中移除。

## 以目标驱动执行

开始前明确任务的成功标准，并持续验证，直到有证据表明目标已达成。

- 把任务转成可检查的结果。例如，添加校验时明确无效输入应被拒绝；修复缺陷时明确能够复现问题的场景应通过；重构时确认项目要求的检查在改动后通过。
- 多步骤任务先列出简短计划，并为每一步说明验证方式：

  1. `[步骤]` → 验证：`[检查方式]`
  2. `[步骤]` → 验证：`[检查方式]`
  3. `[步骤]` → 验证：`[检查方式]`

- 成功标准应足够明确，让执行者可以独立检查进度和结果；避免只用“让它能用”这类无法判定是否完成的目标。
- 根据项目规则和任务要求选择合适的验证方式，例如测试、类型检查或构建；发现验证未通过时，继续修正并重新验证。

这些规则应帮助减少无关改动、过度复杂的实现和返工，并尽早发现需求理解上的问题。

## 应用源码目录与入口文件

工作区根目录的 `platform-baseline.json` 是本工作区平台接线、包根目录和入口地图的机器可读事实来源。地图中的 `packageRoot` 相对于工作区根目录；`sourceLayout.pathBase` 为 `application-package-root`，因此其中的 `src/...`、`test/...` 和包配置路径相对于 `packageRoot`。开发任务计划中的路径也相对于工作区根目录。

### 目录职责和依赖边界

- **`src/server/`**：Hono server entry, middleware, routes, platform bindings, services, repositories, and migrations.
  - 可依赖：src/shared/、server dependencies、selected vendor modules。
  - 禁止依赖：src/client/、React、DOM APIs、browser globals。
  - 写入责任：Server implementation tasks own this subtree unless the plan declares a narrower owner.
- **`src/client/`**：React/Vite browser entry, app composition, pages, components, hooks, browser API client, i18n provider, and styles.
  - 可依赖：src/shared/、browser dependencies。
  - 禁止依赖：src/server/、Node built-ins、Hono server runtime、server secrets。
  - 写入责任：Client implementation tasks own this subtree unless the plan declares a narrower owner.
- **`src/shared/`**：Platform-neutral contracts, schemas, locale resources, constants, and pure logic shared by server and client.
  - 可依赖：platform-neutral TypeScript and JSON。
  - 禁止依赖：src/server/、src/client/、Node APIs、Hono、React、DOM APIs、browser globals、database drivers。
  - 写入责任：Assign one task as owner for every shared artifact; parallel server and client tasks must not both write this subtree.
- `test/`：只放测试、隔离 fixture 和测试辅助工具；通过真实实现验证行为，不放产品运行时代码。
- 应用包根目录放 `package.json`、`vite.config.ts`、`tsconfig.json`、`tsconfig.client.json`、`tsconfig.server.json`、`index.html` 和锁文件，不在 `src/` 中复制这些包级配置。

### 基线模板文件用途

下表是本 profile 的稳定模板入口；按任务的 `inspectWhen` 选择需要检查的文件，不要仅因文件出现在地图里就全部读取。所选模块的额外入口和待完成绑定见 `modules.*.entryFiles` 与 `requiredApplicationBindings`。

| 路径（相对应用包根） | 用途 | 何时检查 |
| --- | --- | --- |
| `index.html` | Vite document shell; loads src/client/main.tsx. | client entry or HTML changes |
| `package.json` | Application scripts, dependencies, and runtime commands. | a task changes dependencies or package scripts |
| `vite.config.ts` | Vite plugins, development port, and API proxy. | a task changes client build or dev-server behavior |
| `tsconfig.json` | Aggregate TypeScript compiler options and complete application source check. | a task changes the complete type-check or shared compiler options |
| `tsconfig.client.json` | Client-only TypeScript check for src/client/ and platform-neutral src/shared/ files. | a client task needs independent type-checking or client source inclusion changes |
| `tsconfig.server.json` | Server-only TypeScript check for src/server/ and platform-neutral src/shared/ files. | a server task needs independent type-checking or server source inclusion changes |
| `src/server/index.ts` | Initializes selected server resources, assembles the Hono app, starts HTTP, and closes resources. | server startup, module bootstrap, or shutdown changes |
| `src/server/app.ts` | Owns global middleware, API errors, public/protected route wiring, and production SPA fallback. | middleware, error shape, route order, or static hosting changes |
| `src/server/routes.ts` | Public and authenticated business route registration points. | server endpoints or route ownership changes |
| `src/server/platform/bootstrap.ts` | Initializes resources for selected platform modules. | a selected module changes server resource startup |
| `src/server/platform/auth.ts` | Server identity resolver and authentication boundary binding point. | authentication, identity resolution, or authorization scope changes |
| `src/server/platform/locale.ts` | Default no-op server request locale boundary; replaced by the selected i18n module. | server-side locale behavior or i18n wiring changes |
| `src/server/migrations/` | Database migration files governed by the approved design. | a task adds or changes schema or migration registration |
| `src/server/migrations/sqlite/` | SQLite migrations installed by the selected platform modules. | a task adds or changes SQLite schema |
| `src/client/main.tsx` | Mounts React and application-wide client providers. | client mount or global provider changes |
| `src/client/App.tsx` | Composes the top-level client application and navigation. | top-level application composition or navigation changes |
| `src/client/platform/api-client.ts` | Single browser request boundary, wire response normalization, and API error decoding. | client API integration, wire conversion, or API error behavior changes |
| `src/client/platform/i18n.tsx` | Default client locale provider; replaced by the selected i18n module when installed. | client translation behavior or i18n wiring changes |
| `src/client/index.css` | Client application styles added by the selected UI integration. | the task changes global styles or a selected UI integration |
| `test/with-http-server.mjs` | Starts an isolated real HTTP server for application tests. | a task adds server or HTTP integration tests |
| `test/platform.test.mjs` | Checks baseline HTTP errors, health, and production static fallback. | a task changes platform entry behavior |
| `test/fixtures/qa-environment.mjs` | Creates isolated per-run QA databases and ready-to-login test identities. | a task needs repeatable test accounts or business data |
| `test/fixtures/README.md` | Documents the per-app company, role, permission, and business-data fixture contract. | a task adds or changes QA seed data |
| `test/dbkit.test.mjs` | Verifies selected dbkit startup, migrations, and database behavior. | a task changes the dbkit binding or database startup |
| `tailwind.config.js` | Tailwind content scanning and theme configuration for the selected UI integration. | a task changes Tailwind theme or content scanning |
| `postcss.config.js` | PostCSS plugins for the selected Tailwind UI integration. | a task changes CSS processing |
