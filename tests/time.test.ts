import { describe, expect, it } from 'vitest'

import { formatTime } from '../src/time'

describe('formatTime', () => {
  it('以两位补足显示时、分、秒，用冒号分隔', () => {
    expect(formatTime(new Date(2026, 0, 15, 9, 5, 7))).toBe('09:05:07')
  })

  it('已满两位的值保持原样', () => {
    expect(formatTime(new Date(2026, 0, 15, 23, 59, 59))).toBe('23:59:59')
  })

  it('零点显示为 00:00:00', () => {
    expect(formatTime(new Date(2026, 0, 15, 0, 0, 0))).toBe('00:00:00')
  })

  it('恰好落在整秒时只显示整秒值', () => {
    expect(formatTime(new Date(2026, 0, 15, 7, 8, 9, 999))).toBe('07:08:09')
  })

  it('秒值 59 进位到下一分钟的 00，分与时同步进位', () => {
    const lastSecond = new Date(2026, 0, 15, 12, 34, 59)
    const nextMinute = new Date(lastSecond.getTime() + 1000)

    expect(formatTime(lastSecond)).toBe('12:34:59')
    expect(formatTime(nextMinute)).toBe('12:35:00')

    const lastMinuteOfDay = new Date(2026, 0, 15, 23, 59, 59)
    expect(formatTime(new Date(lastMinuteOfDay.getTime() + 1000))).toBe('00:00:00')
  })
})