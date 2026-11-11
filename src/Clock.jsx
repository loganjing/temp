import { useState, useEffect } from 'react'
import { formatTime } from './formatTime.js'
import './Clock.css'

export default function Clock() {
  const [time, setTime] = useState(() => formatTime(new Date()))

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(formatTime(new Date()))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <main className="clock-container">
      <div className="clock-display" aria-live="polite" aria-label="当前时间">
        {time}
      </div>
    </main>
  )
}
