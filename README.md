# 130-clock 实时时钟

一个单页面实时时钟：打开页面即显示当前设备本地时间（时:分:秒，24 小时制），并按秒自动更新，无需手动刷新。

## 运行

```bash
npm install
npm run dev       # 开发服务器（Vite）
npm run test      # 单元测试（vitest）
npm run typecheck # 类型检查（tsc --noEmit）
npm run build     # 类型检查 + 生产构建（输出 dist/，纯静态文件）
```

## 结构

- `index.html`：SPA 入口
- `src/main.tsx`：React 根挂载
- `src/App.tsx` / `src/components/Clock.tsx`：页面与时钟展示组件
- `src/hooks/useClock.ts`：时钟驱动（秒边界链式调度、恢复可见立即重读）
- `src/lib/clock.ts`：时间格式化与秒边界延时纯函数
- `tests/`：单元测试（不启动浏览器或服务）

## 行为说明

- 显示值始终来自当次读取的设备时间（`new Date(Date.now())`），调度只决定何时重读，定时器漂移不会引入显示偏差。
- 页面从后台恢复可见时立即重读一次并重新对齐秒边界，规避后台标签定时器节流。
- 无服务端、无持久化：不写 localStorage，刷新或重开后重新读取当前时间。
