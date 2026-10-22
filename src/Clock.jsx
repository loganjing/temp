import React, { useState, useEffect, useRef, useCallback } from 'react'

/**
 * 实时时钟组件
 *
 * - 页面加载后自动启动，每秒刷新一次
 * - 页面不可见时暂停定时器，恢复可见时立即同步并恢复刷新
 * - 组件卸载时清理定时器
 */
export default function Clock() {
  const [time, setTime] = useState(() => formatTime(new Date()))
  const intervalRef = useRef(null)

  const start = useCallback(() => {
    if (intervalRef.current !== null) return
    // 立即同步到当前时间，避免不可见期间的时间滞后
    setTime(formatTime(new Date()))
    intervalRef.current = setInterval(() => {
      setTime(formatTime(new Date()))
    }, 1000)
  }, [])

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // 页面可见性切换：不可见时暂停，重新可见时恢复
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stop()
      } else {
        start()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [start, stop])

  // 页面加载后自动启动，卸载时清理
  useEffect(() => {
    start()
    return stop
  }, [start, stop])

  return (
    <div className="clock">
      <span className="clock-time" role="timer" aria-live="off">
        {time}
      </span>
    </div>
  )
}

/**
 * 将 Date 格式化为 HH:MM:SS
 */
function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}
