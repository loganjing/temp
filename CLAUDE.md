# land 工作区约定

本工作区遵循「一个应用一个工作区、自包含、可独立交付」原则。工作区级约定以根 `AGENTS.md` 为准；应用源码的目录职责、依赖方向、基线文件用途和模板入口见 `app/land/AGENTS.md`。

## 项目布局

- `app/land/` 是应用包根目录，包含 `src/server/`、`src/client/`、`src/shared/`、`test/` 及包级配置。
- `docs/` 保存需求、已批准设计、验收和开发计划；不要擅自改写已批准基线。
- `vendor/` 保存已批准设计选定的本地模块发行包；不得换成私有 registry 依赖。
- `deploy/` 保存部署基线。应用源码和包内测试不能放到工作区根目录的 `src/` 或 `test/`。

## 关键边界

- 先读根目录 `platform-baseline.json`，根据 `sourceLayout` 选择当前任务需要的少量入口；`packageRoot` 也在该地图中。修改应用代码时还要读 `app/land/AGENTS.md`。
- `src/client/` 不导入 `src/server/`；`src/server/` 不导入 `src/client/`；`src/shared/` 不依赖 Node/Hono、React、DOM 或浏览器全局 API。
- 登录/SSO 路由放在 `app/land/src/server/routes.ts` 的 `registerPublicRoutes`；认证后的业务路由放在 `registerProtectedRoutes`。API 错误和静态回退由 `src/server/app.ts` 管理，统一浏览器请求/响应边界位于 `src/client/platform/api-client.ts`。
- authkit 成功认证只证明身份；公司/租户访问范围必须由服务端可信身份和授权关系确定。附件路由必须先实现真实实体权限回调。
- 任务计划以工作区根为路径基准，包内路径包含 `app/land/`。并行任务只能拥有互不重叠的目录；shared、应用包配置和跨端公共入口必须指定唯一 owner。`writableScopes` 由 compiler 派生。

## 常用命令

从工作区根运行 `npm run dev`、`npm run build`、`npm run test`、`npm run start`；这些根脚本会路由到 `land` 应用包。也可在 `app/land/` 中运行包级命令。
