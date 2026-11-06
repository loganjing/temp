# jlgguest — 访客登记与审批系统

微信小程序访客登记与移动端审批系统，包含三个独立运行部分：

| 部分 | 技术栈 | 说明 |
| --- | --- | --- |
| 后端服务 | Hono + Node.js + TypeScript + SQLite | RESTful API，数据持久化 |
| 审批端 SPA | React + Vite + TypeScript + Ant Design Mobile | 移动端优先 Web SPA（由后续任务实现） |
| 访客端 | 微信小程序原生框架 | 登记与状态查看（由后续任务实现） |

## 目录结构

```
jlgguest/
├── server/                    # 后端服务
│   ├── src/
│   │   ├── app.ts             # Hono app 组装与导出
│   │   ├── index.ts           # 入口，启动 HTTP 服务
│   │   ├── routes/
│   │   │   ├── visitors.ts    # 访客 CRUD 路由
│   │   │   └── wechat.ts      # 微信手机号解密路由
│   │   ├── services/
│   │   │   └── visitor-service.ts  # 业务逻辑与状态机
│   │   ├── db/
│   │   │   ├── connection.ts  # SQLite 连接与迁移执行
│   │   │   └── migrations/
│   │   │       └── 001-init.sql
│   │   └── utils/
│   │       ├── validate.ts    # 字段校验工具
│   │       └── error.ts       # 统一错误响应
│   ├── scripts/
│   │   └── smoke-test.ts      # API 冒烟测试
│   ├── package.json
│   └── tsconfig.json
├── admin/                     # 审批端 SPA（由后续任务实现）
├── docs/wi-t1000020/          # 需求、架构、技术契约
└── package.json               # npm workspace 根
```

> `admin/` workspace 将在审批端实现任务中添加到根 `package.json` 的 `workspaces` 列表。

## 后端服务

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务监听端口 |
| `DB_PATH` | `data/visitors.db` | SQLite 数据库文件路径 |
| `WECHAT_APPID` | — | 微信小程序 AppID（手机号解密） |
| `WECHAT_SECRET` | — | 微信小程序 AppSecret（手机号解密） |

### 安装与运行

```bash
# 在项目根目录
npm install

# 开发模式（热重载）
npm run dev

# 生产模式
npm start

# 类型检查
npm run typecheck
```

### 隔离测试

```bash
cd server
rm -f data/test-visitors.db
DB_PATH=data/test-visitors.db PORT=3999 npx tsx scripts/smoke-test.ts
```

### API 端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/visitors` | 提交访客登记 |
| GET | `/api/visitors` | 查询登记列表（支持 `status` / `phone` 过滤） |
| GET | `/api/visitors/:id` | 获取登记详情 |
| PATCH | `/api/visitors/:id/status` | 更新审核状态（`approved` / `rejected`） |
| POST | `/api/wechat/phone` | 微信手机号解密 |
| GET | `/health` | 健康检查 |

### 状态机

```
pending ──approved──→ approved (终态)
pending ──rejected──→ rejected (终态)
```

终态记录不可再变更，违反时返回 `409 INVALID_STATE_TRANSITION`。

### 数据库迁移

启动时自动创建 `data/` 目录并执行版本化迁移脚本（`server/src/db/migrations/`），不通过 ORM 自动同步 schema。
