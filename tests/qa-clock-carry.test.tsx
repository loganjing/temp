import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../src/App'

/**
 * QA 独立验证：AC-01 的进位条件用可控（模拟）时钟覆盖。
 * 真实时钟无法在有限时间内稳定观察到整点、跨日边界，改用
 * `vi.setSystemTime` + `vi.advanceTimersByTime` 驱动页面渲染，
 * 使边界时刻可复现，不依赖真实时间流逝。
 */

function readDisplay(): string {
  return screen.getByTestId('clock-display').textContent ?? ''
}

function renderAt(date: Date): void {
  vi.setSystemTime(date)
  render(<App />)
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('QA AC-01 进位验证（模拟时钟）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('秒 59 进位到下一分钟的 00，分同步进位（09:58:59 → 09:59:00）', () => {
    renderAt(new Date(2026, 0, 15, 9, 58, 59, 0))
    expect(readDisplay()).toBe('09:58:59')

    advance(1000)

    expect(readDisplay()).toBe('09:59:00')
  })

  it('分 59 与秒 59 同时进位到下一小时的整点（09:59:59 → 10:00:00）', () => {
    renderAt(new Date(2026, 0, 15, 9, 59, 59, 0))
    expect(readDisplay()).toBe('09:59:59')

    advance(1000)

    expect(readDisplay()).toBe('10:00:00')
  })

  it('跨日进位：23:59:59 → 次日 00:00:00', () => {
    renderAt(new Date(2026, 0, 15, 23, 59, 59, 0))
    expect(readDisplay()).toBe('23:59:59')

    advance(1000)

    expect(readDisplay()).toBe('00:00:00')
  })

  it('连续推进后仍与模拟时钟逐秒一致，且始终两位补足', () => {
    renderAt(new Date(2026, 0, 15, 9, 5, 7, 0))
    expect(readDisplay()).toBe('09:05:07')

    advance(3000)

    expect(readDisplay()).toBe('09:05:10')
  })
})