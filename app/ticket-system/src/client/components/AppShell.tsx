import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABELS } from '../domain/labels'

interface NavItem {
  to: string
  label: string
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/workbench', label: '工单工作台' },
  { to: '/mine', label: '我的工单' },
  { to: '/stats', label: '统计分析' },
  { to: '/groups', label: '业务组配置', adminOnly: true },
  { to: '/users', label: '用户管理', adminOnly: true },
]

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null
  const isAdmin = user.role === 'company_admin'

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-base font-semibold text-slate-900">工单系统</p>
          <p className="mt-0.5 text-xs text-slate-400">工单受理与处理平台</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="主导航">
          {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="font-medium text-slate-700">{user.displayName}</span>
            <span aria-hidden>·</span>
            <span>{user.companyName}</span>
            {user.department && (
              <>
                <span aria-hidden>·</span>
                <span>{user.department}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>{ROLE_LABELS[user.role]}</span>
          </div>
          <button
            type="button"
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            onClick={() => {
              logout()
              navigate('/login', { replace: true })
            }}
          >
            退出
          </button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
