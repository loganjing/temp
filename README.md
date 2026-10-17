# 工单系统（121-full / wi-t1000293）

多公司工单管理系统：提交人创建并跟踪工单；公司按分类将工单自动分配到业务组；业务组成员处理工单、多轮回复并在必要时转派；工单完成后由提交人进行满意度评价。

- 技术栈（冻结）：Hono（Node.js ≥ 20，ESM）+ better-sqlite3 + 编号 SQL 迁移；前端为 React + Vite SPA（由前端任务交付，构建产物 `dist/` 由本服务托管）。
- 契约：`docs/wi-t1000293/requirements.md`（需求）、`docs/wi-t1000293/architecture-baseline.md`（架构基线）、`docs/wi-t1000293/technical-contract.md`（字段级 API 契约，接口唯一基准）。

## 安装

```bash
npm install
```

依赖声明在根 `package.json`（前后端一次性声明），`package-lock.json` 锁定版本。安装成功后会写入 `node_modules/.install-complete` 标记。

## 构建前端（前端任务交付后可用）

```bash
npm run build
```

构建产物输出到 `dist/`，由 `src/server.js` 静态托管（SPA 回退到 `index.html`）。

## 启动

常规启动（托管 `/api` 与 `dist/` 静态资源）：

```bash
npm start
```

开发启动（Hono 开发服务 + Vite dev server 并行，`/api` 由 Vite 代理转发）：

```bash
npm run dev
```

环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务监听端口；`PORT=0` 时由系统分配空闲端口 |
| `DB_PATH` | `./data/application.db` | SQLite 数据库文件路径（覆盖时父目录自动创建） |

- 首次启动自动执行 `migrations/sqlite/` 全部编号迁移并登记到 `schema_migrations`；种子数据（两家公司、覆盖提交人/处理人/公司管理员的用户、初始分类列表）随迁移交付，干净目录启动即可进入验收场景。
- 服务启动后监听 `http://127.0.0.1:<PORT>`。

## 测试

```bash
npm test
```

基于 `node:test` 的 API 验收测试（`tests/`）：真实启动服务（独立临时 `DB_PATH` + 系统分配空闲端口，结束清理进程与临时库），覆盖契约全部端点与响应字段、错误码（401/403/404/400/409 INVALID_STATE/409 CONFLICT）、状态机全部流转（含创建时规则命中自动直达 processing 与未命中停留 created）、多轮回复排序、转派、完成、取消、评价、`GET /api/users/{userId}/tickets` 历史工单、`X-User-Id` 校验。

## 验收约定

- 验收命令与常规启动命令分开记录；验证脚本自行负责启动（空闲端口 + 等待真实监听就绪）与清理（仅清理本次启动的进程与临时数据库），不额外后台常驻服务。
- 所有 API 请求必须携带 `X-User-Id: <整数用户id>`（用户列表见 `GET /api/users`）；缺失、非整数或用户不存在返回 `401 INVALID_USER`。
- 种子用户（`migrations/sqlite/0002_seed.sql`）：
  - 公司 1 星云科技：1 王管理（公司管理员）、2 李提交（提交人）、3 赵网络（处理人）、4 钱软件（处理人）
  - 公司 2 远航制造：5 孙管理（公司管理员）、6 周提交（提交人）、7 吴处理（处理人）
  - 初始分类：网络问题 / 软件问题 / 硬件问题 / 账号权限 / 其他
- 冒烟闭环（基于种子数据）：创建工单（命中“分类 → 业务组”规则自动分配）→ 多轮回复 → 转派 → 完成 → 满意度评价。
- 数据库变更一律走 `migrations/sqlite/` 编号迁移；禁止手工改 schema。

## 目录结构（服务端部分）

```
src/server.js          服务入口：迁移执行 / /api 路由 / dist 静态托管
src/routes/api.js      API 路由层：X-User-Id 解析校验、参数校验、响应组装
src/domain/            领域服务：状态机、自动分配、角色判断、事务边界
src/db/                数据访问：连接管理（DB_PATH 覆盖）、迁移执行器
migrations/sqlite/     编号 SQL 迁移（0001_init 表结构 / 0002_seed 种子数据）
tests/                 node:test API 验收测试
```
