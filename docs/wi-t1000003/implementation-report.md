# 实现报告 — 实时时间显示页面

- 工作项：`wi-t1000003`
- 阶段：implementation（revision 2）
- 应用类型：`simple-frontend`（依据 `docs/wi-t1000003/architecture-baseline.md`，SHA-256 `4fb22288c7642cca4a6dcc531e35662a7346c0fe6723f5ea0bcccf931f7a435a`）
- 需求基线：`docs/wi-t1000003/requirements.md`，SHA-256 `0bf100ade9c2823c515e4fe9975ab65f89d35815dd8ea9ff39be54acd28dd3d5`

## 变更行为

页面打开即显示当前本地系统时间的时、分、秒，格式为两位补足的 `HH:MM:SS`，显示值随真实时间自动前进，秒值到达 59 后进位为下一分钟的 `00`；全程无需登录、参数或任何用户操作。此前工作区没有任何应用代码，本次为新建应用，没有需要保持的既有业务行为或对外契约。

实现要点与根因：

- 时间来源使用浏览器运行环境的本地系统时间（`new Date()`），不引入额外时间服务、不持久化数据。
- 计时器采用 `window.setInterval` 每 250ms 轮询一次并重新读取 `new Date()`。若仅用 1000ms 固定间隔，挂载时刻与真实秒边界未对齐，显示值最多可能滞后近 1 秒；250ms 轮询把偏差压到 0.25 秒以内，同时满足"至少每秒更新一次"。
- 格式化独立为纯函数，个位数时、分、秒统一补足两位，避免出现 `9:5:7`。
- 组件卸载时清除计时器，避免重复挂载（如 React 严格模式）累积多个计时器。

## 调用链与实现范围

`index.html`（`#root` 挂载点）→ `src/main.tsx`（`createRoot` 渲染）→ `src/App.tsx`（`useCurrentTime()` 取当前时刻 + `formatTime()` 渲染 `<time data-testid="clock-display">`）→ `src/useCurrentTime.ts`（`setInterval` 每秒多次刷新状态）→ `src/time.ts`（`HH:MM:SS` 格式化）→ `src/styles.css`（居中、等宽数字、深色背景）。

新增/修改文件：

| 文件 | 说明 | SHA-256 |
| --- | --- | --- |
| `package.json` | 脚本与依赖声明（`dev` / `build` / `typecheck` / `test`） | `ca0f5348d9e194b24326be3a3236bb94960ecc6b704a666f35fabe4fe4d6aee6` |
| `index.html` | Vite 入口页面，提供 `#root` 挂载点 | `6b13b8bd479f6cd376b3e593a875440362ffa09380d7afd0b658a970b4d49ea7` |
| `vite.config.ts` | React 插件与测试环境配置 | `e0d06a46bf19c2c9fd5608e8c10a70f73e7c4984dadba55a52898e8f51ee415d` |
| `tsconfig.json` | TypeScript 严格模式配置 | `9e3bc7222f1453979ae682ce6b1dace4c1e32b96abac84467b03c64c4e02fa1b` |
| `src/main.tsx` | 应用挂载入口，缺挂载点时显式报错 | `4564874b0b03742a11ec430ce1899a185c3d04bb26c94641973e1be5c6c99a46` |
| `src/App.tsx` | 页面组件，渲染 `HH:MM:SS` | `e0d364b43a453c010bf4491a7625b25198e3b3a064a0ac249c11e0e0376ae7f9` |
| `src/useCurrentTime.ts` | 本地时间轮询 Hook 与计时器清理 | `1abacc4714cbdd9e4813d9d8f102d60e6d3f0af6ed40e82a59de73515157b064` |
| `src/time.ts` | 两位补足的 `HH:MM:SS` 格式化 | `0ff11c69e4e9141ceb20c87c6e205b03c3c6f0b3032b7517ba8f0c8dac4f43c0` |
| `src/styles.css` | 页面样式 | `927caa57ae6db0886ea0720622ab43ed1f9e7392bc5c11aec521199168fb4ee1` |
| `tests/time.test.ts` | 格式化与进位单元测试 | `4f3cdb3247c94fb54d3559397a27e83ff81c46159d765434f37298cf1e04982d` |
| `tests/App.test.tsx` | 组件渲染、刷新、进位与计时器清理测试 | `0d7b3bd63adf43840819ab706082c6a079cedd6f149586ec02c13d3b10cbf51f` |
| `README.md` | 安装、运行与命令说明 | `579cb8143aa3d849fb4c1fca843d14632b9ab3eddca23501b99148c306dee55c` |

