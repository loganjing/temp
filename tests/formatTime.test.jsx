import { describe, it, expect } from 'vitest'
import { formatTime } from '../src/Clock.jsx'

describe('formatTime', () => {
  it('应在给定 Date 上输出两位补零的 HH:MM:SS', () => {
    const date = new Date(2026, 9, 27, 14, 5, 9)
    expect(formatTime(date)).toBe('14:05:09')
  })

  it('应在 00:00:00 边界正确输出', () => {
    const date = new Date(2026, 9, 27, 0, 0, 0)
    expect(formatTime(date)).toBe('00:00:00')
  })

  it('应在 23:59:59 边界正确输出', () => {
    const date = new Date(2026, 9, 27, 23, 59, 59)
    expect(formatTime(date)).toBe('23:59:59')
  })
})
