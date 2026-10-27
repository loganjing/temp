# 实现报告：贪吃蛇游戏（193-snake）

## 1. 变更行为与实现依据

按需求文档（`docs/wi-t1000391/requirements.md`）和架构基线（`docs/wi-t1000391/architecture-baseline.md`），从零新建了一个基于 React + Vite 的纯前端贪吃蛇游戏 SPA。游戏在浏览器 Canvas 上渲染，所有游戏逻辑在客户端完成，无服务端依赖。

### 实现依据（rootCause）

新建应用，无历史代码。架构基线已确定 simple-frontend 路线（React + Vite + Canvas 2D API），本阶段按此冻结边界实现。

## 2. 调用链与代码结构

```
index.html
  └─ src/main.jsx                 → React 入口
       └─ src/App.jsx             → 应用根组件
            └─ src/components/SnakeGame.jsx   → 游戏组件（Canvas 渲染 + 键盘控制 + 游戏结束 UI）
                 └─ src/hooks/useSnakeGame.js → 游戏 Hook（状态管理 + 游戏循环 + 方向队列 + 测试钩子）
                      └─ src/game/gameLogic.js → 核心游戏逻辑（纯函数，无副作用）
```

### 核心模块职责

| 模块 | 职责 |
|---|---|
| `src/game/gameLogic.js` | 纯函数游戏逻辑：网格、蛇身、食物、方向、碰撞检测、tick 推进、状态创建 |
| `src/hooks/useSnakeGame.js` | React Hook：状态管理、setInterval 游戏循环、方向输入队列、测试控制入口 |
| `src/components/SnakeGame.jsx` | Canvas 渲染（网格/蛇身/食物）、键盘事件监听、游戏结束覆盖层、重新开始按钮 |
| `src/App.jsx` | 根组件，开发环境下启用测试钩子 |

## 3. 实现范围

### 已实现功能（对应需求与 AC）

| 需求项 | 实现状态 | 对应代码 |
|---|---|---|
| 2.1 游戏区域 | ✅ 20×20 网格，Canvas 渲染 | `gameLogic.js` DEFAULT_CONFIG, `SnakeGame.jsx` Canvas 渲染 |
| 2.2 蛇的移动 | ✅ 固定速度自动推进，四方向控制，禁止直接反向 | `gameLogic.js` tick(), isValidDirectionChange() |
| 2.3 食物与进食 | ✅ 食物始终在空单元格，进食后增长+重新生成 | `gameLogic.js` generateFood(), tick() 进食分支 |
| 2.4 游戏结束 | ✅ 撞墙检测（边界）、撞自身检测（排除尾节） | `gameLogic.js` tick() 碰撞分支 |
| 2.5 分数 | ✅ 每进食一个 +1，游戏结束显示最终分数 | `gameLogic.js` score, `SnakeGame.jsx` 分数显示 |
| 2.6 游戏控制 | ✅ 开始即移动，结束后可重新开始 | `useSnakeGame.js` reset(), `SnakeGame.jsx` 重启按钮 + 空格/回车 |
| AC-01 吃食物增长得分 | ✅ 逻辑已实现，单测验证 | `gameLogic.test.js` 进食测试 |
| AC-02 撞墙/撞自身结束 | ✅ 逻辑已实现，单测验证 | `gameLogic.test.js` 碰撞测试（4方向撞墙 + 撞自身 + 尾节不碰撞） |
| AC-03 重新开始 | ✅ 状态重置到初始 | `useSnakeGame.js` reset() |

### 创建的文件清单

| 文件 | 用途 |
|---|---|
| `package.json` | 项目依赖与脚本 |
| `vite.config.js` | Vite + Vitest 配置 |
| `index.html` | HTML 入口 |
| `README.md` | 项目说明 |
| `src/main.jsx` | React 渲染入口 |
| `src/App.jsx` | 根组件 |
| `src/components/SnakeGame.jsx` | 游戏组件 |
| `src/hooks/useSnakeGame.js` | 游戏 Hook |
| `src/game/gameLogic.js` | 核心游戏逻辑 |
| `src/styles/index.css` | 全局样式 |
| `tests/gameLogic.test.js` | 单元测试（20 个用例） |

