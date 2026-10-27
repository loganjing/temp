# 实现报告：Timeling 专注时段记录系统

> 引用需求基线：`docs/wi-t1000390/requirements.md`（SHA-256: `d33aee88398c837aa7a87938954765abdcee28cacf08e1175f584af880e29451`）
> 引用架构基线：`docs/wi-t1000390/architecture-baseline.md`（SHA-256: `c664660570f4a85cade70475ae7095dccf78b85959cd3d5cb46ffc39d3eda89f`）

## 1. 变更概述

按已批准的需求与架构基线，从零实现了 Timeling 单页面专注时段记录系统。技术栈为 React 18 + Vite 5 + TypeScript，纯浏览器端运行，数据通过 localStorage 按日期键持久化。

**核心行为变更**：用户可在单页面内启动番茄钟（25 分钟专注 + 5 分钟休息），专注倒计时归零时自动记录一条当日专注时段，页面上方实时显示累计专注时长，下方以热力图展示当日各时段专注分布，刷新后数据保留。

## 2. 调用链与实现范围

### 项目结构

```
├── index.html              # HTML 入口
├── package.json            # 依赖与脚本
├── vite.config.ts          # Vite 配置
├── vitest.config.ts        # 单元测试配置（jsdom 环境）
├── tsconfig.json           # TypeScript 配置
└── src/
    ├── main.tsx            # React 根挂载
    ├── App.tsx             # 页面布局（三区域自上而下）
    ├── types.ts            # 类型定义、常量、localStorage 读写、格式化函数
    ├── types.test.ts       # 类型层单元测试（14 个）
    ├── HeatmapLogic.ts     # 热力图数据计算（时段统计、强度分级）
    ├── HeatmapLogic.test.ts # 热力图逻辑单元测试（3 个）
    ├── styles.css          # 页面样式
    ├── hooks/
    │   └── usePomodoroTimer.ts  # 番茄钟状态机 Hook
    └── components/
        ├── FocusSummary.tsx    # 累计专注时长展示
        ├── TimerDisplay.tsx    # 番茄钟倒计时与控制按钮
        ├── SessionList.tsx     # 当日专注记录列表
        └── Heatmap.tsx         # 专注热力图渲染
```

### 番茄钟状态机（`src/hooks/usePomodoroTimer.ts`）

状态流转：`idle → focusing → resting → idle`，支持暂停/恢复：

```
idle → focusing（25:00 倒计时）→ 归零 → 记录 + resting（5:00）→ 归零 → idle
         ↓ 暂停                    ↓ 暂停
    paused-focusing           paused-resting
         ↓ 恢复                    ↓ 恢复
       focusing                  resting
```

- 使用 `setInterval`（1 秒 tick）驱动倒计时
- 专注倒计时归零时：生成 `SessionRecord`（`completedAt` + `durationMin: 25`），追加到 sessions 并写入 localStorage，自动进入休息阶段
- 休息倒计时归零时：回到 `idle`，等待用户手动开始下一个专注时段
- 页面加载时从 localStorage 读取当日记录，恢复列表、累计时长和热力图

### 数据持久化（`src/types.ts`）

- **localStorage 键**：`timeling:{YYYY-MM-DD}`，值为 `SessionRecord[]` 的 JSON
- **写入时机**：专注倒计时归零时
- **读取时机**：页面加载时
- **跨天处理**：以当前日期计算键名；键不存在时视为空列表

### 页面布局（`src/App.tsx`）

自上而下三个区域，对应需求 §3.3、§3.1/§3.2、§3.4：

| 区域 | 组件 | 对应需求 |
|------|------|----------|
| 累计专注时长 | `FocusSummary` | §3.3 |
| 番茄钟 + 当日列表 | `TimerDisplay` + `SessionList` | §3.1, §3.2 |
| 专注热力图 | `Heatmap` | §3.4 |

### 热力图（`src/HeatmapLogic.ts` + `src/components/Heatmap.tsx`）

- 将一天划分为 24 个小时格子
- 每格颜色深浅由该时段完成的专注番茄钟数量决定（0-4 共 5 级强度）
- 每次专注完成后自动更新

### 开发测试控制（`src/hooks/usePomodoroTimer.ts`）

在 `import.meta.env.DEV` 为 `true` 时暴露 `window.__TIMELING_TEST__`：

- `fastForwardFocus()`：将专注倒计时设为 0，触发完成逻辑
- `fastForwardRest()`：将休息倒计时设为 0，回到 idle
- `setFocusTickSeconds(sec)`：临时设置每 tick 递减秒数
- `clearTodaySessions()`：清除当日 localStorage 键，恢复初态

## 3. 开发验证证据

| 检查项 | 命令 | 工作目录 | 状态 | 退出码 |
|--------|------|----------|------|--------|
| TypeScript 类型检查 | `npx tsc --noEmit` | 项目根 | 通过 | 0 |
| 单元测试 | `npx vitest run` | 项目根 | 通过（17/17） | 0 |
| 生产构建 | `npx vite build` | 项目根 | 通过 | 0 |

### 单元测试覆盖

- **types.test.ts（14 个）**：常量值校验、`todayKey` 格式化、`loadSessions`/`saveSessions` 往返与异常过滤、`formatTime` 格式化、`formatDuration` 格式化、`hourOf` 提取
- **HeatmapLogic.test.ts（3 个）**：空数据返回 24 格零计数、按小时统计、多时段分布

## 4. 受影响的验收场景与 QA 交接

| AC | 说明 | QA 前置条件 | 预期观察点 |
|----|------|-------------|------------|
| AC-01 | 完成专注时段并自动记录 | 启动番茄钟 → 调用 `window.__TIMELING_TEST__.fastForwardFocus()` | 当日列表新增一条记录（完成时间 + 25 分钟） |
| AC-02 | 累计专注时长更新 | 同 AC-01 | 累计时长 = 完成数量 × 25 分钟 |
| AC-03 | 热力图展示 | 同 AC-01 | 对应时段格子颜色加深 |
| AC-04 | 刷新后数据保留 | 完成至少一个番茄钟 → 刷新页面 | 记录列表、累计时长、热力图与刷新前一致 |

### QA 启动命令

```bash
npm run dev      # 开发服务器，默认 http://127.0.0.1:5174/
npm run build    # 生产构建
```

### 开发测试控制使用方法

1. 打开页面，确认当日列表为空、累计时长为 0、热力图全浅色
2. 点击"开始专注"启动倒计时
3. 在浏览器控制台执行 `window.__TIMELING_TEST__.fastForwardFocus()` 触发专注完成
4. 确认记录列表、累计时长、热力图均已更新
5. 执行 `window.__TIMELING_TEST__.clearTodaySessions()` 恢复初态

## 5. 遗留风险

- **番茄钟状态不持久化**：按架构基线设计，刷新后番茄钟回到 idle，仅当日已完成记录列表持久化。此为预期行为。
- **热力图时段粒度**：架构基线选定每小时一格（24 格），用户未指定具体粒度。
- **跨天数据不展示**：按需求 §5 排除，仅展示当日记录。
- **浏览器 E2E 验收**：开发阶段已提供测试控制入口，但未执行浏览器验收，留给 QA 阶段验证。

## 6. 非目标

- 不支持跨天数据查看或汇总（需求 §5 排除）
- 不支持番茄钟时长自定义（用户明确指定 25/5 分钟）
- 不支持用户账户与多设备同步（需求 §5 排除）
- 不涉及服务端、数据库、认证或外部集成
