// 全局应用壳：左侧导航 + 顶部上下文栏（当前用户、公司、角色）+ 主工作区。

import { NavLink, Outlet } from 'react-router-dom'
import type { ComponentType, SVGProps } from 'react'
import type { Role } from '../contracts'
import { useAuth } from '../state/auth'
import { useCompanyDirectory } from '../state/company-directory'
import { RoleBadge } from './ui'
import { IconActivity, IconBarChart, IconDashboard, IconFileText, IconInbox, IconLogOut, IconSliders } from './icons'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
  roles: Role[]
}

const NAV_ITEMS: NavItem[] = [
  { to: '/workbench', label: '工作台', icon: IconDashboard, roles: ['handler', 'ops'] },
  { to: '/my-tickets', label: '我的工单', icon: IconFileText, roles: ['submitter', 'handler', 'ops'] },
  { to: '/stats', label: '统计', icon: IconBarChart, roles: ['handler', 'ops'] },
  { to: '/audit', label: '审计', icon: IconActivity, roles: ['handler', 'ops'] },
  { to: '/admin', label: '管理', icon: IconSliders, roles: ['ops'] },
]

export default function AppShell() {
  const { user, logout } = useAuth()
  const { resolve } = useCompanyDirectory()
  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role))
  const userTitle = [user.email, user.department].filter(Boolean).join(' · ')

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-slate-200 px-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">
            <IconInbox size={17} />
          </span>
          <span className="text-sm font-semibold">工单系统</span>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
            >
              <item.icon size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-indigo-600 text-white">
              <IconInbox size={15} />
            </span>
            <span className="text-sm font-semibold">工单系统</span>
          </div>
          <div className="flex min-w-0 items-center gap-2.5 text-sm text-slate-600">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
              {user.display_name.slice(0, 1) || 'U'}
            </span>
            <span title={userTitle} className="truncate font-medium text-slate-800">
              {user.display_name}
            </span>
            <span className="text-slate-300">·</span>
            <span className="truncate">{resolve(user.company_id)}</span>
            <span className="text-slate-300">·</span>
            <RoleBadge role={user.role} />
          </div>
          <button type="button" className="btn btn-secondary btn-xs" onClick={logout}>
            <IconLogOut size={13} />
            退出登录
          </button>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
