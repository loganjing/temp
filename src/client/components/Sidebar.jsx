const NAV_ITEMS = [
  { key: 'areas', label: '清洁区域', icon: '🧹' },
  { key: 'jobs', label: '定时作业', icon: '⏰' },
  { key: 'task-instances', label: '任务实例', icon: '📋' },
  { key: 'obstacles', label: '障碍处理', icon: '⚠️' },
  { key: 'supplies', label: '耗材管理', icon: '📦' },
  { key: 'reports', label: '质量报告', icon: '📊' },
];

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">商场清洁管理系统</div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <div
            key={item.key}
            className={`nav-item ${active === item.key ? 'active' : ''}`}
            onClick={() => onNavigate(item.key)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export { NAV_ITEMS };
