# 贪吃蛇游戏 实现报告

## 实现概述

基于已批准的需求基线和架构基线（simple-frontend，React + Vite SPA），完成了贪吃蛇游戏的全部核心逻辑与 UI 实现。游戏逻辑与渲染层解耦，核心规则在 `src/game/gameLogic.js` 中独立实现，便于单元测试覆盖。

## 变更行为与根因

本次为新建应用，无既有行为需保持。实现依据为需求文档 `docs/wi-t1000049/requirements.md` 和架构基线 `docs/wi-t1000049/architecture-baseline.md`。

## 调用链

```
src/main.jsx → src/App.jsx → src/components/SnakeGame.jsx → src/game/gameLogic.js
```

- `src/main.jsx`：React 入口，挂载到 `#root`
- `src/App.jsx`：应用容器，渲染标题和游戏组件
- `src/components/SnakeGame.jsx`：游戏 UI 组件，管理游戏循环（setInterval）、键盘输入处理、状态渲染（CSS Grid）
- `src/game/gameLogic.js`：核心游戏逻辑，包含方向控制校验、食物生成、碰撞判定、状态转换

## 实现范围

### 源码文件

| 文件 | 职责 |
|------|------|
| `src/game/gameLogic.js` | 游戏核心逻辑：方向控制、掉头校验、食物随机生成、撞墙/撞自身判定、单步状态推进、状态重置 |
| `src/components/SnakeGame.jsx` | React 游戏组件：游戏循环、键盘输入（方向键/WASD）、CSS Grid 渲染、开始/重新开始控制 |
| `src/components/SnakeGame.css` | 游戏组件样式 |
| `src/App.jsx` | 应用入口组件 |
| `src/App.css` | 应用样式 |
| `src/main.jsx` | React 挂载入口 |
| `src/index.css` | 全局样式 |
| `index.html` | HTML 入口 |
| `vite.config.js` | Vite 配置 |
| `vitest.config.js` | Vitest 测试配置 |
| `package.json` | 项目依赖与脚本 |
| `README.md` | 项目说明 |

### 测试文件

| 文件 | 覆盖范围 |
|------|----------|
| `tests/gameLogic.test.js` | 21 个单元测试，覆盖方向校验、食物生成、撞墙/撞自身判定、吃食物增长、状态重置等核心规则 |

## 需求覆盖与验收条件对照

### AC-01：蛇按方向输入移动且不可直接掉头

- **实现**：`handleDirectionInput` 函数使用 `isValidDirectionChange` 校验方向变更，拒绝与当前方向互为反向的输入；游戏循环通过 `setInterval` 每 150ms 执行 `step` 推进蛇移动
- **单元测试**：`isValidDirectionChange` 拒绝反向掉头、接受有效方向、拒绝无效输入；`handleDirectionInput` 接受有效方向、拒绝掉头、游戏结束后忽略输入
- **状态**：逻辑已实现，单元测试通过

### AC-02：蛇吃到食物后增长且分数增加

- **实现**：`step` 函数检测蛇头与食物位置重合时，蛇身增长一节（不去除尾节）、分数 +1、调用 `generateFood` 在空位生成新食物
- **单元测试**：验证吃食物后蛇身长度 +1、分数 +1、新食物不在蛇身上
- **状态**：逻辑已实现，单元测试通过

### AC-03：撞墙或撞自身时游戏结束并显示最终分数

- **实现**：`step` 函数在每步移动后检查 `isWallCollision`（蛇头越出边界）和 `isSelfCollision`（蛇头与蛇身重叠），满足条件时设置 `gameOver = true`；UI 在游戏结束面板显示最终分数
- **单元测试**：撞墙场景（蛇头到边界外）、撞自身场景（蛇头移到蛇身位置）均返回正确事件和 gameOver 状态
- **状态**：逻辑已实现，单元测试通过

### AC-04：游戏结束后可重新开始

- **实现**：`resetGame` 函数重置全部状态（蛇恢复初始长度与位置、分数归零、食物重新生成）；UI 提供"重新开始"按钮调用该函数
- **单元测试**：验证重置后分数为 0、gameOver 为 false、蛇恢复初始状态
- **状态**：逻辑已实现，单元测试通过

## 开发验证证据

### 单元测试

- **命令**：`npm test`
- **工作目录**：项目根目录
- **结果**：21 passed (21)
- **退出码**：0
- **覆盖范围**：方向校验（反向掉头、有效方向、无效输入）、食物生成（不在蛇身、满网格返回 null）、撞墙判定、撞自身判定、初始状态、正常移动、吃食物增长、撞墙结束、撞自身结束、游戏结束后 noop、方向输入处理、状态重置

### 生产构建

- **命令**：`npm run build`
- **工作目录**：项目根目录
- **结果**：31 modules transformed，构建成功
- **退出码**：0
- **产物**：`dist/index.html` (0.40 kB)、`dist/assets/index-COJ55S7v.css` (1.33 kB)、`dist/assets/index-DS1QHSWv.js` (147.13 kB)

### 前端预览

- **开发服务器**：`npm run dev`，运行在 `http://localhost:5173/`
- **用途**：提供 QA 阶段浏览器验收入口

## 遗留风险

- 浏览器交互验收（键盘输入响应、视觉渲染、开始/重新开始按钮点击闭环）由 QA 阶段执行，本阶段不代替 QA 出具通过证据
- 游戏速度固定为 150ms/步，需求未规定难度分级，当前为合理默认值
