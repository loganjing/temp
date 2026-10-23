# 部署基线

本目录是 deploy-cloud skill 的工作基线。构建与部署一律在云服务器上进行，**本机不需要 Docker**。最小闭环流程（由 deploy-cloud skill 执行）：

1. rsync 工作区根 1:1 映射到服务器 `/opt/__APP_NAME__/`（排除 node_modules/dist/docs 等；服务器特有的 `.env`、`data/` 靠 exclude 保护，⛔ 禁止 `--delete-excluded`）
2. 服务器上 `cd /opt/__APP_NAME__ && docker build -f deploy/Dockerfile -t __APP_NAME__ .`（所选共享模块按 manifest 从 `vendor/` 安装；`.env`/`data` 由 `.dockerignore` 挡在镜像外）
3. 服务器上 `docker compose -f deploy/docker-compose.prod.yml up -d`（compose 在 deploy/ 原位使用，`../.env`、`../data` 恰好锚定 `/opt/__APP_NAME__/` 根）
4. 在服务器 nginx 通配符配置的 map 块加一行子域名映射，`nginx -t && systemctl reload nginx`
5. 浏览器验证 `https://__APP_NAME__.<域名>/api/health`

环境变量清单（`.env`，不入 git）：

- `JWT_SECRET`：启用 authkit 或附件分享时使用；初始化脚本已在 `.env` 生成随机值
- `CORS_ORIGIN`：启用 authkit SSO 时配置前端域名
- `DB_PATH`：启用 dbkit 时可选，默认 `./data/application.db`
- authkit 灵基通道相关：`LINGEE_CONSOLE_URL`、`MATCH_FIELDS`、`KWORK_BASE_URL`、`OAUTH_CLIENT_ID`、`OAUTH_CLIENT_SECRET`（详见 authkit 接入 recipe）
