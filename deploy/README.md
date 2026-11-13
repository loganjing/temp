# 部署基线

本目录是 deploy-cloud skill 的工作基线。构建与部署一律在云服务器上进行，**本机不需要 Docker**。最小闭环流程（由 deploy-cloud skill 执行）：

1. rsync 工作区根 1:1 映射到服务器 `/opt/jlgrobot/`（排除 node_modules/dist/docs 等；服务器特有的 `.env`、`data/` 靠 exclude 保护，⛔ 禁止 `--delete-excluded`）
2. 服务器上 `cd /opt/jlgrobot && docker build -f deploy/Dockerfile -t jlgrobot .`（所选共享模块按 manifest 从 `vendor/` 安装；`.env`/`data` 由 `.dockerignore` 挡在镜像外）
3. 服务器上 `docker compose -f deploy/docker-compose.prod.yml up -d`（compose 在 deploy/ 原位使用，`../.env`、`../data` 恰好锚定 `/opt/jlgrobot/` 根）
4. 在服务器 nginx 通配符配置的 map 块加一行子域名映射，`nginx -t && systemctl reload nginx`
5. 浏览器验证 `https://jlgrobot.<域名>/api/health`

使用 server-ssh-deployment 技能时：Dockerfile 的镜像与 npm 源可通过构建参数配置。使用部署技能构建时，服务器进程环境变量 `LINGEE_IMAGE_REGISTRY` 和 `LINGEE_NPM_REGISTRY` 优先；未设置时复用部署根目录下 `.lingee-build-sources.json`，首次则分别探测国内源，失败后探测官方源并保存可用选择。两种来源均不可用时停止；显式指定或已保存的源后续不可用时由管理员调整，不自动覆盖。选择文件仅保存不含凭据的地址，不修改系统 shell 配置。直接构建时，Dockerfile 默认使用国内源。lock 文件可能记录具体下载地址，修改 registry 不保证所有依赖都从该源下载；系统编译工具仍使用基础镜像的 apt 源。Docker、npm 和 apt 网络问题需分别排查，不要将凭据写入构建参数或镜像。

环境变量清单（`.env`，不入 git）：

- `JWT_SECRET`：启用 authkit 或附件分享时使用；初始化脚本已在 `.env` 生成随机值
- `CORS_ORIGIN`：启用 authkit SSO 时配置前端域名
- `DB_PATH`：启用 dbkit 时可选，默认 `./data/application.db`
- authkit 灵基通道相关：`LINGEE_CONSOLE_URL`、`MATCH_FIELDS`、`KWORK_BASE_URL`、`OAUTH_CLIENT_ID`、`OAUTH_CLIENT_SECRET`（详见 authkit 接入 recipe）
