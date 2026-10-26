/**
 * 贪吃蛇游戏核心逻辑
 * 将游戏规则与 UI 渲染分离，便于单元测试。
 */

export const GRID_SIZE = 20;
export const INITIAL_SNAKE = [
  { x: 10, y: 10 },
  { x: 9, y: 10 },
  { x: 8, y: 10 },
];
export const INITIAL_DIRECTION = { x: 1, y: 0 };
export const GAME_SPEED = 150;

/**
 * 方向常量
 */
export const DIRECTIONS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

/**
 * 判断两个方向是否互为反向
 */
export function isOppositeDirection(current, next) {
  return current.x + next.x === 0 && current.y + next.y === 0;
}

/**
 * 判断方向变更是否有效（不能直接反向掉头）
 */
export function isValidDirectionChange(current, next) {
  if (!next || next.x === undefined || next.y === undefined) return false;
  if (next.x === 0 && next.y === 0) return false;
  return !isOppositeDirection(current, next);
}

/**
 * 在网格内生成随机食物位置，避开蛇身占据的格子
 */
export function generateFood(snake, gridSize = GRID_SIZE) {
  const occupied = new Set(snake.map((s) => `${s.x},${s.y}`));
  const available = [];
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (!occupied.has(`${x},${y}`)) {
        available.push({ x, y });
      }
    }
  }
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * 创建初始游戏状态
 */
export function createInitialState(gridSize = GRID_SIZE) {
  const snake = INITIAL_SNAKE.map((s) => ({ ...s }));
  const food = generateFood(snake, gridSize);
  return {
    snake,
    food,
    direction: { ...INITIAL_DIRECTION },
    nextDirection: { ...INITIAL_DIRECTION },
    score: 0,
    gameOver: false,
    gridSize,
  };
}

/**
 * 判断蛇头是否撞墙（越出边界）
 */
export function isWallCollision(head, gridSize = GRID_SIZE) {
  return head.x < 0 || head.x >= gridSize || head.y < 0 || head.y >= gridSize;
}

/**
 * 判断蛇头是否撞到蛇身
 */
export function isSelfCollision(head, snake) {
  // 检查蛇头是否与蛇身（不含蛇头本身，因为蛇头是新位置）重叠
  for (let i = 0; i < snake.length; i++) {
    if (snake[i].x === head.x && snake[i].y === head.y) {
      return true;
    }
  }
  return false;
}

/**
 * 执行一步游戏逻辑
 * 返回新的游戏状态和事件信息
 */
export function step(state) {
  if (state.gameOver) return { state, event: 'noop' };

  // 应用待生效方向
  const direction = state.nextDirection;
  const head = state.snake[0];
  const newHead = { x: head.x + direction.x, y: head.y + direction.y };

  // 撞墙判定
  if (isWallCollision(newHead, state.gridSize)) {
    return {
      state: { ...state, gameOver: true, direction },
      event: 'wall_collision',
    };
  }

  // 判断是否吃到食物
  const ateFood = state.food && newHead.x === state.food.x && newHead.y === state.food.y;

  // 构建新蛇身
  let newSnake;
  if (ateFood) {
    // 吃到食物：蛇头加到前面，蛇尾不去除（增长一节）
    newSnake = [newHead, ...state.snake];
  } else {
    // 未吃到食物：蛇头加到前面，蛇尾去除
    newSnake = [newHead, ...state.snake.slice(0, -1)];
  }

  // 撞自身判定（在蛇移动后检查）
  // 注意：如果没吃到食物，蛇尾最后一节已经移走，所以需要检查移动后的蛇身
  if (isSelfCollision(newHead, newSnake.slice(1))) {
    return {
      state: { ...state, gameOver: true, direction, snake: newSnake },
      event: 'self_collision',
    };
  }

  // 生成新食物
  const newFood = ateFood ? generateFood(newSnake, state.gridSize) : state.food;
  const newScore = ateFood ? state.score + 1 : state.score;

  return {
    state: {
      ...state,
      snake: newSnake,
      food: newFood,
      direction,
      score: newScore,
      gameOver: false,
    },
    event: ateFood ? 'ate_food' : 'move',
  };
}

/**
 * 处理方向输入
 * 如果方向有效（不反向掉头），更新 nextDirection
 */
export function handleDirectionInput(state, newDirection) {
  if (state.gameOver) return state;
  if (!isValidDirectionChange(state.direction, newDirection)) return state;
  return { ...state, nextDirection: newDirection };
}

/**
 * 重置游戏到初始状态
 */
export function resetGame(gridSize = GRID_SIZE) {
  return createInitialState(gridSize);
}
