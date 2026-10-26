# 实现报告：日常专注时段记录系统（168-timeling）

## 变更行为与依据

本次实现基于已批准的需求基线 `docs/wi-t1000046/requirements.md`（sha256: e91632a9…）和架构基线 `docs/wi-t1000046/architecture-baseline.md`（sha256: b8718676…），从零搭建 React + Vite 单页面应用，交付完整的番茄钟倒计时 + 当日专注记录系统。

核心行为变更：
- 番茄钟状态机驱动专注（25 分钟）→ 休息（5 分钟）→ 可启动下一轮的完整循环。
- 专注阶段倒计时到达 00:00 时自动将专注时段记录到当日列表，无需用户手动保存。
- 页面上方实时显示当日累计专注时长（记录数 × 25 分钟），每完成一个番茄钟后更新。
- 页面下方按小时分桶渲染当日专注热力图，颜色深浅反映专注强度，完成后更新对应时段。
- 当日记录持久化到 `localStorage`（key: `timeling.sessions.YYYY-MM-DD`），刷新后当日数据保留。

## 调用链与实现范围

### 文件结构

| 文件 | 职责 |
|---|---|
| `package.json` | 项目依赖与脚本（React 18, Vite 5） |
| `index.html` | Vite SPA HTML 入口 |
| `vite.config.js` | Vite 配置（端口 5173） |
| `src/main.jsx` | React 根渲染入口 |
| `src/App.jsx` | 主应用组件，组合三大区域 |
| `src/hooks/usePomodoro.js` | 番茄钟状态机与倒计时逻辑 |
| `src/lib/storage.js` | localStorage 读写 + 热力图分桶 + 累计计算 |
| `src/components/CumulativeFocus.jsx` | 累计专注时长区（页面上方） |
| `src/components/PomodoroTimer.jsx` | 番茄钟倒计时区（页面中部） |
| `src/components/Heatmap.jsx` | 当日专注热力图区（页面下方） |
| `src/styles/index.css` | 全局样式 |

### 状态机逻辑（`usePomodoro.js`）

```
idle (25:00) ──启动──▶ focus (25:00→00:00) ──自动──▶ break (05:00→00:00) ──自动──▶ ready (25:00) ──启动──▶ focus …
```

- `setInterval` 每秒驱动 `secondsLeft` 递减。
- 专注阶段到达 0 时：调用 `saveSession({ completedAt: Date.now(), duration: 25 })` 写入 localStorage，更新 `sessions` 状态，自动切换到休息阶段。
- 休息阶段到达 0 时：进入 `ready` 状态，不自动开始专注，避免用户未就位即计时。
- `sessions` 初始值从 `loadSessions()` 读取，刷新后恢复当日已记录的专注时段。

### 数据流

```
用户点击"开始专注"
  → usePomodoro: phase=focus, running=true, setInterval 启动
  → 每秒递减 secondsLeft
  → 到达 0: saveSession() → localStorage[timeling.sessions.YYYY-MM-DD] + sessions state 更新
  → CumulativeFocus 重新渲染（sessions.length × 25 分钟）
  → Heatmap 重新渲染（buildHeatmap 按完成时间小时分桶）
  → 自动切换到 break 阶段
```

### localStorage 存储设计

- Key: `timeling.sessions.YYYY-MM-DD`（按日期区分）
- Value: `[{ completedAt: <timestamp>, duration: 25 }]`
- 累计时长和热力图数据均从 sessions 列表派生，无需单独持久化，保证三者数据一致。

## 开发验证证据

### 构建检查

| checkId | 命令 | 工作目录 | 状态 | 退出码 | 证据 |
|---|---|---|---|---|---|
| build | `npx vite build` | 项目根目录 | passed | 0 | 36 modules transformed, dist 产出 index.html (0.41 kB) + CSS (4.53 kB) + JS (147.74 kB)，built in 276ms |

### 开发服务器启动

| checkId | 命令 | 状态 | 证据 |
|---|---|---|---|
| dev-server | `npx vite --port 5173 --host` | passed | Vite v5.4.21 ready in 87ms, http://localhost:5173/ |

### 前端预览地址

`http://localhost:5173/` — Vite 开发服务器已作为注册后台作业启动，提供预览入口。

## 验收条件对照

### AC-01：番茄钟专注阶段完成并自动记录当日列表

- 实现依据：`usePomodoro.js` 中专注阶段倒计时到达 0 时自动调用 `saveSession()`，将 `{ completedAt: Date.now(), duration: 25 }` 写入 localStorage 并更新 sessions 状态，随后自动切换到休息阶段（05:00）。
- 状态：已实现，开发自检（构建通过 + 服务启动）完成。用户界面交互验证留待 QA。

### AC-02：页面上方显示当日累计专注时长并随完成更新

- 实现依据：`CumulativeFocus.jsx` 从 `sessions` 派生 `totalFocusMinutes(sessions)`，实时渲染累计时长。sessions 状态每次专注完成时更新，组件自动重渲染。
- 状态：已实现，开发自检完成。运行时渲染验证留待 QA。

### AC-03：页面下方热力图展示当日各时段专注分布

- 实现依据：`Heatmap.jsx` 调用 `buildHeatmap(sessions)` 将记录按完成时间的小时分桶（0-23），每桶统计专注分钟数，热度等级 0-4 对应背景色深浅。sessions 更新后热力图自动重渲染。
- 状态：已实现，开发自检完成。视觉样式验证留待 QA。

## 遗留风险与待验证项

1. **浏览器 E2E 验证**：本阶段仅完成构建检查和开发服务器启动，番茄钟完整循环、自动记录、累计更新、热力图渲染的浏览器交互验证由 QA 阶段执行。
2. **跨天数据**：需求基线明确将跨天持久化排除在基线之外；当前实现以当日记录为最小可观察结果，localStorage 仅用于同一日内刷新后保留当日数据。
3. **暂停/重置/跳过**：需求未指定，未实现，保持未规定。
4. **声音/弹窗提醒**：需求未指定，未实现，保持未规定。

## QA 所需信息

- 启动命令：`npm run dev`（工作目录：项目根目录）
- 前端地址：`http://localhost:5173/`
- 无需登录，无需后端服务
- 建议使用可控/加速时钟驱动渲染以验证 AC-01（避免等待 25 分钟真实倒计时）
- 数据隔离：localStorage key 为 `timeling.sessions.YYYY-MM-DD`，可在 DevTools Application > Local Storage 中查看和清除
