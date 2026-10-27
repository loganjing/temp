import { describe, it, expect } from 'vitest'
import {
  createInitialSnake,
  createInitialState,
  generateFood,
  isValidDirectionChange,
  tick,
  DIRECTIONS,
  DEFAULT_CONFIG,
} from '../src/game/gameLogic.js'

describe('createInitialSnake', () => {
  it('返回指定长度的蛇身，蛇头在网格中央', () => {
    const snake = createInitialSnake(20, 20, 3)
    expect(snake).toHaveLength(3)
    expect(snake[0]).toEqual({ x: 10, y: 10 })
    expect(snake[1]).toEqual({ x: 9, y: 10 })
    expect(snake[2]).toEqual({ x: 8, y: 10 })
  })
})

describe('generateFood', () => {
  it('在空单元格中生成食物', () => {
    const snake = [{ x: 5, y: 5 }]
    const rng = () => 0.5
    const food = generateFood(snake, 10, 10, rng)
    expect(food).not.toBeNull()
    expect(food.x).toBeGreaterThanOrEqual(0)
    expect(food.x).toBeLessThan(10)
    expect(food.y).toBeGreaterThanOrEqual(0)
    expect(food.y).toBeLessThan(10)
    // 食物不应在蛇身上
    expect(snake.some((s) => s.x === food.x && s.y === food.y)).toBe(false)
  })

  it('网格已满时返回 null', () => {
    const snake = []
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        snake.push({ x, y })
      }
    }
    const food = generateFood(snake, 3, 3)
    expect(food).toBeNull()
  })

  it('确定性随机：相同种子产生相同食物', () => {
    const snake = [{ x: 0, y: 0 }]
    const rng1 = () => 0.3
    const rng2 = () => 0.3
    const food1 = generateFood(snake, 10, 10, rng1)
    const food2 = generateFood(snake, 10, 10, rng2)
    expect(food1).toEqual(food2)
  })
})

describe('isValidDirectionChange', () => {
  it('禁止直接反向', () => {
    expect(isValidDirectionChange('RIGHT', 'LEFT')).toBe(false)
    expect(isValidDirectionChange('LEFT', 'RIGHT')).toBe(false)
    expect(isValidDirectionChange('UP', 'DOWN')).toBe(false)
    expect(isValidDirectionChange('DOWN', 'UP')).toBe(false)
  })

  it('允许 90 度转向', () => {
    expect(isValidDirectionChange('RIGHT', 'UP')).toBe(true)
    expect(isValidDirectionChange('RIGHT', 'DOWN')).toBe(true)
    expect(isValidDirectionChange('UP', 'LEFT')).toBe(true)
    expect(isValidDirectionChange('UP', 'RIGHT')).toBe(true)
  })

  it('相同方向返回 false', () => {
    expect(isValidDirectionChange('RIGHT', 'RIGHT')).toBe(false)
  })

  it('无效方向返回 false', () => {
    expect(isValidDirectionChange('RIGHT', 'INVALID')).toBe(false)
  })
})

