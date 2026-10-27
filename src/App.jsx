import SnakeGame from './components/SnakeGame.jsx'

export default function App() {
  // 开发/测试环境下启用 window.__snakeGame 测试控制入口
  const isDev = import.meta.env.DEV
  return <SnakeGame enableTestHooks={isDev} />
}
