# 贪吃蛇游戏

一个基于 React + Vite 的经典贪吃蛇游戏。

## 运行

```bash
npm install
npm run dev      # 开发服务器
npm run build    # 构建产物
npm test         # 单元测试
```

## 操作

- 方向键 ↑↓←→ 或 WASD 控制蛇移动方向
- 蛇不能直接反向掉头
- 吃到食物增长一节，分数 +1
- 撞墙或撞自身游戏结束
- 游戏结束后可点击重新开始

## 架构

- `src/game/gameLogic.js` — 核心游戏逻辑（方向控制、食物生成、碰撞判定、状态转换），与 UI 解耦，可独立单元测试
- `src/components/SnakeGame.jsx` — React 游戏组件，使用 CSS Grid 渲染
- `src/App.jsx` — 应用入口
- `tests/gameLogic.test.js` — 核心逻辑单元测试
