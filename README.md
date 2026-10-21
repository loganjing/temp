# ticketing

本工作区由通用应用 Team Lead 初始化：一个应用一个工作区，自包含、可独立交付。

## 目录结构

```
ticketing/
  app/ticketing/     # 单应用包：AGENTS.md + src/client/ React/Vite + src/server/ Hono + src/shared/ 跨端代码
  # task plan paths for application files use the workspace-root prefix app/ticketing/
  docs/                 # requirements、design、验收和开发计划等项目文档
  agentNotes/           # README.md 阅读导航和 QA 准备/执行说明
  ai-partners/          # AI 协作相关资料
  skills/               # 项目专属 skill
  deploy/               # 部署基线（Dockerfile + docker-compose.prod.yml），部署/下线用 deploy-cloud skill
  vendor/               # 按已批准设计和 catalog manifest 安装的本地运行时模块
  CLAUDE.md             # AI 工作区约定（agent 会话的行为规范）
  AGENTS.md             # 仓库级 agent 指令
  platform-baseline.json # 包路径、模块状态和入口地图
  package.json          # npm workspace 根（workspaces: app/*）
```

## 快速开始

```bash
npm ci             # 按交付锁文件安装依赖
npm run dev        # 后端 :3000 + 前端 :5173（vite 代理 /api）
npm run typecheck:server -w ticketing  # 独立检查 Hono 服务端及 shared 类型
npm run typecheck:client -w ticketing  # 独立检查 React/Vite 客户端及 shared 类型
npm run build:client -w ticketing      # 单独生成浏览器端产物
npm run build      # 类型检查 + 前端构建
npm run test       # 真实 HTTP 平台检查；选定模块有相应启动检查
npm run start      # 生产模式启动（托管 dist）
```

## 约定速览

- 共享模块必须由 catalog 标记为 ready，并从对应安装 manifest 复制到工作区 `vendor/`；source-only 模块不可安装。
- 应用源码按 `src/server/`（Hono 服务端）、`src/client/`（React/Vite 浏览器端）和 `src/shared/`（不依赖两端运行时的共享代码）分区。完整目录职责、依赖方向和基线文件用途见 `app/ticketing/AGENTS.md`；工作区级规则和 Agent Notes 阅读路由见根 `AGENTS.md` 与 `agentNotes/README.md`。
- 根目录 `platform-baseline.json` 记录 `packageRoot`、已接通的框架能力、仅安装的模块及相对于应用包根目录的入口地图。公开登录路由和受保护业务路由分别注册在 `src/server/routes.ts`；公共错误与静态托管在 `src/server/app.ts`；统一前端请求入口在 `src/client/platform/api-client.ts`。
- dbkit 选中后启动时连接 SQLite、运行 `src/server/migrations/sqlite/` 中的迁移，并在服务退出时关闭连接；业务表与 SQL 仍由已批准设计决定。i18n 选中后前后端已接通，需把初始词条替换为产品词条。
- authkit 需要宿主用户解析器和已批准的登录契约；绑定前受保护 API 返回 503。attachment 需要关联实体和权限回调。仅安装模块不代表相应业务功能已经可用。
- 本模板只适用于已批准 Hono + React/Vite 技术栈；任务计划源码路径写为 `app/ticketing/src/...`，而非工作区根 `src/...`。
- 数据（SQLite）与用户上传落在应用目录的 `data/`、`uploads/`，持久化卷、不入 git。
- 部署交付 HTTPS 域名（`deploy-cloud` skill），构建在云服务器上进行，本机不需要 Docker。
