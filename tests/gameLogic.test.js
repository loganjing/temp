import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  step,
  handleDirectionInput,
  isOppositeDirection,
  isValidDirectionChange,
  generateFood,
  isWallCollision,
  isSelfCollision,
  resetGame,
  DIRECTIONS,
  INITIAL_DIRECTION,
  INITIAL_SNAKE,
  GRID_SIZE,
} from '../src/game/gameLogic.js'

describe('isOppositeDirection', () => {
  it('返回 true 当两个方向互为反向', () => {
    expect(isOppositeDirection(DIRECTIONS.UP, DIRECTIONS.DOWN)).toBe(true)
    expect(isOppositeDirection(DIRECTIONS.LEFT, DIRECTIONS.RIGHT)).toBe(true)
  })

  it('返回 false 当两个方向不互为反向', () => {
    expect(isOppositeDirection(DIRECTIONS.UP, DIRECTIONS.UP)).toBe(false)
    expect(isOppositeDirection(DIRECTIONS.UP, DIRECTIONS.LEFT)).toBe(false)
  })
})

describe('isValidDirectionChange', () => {
  it('拒绝直接反向掉头', () => {
    expect(isValidDirectionChange(DIRECTIONS.RIGHT, DIRECTIONS.LEFT)).toBe(false)
    expect(isValidDirectionChange(DIRECTIONS.UP, DIRECTIONS.DOWN)).toBe(false)
  })

  it('接受非反向方向', () => {
    expect(isValidDirectionChange(DIRECTIONS.RIGHT, DIRECTIONS.UP)).toBe(true)
    expect(isValidDirectionChange(DIRECTIONS.RIGHT, DIRECTIONS.DOWN)).toBe(true)
    expect(isValidDirectionChange(DIRECTIONS.RIGHT, DIRECTIONS.RIGHT)).toBe(true)
  })

  it('拒绝无效输入', () => {
    expect(isValidDirectionChange(DIRECTIONS.RIGHT, null)).toBe(false)
    expect(isValidDirectionChange(DIRECTIONS.RIGHT, { x: 0, y: 0 })).toBe(false)
    expect(isValidDirectionChange(DIRECTIONS.RIGHT, {})).toBe(false)
  })
})

describe('generateFood', () => {
  it('生成食物位置不在蛇身上', () => {
    const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }]
    const food = generateFood(snake)
    expect(food).not.toBeNull()
    const onSnake = snake.some((s) => s.x === food.x && s.y === food.y)
    expect(onSnake).toBe(false)
  })

  it('蛇占满网格时返回 null', () => {
    const fullSnake = []
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        fullSnake.push({ x, y })
      }
    }
    expect(generateFood(fullSnake)).toBeNull()
  })
})

describe('isWallCollision', () => {
  it('检测越界', () => {
    expect(isWallCollision({ x: -1, y: 0 })).toBe(true)
    expect(isWallCollision({ x: 0, y: -1 })).toBe(true)
    expect(isWallCollision({ x: GRID_SIZE, y: 0 })).toBe(true)
    expect(isWallCollision({ x: 0, y: GRID_SIZE })).toBe(true)
  })

  it('不越界返回 false', () => {
    expect(isWallCollision({ x: 0, y: 0 })).toBe(false)
    expect(isWallCollision({ x: GRID_SIZE - 1, y: GRID_SIZE - 1 })).toBe(false)
  })
})

describe('isSelfCollision', () => {
  it('检测蛇头与蛇身重叠', () => {
    const snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ]
    expect(isSelfCollision({ x: 4, y: 5 }, snake)).toBe(true)
    expect(isSelfCollision({ x: 6, y: 5 }, snake)).toBe(false)
  })
})

describe('createInitialState', () => {
  it('初始状态正确', () => {
    const state = createInitialState()
    expect(state.snake).toEqual(INITIAL_SNAKE)
    expect(state.direction).toEqual(INITIAL_DIRECTION)
    expect(state.nextDirection).toEqual(INITIAL_DIRECTION)
    expect(state.score).toBe(0)
    expect(state.gameOver).toBe(false)
    expect(state.gridSize).toBe(GRID_SIZE)
  })

  it('初始食物不在蛇身上', () => {
    const state = createInitialState()
    const onSnake = state.snake.some((s) => s.x === state.food.x && s.y === state.food.y)
    expect(onSnake).toBe(false)
  })
})

