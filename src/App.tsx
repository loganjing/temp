import { formatTime } from './time'
import { useCurrentTime } from './useCurrentTime'

export default function App() {
  const now = useCurrentTime()

  return (
    <main className="clock" aria-label="当前时间">
      <time className="clock__display" data-testid="clock-display" dateTime={now.toISOString()}>
        {formatTime(now)}
      </time>
    </main>
  )
}