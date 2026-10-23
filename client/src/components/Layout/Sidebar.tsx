import { NavLink } from 'react-router-dom';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { path: '/tasks', label: '任务管理', icon: '📋' },
  { path: '/monitoring', label: '实时监控', icon: '📡' },
  { path: '/statistics', label: '任务统计', icon: '📊' },
  { path: '/resources', label: '设备管理', icon: '🚗' },
  { path: '/map', label: '地图配置', icon: '🗺' },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo">📦</span>
        <span className="sidebar__title">仓储搬运</span>
      </div>
      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar__item${isActive ? ' sidebar__item--active' : ''}`
            }
          >
            <span className="sidebar__icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
