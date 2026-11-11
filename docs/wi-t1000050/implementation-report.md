# k12-clock 实现报告

## 变更行为与根因

本阶段基于已批准的需求（`docs/wi-t1000050/requirements.md`）和架构基线（`docs/wi-t1000050/architecture-baseline.md`），新建一个 React/Vite 单页应用，页面实时显示当前时、分、秒。

根因：需求要求一个页面实时显示当前时分秒，架构基线已确定 simple-frontend 路线（React/Vite SPA + 浏览器 `setInterval` 定时器），本阶段按该基线完成全部实现。

## 实现范围

### 新建文件

| 文件 | 职责 |
|---|---|
| `package.json` | 项目依赖与脚本（React 18、Vite 5、Vitest 2） |
| `vite.config.js` | Vite 配置，启用 React 插件 |
| `index.html` | HTML 入口 |
| `src/main.jsx` | React 挂载入口 |
| `src/App.jsx` | 应用根组件，渲染 Clock |
| `src/Clock.jsx` | 时钟组件，挂载时启动 1 秒定时器，每秒读取系统时间并更新显示，卸载时清理定时器 |
| `src/formatTime.js` | 时间格式化工具函数，将 Date 转为 `HH:MM:SS`（24 小时制，两位补零） |
| `src/index.css` | 全局样式（深色背景、等宽字体） |
| `src/Clock.css` | 时钟组件样式（居中大号数字、青色发光效果） |
| `tests/formatTime.test.js` | `formatTime` 单元测试（4 个用例） |

### 核心调用链

```
index.html → src/main.jsx → src/App.jsx → src/Clock.jsx
                                                  ↓
                                        src/formatTime.js (formatTime)
                                                  ↓
                                        setInterval(1000ms) → setTime → 重渲染
                                                  ↓
                                        卸载时 clearInterval(timer)
```

### 关键实现细节

- **时间格式化**：`formatTime(date)` 使用 `String.padStart(2, '0')` 确保时、分、秒均为两位补零，24 小时制。
- **实时更新**：`Clock` 组件在 `useEffect` 中启动 `setInterval`，间隔 1000ms，每秒调用 `formatTime(new Date())` 更新 state，触发重渲染。
- **定时器清理**：`useEffect` 返回 cleanup 函数调用 `clearInterval`，组件卸载时自动清理，避免内存泄漏。
- **时间来源**：浏览器 `Date` 对象读取客户端系统时间，不依赖任何服务端或外部时间源。
- **可访问性**：时钟显示区域添加 `aria-live="polite"` 和 `aria-label="当前时间"`。

## 开发验证证据

| 检查项 | 命令 | 工作目录 | 状态 | 退出码 |
|---|---|---|---|---|
| 单元测试 | `npm test` | wi-t1000050 | 通过 | 0 |
| 生产构建 | `npm run build` | wi-t1000050 | 通过 | 0 |
| 开发服务器启动 | `npm run dev` | wi-t1000050 | 通过 | — |

### 单元测试详情

- 测试文件：`tests/formatTime.test.js`
- 测试用例：4 个，全部通过
  - 格式化为 `HH:MM:SS`（14:30:45）
  - 个位数补零（01:02:03）
  - 午夜零点（00:00:00）
  - 最大有效值（23:59:59）

### 构建产物

```
dist/index.html         0.40 kB │ gzip:  0.27 kB
dist/assets/index.css   0.43 kB │ gzip:  0.32 kB
dist/assets/index.js  143.10 kB │ gzip: 46.02 kB
```

### 预览地址

开发服务器已启动：`http://localhost:5173/`

## 验收映射

- **AC-01（页面实时显示当前时分秒）**：
  - 确定性部分（通过）：页面渲染 `HH:MM:SS` 格式，补零规则由单元测试验证；构建通过确保产物完整。
  - 实时部分（待 QA）：定时器每秒更新逻辑已实现，需在运行时观察显示值随系统时间推进，由 QA 在浏览器中验证。

## 遗留风险

- 无持久化数据、无后端、无认证，无相关风险。
- 实时更新的运行时观察（浏览器 E2E）留给 QA 阶段验证。
- 页面布局、配色为实现阶段确定的极简数字时钟风格，用户可后续调整。
