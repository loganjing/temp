import { useEffect, useState } from 'react';
import { delayToNextSecond, formatClock } from '../lib/clock';

/**
 * 实时时钟 hook：返回当前设备本地时间（HH:MM:SS，24 小时制）。
 *
 * - 挂载时立即读取一次设备时间，保证打开页面即可见当前时间；
 * - 之后按“距下一秒边界”的延时链式调度，每次回调都重新读取设备时间
 *   而非累加计数，定时器漂移不会引入显示偏差；
 * - 监听 visibilitychange：页面恢复可见时立即重读一次并重新对齐秒边界，
 *   规避后台标签页定时器节流造成的显示滞后。
 */
export function useClock(): string {
  const [time, setTime] = useState(() => formatClock(new Date(Date.now())));

  useEffect(() => {
    let timeoutId: number | undefined;
    let disposed = false;

    const readNow = () => {
      setTime(formatClock(new Date(Date.now())));
    };

    const scheduleNext = () => {
      const delay = delayToNextSecond(Date.now());
      timeoutId = window.setTimeout(() => {
        if (disposed) {
          return;
        }
        readNow();
        scheduleNext();
      }, delay);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      readNow();
      scheduleNext();
    };

    readNow();
    scheduleNext();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return time;
}

export default useClock;
