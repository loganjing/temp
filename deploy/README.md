# 部署基线

只允许部署到经确认的测试服务器，不能直接部署到生产环境。服务器需要 Python 3、Docker 和 Docker Compose；构建在服务器上进行，本机不需要 Docker。

使用部署技能检查当前实例、数据和备份，再上传源码并构建新版本镜像。默认服务器目录为 `/opt/lingee-apps/<应用名>/`，源码版本、环境配置、持久化数据和备份分开保存。继续使用项目现有的 `deploy/Dockerfile` 和 `deploy/docker-compose.prod.yml`；Compose 中的相对路径由部署技能按应用目录解析。已有容器或数据的归属不能确认时停止，不要覆盖。

自动备份目前只支持单个 SQLite 数据库及其 WAL/SHM；数据目录包含附件或其他文件、使用外部数据库或不确定完整性时，不能声称已完成备份或继续自动更新。

环境变量清单（`.env`，不入 git）：

- `JWT_SECRET`：启用 authkit 或附件分享时使用；初始化脚本已在 `.env` 生成随机值
- `CORS_ORIGIN`：启用 authkit SSO 时配置前端域名
- `DB_PATH`：启用 dbkit 时可选，默认 `./data/application.db`
- authkit 灵基通道相关：`LINGEE_CONSOLE_URL`、`MATCH_FIELDS`、`KWORK_BASE_URL`、`OAUTH_CLIENT_ID`、`OAUTH_CLIENT_SECRET`（详见 authkit 接入 recipe）

使用 server-ssh-deployment 部署时，服务器 nginx 和测试域名由部署技能探测和接入；项目基线只提供 Dockerfile 与 Compose，不写入服务器级 nginx 配置。未接入 nginx 时按技能说明使用本机 SSH 隧道访问。
