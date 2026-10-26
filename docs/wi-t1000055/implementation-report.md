# 实现报告：贪吃蛇游戏（175-snake）

## 1. 变更行为与实现依据

实现了完整的贪吃蛇浏览器游戏，基于已批准的需求文档 `docs/wi-t1000055/requirements.md` 和架构基线 `docs/wi-t1000055/architecture-baseline.md`。玩家通过方向键/WASD 控制蛇的移动方向，蛇持续自动移动，吃到食物后身体增长一节并加分，碰到边界或自身时游戏结束，结束后可重新开始。

采用 React 18 + Vite + TypeScript + Canvas 2D，按架构基线精简为 3 个核心源文件：

- `src/engine.ts` — 纯函数游戏引擎：类型定义（Point/Direction/GameState/SnakeState/TestControl）、常量（GRID_SIZE/CELL_SIZE/TICK_INTERVAL 等）、`createInitialState`、`changeDirection`、`tick`（推进一步）、`spawnFood`（随机生成食物）、`setFoodOverride`（测试钩子）、`getStateSnapshot`、碰撞检测。
- `src/App.tsx` — React 组件：游戏循环（`requestAnimationFrame` + 固定步长）、Canvas 绘制、键盘输入处理、分数显示、游戏结束提示与重新开始按钮，以及测试控制入口 `window.__snakeTest`（仅 DEV 模式）。
- `src/main.tsx` — Vite 入口，挂载 `App` 到 `#root`。

## 2. 调用链

键盘输入 → `changeDirection`（入队 pendingDirections）→ `requestAnimationFrame` 循环累积时间达到 `TICK_INTERVAL`(150ms) → `tick`（消费 pending、移动蛇头、碰撞检测、吃食增长/计分） → React state 同步 → `renderCanvas`（网格/蛇身/食物/结束遮罩）。

## 3. 实现范围

### 新建文件

| 文件 | 用途 |
|------|------|
| `package.json` | 项目依赖与脚本（dev/build/test） |
| `tsconfig.json` | TypeScript 配置 |
| `tsconfig.node.json` | Vite 配置文件的 TS 配置 |
| `vite.config.ts` | Vite + React + Vitest 配置 |
| `index.html` | HTML 入口 |
| `src/engine.ts` | 游戏引擎（类型+常量+纯函数） |
| `src/App.tsx` | 主组件（游戏循环+绘制+输入+测试钩子） |
| `src/main.tsx` | Vite 挂载入口 |
| `src/index.css` | 全局样式 |
| `src/vite-env.d.ts` | Vite 类型声明 |
| `tests/engine.test.ts` | 引擎单元测试（22 项） |

### 核心规则实现

- **方向控制**：键盘 ArrowKeys + WASD，映射为 UP/DOWN/LEFT/RIGHT。
- **持续移动**：`requestAnimationFrame` 累积时间，达到 150ms 步长调用 `tick`。
- **反向限制**：`changeDirection` 拒绝与当前/最后 pending 方向相反的输入，防止瞬间撞死。
- **食物与增长**：`spawnFood` 在空白格随机生成食物；`tick` 中吃到食物时蛇身增长一节（尾部不出队）、分数 +1，并生成新食物。
- **碰撞与结束**：蛇头越界或撞到自身（排除即将移出的尾部位置）时 `gameState` 置为 `'over'`。
- **计分**：每吃一个食物 +1，游戏结束遮罩显示最终得分。
- **重新开始**：游戏结束后按钮或键盘触发 `createInitialState` 重置为短蛇、零分。
- **胜利条件**：蛇填满整个网格（20×20=400 格）时 `gameState` 置为 `'won'`。

### 确定性验证入口

按架构基线在 DEV 模式通过 `window.__snakeTest` 暴露：
- `step()` — 手动推进单步，暂停自动循环。
- `setFood(x, y)` — 固定食物位置，暂停自动循环。
- `getState()` — 读取蛇身坐标、方向、食物、分数、游戏状态的快照。

生产构建（`vite build`）不暴露此钩子（`import.meta.env.DEV` 为 false）。

## 4. 开发验证证据

| checkId | 命令 | 工作目录 | 状态 | 退出码 | 证据 |
|---------|------|----------|------|--------|------|
| typecheck | `npx tsc -b` | 项目根 | passed | 0 | TypeScript 类型检查零错误 |
| unit-test | `npx vitest run` | 项目根 | passed | 0 | 22/22 项测试通过 |
| build | `npx vite build` | 项目根 | passed | 0 | 生产构建成功，输出 dist/index.html + JS(146.66kB) + CSS(0.77kB) |
| dev-server | `npx vite --port 5175` | 项目根 | passed | — | 开发服务器运行于 http://localhost:5175/ |

### 单元测试覆盖

引擎单元测试覆盖以下场景：
- `createInitialState`：初始状态为 running、score=0、3 节蛇、食物存在且不在蛇身。
- `changeDirection`：合法垂直方向入队、拒绝 180° 反向、拒绝同方向、游戏结束时不接受输入、按最后 pending 方向判断反向。
- `tick`：正常前移、吃食增长+计分+新食物、不吃食不长、边界碰撞结束（右墙/上墙）、自身碰撞结束、尾部刚腾出位置可进入、消费 pending 方向、游戏结束/胜利时不推进。
- `setFoodOverride`：设置食物位置、override 在下一轮 spawn 时生效、override 位置被占用时回退随机。
- `spawnFood`：网格满时返回 null。
- `getStateSnapshot`：返回防御性副本。

## 5. QA 交接信息

- **启动命令**：`npm run dev`（或 `npm run build && npm run preview`），工作目录为项目根。
- **前端地址**：开发服务器 http://localhost:5175/ ，生产预览 http://localhost:4173/ 。
- **无需登录/认证**：纯前端单机游戏，无后端。
- **确定性验证入口**：在开发服务器打开页面后，通过浏览器控制台调用 `window.__snakeTest.step()`、`window.__snakeTest.setFood(x, y)`、`window.__snakeTest.getState()`。生产构建不包含此钩子。
- **验收场景对照**：
  - AC-01（移动/吃食/增长/得分）：用方向键控制蛇移向食物，`step()` 可手动推进单步，`setFood()` 可固定食物位置避免随机，`getState()` 可读取蛇长和分数。
  - AC-02（碰撞结束/最终得分）：控制蛇撞墙或自身，观察 Canvas 遮罩显示"游戏结束"与得分，`getState()` 可读取 `gameState: 'over'`。
  - AC-03（重新开始）：游戏结束后点击"重新开始"按钮或按键，`getState()` 可读取 `gameState: 'running'`、`score: 0`、蛇长 3。

## 6. 遗留风险

- 浏览器端交互验收（AC-01/02/03）由 QA 阶段执行，本阶段仅提供确定性入口和单元测试覆盖，不代替 QA 的浏览器验收。
- 测试钩子仅在 DEV 模式暴露，生产构建不包含，不影响生产行为。
- `spawnFood` 在网格满时返回 null（胜利状态），正常运行中 400 格场景极端罕见。
