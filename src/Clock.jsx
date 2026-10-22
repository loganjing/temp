import React, { useState, useEffect, useRef } from 'react'

function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export default function Clock() {
  const [time, setTime] = useState(() => formatTime(new Date()))
  const intervalRef = useRef(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTime(formatTime(new Date()))
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
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
