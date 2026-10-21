// 应用壳：左侧导航 + 顶部上下文栏 + 主工作区。导航入口按 /api/auth/me 的角色信息呈现。
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { ChartColumn, Inbox, LogOut, Settings, Ticket, Users } from 'lucide-react'
import { useAuth } from './auth'

export function AppShell({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth()
  const isHandler = (me?.groups.length ?? 0) > 0
  const isAdmin = me?.org?.isCompanyAdmin === true

  const navItems = [
    { to: '/tickets', label: '工单', icon: Ticket, visible: true },
    { to: '/workbench', label: '工作台', icon: Inbox, visible: isHandler || isAdmin },
    { to: '/stats', label: '统计', icon: ChartColumn, visible: isHandler || isAdmin },
    { to: '/config', label: '配置', icon: Settings, visible: isAdmin },
    { to: '/users', label: '用户管理', icon: Users, visible: true },
  ].filter((item) => item.visible)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Ticket className="h-5 w-5" />
          </span>
          <span className="text-base font-semibold text-slate-900">工单系统</span>
        </div>
        <nav className="mt-1 flex-1 space-y-1 px-3" aria-label="主导航">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <p className="px-5 py-4 text-[11px] leading-4 text-slate-400">多公司工单服务台</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="min-w-0 text-sm">
            <span className="font-medium text-slate-900" title={me?.user.email}>
              {me?.user.name ?? '—'}
            </span>
            {me?.org ? (
              <span className="ml-2 text-slate-500">
                {me.org.companyName} · {me.org.department}
                {me.org.isCompanyAdmin ? ' · 公司管理员' : ''}
              </span>
            ) : (
              <span className="ml-2 text-amber-600" title="该账号未设置组织档案">
                未设置组织档案，无法创建工单
              </span>
            )}
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