describe('step - 正常移动', () => {
  it('蛇向右移动一格，不增长，分数不变', () => {
    const state = createInitialState()
    const initialLength = state.snake.length
    const result = step(state)
    expect(result.event).toBe('move')
    expect(result.state.snake.length).toBe(initialLength)
    expect(result.state.score).toBe(0)
    expect(result.state.snake[0]).toEqual({ x: 11, y: 10 })
  })
})

describe('step - 吃食物增长', () => {
  it('蛇头到达食物位置时增长一节、分数+1、新食物生成', () => {
    const state = createInitialState()
    // 把食物放到蛇头正前方
    const head = state.snake[0]
    state.food = { x: head.x + 1, y: head.y }
    const initialLength = state.snake.length
    const result = step(state)
    expect(result.event).toBe('ate_food')
    expect(result.state.snake.length).toBe(initialLength + 1)
    expect(result.state.score).toBe(1)
    // 新食物不在蛇身上
    const onSnake = result.state.snake.some(
      (s) => s.x === result.state.food.x && s.y === result.state.food.y
    )
    expect(onSnake).toBe(false)
  })
})

describe('step - 撞墙', () => {
  it('蛇头越出边界时游戏结束', () => {
    const state = createInitialState()
    // 把蛇放到右边界
    state.snake = [{ x: GRID_SIZE - 1, y: 10 }]
    state.food = { x: 0, y: 0 }
    const result = step(state)
    expect(result.event).toBe('wall_collision')
    expect(result.state.gameOver).toBe(true)
  })
})

describe('step - 撞自身', () => {
  it('蛇头移动到蛇身位置时游戏结束', () => {
    const state = createInitialState()
    // 构造一个会撞自身的场景
    // 蛇身: (5,5)->(6,5)->(6,6), 方向向上, 下一步到(5,4)不撞自身
    // 换一个: 蛇头(5,5), 身体(4,5)(4,6)(5,6), 方向向上时下一步(5,4)安全
    // 用更直接的: 蛇头在(5,5), 蛇身(4,5)(3,5), 方向向下然后左转形成环形
    // 简单场景: 长4节蛇, 让它掉头走回去
    state.snake = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 5 },
    ]
    state.direction = { x: 0, y: 1 } // 向下
    state.nextDirection = { x: 0, y: 1 }
    state.food = { x: 0, y: 0 }
    // 蛇头(5,5)向下移到(5,6), (5,6)是蛇身第二节
    const result = step(state)
    expect(result.event).toBe('self_collision')
    expect(result.state.gameOver).toBe(true)
  })
})

describe('step - 游戏结束后不再移动', () => {
  it('gameOver 状态下 step 返回 noop', () => {
    const state = createInitialState()
    state.gameOver = true
    const result = step(state)
    expect(result.event).toBe('noop')
    expect(result.state).toBe(state)
  })
})

describe('handleDirectionInput', () => {
  it('接受有效方向变更', () => {
    const state = createInitialState()
    const newState = handleDirectionInput(state, DIRECTIONS.UP)
    expect(newState.nextDirection).toEqual(DIRECTIONS.UP)
  })

  it('拒绝反向掉头', () => {
    const state = createInitialState()
    // 初始方向是向右, 尝试向左
    const newState = handleDirectionInput(state, DIRECTIONS.LEFT)
    expect(newState.nextDirection).toEqual(INITIAL_DIRECTION) // 不变
  })

  it('游戏结束后忽略方向输入', () => {
    const state = createInitialState()
    state.gameOver = true
    const newState = handleDirectionInput(state, DIRECTIONS.UP)
    expect(newState).toBe(state)
  })
})

describe('resetGame', () => {
  it('重置后状态回到初始值', () => {
    const state = createInitialState()
    state.score = 10
    state.gameOver = true
    const reset = resetGame()
    expect(reset.score).toBe(0)
    expect(reset.gameOver).toBe(false)
    expect(reset.snake).toEqual(INITIAL_SNAKE)
    expect(reset.direction).toEqual(INITIAL_DIRECTION)
  })
})
