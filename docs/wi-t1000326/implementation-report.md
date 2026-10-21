# 130-clock 实现报告

## 交付概述

按已批准需求（`docs/wi-t1000326/requirements.md`，AC-01）与架构基线（`docs/wi-t1000326/architecture-baseline.md`，simple-frontend 紧凑路线）交付一个 React + Vite SPA：页面打开即显示设备本地当前时分秒（`HH:MM:SS`，24 小时制），并按秒边界自动持续更新，无需手动刷新。无服务端、无持久化、无路由，与架构基线一致。

## 实现范围（变更清单）

| 文件 | 说明 |
| --- | --- |
| `package.json` / `package-lock.json` | 新建 npm 工程：react 18、vite 5、typescript、vitest、jsdom、@testing-library/react |
| `tsconfig.json` | TypeScript 严格模式（`noEmit`，仅类型检查，含 `src` 与 `tests`） |
| `vite.config.ts` | Vite + React 插件；vitest 配置（node 默认环境，`tests/` 用例） |
| `index.html` | SPA 入口（`lang="zh-CN"`，标题“实时时钟 · 130-clock”） |
| `src/main.tsx` | React 根挂载（StrictMode） |
| `src/App.tsx` | 页面外壳：居中布局承载时钟组件 |
| `src/components/Clock.tsx` | 时钟展示组件（时:分:秒，`aria-label` 随当前时间更新） |
| `src/hooks/useClock.ts` | 时钟驱动 hook：挂载立即读一次、秒边界链式调度、`visibilitychange` 恢复重读 |
| `src/lib/clock.ts` | 纯函数：`formatClock`（HH:MM:SS 两位补零）、`delayToNextSecond`（秒边界延时） |
| `src/index.css` | 居中卡片版式、等宽数字（`tabular-nums` 防跳动）、深浅色自适应 |
| `tests/clock.test.ts` | 纯函数单元测试（8 例） |
| `tests/useClock.test.tsx` | hook 行为单元测试（5 例，fake timers + jsdom，不启动浏览器/服务） |
| `README.md` | 运行、结构与行为说明 |

## 调用链

`index.html` → `src/main.tsx`（挂载 `#root`）→ `App` → `Clock` → `useClock` → `src/lib/clock`（`formatClock` / `delayToNextSecond`）→ 浏览器 `Date` API。

时间语义：每次显示更新都通过 `new Date(Date.now())` 重新读取设备时间；调度（`setTimeout` 链 + `visibilitychange`）只决定“何时重读”，不产生时间值，因此定时器漂移不会引入显示偏差。

## 核心机制与需求对应

- 打开即显示：`useClock` 的 `useState` 初始化器立即读取一次设备时间，挂载零等待可见；effect 内再次同步读取一次。
- 持续自动更新：链式 `setTimeout` 按“距下一秒边界”的延时调度，每次回调重读 `Date` 后重新计算下一个边界，不做固定 1000ms 累加。
- 后台恢复：`visibilitychange` 变为可见时立即重读一次并重新对齐秒边界，规避后台标签定时器节流造成的显示滞后。
- 无持久化：不写 `localStorage`，无服务端，刷新或重开后重新读取当前时间。

## 开发验证证据（本阶段实际执行，均在工作区根目录）

| checkId | 命令 | 工作目录 | 状态 | 退出码 | 证据 |
| --- | --- | --- | --- | --- | --- |
| typecheck | `npm run typecheck` | 工作区根 | 通过 | 0 | `tsc --noEmit` 无诊断输出 |
| unit-tests | `npm run test` | 工作区根 | 通过 | 0 | `vitest run`：13/13 通过（`tests/clock.test.ts` 8 例、`tests/useClock.test.tsx` 5 例） |
| build | `npm run build` | 工作区根 | 通过 | 0 | `tsc --noEmit && vite build` 产出 `dist/` 纯静态文件（index.html、css、js） |

单元测试覆盖：

- `formatClock`：两位补零（09:05:03）、`00:00:00`、`23:59:59`、`12:00:00`（24 小时制断言）、输出结构 `HH:MM:SS` 正则校验。
- `delayToNextSecond`：秒内 250ms→750ms、999ms→1ms、恰在边界→1000ms。
- `useClock`：挂载立即读一次（含秒边界调度已建立）；跨秒边界自动更新（30→31→32）；每次更新重读设备时间而非累加（时间源跳变到 10:15:39 时显示跟随 39 而非链式 31）；恢复可见立即重读并重新对齐调度（后台 10 秒后回到 10:15:40）；卸载清理定时器与监听（`getTimerCount=0`、`removeEventListener` 被调用、卸载后推进时间不再更新）。

### 过程中发现并修复的测试基建缺陷

现象：全量运行时“恢复可见”用例的挂起定时器计数为 4（预期 1），单独运行该用例计数正确。根因：vitest 默认不注入全局测试钩子，测试库的自动组件清理未注册，前序用例的组件连同 `visibilitychange` 监听器跨用例泄漏并重复调度。修复：在 `tests/useClock.test.tsx` 显式注册 `afterEach(cleanup)`。修复后 13/13 通过；产品代码未因此改动。

## 验收场景对应与遗留

- AC-01（runtime-render：页面实时显示当前时分秒）：本阶段完成实现并交付预览入口。浏览器端用户可观察验收（连续观察至少 5 秒跨秒位、与设备时间对比偏差 ≤1 秒）按阶段分工由 QA 验证阶段执行；本阶段不代出浏览器验收证据。
- 预览地址：http://localhost:5179/（实现阶段以后台注册方式启动的 Vite 开发服务器，自动避让了已占用的 5173–5178 端口）。

## 遗留风险

- 浏览器端秒级精度与视觉行为（跨秒位跳变、与设备时间对比）未在本阶段执行浏览器验收，属阶段分工内待 QA 验证项；开发侧已通过单元测试闭合驱动机制的语义正确性。
- 无服务端/Schema/Migration 变更，无其他已知风险。

## 基线建议

无。simple-frontend 紧凑路线无共享基线需要更新。
