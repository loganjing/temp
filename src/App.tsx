import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CANVAS_SIZE,
  CELL_SIZE,
  GRID_SIZE,
  TICK_INTERVAL,
  changeDirection,
  createInitialState,
  getStateSnapshot,
  setFoodOverride,
  tick,
} from './engine';
import type { Direction, GameState, SnakeState, TestControl } from './engine';

function renderCanvas(
  canvas: HTMLCanvasElement | null,
  state: SnakeState,
): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.strokeStyle = '#f0f0f0';
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL_SIZE, 0);
    ctx.lineTo(i * CELL_SIZE, CANVAS_SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * CELL_SIZE);
    ctx.lineTo(CANVAS_SIZE, i * CELL_SIZE);
    ctx.stroke();
  }

  if (state.food) {
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.arc(
      state.food.x * CELL_SIZE + CELL_SIZE / 2,
      state.food.y * CELL_SIZE + CELL_SIZE / 2,
      CELL_SIZE / 2 - 2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  state.snake.forEach((seg, i) => {
    ctx.fillStyle = i === 0 ? '#2a9d3f' : '#52b788';
    ctx.fillRect(
      seg.x * CELL_SIZE + 1,
      seg.y * CELL_SIZE + 1,
      CELL_SIZE - 2,
      CELL_SIZE - 2,
    );
  });

  if (state.gameState === 'over' || state.gameState === 'won') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const msg = state.gameState === 'won' ? '胜利！' : '游戏结束';
    ctx.fillText(msg, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 20);
    ctx.font = '20px sans-serif';
    ctx.fillText(`得分: ${state.score}`, CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 20);
  }
}

export default function App() {
  const gameRef = useRef<SnakeState>(createInitialState());
  const pausedRef = useRef(false);
  const [score, setScore] = useState(gameRef.current.score);
  const [gameState, setGameState] = useState<GameState>(
    gameRef.current.gameState,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const syncState = useCallback(() => {
    setScore(gameRef.current.score);
    setGameState(gameRef.current.gameState);
  }, []);

  useEffect(() => {
    let rafId: number;
    let lastTick = performance.now();

    const loop = (now: number) => {
      if (!pausedRef.current && gameRef.current.gameState === 'running') {
        const elapsed = now - lastTick;
        if (elapsed >= TICK_INTERVAL) {
          lastTick = now - (elapsed % TICK_INTERVAL);
          gameRef.current = tick(gameRef.current);
          syncState();
        }
      } else {
        lastTick = now;
      }
      renderCanvas(canvasRef.current, gameRef.current);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [syncState]);

  useEffect(() => {
    const keyMap: Record<string, Direction> = {
      ArrowUp: 'UP',
      ArrowDown: 'DOWN',
      ArrowLeft: 'LEFT',
      ArrowRight: 'RIGHT',
      w: 'UP',
      s: 'DOWN',
      a: 'LEFT',
      d: 'RIGHT',
    };
    const handler = (e: KeyboardEvent) => {
      const dir = keyMap[e.key];
      if (dir) {
        e.preventDefault();
        gameRef.current = changeDirection(gameRef.current, dir);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const restart = useCallback(() => {
    gameRef.current = createInitialState();
    pausedRef.current = false;
    syncState();
    renderCanvas(canvasRef.current, gameRef.current);
  }, [syncState]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const testControl: TestControl = {
      step: () => {
        pausedRef.current = true;
        gameRef.current = tick(gameRef.current);
        syncState();
        renderCanvas(canvasRef.current, gameRef.current);
      },
      setFood: (x: number, y: number) => {
        pausedRef.current = true;
        gameRef.current = setFoodOverride(gameRef.current, x, y);
        syncState();
        renderCanvas(canvasRef.current, gameRef.current);
      },
      getState: () => getStateSnapshot(gameRef.current),
    };

    window.__snakeTest = testControl;

    return () => {
      delete window.__snakeTest;
    };
  }, [syncState]);

  const handleRestart = useCallback(() => {
    restart();
  }, [restart]);

  const statusText =
    gameState === 'running'
      ? '进行中'
      : gameState === 'over'
        ? '游戏结束'
        : gameState === 'won'
          ? '胜利'
          : '准备中';

  return (
    <div className="game-container">
      <div className="game-header">
        <span className="score">得分: {score}</span>
        <span className="game-status">{statusText}</span>
      </div>
      <canvas ref={canvasRef} width={400} height={400} />
      <div className="controls">
        {gameState !== 'running' && (
          <button onClick={handleRestart}>
            {gameState === 'idle' ? '开始' : '重新开始'}
          </button>
        )}
      </div>
      <p className="hint">使用方向键 ↑ ↓ ← → 或 WASD 控制蛇的移动方向</p>
    </div>
  );
}
