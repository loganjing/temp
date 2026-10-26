# 贪吃蛇游戏 — 实现报告

## 1. 变更行为与实现依据

**变更行为**：从零搭建一个可运行的贪吃蛇游戏 SPA，完整覆盖需求基线中定义的全部核心行为：网格移动、方向控制（禁止 180° 反向调头）、吃食物增长、碰撞失败/胜利结束、实时得分显示、游戏结束后可重新开始。

**实现依据**：已批准的需求基线 `docs/wi-t0054/requirements.md`（sha256:a9abec4636b2b1cb58cd6d362bf515c873a34088b34d281171e24b5de6a25496）和架构基线 `docs/wi-t0054/architecture-baseline.md`（sha256:b464b510cd8de90beeceab710b60eb8493cce78b2595659560e2ae8751b92ad5）。工作区此前无业务代码，按新建应用处理。

## 2. 技术栈与项目结构

| 维度 | 选择 |
|------|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5 |
| 渲染 | HTML Canvas 2D |
| 游戏循环 | requestAnimationFrame + 时间步控制（150ms/tick） |
| 网格 | 20×20，每格 20px，画布 400×400px |
| 测试 | Vitest（纯函数单元测试） |

### 文件清单

| 文件 | 职责 |
|------|------|
| `package.json` | 依赖与脚本（dev/build/test） |
| `vite.config.ts` | Vite + Vitest 配置 |
| `tsconfig.json` / `tsconfig.node.json` | TypeScript 项目引用配置 |
| `index.html` | SPA 入口 |
| `src/main.tsx` | React 挂载入口 |
| `src/App.tsx` | 主组件：得分显示、Canvas、重启按钮、操作提示 |
| `src/index.css` | 页面布局与样式 |
| `src/game/types.ts` | 类型定义（Point、Direction、GameState、SnakeState） |
| `src/game/constants.ts` | 网格尺寸、tick 间隔、初始蛇身、方向增量、反向映射 |
| `src/game/engine.ts` | 纯函数游戏引擎：createInitialState、changeDirection、tick、spawnFood、setFoodOverride、getStateSnapshot |
| `src/hooks/useSnakeGame.ts` | React Hook：rAF 循环、键盘事件、Canvas 渲染、测试控制入口 |
| `tests/game/engine.test.ts` | 引擎纯函数单元测试（22 项） |

## 3. 调用链

```
用户键盘输入
  → window keydown 事件监听（useSnakeGame）
  → changeDirection(engine.ts)  — 校验反向调头、入队 pendingDirections
  → requestAnimationFrame 循环
  → 每 150ms 调用 tick(engine.ts)
    → 消费 pendingDirections 队首方向
    → 计算新头部坐标
    → 边界碰撞检测 → gameState='over'
    → 自身碰撞检测（排除即将移走的尾部）→ gameState='over'
    → 吃食物检测 → 增长身体、score+1、spawnFood 生成新食物
    → 胜利检测（蛇身填满网格）→ gameState='won'
  → renderCanvas(useSnakeGame.ts) — Canvas 绘制蛇、食物、网格、结束遮罩
  → React state 同步（score、gameState）→ UI 更新
```

## 4. 核心业务规则实现

### 4.1 方向控制与反向调头禁止

- `changeDirection` 将有效方向加入 `pendingDirections` 队列（最多 2 个）。
- 每次入队时检查与队列末尾方向（或当前方向）是否构成 180° 反向，是则拒绝。
- 每个 tick 只消费队列首部一个方向，避免快速连按导致的非法调头。

### 4.2 食物生成

- `spawnFood` 从所有非蛇身格子中均匀随机选取。
- 支持 `nextFoodOverride`（测试覆盖）：若设置了覆盖位置且该位置空闲，使用覆盖位置。
- 蛇填满整个网格时返回 null，触发胜利。

### 4.3 碰撞检测