describe('tick', () => {
  it('正常移动：蛇头前进一格，蛇尾移除，长度不变', () => {
    const state = {
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 3, y: 5 },
      ],
      food: { x: 10, y: 10 },
      direction: 'RIGHT',
      cols: 20,
      rows: 20,
      score: 0,
      status: 'running',
    }
    const result = tick(state)
    expect(result.snake).toHaveLength(3)
    expect(result.snake[0]).toEqual({ x: 6, y: 5 })
    expect(result.snake[2]).toEqual({ x: 4, y: 5 })
    expect(result.score).toBe(0)
    expect(result.status).toBe('running')
  })

  it('进食：蛇头到达食物位置，蛇身增长，分数 +1', () => {
    const state = {
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 3, y: 5 },
      ],
      food: { x: 6, y: 5 },
      direction: 'RIGHT',
      cols: 20,
      rows: 20,
      score: 0,
      status: 'running',
    }
    // 使用确定性 rng 让食物生成在固定位置
    const rng = () => 0.0
    const result = tick(state, rng)
    expect(result.snake).toHaveLength(4)
    expect(result.snake[0]).toEqual({ x: 6, y: 5 })
    expect(result.score).toBe(1)
    expect(result.status).toBe('running')
    // 食物应重新生成到新位置
    expect(result.food).not.toEqual({ x: 6, y: 5 })
  })

  it('撞墙：蛇头超出右边界时游戏结束', () => {
    const state = {
      snake: [{ x: 19, y: 5 }],
      food: { x: 10, y: 10 },
      direction: 'RIGHT',
      cols: 20,
      rows: 20,
      score: 3,
      status: 'running',
    }
    const result = tick(state)
    expect(result.status).toBe('game-over')
    expect(result.score).toBe(3)
  })

  it('撞墙：蛇头超出左边界时游戏结束', () => {
    const state = {
      snake: [{ x: 0, y: 5 }],
      food: { x: 10, y: 10 },
      direction: 'LEFT',
      cols: 20,
      rows: 20,
      score: 1,
      status: 'running',
    }
    const result = tick(state)
    expect(result.status).toBe('game-over')
  })

  it('撞墙：蛇头超出上边界时游戏结束', () => {
    const state = {
      snake: [{ x: 5, y: 0 }],
      food: { x: 10, y: 10 },
      direction: 'UP',
      cols: 20,
      rows: 20,
      score: 0,
      status: 'running',
    }
    const result = tick(state)
    expect(result.status).toBe('game-over')
  })

  it('撞墙：蛇头超出下边界时游戏结束', () => {
    const state = {
      snake: [{ x: 5, y: 19 }],
      food: { x: 10, y: 10 },
      direction: 'DOWN',
      cols: 20,
      rows: 20,
      score: 0,
      status: 'running',
    }
    const result = tick(state)
    expect(result.status).toBe('game-over')
  })

  it('撞自身：蛇头碰到蛇身时游戏结束', () => {
    // 蛇头 {4,5} 向右移动到 {5,5}，{5,5} 是蛇身第二节（非尾节），碰撞
    const state = {
      snake: [
        { x: 4, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
      ],
      food: { x: 15, y: 15 },
      direction: 'RIGHT',
      cols: 20,
      rows: 20,
      score: 0,
      status: 'running',
    }
    const result = tick(state)
    expect(result.status).toBe('game-over')
  })

  it('不撞自身：蛇头移动到当前尾节位置不视为碰撞（尾节同 tick 移除）', () => {
    // 蛇头 {2,4} 向下移动到 {2,5}，{2,5} 是当前尾节，尾节在同一 tick 移除，不碰撞
    const state = {
      snake: [
        { x: 2, y: 4 },
        { x: 3, y: 4 },
        { x: 3, y: 5 },
        { x: 2, y: 5 },
      ],
      food: { x: 15, y: 15 },
      direction: 'DOWN',
      cols: 20,
      rows: 20,
      score: 0,
      status: 'running',
    }
    const result = tick(state)
    expect(result.status).toBe('running')
    expect(result.snake[0]).toEqual({ x: 2, y: 5 })
    expect(result.snake).toHaveLength(4)
  })

  it('网格占满时进食后游戏以胜利结束', () => {
    // 3x3 网格，蛇占 8 格，蛇头 {1,0} 向下移动到 {1,1} 吃食物
    const snake = [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 0, y: 2 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
    ]
    const state = {
      snake,
      food: { x: 1, y: 1 },
      direction: 'DOWN',
      cols: 3,
      rows: 3,
      score: 7,
      status: 'running',
    }
    const result = tick(state)
    expect(result.snake).toHaveLength(9)
    expect(result.score).toBe(8)
    expect(result.status).toBe('game-over')
  })

  it('tick 不修改原始状态（不可变）', () => {
    const originalSnake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
    ]
    const state = {
      snake: originalSnake,
      food: { x: 10, y: 10 },
      direction: 'RIGHT',
      cols: 20,
      rows: 20,
      score: 0,
      status: 'running',
    }
    tick(state)
    expect(state.snake).toBe(originalSnake)
    expect(state.snake).toHaveLength(2)
    expect(state.score).toBe(0)
  })
})

describe('createInitialState', () => {
  it('返回有效初始状态', () => {
    const state = createInitialState()
    expect(state.snake.length).toBe(DEFAULT_CONFIG.initialSnakeLength)
    expect(state.direction).toBe(DEFAULT_CONFIG.initialDirection)
    expect(state.score).toBe(0)
    expect(state.status).toBe('running')
    expect(state.cols).toBe(DEFAULT_CONFIG.cols)
    expect(state.rows).toBe(DEFAULT_CONFIG.rows)
    // 食物不在蛇身上
    expect(state.snake.some((s) => s.x === state.food.x && s.y === state.food.y)).toBe(false)
  })

  it('支持配置覆盖', () => {
    const state = createInitialState({ cols: 10, rows: 10, initialSnakeLength: 2 })
    expect(state.cols).toBe(10)
    expect(state.rows).toBe(10)
    expect(state.snake).toHaveLength(2)
  })
})
