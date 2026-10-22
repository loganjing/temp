import { useState, useEffect } from 'react'
import './App.css'

/**
 * 将 Date 对象格式化为 HH:MM:SS（24 小时制，两位补零）
 * @param {Date} date
 * @returns {string}
 */
function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

function App() {
  const [time, setTime] = useState(() => formatTime(new Date()))

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(formatTime(new Date()))
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <div className="clock-container">
      <h1 className="clock-time">{time}</h1>
    </div>
  )
}

export default App
