import { NavLink, Outlet } from 'react-router-dom'
import type { CurrentUser } from '../types/auth'

interface AppShellProps {
  user: CurrentUser
  onSignOut: () => void
}

interface NavItem {
  to: string
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { to: '/workbench', label: '工单工作台' },
  { to: '/tickets/new', label: '创建工单' },
  { to: '/business-groups', label: '业务组管理' },
  { to: '/dashboard', label: '统计仪表盘' },
  { to: '/logs', label: '操作日志' },
  { to: '/admin/users', label: '用户管理' },
]

// 应用壳：左侧导航 + 顶部上下文栏 + 主工作区。
export function AppShell({ user, onSignOut }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
        <div className="px-4 py-5 text-lg font-semibold text-[var(--accent)]">工单管理系统</div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm ${isActive ? 'bg-[var(--accent)] text-white' : 'text-[var(--text)] hover:bg-[var(--border)]'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="topbar">
          <div>
            <h1>工单管理系统</h1>
            <p title={user.email}>{user.name} · {user.email}</p>
          </div>
          <button className="secondary" onClick={onSignOut}>退出</button>
        </header>
        <main className="shell flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
