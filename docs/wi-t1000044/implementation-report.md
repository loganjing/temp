# 166-clock 实现报告

## 变更行为与根因

本实现从零创建 React + Vite 单页应用，在浏览器页面实时显示当前本地时间（HH:MM:SS），每秒自动更新。根因为新建应用，无历史缺陷。

## 调用链

```
index.html
  └── /src/main.jsx          # React 入口，挂载 #root
        └── /src/App.jsx     # 时钟组件
              ├── useState   # 初始值为 formatTime(new Date())
              ├── useEffect  # 挂载后启动 setInterval(1000ms)，卸载时 clearInterval
              └── formatTime # 从 Date 读取时/分/秒，padStart(2,'0') 补零，拼接 HH:MM:SS
```

## 实现范围

### 新增文件

| 文件 | 用途 |
|------|------|
| `package.json` | 项目依赖与脚本（react 18, react-dom 18, vite 5, @vitejs/plugin-react 4） |
| `index.html` | Vite HTML 入口，挂载点 `#root` |
| `vite.config.js` | Vite 配置，启用 React 插件，端口 5173 |
| `src/main.jsx` | React DOM 入口，StrictMode 渲染 App |
| `src/App.jsx` | 时钟组件：useState + useEffect(setInterval 1000ms) + formatTime |
| `src/index.css` | 全局重置样式 |
| `src/App.css` | 时钟页面样式（居中、tabular-nums、响应式字号） |
| `.gitignore` | 忽略 node_modules/dist/.vite |

### 核心逻辑

- **时间获取**：`new Date()` 读取浏览器所在设备本地系统时钟。
- **格式化**：`String.prototype.padStart(2, '0')` 对时、分、秒做两位前导补零，拼接为 `HH:MM:SS`。
- **自动更新**：组件挂载后 `useEffect` 启动 `setInterval`，周期 1000ms，每秒读取 `new Date()` 并通过 `setTime` 重渲染；组件卸载时 `clearInterval` 清理定时器。
- **无交互依赖**：页面打开后即显示时间，无需用户操作；无输入、无按钮、无路由、无外部 API 调用、无存储写入。

## 验收条件对照

### AC-01：页面实时显示当前时分秒

- **实现状态**：已实现
- **实现依据**：
  - `src/App.jsx` 的 `formatTime` 函数使用 `getHours()`/`getMinutes()`/`getSeconds()` + `padStart(2, '0')` 生成 `HH:MM:SS` 格式。
  - `useEffect` 中 `setInterval(…, 1000)` 每秒更新 state，React 重渲染使页面文字实时变化。
  - 初始 state 通过 `useState(() => formatTime(new Date()))` 惰性初始化，首屏即显示时间。
- **证据类型**：runtime-render（浏览器 E2E 验收留给 QA）

## 开发验证

| checkId | 命令 | 工作目录 | 状态 | 退出码 | 证据 |
|---------|------|----------|------|--------|------|
| dep-install | `npm install` | 项目根 | passed | 0 | added 62 packages in 6s |
| build-check | `npm run build` | 项目根 | passed | 0 | 32 modules transformed, built in 218ms, dist 产物正常生成 |

### 验证说明

- 构建检查覆盖全部源码模块（32 modules transformed），无编译错误。
- 开发服务器已启动，预览地址：`http://localhost:5173/`。
- 浏览器实时渲染验证（时间显示是否正确、是否自动更新）属于 QA 验收范围，本阶段不执行。

## 遗留风险

- 无未修复缺陷。
- 浏览器实时渲染验证（AC-01 runtime-render）待 QA 阶段执行。
- 时钟精度取决于 `setInterval` 的浏览器调度，极端情况下可能存在毫秒级延迟，但不影响秒级显示正确性。
