import { type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { Loading } from './common'
import { useState, useEffect } from 'react'

const navItems = [
  { to: '/workbench', label: '工作台', icon: '◆' },
  { to: '/tickets', label: '工单列表', icon: '☰' },
  { to: '/tickets/new', label: '提交工单', icon: '✎' },
  { to: '/config', label: '配置', icon: '⚙' },
  { to: '/stats', label: '统计仪表盘', icon: '▦' },
  { to: '/notifications', label: '通知核对', icon: '✉' },
]

export default function Layout({ children }: { children?: ReactNode }) {
  const { session, loading, error, switchUser } = useSession()
  const navigate = useNavigate()
  const [showLogin, setShowLogin] = useState(false)
  const [userId, setUserId] = useState('')

  useEffect(() => {
    if (!loading && !session?.user) {
      setShowLogin(true)
    }
  }, [loading, session])

  const handleLogin = async () => {
    if (!userId.trim()) return
    await switchUser(userId.trim())
    setShowLogin(false)
    setUserId('')
    navigate('/workbench')
  }

  if (loading && !session) {
    return (
      <div className="app-layout">
        <div className="app-sidebar">
          <div className="sidebar-logo"><span className="logo-icon">T</span> 工单系统</div>
        </div>
        <div className="app-main">
          <div className="app-content"><Loading /></div>
        </div>
      </div>
    )
  }

  const user = session?.user

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">T</span> 工单系统
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? 'active' : ''}`
              }
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-title">工单系统</div>
          {user ? (
            <div className="topbar-user">
              <div className="topbar-user-info">
                <div className="topbar-user-name">{user.name}</div>
                <div className="topbar-user-company">{user.companyName} · {user.department}</div>
              </div>
              <div className="topbar-user-avatar">
                {user.name.charAt(0)}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={async () => {
                await switchUser('') // will fail but triggers reload
                setShowLogin(true)
              }}>切换</button>
            </div>
          ) : null}
        </header>

        <div className="app-content">
          {error && !user && (
            <div className="alert alert-error">{error}</div>
          )}
          {showLogin && !user ? (
            <div className="modal-overlay">
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">选择操作者身份</div>
                <div className="modal-body">
                  <div className="form-group">
                    <label className="form-label">用户 ID</label>
                    <input
                      className="form-input"
                      value={userId}
                      onChange={e => setUserId(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleLogin()}
                      placeholder="如 u1, u2..."
                      autoFocus
                    />
                    <div className="form-hint">输入用户 ID 切换操作者身份</div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-primary" onClick={handleLogin} disabled={!userId.trim()}>
                    进入
                  </button>
                </div>
              </div>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  )
}
