import { Button, Result, Spin } from 'antd'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import UsersPage from './admin/UsersPage'
import AppShell from './components/AppShell'
import CategoriesRulesPage from './pages/config/CategoriesRulesPage'
import GroupsPage from './pages/config/GroupsPage'
import LoginPage from './pages/LoginPage'
import MyTicketsPage from './pages/MyTicketsPage'
import StatsPage from './pages/StatsPage'
import TicketDetailPage from './pages/TicketDetailPage'
import WorkbenchPage from './pages/WorkbenchPage'
import { defaultPathFor, useSession } from './platform/session'
import type { UserProfile } from './platform/types'

function Landing() {
  const { user } = useSession()
  return user ? <Navigate to={defaultPathFor(user)} replace /> : null
}

function RequireSession() {
  const { status, user } = useSession()
  const location = useLocation()
  if (status === 'loading') {
    return (
      <div className="app-loading">
        <Spin size="large" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  return <AppShell />
}

function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user } = useSession()
  const navigate = useNavigate()
  if (!user) return null
  if (!roles.some((role) => user.roles.includes(role))) {
    return (
      <Result
        status="403"
        title="无权限访问"
        subTitle="该页面仅对公司管理员开放，如需权限请联系管理员。"
        extra={<Button type="primary" onClick={() => navigate(defaultPathFor(user as UserProfile), { replace: true })}>返回可用页面</Button>}
      />
    )
  }
  return <>{children}</>
}

function NotFound() {
  const { user } = useSession()
  const navigate = useNavigate()
  return (
    <div className="app-loading">
      <Result
        status="404"
        title="页面不存在"
        subTitle="请检查访问地址，或返回首页继续使用。"
        extra={<Button type="primary" onClick={() => navigate(user ? defaultPathFor(user) : '/login', { replace: true })}>返回首页</Button>}
      />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireSession />}>
        <Route index element={<Landing />} />
        <Route path="my-tickets" element={<MyTicketsPage />} />
        <Route path="workbench" element={<WorkbenchPage />} />
        <Route path="tickets/:id" element={<TicketDetailPage />} />
        <Route path="settings/groups" element={<RequireRole roles={['company_admin']}><GroupsPage /></RequireRole>} />
        <Route path="settings/categories" element={<RequireRole roles={['company_admin']}><CategoriesRulesPage /></RequireRole>} />
        <Route path="settings/users" element={<RequireRole roles={['company_admin']}><UsersPage /></RequireRole>} />
        <Route path="stats" element={<RequireRole roles={['company_admin', 'platform_stats']}><StatsPage /></RequireRole>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}