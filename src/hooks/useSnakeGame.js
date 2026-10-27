import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createInitialState,
  tick,
  isValidDirectionChange,
  generateFood,
  DEFAULT_CONFIG,
} from '../game/gameLogic.js'

/**
 * 贪吃蛇游戏 Hook
 *
 * 管理：蛇身坐标、食物、方向、分数、游戏状态、方向输入队列和游戏循环。
 *
 * 测试控制入口（仅测试环境启用）：
 * - 当 enableTestHooks 为 true 时，在 window.__snakeGame 暴露以下接口：
 *   - getState(): 获取当前完整游戏状态快照
 *   - step(): 手动执行一个 tick（不依赖定时器）
 *   - setDirection(dir): 设置方向
 *   - setFood(x, y): 确定性地设置食物位置（预置验收场景用）
 *   - setSnake(coords): 确定性地设置蛇身坐标
 *   - reset(): 重置游戏到初始状态
 *   - pauseAutoTick() / resumeAutoTick(): 暂停/恢复自动定时器
 *
 * @param {object} [options]
 * @param {boolean} [options.enableTestHooks] - 是否启用测试控制入口
 * @param {object} [options.config] - 游戏配置覆盖
 * @returns {object} { snake, food, direction, score, status, reset, handleDirectionChange }
 */
export function useSnakeGame({ enableTestHooks = false, config } = {}) {
  const [state, setState] = useState(() => createInitialState(config))
  const directionQueueRef = useRef([])
  const intervalRef = useRef(null)
  const stateRef = useRef(state)
  const testHooksRef = useRef(enableTestHooks)
  const pausedRef = useRef(false)

  // 同步 ref 以在定时器回调中读取最新状态
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const doTick = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'running') return prev
      // 从队列消费一个合法方向
      let { direction } = prev
      const queue = directionQueueRef.current
      while (queue.length > 0) {
        const next = queue.shift()
        if (isValidDirectionChange(direction, next)) {
          direction = next
          break
        }
      }
      return tick({ ...prev, direction })
    })
  }, [])

  const startAutoTick = useCallback(() => {
    if (intervalRef.current) return
    const tickInterval = (config && config.tickInterval) || DEFAULT_CONFIG.tickInterval
    intervalRef.current = setInterval(() => {
      if (pausedRef.current) return
      doTick()
    }, tickInterval)
  }, [doTick, config])

  const stopAutoTick = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // 游戏开始时启动自动 tick
  useEffect(() => {
    startAutoTick()
    return () => stopAutoTick()
  }, [startAutoTick, stopAutoTick])

  const reset = useCallback(() => {
    directionQueueRef.current = []
    setState(createInitialState(config))
  }, [config])

  const handleDirectionChange = useCallback((dir) => {
    if (stateRef.current.status !== 'running') return
    directionQueueRef.current.push(dir)
  }, [])

  // 测试控制入口
  useEffect(() => {
    if (!testHooksRef.current || typeof window === 'undefined') return

    window.__snakeGame = {
      getState: () => stateRef.current,
      step: () => doTick(),
      setDirection: (dir) => {
        directionQueueRef.current.push(dir)
      },
      setFood: (x, y) => {
        setState((prev) => ({ ...prev, food: { x, y } }))
      },
      setSnake: (coords) => {
        setState((prev) => ({ ...prev, snake: coords }))
      },
      reset: () => reset(),
      pauseAutoTick: () => {
        pausedRef.current = true
      },
      resumeAutoTick: () => {
        pausedRef.current = false
      },
      // 确定性食物生成辅助：传入蛇身返回下一个食物（使用固定 rng）
      generateDeterministicFood: (snake, cols, rows, seedFn) =>
        generateFood(snake, cols || stateRef.current.cols, rows || stateRef.current.rows, seedFn),
    }

    return () => {
      delete window.__snakeGame
    }
  }, [doTick, reset])

  return {
    snake: state.snake,
    food: state.food,
    direction: state.direction,
    score: state.score,
    status: state.status,
    reset,
    handleDirectionChange,
    cols: state.cols,
    rows: state.rows,
  }
}
