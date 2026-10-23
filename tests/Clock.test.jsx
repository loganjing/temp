import { describe, it, expect } from 'vitest'
import { formatTime } from '../src/Clock.jsx'

describe('formatTime', () => {
  it('formats a time with all single-digit components with leading zeros', () => {
    const date = new Date(2026, 9, 23, 1, 5, 9)
    expect(formatTime(date)).toBe('01:05:09')
  })

  it('formats a time with all double-digit components without extra padding', () => {
    const date = new Date(2026, 9, 23, 14, 30, 59)
    expect(formatTime(date)).toBe('14:30:59')
  })

  it('formats midnight as 00:00:00', () => {
    const date = new Date(2026, 9, 23, 0, 0, 0)
    expect(formatTime(date)).toBe('00:00:00')
  })

  it('formats 23:59:59 at end of day', () => {
    const date = new Date(2026, 9, 23, 23, 59, 59)
    expect(formatTime(date)).toBe('23:59:59')
  })
})
