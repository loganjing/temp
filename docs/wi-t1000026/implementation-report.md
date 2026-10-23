# 实现报告：实时时钟页面

## 变更行为与根因

本次实现基于已批准的需求文档和架构基线，从零创建一个纯前端 SPA 页面，实时显示当前系统时间的时、分、秒，每秒自动刷新。应用类型为 `simple-frontend`，不涉及服务端、数据库、认证或外部集成。

## 调用链

```
index.html → src/main.jsx → src/Clock.jsx (useEffect + setInterval 1000ms → formatTime(new Date()) → setState → render HH:MM:SS)
```

- `index.html`：根 HTML，挂载点 `#root`
- `src/main.jsx`：入口，将 `Clock` 组件挂载到 `#root`
- `src/Clock.jsx`：时钟组件，`useState` 初始化当前时间，`useEffect` 中 `setInterval` 每 1 秒读取 `new Date()` 并通过 `formatTime` 格式化为 `HH:MM:SS`，组件卸载时 `clearInterval` 清理定时器
- `formatTime`：导出的纯函数，使用 `String.padStart(2, '0')` 将时、分、秒补零至两位拼接为 `HH:MM:SS`

## 实现范围

| 文件 | 说明 |
|------|------|
| `package.json` | 项目配置，React 18 + Vite 5 + Vitest 2 |
| `vite.config.js` | Vite 配置，React 插件，开发服务器绑定 127.0.0.1 |
| `vitest.config.js` | Vitest 测试配置 |
| `index.html` | 根 HTML，挂载点 `#root` |
| `src/main.jsx` | 应用入口，挂载 Clock 组件 |
| `src/Clock.jsx` | 时钟组件，含导出的 `formatTime` 函数 |
| `src/index.css` | 全局样式 |
| `src/Clock.css` | 时钟组件样式 |
| `tests/Clock.test.jsx` | `formatTime` 单元测试，4 个用例 |
| `.gitignore` | 忽略 node_modules、dist 等 |

## 验收条件对照

### AC-01：页面实时显示当前时分秒

- **实现状态**：已实现
- **证据**：
  - `src/Clock.jsx` 中 `formatTime` 使用 `new Date()` 获取系统时间，格式化为 `HH:MM:SS`
  - `useEffect` 内 `setInterval(..., 1000)` 每秒触发重渲染，时间持续更新
  - 页面加载时 `useState` 初始值立即显示当前时间，无需等待首次 tick
  - 构建通过：`npm run build` 成功，产出 `dist/` 静态资源
  - 单元测试通过：`npx vitest run` 4/4 用例通过
  - 开发服务器运行：`http://127.0.0.1:5175/`

## 开发验证

| 检查项 | 命令 | 工作目录 | 状态 | 退出码 | 证据 |
|--------|------|----------|------|--------|------|
| 构建 | `npm run build` | 项目根 | 通过 | 0 | 32 模块转译成功，产出 dist/index.html + CSS + JS |
| 单元测试 | `npx vitest run` | 项目根 | 通过 | 0 | 4/4 用例通过（formatTime 边界覆盖：单位数补零、双位数、00:00:00、23:59:59） |

## 预览地址

开发服务器已启动，前端 URL：`http://127.0.0.1:5175/`

## 遗留风险

- 无关键遗留风险。页面为纯前端实现，逻辑简单明确。
- 浏览器端实时显示和持续刷新行为由 QA 在验收阶段验证。
