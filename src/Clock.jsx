import { useState, useEffect } from 'react'
import './Clock.css'

function formatUnit(value) {
  return String(value).padStart(2, '0')
}

export default function Clock() {
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const hours = formatUnit(time.getHours())
  const minutes = formatUnit(time.getMinutes())
  const seconds = formatUnit(time.getSeconds())

  return (
    <div className="clock">
      <div className="clock-digits">
        <span className="clock-unit">
          <span className="clock-value">{hours}</span>
          <span className="clock-label">时</span>
        </span>
        <span className="clock-separator">:</span>
        <span className="clock-unit">
          <span className="clock-value">{minutes}</span>
          <span className="clock-label">分</span>
        </span>
        <span className="clock-separator">:</span>
        <span className="clock-unit">
          <span className="clock-value">{seconds}</span>
          <span className="clock-label">秒</span>
        </span>
      </div>
    </div>
  )
}
