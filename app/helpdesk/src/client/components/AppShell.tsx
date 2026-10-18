import { NavLink, Outlet } from 'react-router-dom'
import { localizedUser } from '../domain/format'
import type { Role } from '../domain/types'
import { useLocale, usePlatformText } from '../platform/i18n'
import { useSession } from '../platform/session'
import { Icon, type IconName } from './icons'

interface NavItem {
  to: string
  labelKey: string
  icon: IconName
  roles: Role[]
}

const ALL_ROLES: Role[] = ['requester', 'agent', 'manager', 'admin']

const NAV_MAIN: NavItem[] = [
  { to: '/tickets', labelKey: 'nav.tickets', icon: 'ticket', roles: ALL_ROLES },
  { to: '/tickets/new', labelKey: 'nav.newTicket', icon: 'plus', roles: ALL_ROLES },
  { to: '/inbox', labelKey: 'nav.inbox', icon: 'inbox', roles: ['manager', 'admin'] },
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: 'dashboard', roles: ALL_ROLES },
  { to: '/org', labelKey: 'nav.org', icon: 'sitemap', roles: ['manager', 'admin'] },
]

const NAV_ADMIN: NavItem[] = [
  { to: '/admin/users', labelKey: 'nav.users', icon: 'users', roles: ['admin'] },
  { to: '/admin/companies', labelKey: 'nav.companies', icon: 'building', roles: ['admin'] },
  { to: '/admin/categories', labelKey: 'nav.categories', icon: 'tag', roles: ['admin'] },
  { to: '/settings/assignment-rules', labelKey: 'nav.assignmentRules', icon: 'flow', roles: ['admin'] },
  { to: '/settings/sla', labelKey: 'nav.sla', icon: 'clock', roles: ['admin'] },
  { to: '/settings/calendar', labelKey: 'nav.calendar', icon: 'calendar', roles: ['admin'] },
  { to: '/admin/audit-logs', labelKey: 'nav.auditLogs', icon: 'document', roles: ['admin'] },
]

function NavLinks({ items, role }: { items: NavItem[]; role: Role }) {
  const t = usePlatformText()
  return (
    <nav className="space-y-1">
      {items
        .filter((item) => item.roles.includes(role))
        .map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`
            }
          >
            <Icon name={item.icon} className="h-4 w-4" />
            {t(item.labelKey)}
          </NavLink>
        ))}
    </nav>
  )
}

export function AppShell() {
  const t = usePlatformText()
  const { locale, setLocale } = useLocale()
  const { me, logout } = useSession()

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
          <Icon name="ticket" className="h-5 w-5 text-indigo-600" />
          <span className="text-base font-semibold">Helpdesk</span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <NavLinks items={NAV_MAIN} role={me?.role ?? 'requester'} />
          {me?.role === 'admin' && (
            <div className="mt-4 space-y-1">
              <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t('nav.sectionAdmin')}
              </div>
              <NavLinks items={NAV_ADMIN} role="admin" />
            </div>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b border-slate-200 bg-white px-4">
          {me && (
            <span className="flex items-center gap-2 text-sm">
              <span className="font-medium text-slate-800">{localizedUser(me, locale)}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t(`role.${me.role}`)}</span>
            </span>
          )}
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
            aria-label={t('common.language')}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
            title={t('common.logout')}
          >
            <Icon name="logout" className="h-4 w-4" />
          </button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
