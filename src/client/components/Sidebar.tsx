/**
 * 左侧边栏 — 模块导航（总览、任务队列、机器人、告警）
 */
import { useApp, type PageId } from '../context/AppContext';

interface NavItem {
  id: PageId;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: '总览', icon: '◎' },
  { id: 'queue', label: '任务队列', icon: '☰' },
  { id: 'robots', label: '机器人', icon: '◆' },
  { id: 'alerts', label: '告警', icon: '!' },
];

export function Sidebar() {
  const { currentPage, navigate } = useApp();

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">配送机器人监控</div>
      <div className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <div
            key={item.id}
            className={`sidebar-nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => navigate(item.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') navigate(item.id);
            }}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </nav>
  );
}
