import { type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import type { CurrentUser } from '../types'
import { ROLE_LABELS } from '../types'

interface NavItem {
  to: string
  label: string
  icon: string
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '工作台', icon: '🏠' },
  { to: '/tickets/new', label: '创建工单', icon: '✎' },
  { to: '/admin/groups', label: '业务组管理', icon: '👥', adminOnly: true },
  { to: '/admin/routing-rules', label: '路由规则', icon: '⚙', adminOnly: true },
  { to: '/statistics', label: '统计分析', icon: '📊' },
]

export function Layout({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const navigate = useNavigate()
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || user.role === 'admin')

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('platform-token')}` },
      })
    } catch {
      // 忽略登出请求失败
    }
    localStorage.removeItem('platform-token')
    navigate('/login')
  }

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">🎫</span>
          <span className="brand-text">工单系统</span>
        </div>
        <ul className="nav-list">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="main-area">
        <header className="topbar-app">
          <div className="topbar-user">
            <span className="user-name">{user.displayName}</span>
            <span className="user-meta">{user.companyName} · {ROLE_LABELS[user.role]}</span>
          </div>
          <button className="secondary logout-btn" onClick={handleLogout}>退出</button>
        </header>
        <main className="content-area">{children}</main>
      </div>
    </div>
  )
}
