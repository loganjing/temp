# 实现报告：实时时钟页面

## 变更行为与实现依据

新建 React + Vite SPA 应用，页面打开后在页面中央显示当前系统时间的 `HH:MM:SS` 格式时钟，每秒自动刷新。页面不可见时暂停定时器，恢复可见时立即同步到当前时间并恢复每秒刷新。组件卸载时清理定时器。

实现依据：需求文档 `docs/wi-t1000011/requirements.md`（AC-01）与架构基线 `docs/wi-t1000011/architecture-baseline.md`（simple-frontend 路线）。

## 调用链与实现范围

```
index.html → src/main.jsx → src/App.jsx → src/Clock.jsx
```

### 文件清单

| 文件 | 职责 |
|------|------|
| `package.json` | 项目配置，React 18 + Vite 6 依赖声明 |
| `vite.config.js` | Vite 配置，React 插件，本地开发服务器 |
| `index.html` | HTML 入口，挂载点 `#root` |
| `src/main.jsx` | React 渲染入口 |
| `src/App.jsx` | 根组件，布局容器 |
| `src/Clock.jsx` | 时钟组件：定时器管理 + 页面可见性切换 |
| `src/index.css` | 全局基础样式 |
| `src/App.css` | 应用与时钟布局样式 |
| `.gitignore` | 忽略 `node_modules` / `dist` |
| `README.md` | 项目说明与运行指南 |

### 核心逻辑

- **自动启动**：组件 `useEffect` 在挂载时调用 `start()`，无需用户触发。
- **每秒刷新**：`setInterval(() => setTime(formatTime(new Date())), 1000)`，满足实时且刷新间隔不超过 1 秒。
- **可见性暂停**：监听 `visibilitychange` 事件，`document.hidden` 为 `true` 时 `stop()` 清除定时器，为 `false` 时 `start()` 立即同步并恢复。
- **卸载清理**：`useEffect` 的 cleanup 函数调用 `stop()`，避免内存泄漏。
- **时间格式化**：`formatTime(date)` 用 `padStart(2, '0')` 补零，输出 `HH:MM:SS`。

## 开发验证证据

### 构建检查

- 命令：`npm run build`
- 工作目录：项目根
- 状态：通过
- 证据：Vite 成功构建，输出 `dist/index.html`（0.40 kB）、`dist/assets/index-*.css`（0.38 kB）、`dist/assets/index-*.js`（144.59 kB），29 个模块转换完成，构建耗时 268ms，无错误。

### 依赖安装

- 命令：`npm install`
- 状态：通过
- 证据：65 个包安装成功，无漏洞报告。

### 前端服务启动

- 命令：`npm run dev`
- 状态：运行中
- 预览地址：`http://127.0.0.1:5174/`

## 验收对照

| AC | 描述 | 实现状态 | 证据 |
|----|------|----------|------|
| AC-01 | 页面打开后实时显示当前时分秒 | 已实现 | Clock 组件自动启动，每秒 `setInterval` 刷新，格式 `HH:MM:SS`；构建通过；前端服务已启动。浏览器 E2E 验收留给 QA。 |

## 遗留风险

- 无。需求范围仅涉及浏览器本地时钟显示，不涉及服务端、数据库、认证或外部集成。
- 浏览器端实时刷新行为、页面可见性切换的运行时验收由 QA 阶段执行。
