/**
 * Application shell: left sidebar navigation + top context bar.
 * Sidebar items are filtered by user role.
 */

import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import type { UserRole } from '../types';

interface NavEntry {
  to: string;
  label: string;
  icon: string;
  roles?: UserRole[];
}

const navEntries: NavEntry[] = [
  { to: '/workbench', label: '工单工作台', icon: '📋', roles: ['handler', 'admin'] },
  { to: '/tickets/new', label: '创建工单', icon: '➕', roles: ['submitter', 'admin'] },
  { to: '/statistics', label: '统计仪表盘', icon: '📊', roles: ['admin'] },
  { to: '/business-groups', label: '业务组管理', icon: '👥', roles: ['admin'] },
  { to: '/assignment-rules', label: '分配规则管理', icon: '⚙️', roles: ['admin'] },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  const visibleEntries = navEntries.filter(
    (e) => !e.roles || e.roles.some((r) => hasRole(r)),
  );

  const roleLabel = (roles: UserRole[]) => {
    const map: Record<UserRole, string> = {
      submitter: '提交人',
      handler: '处理人',
      admin: '管理员',
    };
    return roles.map((r) => map[r]).join(' / ');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">工单系统</div>
        <nav className="sidebar-nav">
          {visibleEntries.map((e) => (
            <NavLink
              key={e.to}
              to={e.to}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              <span className="nav-icon">{e.icon}</span>
              <span>{e.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-context">
              <span>👤 {user?.name ?? '—'}</span>
              <span>🏢 ID:{user?.companyId ?? '—'}</span>
              <span>🔑 {user ? roleLabel(user.roles) : '—'}</span>
            </div>
          </div>
          <div className="topbar-right">
            <span className="topbar-user">{user?.email ?? ''}</span>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              退出
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
