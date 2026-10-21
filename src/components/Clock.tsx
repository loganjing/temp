import useClock from '../hooks/useClock';

export default function Clock() {
  const time = useClock();
  return (
    <section className="clock" aria-label={`当前时间 ${time}`}>
      <span className="clock-time">{time}</span>
    </section>
  );
}
