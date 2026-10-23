import React, { useState, useEffect } from 'react'
import './Clock.css'

/**
 * 格式化时间为 HH:MM:SS
 * @param {Date} date
 * @returns {string}
 */
export function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export default function Clock() {
  const [time, setTime] = useState(() => formatTime(new Date()))

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(formatTime(new Date()))
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <div className="clock-container">
      <h1 className="clock-title">实时时钟</h1>
      <div className="clock-display" aria-live="polite" aria-atomic="true">
        {time}
      </div>
    </div>
  )
}
