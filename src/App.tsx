import { useCallback } from 'react';
import { useSnakeGame } from './hooks/useSnakeGame';

export default function App() {
  const { score, gameState, canvasRef, restart } = useSnakeGame();

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
      <p className="hint">使用方向键 ↑ ↓ ← → 控制蛇的移动方向</p>
    </div>
  );
}
