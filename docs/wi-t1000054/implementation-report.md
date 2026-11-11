# 实现报告：k13-clock

> 对应需求：`docs/wi-t1000054/requirements.md`（sha256: 33f5c138565e68d5d62038c391f16d96a73b10f77ac0dc0fe8125386cf4de2df）
> 架构基线：`docs/wi-t1000054/architecture-baseline.md`（sha256: 5761674fc621a23d647686f9e2d67e478d156e08464d0077429ea81f9e5d66a6）

## 实现目标

实现一个实时显示当前时、分、秒的页面。页面打开后立即显示 `HH:MM:SS` 格式的当前时间，并随系统时钟每秒自动更新，用户无需手动刷新。

## 变更行为与调用链

**行为**：页面挂载后，`Clock` 组件读取当前 `Date`，通过 `formatTime` 格式化为 `HH:MM:SS` 渲染到 DOM；`useEffect` 注册 1000ms `setInterval` 定时器，每秒重新读取系统时间并更新 React state，触发重渲染。组件卸载时 `clearInterval` 清除定时器。

**调用链**：
```
index.html → src/main.jsx → src/Clock.jsx → formatTime(new Date()) → render <span>{HH:MM:SS}</span>
                                  ↓ useEffect
                          setInterval(1000ms) → setTime(formatTime(new Date()))
                                  ↓ unmount
                          clearInterval(timer)
```

## 实现范围

### 新建文件

| 文件 | 职责 |
|------|------|
| `package.json` | 项目依赖与脚本（React 18、Vite 5、Vitest 2） |
| `vite.config.js` | Vite 配置，React 插件，开发服务器绑定 0.0.0.0:5173 |
| `index.html` | SPA HTML 入口，挂载 `#root` |
| `src/main.jsx` | React 渲染入口，挂载 `Clock` 到 `#root` |
| `src/Clock.jsx` | 时钟组件，含 `pad`、`formatTime` 纯函数与定时器逻辑 |
| `src/index.css` | 全局样式，居中大字号数字、中性深色背景 |
| `tests/clock.test.js` | 单元测试，覆盖 `pad` 与 `formatTime` 的补零与格式化 |

### 复用文件

- `deploy/Dockerfile`：设计阶段初始化的 npm + Vite 构建镜像，与本项目 `npm run build` → `dist/` 输出路径一致，无需修改。
- `.dockerignore`：设计阶段初始化，排除 `node_modules`、`dist`、`.expert-team` 等，无需修改。

## 验收条件对照（AC-01）

| 子断言 | 实现状态 | 证据 |
|--------|----------|------|
| 页面加载后显示当前时间 | 已实现 | `src/Clock.jsx` 初始 state 为 `formatTime(new Date())`，挂载即渲染 |
| 格式为 `HH:MM:SS` 两位补零 | 已实现 | `formatTime` 使用 `pad` 对时/分/秒补零；单元测试 `tests/clock.test.js` 覆盖单值、两位、午时边界、最大值 |
| 每秒自动更新 | 已实现 | `useEffect` 注册 1000ms `setInterval`，每 tick 调用 `setTime(formatTime(new Date()))` |
| 与系统时间一致 | 已实现 | 时间源为浏览器 `new Date()`（客户端系统时钟），无服务端依赖 |
| 卸载时清除定时器 | 已实现 | `useEffect` 返回 `clearInterval(timer)` |

## 开发验证

### 单元测试

- 命令：`npm test`
- 工作目录：项目根
- 状态：通过（退出码 0）
- 结果：5 个测试全部通过，覆盖 `pad`（单值补零、两位不变）与 `formatTime`（常规、午时边界 `00:00:00`、最大值 `23:59:59`）

### 构建

- 命令：`npm run build`
- 工作目录：项目根
- 状态：通过（退出码 0）
- 结果：31 模块转换成功，输出 `dist/index.html`、`dist/assets/index-*.css`、`dist/assets/index-*.js`

## 预览入口

- 启动命令：`npm run dev`（工作目录：项目根）
- 前端地址：http://localhost:5173/
- 说明：Vite 开发服务器提供本地预览，实际浏览器验收由 QA 阶段执行。

## 遗留风险与边界

- 实时性（每秒可见更新）与系统时间一致性属于运行时行为，需 QA 在浏览器中观察确认，开发阶段未做浏览器 E2E 验收。
- 时间精度取决于 `setInterval` 调度与浏览器事件循环，存在亚秒级漂移，但不影响每秒级显示正确性。
- 无服务端、无持久化、无认证，符合需求边界。
