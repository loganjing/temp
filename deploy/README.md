# 部署基线

只允许部署到经确认的测试服务器，不能直接部署到生产环境。服务器需要 Python 3、Docker 和 Docker Compose；构建在服务器上进行，本机不需要 Docker。

Dockerfile 的镜像与 npm 源可通过构建参数配置。使用部署技能构建时，服务器进程环境变量 `LINGEE_IMAGE_REGISTRY` 和 `LINGEE_NPM_REGISTRY` 优先；未设置时复用部署根目录下 `.lingee-build-sources.json`，首次则分别探测国内源，失败后探测官方源并保存可用选择。两种来源均不可用时停止；显式指定或已保存的源后续不可用时由管理员调整，不自动覆盖。选择文件仅保存不含凭据的地址，不修改系统 shell 配置。直接构建时，Dockerfile 默认使用国内源。lock 文件可能记录具体下载地址，修改 registry 不保证所有依赖都从该源下载；系统编译工具仍使用基础镜像的 apt 源。Docker、npm 和 apt 网络问题需分别排查，不要将凭据写入构建参数或镜像。

使用部署技能检查当前实例、数据和备份，再上传源码并构建新版本镜像。默认服务器目录为 `/opt/lingee-apps/<应用名>/`，源码版本、环境配置、持久化数据和备份分开保存。继续使用项目现有的 `deploy/Dockerfile` 和 `deploy/docker-compose.prod.yml`；Compose 中的相对路径由部署技能按应用目录解析。已有容器或数据的归属不能确认时停止，不要覆盖。

自动备份目前只支持单个 SQLite 数据库及其 WAL/SHM；数据目录包含附件或其他文件、使用外部数据库或不确定完整性时，不能声称已完成备份或继续自动更新。

环境变量清单（`.env`，不入 git）：

- `JWT_SECRET`：启用 authkit 或附件分享时使用；初始化脚本已在 `.env` 生成随机值
- `CORS_ORIGIN`：启用 authkit SSO 时配置前端域名
- `DB_PATH`：启用 dbkit 时可选，默认 `./data/application.db`
- authkit 灵基通道相关：`LINGEE_CONSOLE_URL`、`MATCH_FIELDS`、`KWORK_BASE_URL`、`OAUTH_CLIENT_ID`、`OAUTH_CLIENT_SECRET`（详见 authkit 接入 recipe）

使用 server-ssh-deployment 部署时，技能提供仅供当前电脑临时使用的 SSH 隧道，不自动修改 nginx。需要从其他设备访问测试服务器时，仍需另行配置测试域名、证书和反向代理等入口。
