import { useState, useEffect, useRef } from 'react'
import './App.css'

function formatTwoDigits(n) {
  return String(n).padStart(2, '0')
}

function getClockParts(date) {
  return {
    hours: formatTwoDigits(date.getHours()),
    minutes: formatTwoDigits(date.getMinutes()),
    seconds: formatTwoDigits(date.getSeconds()),
  }
}

export default function App() {
  const [time, setTime] = useState(() => getClockParts(new Date()))
  const timerRef = useRef(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTime(getClockParts(new Date()))
    }, 1000)
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  return (
    <main className="clock-page">
      <div className="clock-display" aria-live="polite" aria-atomic="true">
        {time.hours}:{time.minutes}:{time.seconds}
      </div>
    </main>
  )
}
