import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createInitialState,
  step,
  handleDirectionInput,
  resetGame,
  DIRECTIONS,
  GAME_SPEED,
} from '../game/gameLogic.js'
import './SnakeGame.css'

const KEY_TO_DIRECTION = {
  ArrowUp: DIRECTIONS.UP,
  ArrowDown: DIRECTIONS.DOWN,
  ArrowLeft: DIRECTIONS.LEFT,
  ArrowRight: DIRECTIONS.RIGHT,
  w: DIRECTIONS.UP,
  s: DIRECTIONS.DOWN,
  a: DIRECTIONS.LEFT,
  d: DIRECTIONS.RIGHT,
}

export default function SnakeGame() {
  const [gameState, setGameState] = useState(() => createInitialState())
  const [isRunning, setIsRunning] = useState(false)
  const directionLockRef = useRef(false)

  // 游戏主循环
  useEffect(() => {
    if (!isRunning || gameState.gameOver) return
    const intervalId = setInterval(() => {
      setGameState((prev) => step(prev).state)
    }, GAME_SPEED)
    return () => clearInterval(intervalId)
  }, [isRunning, gameState.gameOver])

  // 键盘输入处理
  useEffect(() => {
    const handleKeyDown = (e) => {
      const dir = KEY_TO_DIRECTION[e.key]
      if (!dir) return
      e.preventDefault()
      if (gameState.gameOver) return
      setGameState((prev) => handleDirectionInput(prev, dir))
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gameState.gameOver])

  const handleStart = useCallback(() => {
    setGameState(createInitialState())
    setIsRunning(true)
  }, [])

  const handleRestart = useCallback(() => {
    setGameState(resetGame())
    setIsRunning(true)
  }, [])

  const { snake, food, score, gameOver, gridSize } = gameState
  const cellSize = 20
  const boardSize = gridSize * cellSize

  // 构建蛇身格子集合用于渲染
  const snakeSet = new Set(snake.map((s) => `${s.x},${s.y}`))

  return (
    <div className="snake-game">
      <div className="game-header">
        <span className="score-label">分数: {score}</span>
      </div>
      <div
        className="game-board"
        style={{
          width: boardSize,
          height: boardSize,
          gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
        }}
      >
        {Array.from({ length: gridSize * gridSize }, (_, i) => {
          const x = i % gridSize
          const y = Math.floor(i / gridSize)
          const key = `${x},${y}`
          const isSnake = snakeSet.has(key)
          const isHead = snake[0] && snake[0].x === x && snake[0].y === y
          const isFood = food && food.x === x && food.y === y
          let className = 'cell'
          if (isHead) className += ' cell-head'
          else if (isSnake) className += ' cell-body'
          else if (isFood) className += ' cell-food'
          return <div key={i} className={className} />
        })}
      </div>
      <div className="game-controls">
        {!isRunning && !gameOver && (
          <button className="btn btn-start" onClick={handleStart}>
            开始游戏
          </button>
        )}
        {isRunning && !gameOver && (
          <p className="hint">使用方向键 ↑↓←→ 或 WASD 控制方向</p>
        )}
        {gameOver && (
          <div className="game-over-panel">
            <p className="game-over-text">游戏结束</p>
            <p className="final-score">最终分数: {score}</p>
            <button className="btn btn-restart" onClick={handleRestart}>
              重新开始
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
