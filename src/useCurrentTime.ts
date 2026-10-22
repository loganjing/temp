import { useEffect, useState } from 'react'

/**
 * 轮询间隔（毫秒）。取值小于 1000ms，使显示值在真实秒边界后很快刷新，
 * 保证秒值变化可被观察到，并且与本地系统时间的偏差远小于 1 秒。
 */
export const TICK_INTERVAL_MS = 250

/**
 * 返回持续跟随本地系统时间的当前时刻；组件卸载时停止计时器。
 */
export function useCurrentTime(intervalMs: number = TICK_INTERVAL_MS): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    setNow(new Date())
    const timer = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])

  return now
}