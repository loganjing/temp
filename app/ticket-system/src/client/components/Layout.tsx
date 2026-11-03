import { NavLink, type NavigateFunction, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { CurrentUser } from '../types'
import { ROLE_LABELS } from './common'

export function Layout({
  user,
  onLogout,
  children,
}: {
  user: CurrentUser
  onLogout: () => void
  children: ReactNode
}) {
  const navigate = useNavigate() as NavigateFunction
  const isAdmin = user.role === 'admin'
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">工单系统</div>
        <nav className="nav-list" aria-label="主导航">
          <NavLink to="/workbench" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>工单工作台</NavLink>
          <NavLink to="/tickets/new" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>创建工单</NavLink>
          {isAdmin && (
            <>
              <NavLink to="/admin/statistics" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>统计分析</NavLink>
              <NavLink to="/admin/business-groups" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>业务组管理</NavLink>
              <NavLink to="/admin/categories" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>分类与规则管理</NavLink>
              <NavLink to="/admin/logs" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>操作日志</NavLink>
              <NavLink to="/admin/users" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>用户管理</NavLink>
            </>
          )}
        </nav>
      </aside>
      <div className="content-area">
        <header className="topbar context-bar">
          <div className="context-company">
            <strong>{user.companyName || '未关联公司'}</strong>
          </div>
          <div className="user-info">
            <span className={`role-badge role-${user.role}`}>{ROLE_LABELS[user.role]}</span>
            <span title={user.email} className="user-name">{user.displayName}</span>
            <button className="secondary" onClick={() => { void onLogout(); navigate('/workbench') }}>退出</button>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  )
}
