import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import type { Role } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { roleLabels } from '../format'

interface NavItem {
  to: string
  label: string
  roles: Role[]
}

const navItems: NavItem[] = [
  { to: '/workbench', label: '工作台', roles: ['handler', 'admin'] },
  { to: '/tickets', label: '我的工单', roles: ['submitter'] },
  { to: '/stats', label: '统计分析', roles: ['handler', 'admin'] },
  { to: '/settings', label: '配置管理', roles: ['admin'] },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  const companyLabel = user.companyName || user.companyId || '未归属公司'

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="flex w-52 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white">工</span>
          <span className="text-sm font-semibold text-slate-900">工单系统</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems
            .filter(item => item.roles.includes(user.role))
            .map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 text-sm ${isActive ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b border-slate-200 bg-white px-6">
          <span className="text-sm text-slate-500">
            {user.name} · {companyLabel} · {roleLabels[user.role]}
          </span>
          <button
            type="button"
            className="btn-secondary px-2.5 py-1.5 text-xs"
            onClick={() => {
              logout()
              navigate('/login', { replace: true })
            }}
          >
            退出登录
          </button>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
