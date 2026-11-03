import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import type { CurrentUser } from '../api/types'

const NAV_ITEMS = [
  { to: '/', label: '工单工作台', end: true },
  { to: '/tickets/new', label: '创建工单', end: false },
  { to: '/statistics', label: '统计分析', end: false },
  { to: '/groups', label: '业务组管理', end: false },
  { to: '/assignment-rules', label: '分类分配规则', end: false },
  { to: '/audit-logs', label: '审计日志', end: false },
]

export function Layout({ user, onLogout, children }: { user: CurrentUser; onLogout: () => void; children: ReactNode }) {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">工单系统</div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-area">
        <header className="topbar-app">
          <div className="topbar-user">
            <span className="user-name">{user.name}</span>
            <span className="subtext" title={user.email}>{user.email}</span>
          </div>
          <button className="secondary" onClick={onLogout}>登出</button>
        </header>
        <div className="page-content">{children}</div>
      </div>
    </div>
  )
}
