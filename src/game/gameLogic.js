/**
 * 贪吃蛇游戏核心逻辑模块
 * 将游戏规则与渲染/运行时驱动分离，便于单元测试和确定性验证。
 */

/** 方向向量定义 */
export const DIRECTIONS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
}

/** 方向反义映射，用于防止直接反向 */
export const OPPOSITE = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
}

/** 默认网格配置 */
export const DEFAULT_CONFIG = {
  cols: 20,
  rows: 20,
  initialSnakeLength: 3,
  initialDirection: 'RIGHT',
  tickInterval: 150,
}

/**
 * 创建初始蛇身坐标数组。
 * 蛇头在索引 0，从网格中央向左排列。
 * @param {number} cols - 网格列数
 * @param {number} rows - 网格行数
 * @param {number} length - 初始蛇身长度
 * @returns {{x:number,y:number}[]} 蛇身坐标数组
 */
export function createInitialSnake(cols, rows, length) {
  const cx = Math.floor(cols / 2)
  const cy = Math.floor(rows / 2)
  const snake = []
  for (let i = 0; i < length; i++) {
    snake.push({ x: cx - i, y: cy })
  }
  return snake
}

/**
 * 在空单元格中随机生成食物坐标。
 * @param {{x:number,y:number}[]} snake - 当前蛇身坐标
 * @param {number} cols - 网格列数
 * @param {number} rows - 网格行数
 * @param {function():number} [rng] - 随机数生成器，默认 Math.random
 * @returns {{x:number,y:number}|null} 食物坐标；网格已满时返回 null
 */
export function generateFood(snake, cols, rows, rng = Math.random) {
  const occupied = new Set(snake.map((s) => `${s.x},${s.y}`))
  const empty = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const key = `${x},${y}`
      if (!occupied.has(key)) {
        empty.push({ x, y })
      }
    }
  }
  if (empty.length === 0) return null
  return empty[Math.floor(rng() * empty.length)]
}

/**
 * 判断新方向是否合法（不能直接反向）。
 * @param {string} current - 当前方向
 * @param {string} requested - 请求方向
 * @returns {boolean}
 */
export function isValidDirectionChange(current, requested) {
  if (!DIRECTIONS[requested]) return false
  if (current === requested) return false
  return OPPOSITE[current] !== requested
}

/**
 * 执行一个游戏 tick 的移动计算。
 * 返回新的游戏状态，不修改输入。
 *
 * @param {object} state - 当前游戏状态
 * @param {{x:number,y:number}[]} state.snake - 蛇身坐标
 * @param {{x:number,y:number}} state.food - 食物坐标
 * @param {string} state.direction - 当前方向
 * @param {number} state.cols - 网格列数
 * @param {number} state.rows - 网格行数
 * @param {number} state.score - 当前分数
 * @param {function():number} [rng] - 食物随机生成器（测试注入用）
 * @returns {object} 新状态 { snake, food, direction, score, status }
 *   status: 'running' | 'game-over'
 */
export function tick(state, rng = Math.random) {
  const { snake, food, direction, cols, rows, score } = state
  const dir = DIRECTIONS[direction]
  const head = snake[0]
  const newHead = { x: head.x + dir.x, y: head.y + dir.y }

  // 撞墙检测
  if (newHead.x < 0 || newHead.x >= cols || newHead.y < 0 || newHead.y >= rows) {
    return {
      ...state,
      status: 'game-over',
    }
  }

  // 撞自身检测（排除当前尾节，因为尾节在同一 tick 移除）
  const bodyToCheck = snake.slice(0, -1)
  const hitSelf = bodyToCheck.some((s) => s.x === newHead.x && s.y === newHead.y)
  if (hitSelf) {
    return {
      ...state,
      status: 'game-over',
    }
  }

  const newSnake = [newHead, ...snake]

  // 进食检测
  if (newHead.x === food.x && newHead.y === food.y) {
    const newFood = generateFood(newSnake, cols, rows, rng)
    const newScore = score + 1
    // 网格已满 → 胜利结束
    if (newFood === null) {
      return {
        snake: newSnake,
        food: { x: -1, y: -1 },
        direction,
        cols,
        rows,
        score: newScore,
        status: 'game-over',
      }
    }
    return {
      snake: newSnake,
      food: newFood,
      direction,
      cols,
      rows,
      score: newScore,
      status: 'running',
    }
  }

  // 未进食：移除尾部，长度不变
  newSnake.pop()
  return {
    snake: newSnake,
    food,
    direction,
    cols,
    rows,
    score,
    status: 'running',
  }
}

/**
 * 创建完整的初始游戏状态。
 * @param {object} [configOverrides] - 配置覆盖
 * @param {function():number} [rng] - 食物随机生成器（测试注入用）
 * @returns {object} 初始游戏状态
 */
export function createInitialState(configOverrides = {}, rng = Math.random) {
  const config = { ...DEFAULT_CONFIG, ...configOverrides }
  const snake = createInitialSnake(config.cols, config.rows, config.initialSnakeLength)
  const food = generateFood(snake, config.cols, config.rows, rng)
  return {
    snake,
    food,
    direction: config.initialDirection,
    cols: config.cols,
    rows: config.rows,
    score: 0,
    status: 'running',
    config,
  }
}
