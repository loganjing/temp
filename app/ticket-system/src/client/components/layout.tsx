import { BarChart3, LifeBuoy, LogOut, Mail, Ticket, Users, Workflow, Inbox } from 'lucide-react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Spinner } from './feedback'

const NAV_ITEMS = [
  { to: '/workspace', label: '工作台', icon: Inbox },
  { to: '/tickets', label: '我的工单', icon: Ticket },
  { to: '/groups', label: '业务组', icon: Users },
  { to: '/rules', label: '分配规则', icon: Workflow },
  { to: '/dashboard', label: '统计仪表盘', icon: BarChart3 },
  { to: '/mail-outbox', label: '邮件记录', icon: Mail },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2.5 border-b border-slate-200 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <LifeBuoy className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-slate-900">工单系统</p>
            <p className="text-[11px] leading-tight text-slate-400">多公司服务台</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-end gap-3 border-b border-slate-200 bg-white px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate font-medium text-slate-700">{user?.fullName ?? '—'}</span>
            <span className="truncate rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500" title={user?.companyName}>
              {user?.companyName ?? '—'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
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

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
      <div className="min-w-0">
        <h1 className="text-base font-semibold text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function LoadingBlock({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-slate-500" role="status">
      <Spinner />
      {label}
    </div>
  )
}
