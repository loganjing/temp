# 贪吃蛇游戏（193-snake）

一个基于 React + Vite 的经典贪吃蛇网页游戏。

## 功能

- 方向键（↑↓←→）或 WASD 控制蛇的移动方向
- 吃食物得分，蛇身增长
- 撞墙或撞自身游戏结束，显示最终分数
- 游戏结束后可重新开始

## 快速开始

```bash
npm install
npm run dev
```

浏览器访问 `http://localhost:5173` 即可开始游戏。

## 测试

```bash
npm run test
```

## 构建

```bash
npm run build
```

## 技术栈

- React 18
- Vite
- HTML Canvas 2D API
- Vitest（单元测试）

## 游戏规则

- 蛇在 20×20 网格中移动，初始长度 3 节
- 每个 tick 蛇头沿当前方向前进一格
- 不能直接反向（向右移动时不能立即向左）
- 吃到食物：蛇身 +1，分数 +1，食物重新生成
- 撞墙或撞自身：游戏结束
- 网格占满：胜利结束
