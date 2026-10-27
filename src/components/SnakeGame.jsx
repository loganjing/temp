import { useEffect, useRef } from 'react'
import { useSnakeGame } from '../hooks/useSnakeGame.js'

/** 画布单元格像素大小 */
const CELL_SIZE = 24

/** 颜色配置 */
const COLORS = {
  background: '#1a202c',
  gridLine: '#2d3748',
  snakeHead: '#48bb78',
  snakeBody: '#38a169',
  food: '#f56565',
}

/**
 * 贪吃蛇游戏组件
 *
 * 渲染 Canvas 画布、分数和游戏结束提示。
 * 支持键盘方向控制（↑↓←→ 和 WASD）。
 *
 * @param {object} [props]
 * @param {boolean} [props.enableTestHooks] - 是否启用测试控制入口
 */
export default function SnakeGame({ enableTestHooks = false }) {
  const {
    snake,
    food,
    direction,
    score,
    status,
    reset,
    handleDirectionChange,
    cols,
    rows,
  } = useSnakeGame({ enableTestHooks })

  const canvasRef = useRef(null)

  // 键盘控制
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase()
      const keyMap = {
        arrowup: 'UP',
        arrowdown: 'DOWN',
        arrowleft: 'LEFT',
        arrowright: 'RIGHT',
        w: 'UP',
        s: 'DOWN',
        a: 'LEFT',
        d: 'RIGHT',
      }
      if (keyMap[key]) {
        e.preventDefault()
        handleDirectionChange(keyMap[key])
      }
      // 游戏结束后按空格或回车重新开始
      if (status === 'game-over' && (key === ' ' || key === 'enter')) {
        e.preventDefault()
        reset()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleDirectionChange, status, reset])

  // Canvas 渲染
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = cols * CELL_SIZE
    const h = rows * CELL_SIZE
    canvas.width = w
    canvas.height = h

    // 背景
    ctx.fillStyle = COLORS.background
    ctx.fillRect(0, 0, w, h)

    // 网格线
    ctx.strokeStyle = COLORS.gridLine
    ctx.lineWidth = 1
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath()
      ctx.moveTo(x * CELL_SIZE, 0)
      ctx.lineTo(x * CELL_SIZE, h)
      ctx.stroke()
    }
    for (let y = 0; y <= rows; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * CELL_SIZE)
      ctx.lineTo(w, y * CELL_SIZE)
      ctx.stroke()
    }

    // 食物
    ctx.fillStyle = COLORS.food
    ctx.beginPath()
    ctx.arc(
      food.x * CELL_SIZE + CELL_SIZE / 2,
      food.y * CELL_SIZE + CELL_SIZE / 2,
      CELL_SIZE / 2 - 2,
      0,
      Math.PI * 2,
    )
    ctx.fill()

    // 蛇身
    snake.forEach((segment, index) => {
      ctx.fillStyle = index === 0 ? COLORS.snakeHead : COLORS.snakeBody
      const padding = 1
      ctx.fillRect(
        segment.x * CELL_SIZE + padding,
        segment.y * CELL_SIZE + padding,
        CELL_SIZE - padding * 2,
        CELL_SIZE - padding * 2,
      )
    })
  }, [snake, food, cols, rows])

  return (
    <div className="game-container">
      <div className="game-header">
        <span className="game-title">贪吃蛇</span>
        <span className="game-score">
          分数<span className="game-score-value">{score}</span>
        </span>
      </div>
      <div className="game-canvas-wrapper">
        <canvas ref={canvasRef} className="game-canvas" />
        {status === 'game-over' && (
          <div className="game-over-overlay">
            <div className="game-over-text">游戏结束</div>
            <div className="game-over-score">最终得分：{score}</div>
            <button className="game-restart-btn" onClick={reset}>
              重新开始
            </button>
          </div>
        )}
      </div>
      <div className="game-hint">
        方向键 / WASD 控制方向 · 游戏结束后按空格或回车重新开始
      </div>
    </div>
  )
}
