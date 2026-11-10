import { useEffect, useState } from 'react'
import './App.css'

/** 将两位以内整数补零为固定两位字符串 */
function padTwo(num: number): string {
  return num.toString().padStart(2, '0')
}

/** 从 Date 提取 HH:MM:SS 格式字符串 */
function formatTime(date: Date): string {
  return `${padTwo(date.getHours())}:${padTwo(date.getMinutes())}:${padTwo(date.getSeconds())}`
}

function App() {
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="clock-page">
      <div className="clock-display" aria-live="polite" aria-atomic="true">
        {formatTime(time)}
      </div>
    </div>
  )
}

export default App
