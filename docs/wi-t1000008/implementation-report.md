# 实现报告：实时时钟页面

## 变更行为与根因

本次实现创建了一个 React + Vite 单页应用，页面打开后实时显示当前时、分、秒，每秒自动更新。时间来源为浏览器 `Date` 对象，通过 `setInterval` 每 1000ms 触发状态更新，将最新时间写入 DOM。

## 调用链

```
index.html → src/main.jsx → src/App.jsx → src/Clock.jsx
```

- `index.html`：HTML 入口，挂载 `#root` 容器
- `src/main.jsx`：React 渲染入口，将 `App` 组件挂载到 `#root`
- `src/App.jsx`：页面容器，居中布局，渲染 `Clock` 组件
- `src/Clock.jsx`：核心时钟组件，使用 `useState` + `useEffect` + `setInterval` 实现实时更新

## 实现范围

### 新建文件

| 文件 | 职责 |
|------|------|
| `package.json` | 项目依赖与脚本定义 |
| `vite.config.js` | Vite 构建配置，启用 React 插件 |
| `index.html` | HTML 入口 |
| `src/main.jsx` | React 渲染入口 |
| `src/App.jsx` | 页面容器组件 |
| `src/App.css` | 页面容器样式 |
| `src/Clock.jsx` | 实时时钟组件 |
| `src/Clock.css` | 时钟组件样式 |
| `src/index.css` | 全局基础样式 |
| `.gitignore` | 忽略 `node_modules`、`dist` |

### 核心实现 — Clock 组件

```jsx
const [time, setTime] = useState(() => new Date());

useEffect(() => {
  const timer = setInterval(() => {
    setTime(new Date());
  }, 1000);
  return () => clearInterval(timer);
}, []);
```

- 初始状态使用惰性初始化 `() => new Date()`，页面加载即显示当前时间
- `useEffect` 注册 `setInterval` 定时器，每 1000ms 更新时间状态
- 组件卸载时 `clearInterval` 清除定时器，防止内存泄漏
- `formatUnit` 使用 `padStart(2, '0')` 保证时、分、秒始终为两位数显示

## 开发验证证据

| 检查项 | 命令 | 工作目录 | 状态 | 退出码 | 证据 |
|--------|------|----------|------|--------|------|
| 依赖安装 | `npm install` | 项目根目录 | 通过 | 0 | 62 packages added |
| 生产构建 | `npm run build` | 项目根目录 | 通过 | 0 | 34 modules transformed, built in 219ms |
| 开发服务器 | `npm run dev` | 项目根目录 | 运行中 | — | http://localhost:5173/ |

### 构建产物

```
dist/index.html                   0.39 kB
dist/assets/index-D5X7F0lv.css    0.87 kB
dist/assets/index-BJgJTpF0.js   143.63 kB (gzip: 46.05 kB)
```

## AC 映射

| AC ID | 描述 | 实现状态 | 证据 |
|-------|------|----------|------|
| AC-01 | 页面实时显示当前时分秒 | 已实现 | `Clock.jsx` 使用 `setInterval` 每秒更新 `Date` 对象，构建通过，开发服务器运行于 http://localhost:5173/ |

## 遗留风险

- 实时更新与页面渲染的正确性需由 QA 通过浏览器验收确认。
- 时间精度依赖浏览器 `Date` API 与 `setInterval`，存在毫秒级漂移，不影响秒级显示。
