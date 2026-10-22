# 实现报告：实时时钟页面

## 变更行为与根因

本次实现从零搭建一个 React + Vite 单页应用，页面居中实时显示当前时:分:秒（HH:MM:SS），每秒自动更新，用户无需手动刷新。

## 调用链

```
index.html → src/main.jsx → src/App.jsx
```

- `index.html`：HTML 入口，挂载 `#root` 容器，加载 `src/main.jsx`。
- `src/main.jsx`：React 入口，使用 `createRoot` 将 `App` 组件渲染到 `#root`。
- `src/App.jsx`：核心组件，`useState` 保存当前时间字符串，`useEffect` 启动 `setInterval`（1 秒间隔）更新时间，卸载时 `clearInterval` 清除定时器。
- `src/index.css`：全局重置与基础样式。
- `src/App.css`：时钟容器居中布局与时间文本样式。

## 实现范围

| 文件 | 说明 |
|------|------|
| `package.json` | 项目配置，依赖 React 18 + Vite 5 |
| `vite.config.js` | Vite 配置，启用 React 插件 |
| `index.html` | HTML 入口 |
| `src/main.jsx` | React 挂载入口 |
| `src/App.jsx` | 时钟组件（useState + useEffect + setInterval） |
| `src/index.css` | 全局样式 |
| `src/App.css` | 组件样式 |

### 关键实现逻辑

- `formatTime(date)`：使用 `getHours()`/`getMinutes()`/`getSeconds()` 取值，`padStart(2, '0')` 补零，拼接为 `HH:MM:SS`。
- `useState` 初始值：组件首次渲染时立即调用 `formatTime(new Date())`，确保页面加载即显示当前时间。
- `useEffect`：挂载后启动 `setInterval`，每 1000ms 重新获取 `new Date()` 并更新状态；卸载时 `clearInterval` 防止内存泄漏。

## 开发验证

| 检查项 | 命令 | 工作目录 | 状态 | 退出码 | 证据 |
|--------|------|----------|------|--------|------|
| 依赖安装 | `npm install` | 项目根目录 | 通过 | 0 | 62 packages installed |
| 生产构建 | `npm run build` | 项目根目录 | 通过 | 0 | dist/index.html (0.39 kB), dist/assets/index-*.css (0.48 kB), dist/assets/index-*.js (143.02 kB), built in 220ms |
| 前端服务启动 | `npm run dev` | 项目根目录 | 通过 | — | Vite v5.4.21 ready, http://localhost:5178/ |

## 前端预览地址

- 开发服务器地址：`http://localhost:5178/`

## 遗留风险与待 QA 验证项

- 时间精度依赖客户端系统时钟，不与外部时间源对时（符合架构基线边界）。
- 浏览器实时更新行为（AC-01：等待数秒后时间值发生变化且与系统时间一致）属于用户界面验收，留待 QA 阶段验证。
- 本阶段未执行浏览器 E2E 验收。
