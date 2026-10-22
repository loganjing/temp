import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { companiesApi } from '../api/admin'
import { useSession } from '../session'

const navItems = [
  { to: '/workbench', label: '工单工作台' },
  { to: '/statistics', label: '统计分析' },
  { to: '/admin/groups', label: '业务组管理' },
  { to: '/admin/catalog', label: '分类管理' },
  { to: '/admin/users', label: '用户管理' },
]

export default function AppShell() {
  const { user, profile, signOut } = useSession()
  const [companyName, setCompanyName] = useState('')

  useEffect(() => {
    const companyId = profile?.companyId
    if (!companyId) {
      setCompanyName('')
      return
    }
    let active = true
    void companiesApi.list()
      .then((result) => { if (active) setCompanyName(result.items.find((company) => company.id === companyId)?.name ?? '') })
      .catch(() => { if (active) setCompanyName('') })
    return () => { active = false }
  }, [profile?.companyId])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">工单系统</div>
        <nav className="nav">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-context">
            <strong>{profile?.displayName || user.email}</strong>
            <span className="muted" title={user.email}>{user.email}</span>
            <span className="muted">所属公司：{companyName || (profile?.companyId ? `#${profile.companyId}` : '未关联')}</span>
          </div>
          <button className="secondary" onClick={signOut}>退出登录</button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}