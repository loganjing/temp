import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import type { ReactNode } from 'react'

interface NavItem {
  to: string
  label: string
  icon: string
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { to: '/workbench', label: '工单工作台', icon: '📋' },
  { to: '/admin', label: '管理后台', icon: '⚙', adminOnly: true },
  { to: '/stats', label: '统计分析', icon: '📊', adminOnly: true },
  { to: '/audit-logs', label: '操作日志', icon: '📝', adminOnly: true },
]

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const visibleItems = navItems.filter((item) => !item.adminOnly || user?.role === 'admin')

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top context bar */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-gray-900">工单系统</span>
          {user?.companyName && (
            <span className="text-sm text-gray-400">| {user.companyName}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-right">
            <div className="font-medium text-gray-700">{user?.name}</div>
            <div className="text-xs text-gray-400">
              {user?.email} · {roleLabel(user?.role)}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-red-600 transition-colors"
          >
            退出
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-56 flex-shrink-0 bg-white border-r border-gray-200 py-4">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}

function roleLabel(role?: string): string {
  switch (role) {
    case 'admin':
      return '管理员'
    case 'handler':
      return '处理人'
    case 'submitter':
      return '提交人'
    default:
      return role ?? ''
  }
}
