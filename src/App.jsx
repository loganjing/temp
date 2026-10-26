import { useState, useEffect } from 'react'
import './App.css'

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
    <div className="clock-page">
      <main className="clock-container">
        <h1 className="clock-time" aria-live="polite" aria-label="当前时间">
          {time}
        </h1>
      </main>
    </div>
  )
}

export default App
