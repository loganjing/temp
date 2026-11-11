import { describe, it, expect } from 'vitest'
import { pad, formatTime } from '../src/Clock.jsx'

describe('pad', () => {
  it('单值补零为两位', () => {
    expect(pad(0)).toBe('00')
    expect(pad(5)).toBe('05')
    expect(pad(9)).toBe('09')
  })

  it('两位值保持不变', () => {
    expect(pad(10)).toBe('10')
    expect(pad(59)).toBe('59')
  })
})

describe('formatTime', () => {
  it('从 Date 生成 HH:MM:SS', () => {
    const date = new Date(2026, 0, 1, 9, 5, 3)
    expect(formatTime(date)).toBe('09:05:03')
  })

  it('午时边界正确补零', () => {
    const date = new Date(2026, 0, 1, 0, 0, 0)
    expect(formatTime(date)).toBe('00:00:00')
  })

  it('最大值组合正确', () => {
    const date = new Date(2026, 0, 1, 23, 59, 59)
    expect(formatTime(date)).toBe('23:59:59')
  })
})
