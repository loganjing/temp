import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../src/App'
import { TICK_INTERVAL_MS } from '../src/useCurrentTime'

const DISPLAY = 'clock-display'

function readDisplay(): string {
  const element = screen.getByTestId(DISPLAY)
  return element.textContent ?? ''
}

describe('App', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('打开页面即显示当前本地时间的 HH:MM:SS，无需任何交互', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 9, 5, 7, 0))

    render(<App />)

    expect(readDisplay()).toBe('09:05:07')
  })

  it('显示值随真实时间前进，秒值持续变化', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 9, 5, 7, 0))

    render(<App />)
    expect(readDisplay()).toBe('09:05:07')

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(readDisplay()).toBe('09:05:08')

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(readDisplay()).toBe('09:05:09')
  })

  it('秒值到达 59 后进位为下一分钟的 00，分同步进位', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 12, 34, 59, 0))

    render(<App />)
    expect(readDisplay()).toBe('12:34:59')

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(readDisplay()).toBe('12:35:00')
  })

  it('轮询间隔小于 1 秒，保证秒值变化能被观察到', () => {
    expect(TICK_INTERVAL_MS).toBeLessThan(1000)
    expect(TICK_INTERVAL_MS).toBeGreaterThan(0)
  })

  it('组件卸载后停止刷新计时器', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 9, 5, 7, 0))

    const view = render(<App />)
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    view.unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})