# 实现报告：日常专注时段记录系统

> Work Item: wi-t1000085 | IssueTask: T1000085 | 阶段: implementation | 路线: simple-frontend

## 1. 实现依据

依据已批准的 `docs/wi-t1000085/requirements.md`（R1–R5）与 `docs/wi-t1000085/architecture-baseline.md`，新建纯前端单页面应用：React + Vite + TypeScript + Ant Design，当日记录持久化到 `localStorage`，无服务端。

## 2. 已实现行为（对照需求）

| 需求 | 实现 |
|------|------|
| R1 单页面 | `src/App.tsx` 单页面布局，顶部累计时长、中部番茄钟、中下部记录列表、底部热力图，无路由跳转 |
| R2 番茄钟倒计时 25+5 | `src/hooks/usePomodoroTimer.ts` 状态机 `idle → focusing → resting → idle`，`setInterval` 1 秒 tick；专注 25:00→00:00 后自动进入休息 05:00→00:00 |
| R3 自动记录 | 专注阶段自然归零时 `commitFocusRecord()` 写入 `localStorage`（键 `focus-records-YYYY-MM-DD`），记录含 `id/completedAt/durationMinutes=25`；手动暂停/中止不写入 |
| R4 累计专注时长 | `src/components/StatsHeader.tsx` 实时汇总 `sum(durationMinutes)` 并展示已完成番茄钟计数 |
| R5 当日热力图 | `src/components/Heatmap.tsx` 按 48 个半小时时段聚合专注次数，4 级强度色阶，无记录时段最低强度 |

## 3. 调用链

```
src/main.tsx
  └─ src/App.tsx (ConfigProvider + Layout)
       ├─ StatsHeader        ← records 派生累计时长
       ├─ PomodoroTimer      ← usePomodoroTimer 状态
       ├─ RecordList         ← records 列表
       └─ Heatmap            ← records 按半小时聚合

src/hooks/usePomodoroTimer.ts
  ├─ src/storage.ts (loadRecords/appendRecord/saveRecords/clearRecords/todayKey)
  ├─ src/utils/time.ts (generateId/formatClock/slot helpers)
  └─ src/types.ts
```

## 4. 测试控制入口（仅 `?test=1`）

为支持验收可重复验证（AC-01/AC-02 涉及 25 分钟倒计时），按架构基线提供：

- 查询参数 `?test=1`：专注压缩为 5 秒、休息 2 秒（`src/storage.ts` `isTestMode`/`defaultDurations`）。
- `window.__focusDebug__`：
  - `setDurations({ focusSeconds, restSeconds })`：动态调整时长。
  - `skipToFocusEnd()`：专注阶段直接推进到归零边界，触发记录写入并进入休息。
  - `clearTodayRecords()`：清空当日记录，恢复初态。
- 正常运行（无 `?test=1`）专注仍为 25 分钟、休息 5 分钟，产品语义不变。

## 5. 开发验证证据

| checkId | 命令 | 工作目录 | 状态 | 证据 |
|---------|------|----------|------|------|
| typecheck | `npm run typecheck` (`tsc --noEmit`) | 项目根 | 通过 | 退出码 0，无类型错误 |
| build | `npm run build` (`tsc -b && vite build`) | 项目根 | 通过 | 退出码 0，`dist/index.html`、`dist/assets/index-*.js`、`dist/assets/index-*.css` 生成 |
| dev-server | `npm run dev` | 项目根 | 运行中 | Vite 开发服务器监听 http://localhost:5174/ |

## 6. 验收场景对照（开发自检，非 QA 验收）

- AC-01：`?test=1` 下启动番茄钟，专注 5 秒递减归零后自动切换到休息倒计时；可由 `skipToFocusEnd()` 推进边界。开发阶段已通过构建与类型检查验证入口可达，浏览器交互验收留给 QA。
- AC-02：`?test=1` 下短时长自然走完专注阶段，`commitFocusRecord` 写入记录并更新累计时长。`clearTodayRecords()` 恢复初态。
- AC-03：热力图组件根据 `records` 按完成时刻归入半小时时段聚合，强度色阶已实现。
- AC-04：四个区域在同一 `App.tsx` 视图中同时渲染，无路由跳转。

## 7. 残留风险与边界

- 浏览器交互、视觉样式、刷新读回、定时器真实运行由 QA 在验收阶段独立启动服务并执行浏览器验收。
- 跨日数据保留、历史查询、专注标签、休息后自动开始下一段专注均为未规定事项，本期未实现。
- `localStorage` 配额异常时静默忽略，不阻塞倒计时运行。

## 8. 交付文件清单

```
package.json
tsconfig.json
vite.config.ts
index.html
.gitignore
src/main.tsx
src/App.tsx
src/index.css
src/types.ts
src/storage.ts
src/utils/time.ts
src/hooks/usePomodoroTimer.ts
src/components/StatsHeader.tsx
src/components/PomodoroTimer.tsx
src/components/RecordList.tsx
src/components/Heatmap.tsx
```
