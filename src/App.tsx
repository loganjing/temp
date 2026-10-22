import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  createPomodoroState,
  pomodoroReducer,
  progressRatio,
  type CompletedFocus,
  type PomodoroDurations,
} from './lib/pomodoro';
import { isDefaultDurations, readDurations } from './lib/config';
import {
  appendRecord,
  createFocusRecord,
  dayStartFromKey,
  loadRecords,
  localDateKey,
  resolveStorage,
  totalFocusMs,
  type FocusRecord,
  type StorageLike,
} from './lib/records';
import {
  HEATMAP_LEGEND,
  buildHeatmap,
  formatBucketMinutes,
  formatHourRange,
  heatLevel,
  isEmptyHeatmap,
} from './lib/heatmap';
import { formatClock, formatDateLabel, formatDuration, formatTimeOfDay } from './lib/format';

const TICK_INTERVAL_MS = 500;
const DAY_LABEL_OFFSET_MS = 12 * 60 * 60 * 1000;

function createStorageOnce(ref: { current: StorageLike | null }): StorageLike {
  if (ref.current === null) ref.current = resolveStorage();
  return ref.current;
}

export function App() {
  const durations = useMemo<PomodoroDurations>(() => readDurations(window.location.search), []);
  const storageRef = useRef<StorageLike | null>(null);
  const storage = createStorageOnce(storageRef);

  const [pomodoro, dispatch] = useReducer(pomodoroReducer, durations, createPomodoroState);
  const [todayKey, setTodayKey] = useState(() => localDateKey(Date.now()));
  const [records, setRecords] = useState<FocusRecord[]>(() =>
    loadRecords(createStorageOnce(storageRef), localDateKey(Date.now())),
  );
  const [justRecorded, setJustRecorded] = useState<FocusRecord | null>(null);
  const consumedRef = useRef<CompletedFocus | null>(null);

  // 倒计时推进与本地零点换日检测：两个动作共用同一心跳，空闲时 dispatch 不改变状态。
  useEffect(() => {
    const heartbeat = () => {
      const now = Date.now();
      dispatch({ type: 'tick', now });
      const key = localDateKey(now);
      setTodayKey((current) => (current === key ? current : key));
    };
    const intervalId = window.setInterval(heartbeat, TICK_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') heartbeat();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // 换日后重新读取当日记录，当日列表、累计时长与热力图随之面向新的一天。
  useEffect(() => {
    setRecords(loadRecords(storage, todayKey));
  }, [storage, todayKey]);

  // 专注倒计时自然结束 → 自动写入当日列表（无需用户操作）；未完整完成的时段不产生记录。
  useEffect(() => {
    const completed = pomodoro.lastCompleted;
    if (!completed || consumedRef.current === completed) return;
    consumedRef.current = completed;
    const recordKey = localDateKey(completed.endedAt);
    const record = createFocusRecord(completed, Date.now());
    const next = appendRecord(storage, recordKey, record);
    setJustRecorded(record);
    if (recordKey === todayKey) {
      setRecords(next);
    } else {
      setTodayKey(recordKey);
    }
    dispatch({ type: 'consume' });
  }, [pomodoro.lastCompleted, storage, todayKey]);

  const handlePrimary = useCallback(() => {
    const now = Date.now();
    if (pomodoro.status === 'running') {
      dispatch({ type: 'pause', now });
      return;
    }
    if (pomodoro.status === 'paused') {
      dispatch({ type: 'resume', now });
      return;
    }
    setJustRecorded(null);
    dispatch({ type: 'start', now });
  }, [pomodoro.status]);

  const handleReset = useCallback(() => {
    setJustRecorded(null);
    dispatch({ type: 'reset' });
  }, []);

  const totalMs = totalFocusMs(records);
  const buckets = useMemo(
    () => buildHeatmap(records, dayStartFromKey(todayKey)),
    [records, todayKey],
  );
  const heatmapEmpty = isEmptyHeatmap(buckets);
  const ratio = progressRatio(pomodoro);
  const phaseLabel = pomodoro.phase === 'focus' ? '专注' : '休息';
  const statusLabel =
    pomodoro.status === 'running' ? '进行中' : pomodoro.status === 'paused' ? '已暂停' : '待开始';
  const primaryLabel =
    pomodoro.status === 'running' ? '暂停' : pomodoro.status === 'paused' ? '继续' : '开始';
  const latestRecord = records.length > 0 ? records[records.length - 1] : null;
  const dateLabel = formatDateLabel(dayStartFromKey(todayKey) + DAY_LABEL_OFFSET_MS);

  return (
    <div className="page">
      <header className="page-header">
        <h1>专注时段记录</h1>
        <p className="page-date" data-testid="today-date">
          {dateLabel}
        </p>
      </header>

      <section className="card summary-card" aria-label="当日累计专注时长">
        <div className="summary-main">
          <span className="summary-label">今日累计专注</span>
          <strong className="summary-value" data-testid="total-focus-duration">
            {formatDuration(totalMs)}
          </strong>
        </div>
        <dl className="summary-meta">
          <div>
            <dt>已完成番茄钟</dt>
            <dd data-testid="completed-pomodoro-count">{records.length} 个</dd>
          </div>
          <div>
            <dt>最近一次</dt>
            <dd data-testid="latest-focus">
              {latestRecord
                ? `${formatTimeOfDay(latestRecord.startedAt)} – ${formatTimeOfDay(latestRecord.endedAt)}`
                : '暂无记录'}
            </dd>
          </div>
          <div>
            <dt>统计口径</dt>
            <dd>本地自然日 {todayKey}</dd>
          </div>
        </dl>
      </section>

      <section className="card timer-card" aria-label="番茄钟">
        <div className="timer-head">
          <span
            className={`phase-chip phase-${pomodoro.phase}`}
            data-testid="phase-label"
            data-phase={pomodoro.phase}
          >
            {phaseLabel}
          </span>
          <span className="timer-status" data-testid="phase-status" data-status={pomodoro.status}>
            {statusLabel}
          </span>
        </div>

        <div
          className={`timer-clock phase-${pomodoro.phase}`}
          data-testid="pomodoro-timer"
          data-phase={pomodoro.phase}
          data-status={pomodoro.status}
          data-remaining-ms={Math.max(0, Math.round(pomodoro.remainingMs))}
          role="timer"
        >
          {formatClock(pomodoro.remainingMs)}
        </div>

        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(ratio * 100)}
        >
          <div
            className={`progress-bar phase-${pomodoro.phase}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>

        <p className="timer-hint">
          专注 {formatDuration(pomodoro.focusMs)}，倒计时结束后自动进入{' '}
          {formatDuration(pomodoro.breakMs)}休息；每次完整完成专注时段都会自动记入当日列表。
        </p>
        {!isDefaultDurations(durations) && (
          <p className="timer-hint timer-hint-warn" data-testid="duration-override-note">
            当前为验证用缩短时长（专注 {Math.round(pomodoro.focusMs / 1000)} 秒 / 休息{' '}
            {Math.round(pomodoro.breakMs / 1000)} 秒），默认使用时长为 25 分钟 / 5 分钟。
          </p>
        )}

        <div className="timer-actions">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="primary-button"
            data-action={pomodoro.status}
            onClick={handlePrimary}
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="reset-button"
            onClick={handleReset}
            disabled={pomodoro.status === 'idle'}
          >
            重置当前时段
          </button>
        </div>

        {justRecorded && (
          <p className="record-note" role="status" data-testid="record-note">
            已记入当日列表：
            {formatTimeOfDay(justRecorded.startedAt)} – {formatTimeOfDay(justRecorded.endedAt)} ·{' '}
            {formatDuration(justRecorded.durationMs)}
          </p>
        )}
      </section>

      <div className="bottom-grid">
        <section className="card heatmap-card" aria-label="当日各时段专注热力图">
          <div className="card-head">
            <h2>今日专注热力图</h2>
            <span className="card-sub">按小时划分全天时段</span>
          </div>

          {heatmapEmpty && (
            <p className="empty-state" data-testid="heatmap-empty">
              今日还没有完成的专注时段，完成一个番茄钟后这里会显示分布。
            </p>
          )}

          <div
            className={`heatmap${heatmapEmpty ? ' is-empty' : ''}`}
            data-testid="heatmap"
            data-empty={heatmapEmpty ? 'true' : 'false'}
          >
            {buckets.map((bucket) => (
              <div
                key={bucket.hour}
                className={`heat-cell heat-level-${heatLevel(bucket.minutes)}`}
                data-testid={`heatmap-cell-${bucket.hour}`}
                data-hour={bucket.hour}
                data-minutes={Math.round(bucket.minutes)}
                data-sessions={bucket.sessions}
                title={`${formatHourRange(bucket.hour)} · ${formatBucketMinutes(bucket.minutes)}`}
              />
            ))}
          </div>

          <div className="heat-axis" aria-hidden="true">
            {buckets.map((bucket) => (
              <span key={bucket.hour}>
                {bucket.hour % 3 === 0 ? String(bucket.hour).padStart(2, '0') : ''}
              </span>
            ))}
          </div>

          <ul className="legend" data-testid="heatmap-legend">
            {HEATMAP_LEGEND.map((item) => (
              <li key={item.level}>
                <span className={`legend-swatch heat-level-${item.level}`} aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
        </section>

        <section className="card records-card" aria-label="当日专注记录">
          <div className="card-head">
            <h2>当日专注记录</h2>
            <span className="card-sub" data-testid="record-count">
              共 {records.length} 条
            </span>
          </div>

          {records.length === 0 ? (
            <p className="empty-state" data-testid="record-list-empty">
              今日还没有完成的番茄钟。
            </p>
          ) : (
            <ol className="record-list" data-testid="record-list">
              {records.map((record, index) => (
                <li key={record.id} data-testid={`record-item-${index}`} data-duration-ms={record.durationMs}>
                  <span className="record-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="record-time">
                    {formatTimeOfDay(record.startedAt)} – {formatTimeOfDay(record.endedAt)}
                  </span>
                  <span className="record-duration">{formatDuration(record.durationMs)}</span>
                </li>
              ))}
            </ol>
          )}

          <p className="card-foot">记录保存在本机浏览器中，刷新或重新打开页面后仍可读取。</p>
        </section>
      </div>
    </div>
  );
}

export default App;