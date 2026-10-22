import { useEffect, useState } from 'react';
import './Clock.css';

/** 将数字补零至两位，例如 8 → "08" */
function padTwo(num: number): string {
  return num.toString().padStart(2, '0');
}

/** 将 Date 格式化为 HH:MM:SS */
function formatTime(date: Date): string {
  const h = padTwo(date.getHours());
  const m = padTwo(date.getMinutes());
  const s = padTwo(date.getSeconds());
  return `${h}:${m}:${s}`;
}

function Clock() {
  const [time, setTime] = useState(() => formatTime(new Date()));

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(formatTime(new Date()));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="clock-container">
      <h1 className="clock-label">实时时钟</h1>
      <div className="clock-time" aria-live="polite" aria-label={`当前时间 ${time}`}>
        {time}
      </div>
    </div>
  );
}

export default Clock;