- **边界碰撞**：新头部坐标超出 [0, GRID_SIZE) 范围 → 游戏结束（失败）。
- **自身碰撞**：新头部坐标命中蛇身。未吃食物时排除尾部（尾部即将移走），吃食物时尾部保留。
- **胜利条件**：蛇身长度 === GRID_SIZE × GRID_SIZE（400 格）。

### 4.4 游戏状态流转

- **开始**：页面加载即自动创建初始状态，gameState='running'，蛇从 (10,10) 向右移动。
- **进行中**：rAF 循环每 150ms 推进一个 tick。
- **结束**：碰撞或胜利后 gameState 切换为 'over' 或 'won'，停止 tick，Canvas 显示结束遮罩与最终得分。
- **重新开始**：点击"重新开始"按钮调用 `restart()`，重置为初始状态。

## 5. 测试控制入口（仅开发环境）

按架构基线要求，在 `import.meta.env.DEV` 下挂载 `window.__snakeTest`：

| 入口 | 签名 | 作用 |
|------|------|------|
| `step()` | `() => void` | 暂停自动 tick，手动推进一个游戏 tick |
| `setFood(x, y)` | `(x: number, y: number) => void` | 暂停自动 tick，将食物固定到指定格子，覆盖随机生成 |
| `getState()` | `() => object` | 读取当前游戏状态快照（蛇身坐标、方向、得分、状态、食物位置） |

任何测试方法被调用后自动暂停 rAF 的自动 tick，测试获得完全控制权。`restart()` 会恢复自动 tick。生产构建中不暴露这些入口。

**受影响的 AC**：AC-01（移动与吃食物）、AC-02（碰撞结束）。QA 可通过 `setFood` 固定食物位置、`step` 单步推进、`getState` 验证状态，实现确定性验收。AC-03（重新开始）无特殊时序因素，直接交互验证。

## 6. 开发验证证据

| 检查项 | 命令 | 工作目录 | 退出码 | 状态 |
|--------|------|----------|--------|------|
| TypeScript 类型检查 | `npx tsc -b` | 项目根 | 0 | 通过 |
| 单元测试 | `npx vitest run` | 项目根 | 0 | 通过（22/22） |
| 生产构建 | `npx vite build` | 项目根 | 0 | 通过 |

### 单元测试覆盖

引擎纯函数测试（`tests/game/engine.test.ts`，22 项）：

- **createInitialState**：初始蛇身长度 3、方向 RIGHT、得分 0、状态 running、食物已生成
- **changeDirection**：接受有效方向、拒绝反向调头、拒绝相同方向、限制队列长度 2、游戏结束时拒绝方向变更
- **tick — 移动**：蛇头按方向前进一格、未吃食物时蛇身长度不变、消费 pendingDirections 队首方向
- **tick — 吃食物**：蛇身增长一节、得分 +1、生成新食物
- **tick — 碰撞**：边界碰撞 → over、自身碰撞 → over、尾部跟随（头部移至尾部原位置时不算碰撞）
- **tick — 胜利**：蛇身填满网格 → won
- **tick — 边界**：游戏结束时不推进
- **spawnFood**：使用覆盖位置、返回 null 当网格满
- **setFoodOverride**：设置食物位置与覆盖位置、覆盖用于后续生成

## 7. 遗留风险与 QA 交接

### QA 所需信息

- **启动命令**：`npm run dev`（已启动，预览地址 `http://localhost:5174/`）
- **构建命令**：`npm run build` → `dist/`
- **无需登录**：纯前端应用，无认证
- **测试控制入口**：开发环境下通过 `window.__snakeTest` 访问（见第 5 节）

### 遗留风险

- 浏览器 E2E 验收（AC-01/02/03 的 runtime-render 与 interaction 证据）由 QA 阶段执行，实现阶段不代替 QA 出具通过证据。
- `__snakeTest` 接口仅在开发环境暴露，生产构建不包含。QA 需在 dev server 上执行确定性验收。
- 食物随机生成使用 `Math.random()`，测试覆盖通过 `setFoodOverride` 绕过随机性；正常运行时食物位置不可预测。