### 确定性验证入口（测试环境专用）

按架构基线第 5 节要求，在开发环境下通过 `window.__snakeGame` 暴露以下控制接口，供 QA 验收使用：

| 接口 | 用途 | 影响的 AC |
|---|---|---|
| `getState()` | 获取当前完整游戏状态快照 | 全部 |
| `step()` | 手动执行一个 tick，不依赖定时器 | AC-01, AC-02 |
| `setDirection(dir)` | 设置蛇的方向 | AC-01 |
| `setFood(x, y)` | 确定性地设置食物位置 | AC-01 |
| `setSnake(coords)` | 确定性地设置蛇身坐标 | AC-01, AC-02 |
| `reset()` | 重置游戏到初始状态 | AC-03 |
| `pauseAutoTick()` / `resumeAutoTick()` | 暂停/恢复自动定时器 | 全部 |

**启用条件**：仅 `import.meta.env.DEV` 为 true 时挂载，生产构建不包含此接口。

**验收场景设置示例**：
- AC-01：`pauseAutoTick()` → `setSnake([{x:5,y:5},{x:4,y:5}])` → `setFood(6,5)` → `setDirection('RIGHT')` → `step()` → 检查 `getState().snake.length === 3 && getState().score === 1`
- AC-02：`pauseAutoTick()` → `setSnake([{x:19,y:5}])` → `setDirection('RIGHT')` → `step()` → 检查 `getState().status === 'game-over'`
- AC-03：在 game-over 状态下调用 `reset()` → 检查 `getState().score === 0 && getState().snake.length === 3 && getState().status === 'running'`

## 4. 开发验证证据

### 单元测试

- **命令**：`npm run test`
- **工作目录**：项目根目录
- **退出码**：0
- **结果**：20 个用例全部通过
- **覆盖范围**：
  - `createInitialSnake`：初始蛇身长度与位置
  - `generateFood`：空单元格生成、网格满返回 null、确定性随机
  - `isValidDirectionChange`：禁止反向、允许 90 度转向、相同/无效方向拒绝
  - `tick`：正常移动、进食增长得分、四方向撞墙、撞自身、尾节不碰撞、网格占满胜利、不可变性
  - `createInitialState`：完整初始状态、配置覆盖

### 构建检查

- **命令**：`npm run build`
- **工作目录**：项目根目录
- **退出码**：0
- **结果**：34 个模块转换成功，产出 `dist/index.html`、CSS（1.49 kB）和 JS（147.39 kB）

### 前端预览

- **启动命令**：`npx vite --host`
- **URL**：http://localhost:5174/
- **状态**：开发服务器运行中，提供预览入口（不构成验收证据）

## 5. 遗留风险与 QA 交接

### 留给 QA 的验证项

| 验收项 | 状态 | 说明 |
|---|---|---|
| AC-01 浏览器交互验证 | 待 QA | 需在真实浏览器中验证键盘控制、蛇身增长、分数显示 |
| AC-02 浏览器碰撞验证 | 待 QA | 需在真实浏览器中验证游戏结束提示和分数显示 |
| AC-03 浏览器重启验证 | 待 QA | 需在真实浏览器中验证重新开始按钮和键盘重启 |
| Canvas 渲染正确性 | 待 QA | 需视觉确认蛇身、食物、网格绘制正确 |
| 键盘响应（↑↓←→ + WASD） | 待 QA | 需验证所有按键映射正确 |

### 遗留风险

- **无关键阻塞项**。游戏逻辑已通过完整单元测试，构建通过。
- 浏览器交互层面的验证（Canvas 渲染、键盘事件、游戏结束 UI）留给 QA 阶段。
- 测试钩子仅在开发环境启用，不影响生产构建。