依赖：`react`/`react-dom` `^19.3.1`；开发依赖 `vite` `^8.3.5`、`@vitejs/plugin-react` `^6.1.2`、`typescript` `^7.0.2`、`vitest` `^5.0.5`、`jsdom` `^29.1.1`、`@testing-library/react` `^16.3.3`、`@types/react`、`@types/react-dom`。锁文件 `package-lock.json` 已随安装生成。

## 开发侧验证证据

| checkId | 命令 | 工作目录 | 退出码 | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| typecheck | `npm run typecheck`（`tsc --noEmit`） | 工作项根目录 | 0 | passed | 无类型错误输出 |
| unit-test | `npm test`（`vitest run`） | 工作项根目录 | 0 | passed | `Test Files 2 passed (2)`、`Tests 10 passed (10)` |
| build | `npm run build`（`tsc --noEmit && vite build`） | 工作项根目录 | 0 | passed | `✓ 18 modules transformed`，产物 `dist/index.html`、`dist/assets/index-Bk43NfEL.css`、`dist/assets/index-B1GiYeZU.js`，`✓ built in 602ms` |
| dev-server-start | `npm run dev`（注册后台作业） | 工作项根目录 | 进程运行中 | passed | `VITE v8.3.5 ready in 83 ms`，地址 `http://localhost:5177/`（5173–5176 被占用，Vite 自动顺延，未占用其他任务端口） |

单元测试覆盖：

- `tests/time.test.ts`：两位补足（`09:05:07`）、已满两位保持（`23:59:59`）、零点（`00:00:00`）、整秒取值（`07:08:09`）、秒 59 进位到 `12:35:00`、跨日进位到 `00:00:00`。
- `tests/App.test.tsx`：首帧即显示 `09:05:07`（无交互）；推进 1 秒后显示 `09:05:08`，再推进 1 秒显示 `09:05:09`；`12:34:59` 推进 1 秒后为 `12:35:00`；轮询间隔 `TICK_INTERVAL_MS` 小于 1000ms；组件卸载后计时器数量归零。

开发侧另确认开发服务器可正常提供页面入口（HTTP 200，响应含 `#root` 挂载点与 `src/main.tsx` 入口脚本）。该检查仅证明启动入口可用，不作为页面行为验收证据。

## 验收条件状态（开发侧）

| AC | 开发侧状态 | 说明 |
| --- | --- | --- |
| AC-01 页面实时显示当前时分秒 | 部分验证 | 格式化、秒级刷新、59 进位、卸载清理已由单元测试与本机运行验证；`runtime-render` 与 `interaction` 类型的浏览器验收（首次读数与本地时间偏差、真实秒值连续变化≥2 次）留给 QA 阶段独立启动服务后执行 |

开发阶段未执行浏览器 E2E、未采集浏览器截图或视觉证据，不代表交付验收通过。

## 遗留风险与后续建议

- 未实现日期、时区、界面语言定制：需求第 6 条明确未规定，保持未实现，不作为验收条件。
- 生产静态产物 `dist/` 只是构建结果，未部署到任何托管环境。
- QA 阶段需独立启动前端服务（地址取自其自身启动的作业，而非本阶段地址）并完成 AC-01 的浏览器验收；若要验证跨分钟进位，需观察到秒值跨过 59。