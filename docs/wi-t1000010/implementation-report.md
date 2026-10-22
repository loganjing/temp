# 实现报告：实时时钟页面

## 变更行为与根因

实现一个纯前端实时时钟页面，用户打开后即看到当前时分秒（`HH:MM:SS`），随后每秒自动更新。时间数据来自浏览器 `Date` API，通过 `setInterval` 驱动 React 状态更新，无需服务端。

## 调用链

```
index.html → src/main.tsx (createRoot) → src/Clock.tsx
  └─ useState(formatTime(new Date()))    // 初始时间
  └─ useEffect → setInterval(1000ms)     // 每秒更新
       └─ setTime(formatTime(new Date()))
  └─ 组件卸载 → clearInterval(timer)    // 清理定时器
```

## 实现范围

| 文件 | 职责 |
|------|------|
| `package.json` | 项目依赖与脚本（React 18、Vite 5、TypeScript 5） |
| `index.html` | HTML 入口，挂载 `#root` |
| `vite.config.ts` | Vite 配置，端口 5173 |
| `tsconfig.json` | TypeScript 严格模式配置 |
| `src/main.tsx` | React 应用入口，挂载 Clock 组件 |
| `src/Clock.tsx` | 时钟组件：获取时间、启动/清理定时器、渲染 HH:MM:SS |
| `src/index.css` | 全局样式（深色背景） |
| `src/Clock.css` | 时钟组件样式（居中布局、等宽数字） |

### 核心逻辑

- **初始时间**：`useState(() => formatTime(new Date()))`，页面加载即显示当前时间。
- **自动更新**：`useEffect` 中注册 `setInterval`（1000ms），每 tick 调用 `new Date()` 更新状态。
- **清理**：`useEffect` 返回 `clearInterval`，组件卸载时清理定时器，防止内存泄漏。
- **格式化**：`getHours()`、`getMinutes()`、`getSeconds()` 结果补零至两位，拼接为 `HH:MM:SS`。

## 验收条件对照

| AC ID | 验收条件 | 实现状态 | 证据 |
|-------|---------|---------|------|
| AC-01 | 页面打开时显示当前时间（含时分秒） | 已实现 | 页面加载即通过 `useState` 初始化 `formatTime(new Date())`，渲染 `HH:MM:SS`；类型检查与构建通过 |
| AC-02 | 时间实时自动更新，秒数逐秒变化 | 已实现 | `useEffect` 注册 `setInterval(1000)`，每秒调用 `new Date()` 更新状态；类型检查与构建通过 |

## 开发验证

| 检查项 | 命令 | 工作目录 | 状态 | 退出码 | 证据 |
|--------|------|---------|------|--------|------|
| 类型检查 | `npm run typecheck` | 项目根 | passed | 0 | tsc --noEmit 无错误输出 |
| 生产构建 | `npm run build` | 项目根 | passed | 0 | Vite 构建成功，输出 dist/index.html + JS/CSS 资源 |
| 开发服务器 | `npm run dev` | 项目根 | running | — | Vite 开发服务器在 http://localhost:5173/ 运行 |

## 预览地址

前端开发服务器已通过后台作业启动，预览地址：`http://localhost:5173/`

浏览器 E2E 验证（页面打开后时间显示、秒数逐秒变化）由 QA 阶段执行。

## 残留风险

- 无服务端依赖，时间来源为浏览器本地时钟，依赖用户设备时间准确性。
- 不涉及持久化、跨设备同步或用户间数据共享，与需求基线一致。
