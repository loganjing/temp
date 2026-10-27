# 190-clock 实现报告

> 需求基线：`docs/wi-t1000388/requirements.md`
> 架构基线：`docs/wi-t1000388/architecture-baseline.md`
> 路线：simple-frontend（React + Vite SPA）

## 实现概述

新建 React + Vite 单页应用，实现实时时钟页面。页面打开后立即显示当前系统时间的时分秒（`HH:MM:SS`，两位补零），每秒自动更新，用户无需手动刷新。

### 变更行为与根因

需求要求"实时显示最近的时分秒"。实现通过浏览器 `Date` 对象读取用户系统本地时间，使用 `setInterval(1000ms)` 每秒重新读取并渲染，满足"实时"的保守可观察默认。时间格式化为两位补零的 `HH:MM:SS`，保证位数稳定可读。

### 调用链

```
index.html → src/main.jsx → src/Clock.jsx
                                  ├─ formatTime(date) → "HH:MM:SS"
                                  ├─ useState(() => new Date())  // 初始时间
                                  └─ useEffect → setInterval(1000ms) → setNow(new Date())
```

## 实现范围

| 文件 | 职责 |
|---|---|
| `package.json` | 项目依赖与脚本（react, react-dom, vite, @vitejs/plugin-react, vitest） |
| `index.html` | HTML 入口，挂载 `#root` |
| `vite.config.js` | Vite 配置，React 插件，开发服务器绑定 127.0.0.1:5173 |
| `src/main.jsx` | React 渲染入口，挂载 `Clock` 到 `#root` |
| `src/Clock.jsx` | 时钟组件：`useState` 持有当前时间，`useEffect` 注册每秒定时器，`formatTime` 格式化输出 |
| `src/index.css` | 全局重置与基础样式 |
| `src/Clock.css` | 时钟页面样式（居中布局，等宽数字） |
| `tests/formatTime.test.jsx` | `formatTime` 单元测试（普通值、00:00:00、23:59:59 边界） |
| `.gitignore` | 忽略 node_modules、dist 等 |

### 核心实现要点

- **初始渲染即显示时间**：`useState(() => new Date())` 的惰性初始化保证组件首次渲染即有当前时间，不存在空白闪烁。
- **每秒自动更新**：`useEffect` 内注册 `setInterval(1000ms)`，每次回调 `setNow(new Date())` 触发重渲染；卸载时 `clearInterval` 清理定时器，无内存泄漏。
- **两位补零格式化**：`String(n).padStart(2, '0')` 对时、分、秒分别补零，输出 `HH:MM:SS`。
- **无持久化**：时间数据仅存在于组件状态，不写入 `localStorage` 或任何存储，符合架构基线。
- **可访问性**：使用 `<time>` 语义标签，`aria-live="polite"` 让屏幕阅读器播报时间变化，`dateTime` 属性提供机器可读值。

## 开发验证证据

| 检查项 | 命令 | 工作目录 | 状态 | 证据 |
|---|---|---|---|---|
| 单元测试 | `npx vitest run` | 项目根 | 通过 | 3 tests passed（formatTime 普通值、00:00:00、23:59:59） |
| 生产构建 | `npm run build` | 项目根 | 通过 | 32 modules transformed，dist 产物正常生成（232ms） |
| 开发服务器 | `npm run dev` → `curl http://127.0.0.1:5173/` | 项目根 | 通过 | HTTP 200，页面可访问 |

### 单元测试覆盖

- `formatTime` 在 `14:05:09` 输出 `14:05:09`（普通值，验证补零）
- `formatTime` 在 `00:00:00` 输出 `00:00:00`（下边界）
- `formatTime` 在 `23:59:59` 输出 `23:59:59`（上边界）

## QA 验收交接

### 启动命令

```bash
npm install
npm run dev
```

- 前端地址：`http://127.0.0.1:5173/`
- 无需登录、无后端、无测试数据配置。

### AC-01 验收建议

1. **确定状态验证**：打开页面，观察显示的 `HH:MM:SS` 与打开瞬间的系统时间一致（允许 ±1 秒误差）。
2. **定时推进验证**：停留 ≥3 秒，观察秒位每秒递增；秒位 59→00 时观察分位递增；分位 59→00 时观察时位递增。
3. **恢复初态**：刷新页面，时间重置为当前系统时间。

## 遗留风险

- 无。本应用为纯前端单页，无服务端、无持久化、无认证，实现完整覆盖需求基线。
