/**
 * 顶部上下文栏 — 模块标题 + 系统状态指示灯 + SSE 连接状态灯
 */
import { useApp, type PageId } from '../context/AppContext';
import type { SSEConnectionStatus } from '../types';

const PAGE_TITLES: Record<PageId, string> = {
  overview: '总览',
  queue: '任务队列',
  robots: '机器人',
  alerts: '告警',
};

function SSEStatusLabel({ status }: { status: SSEConnectionStatus }) {
  const config: Record<SSEConnectionStatus, { label: string; cls: string }> = {
    connected: { label: '实时已连接', cls: 'green' },
    connecting: { label: '连接中…', cls: 'orange' },
    disconnected: { label: '已断开', cls: 'red' },
  };
  const { label, cls } = config[status];
  return (
    <div className="status-pill">
      <span className={`status-dot ${cls}`} />
      <span>{label}</span>
    </div>
  );
}

export function TopBar() {
  const { currentPage, sseStatus } = useApp();

  return (
    <header className="topbar">
      <div className="topbar-title">{PAGE_TITLES[currentPage]}</div>
      <div className="topbar-status">
        <div className="status-pill">
          <span className="status-dot green" />
          <span>系统运行中</span>
        </div>
        <SSEStatusLabel status={sseStatus} />
      </div>
    </header>
  );
}
