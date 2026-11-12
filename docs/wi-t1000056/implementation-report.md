# k16-clock 实现报告

## 变更行为与根因

实现了一个单页面实时时钟，页面打开后居中展示当前时间 `HH:MM:SS`，每秒自动更新，无需手动刷新。时间直接取自客户端系统时钟（`new Date()`），无服务端依赖。

## 调用链

```
index.html → src/main.jsx → src/App.jsx
```

- `src/main.jsx`：React 入口，挂载 `App` 到 `#root`。
- `src/App.jsx`：`App` 组件挂载后通过 `setInterval(1000ms)` 每秒读取 `new Date()`，将 `HH`、`MM`、`SS` 写入 React state 并渲染；组件卸载时 `clearInterval` 清除定时器，避免泄漏。
- `src/index.css` / `src/App.css`：深色背景、浅色等宽字体居中布局，响应式字号。

## 实现范围

| 文件 | 说明 |
|---|---|
| `package.json` | npm 依赖与脚本（React 18 + Vite 5） |
| `index.html` | Vite SPA 入口 HTML |
| `vite.config.js` | Vite 配置，启用 React 插件 |
| `src/main.jsx` | React DOM 挂载入口 |
| `src/App.jsx` | 时钟组件，含 `setInterval` 每秒更新逻辑 |
| `src/index.css` | 全局重置与基础样式 |
| `src/App.css` | 时钟页面布局与视觉样式 |
| `deploy/Dockerfile` | 已有，构建 SPA 静态产物并以 Nginx 提供服务 |
| `.dockerignore` | 已有，排除 node_modules/dist/.git 等 |

## 验证证据

### 构建检查

- **命令**：`npm run build`
- **工作目录**：项目根目录
- **状态**：通过
- **证据**：Vite v5.4.21 构建成功，输出 `dist/index.html`、`dist/assets/index-*.css`、`dist/assets/index-*.js`，32 个模块转换完成，耗时 249ms。

### 依赖安装

- **命令**：`npm install --registry=https://registry.npmmirror.com`
- **状态**：通过
- **证据**：62 个包安装成功，无错误。

### 前端预览

- **URL**：http://localhost:5173/
- **状态**：运行中
- **说明**：开发服务器通过 `npm run dev` 启动，Vite 在 92ms 内就绪。实现阶段不执行浏览器验证，浏览器 E2E 验收留给 QA 阶段。

## 验收标准对照

### AC-01：页面实时显示当前时分秒

- **状态**：已实现（开发自检通过，待 QA 运行时验证）
- **实现说明**：`App` 组件每秒读取 `new Date()` 并渲染 `HH:MM:SS`，格式化为两位补零。构建通过确认代码可编译且产物正常输出。
- **待 QA 验证**：打开 `/` 页面，观察时间与系统时间一致且秒数逐秒递增。

## 遗留风险

- 浏览器运行时行为（页面实际渲染、秒数自动递增）尚未由 QA 验证，当前仅确认构建和开发服务器启动成功。
- 无服务端、无持久化、无认证，不涉及相关风险。
