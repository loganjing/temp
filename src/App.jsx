import { useState, useEffect } from 'react'
import './App.css'

function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
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
