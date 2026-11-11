import { describe, it, expect } from 'vitest'
import { formatTime } from '../src/formatTime.js'

describe('formatTime', () => {
  it('格式化为 HH:MM:SS', () => {
    const date = new Date(2026, 0, 1, 14, 30, 45)
    expect(formatTime(date)).toBe('14:30:45')
  })

  it('对个位数时、分、秒补零', () => {
    const date = new Date(2026, 0, 1, 1, 2, 3)
    expect(formatTime(date)).toBe('01:02:03')
  })

  it('午夜零点显示为 00:00:00', () => {
    const date = new Date(2026, 0, 1, 0, 0, 0)
    expect(formatTime(date)).toBe('00:00:00')
  })

  it('23:59:59 为最大有效值', () => {
    const date = new Date(2026, 0, 1, 23, 59, 59)
    expect(formatTime(date)).toBe('23:59:59')
  })
})
