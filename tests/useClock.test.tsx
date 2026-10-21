// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClock } from '../src/hooks/useClock';

// 显式注册组件清理（vitest 默认不注入全局 afterEach，
// 测试库的自动清理不会生效，组件与 document 监听会跨测试泄漏）。
afterEach(cleanup);

const at = (hours: number, minutes: number, seconds: number, ms = 0): number =>
  new Date(2026, 0, 1, hours, minutes, seconds, ms).getTime();

const setVisibility = (state: DocumentVisibilityState): void => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
};

describe('useClock', () => {
  let nowMs: number;

  beforeEach(() => {
    // 只接管 setTimeout/clearTimeout；设备时间通过 Date.now 的 mock 控制，
    // 以便区分“回调按计划触发”与“显示值来自当次读取的设备时间”。
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    nowMs = at(10, 15, 30, 200);
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('挂载时立即读取一次设备时间（无需等待任何刷新）', () => {
    const { result } = renderHook(() => useClock());
    expect(result.current).toBe('10:15:30');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('跨秒边界时自动更新为最新时间（秒位跳变 30→31→32）', () => {
    const { result } = renderHook(() => useClock());
    expect(result.current).toBe('10:15:30');

    act(() => {
      nowMs = at(10, 15, 31, 0);
      vi.advanceTimersByTime(800); // 触发 10:15:31.000 的秒边界回调
    });
    expect(result.current).toBe('10:15:31');

    act(() => {
      nowMs = at(10, 15, 32, 0);
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe('10:15:32');
  });

  it('每次更新重新读取设备时间而非累加（时间源跳变后显示跟随系统）', () => {
    const { result } = renderHook(() => useClock());
    expect(result.current).toBe('10:15:30');

    act(() => {
      // 定时器按计划在 800ms 处触发，但设备时间已被外部推进到 10:15:39：
      // 若实现为累加计数，这里会显示 10:15:31。
      nowMs = at(10, 15, 39, 100);
      vi.advanceTimersByTime(800);
    });
    expect(result.current).toBe('10:15:39');
  });

  it('页面恢复可见时立即重读时间（消除后台定时器节流滞后）', () => {
    const { result } = renderHook(() => useClock());
    expect(result.current).toBe('10:15:30');

    setVisibility('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe('10:15:30');

    // 后台 10 秒（定时器被节流未触发），设备时间持续前进
    nowMs = at(10, 15, 40, 500);
    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe('10:15:40');
    expect(vi.getTimerCount()).toBe(1); // 已重新对齐秒边界调度
  });

  it('卸载时清理定时器与可见性监听', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { result, unmount } = renderHook(() => useClock());
    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(removeSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );

    act(() => {
      nowMs = at(10, 15, 35, 0);
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe('10:15:30');
  });
});
