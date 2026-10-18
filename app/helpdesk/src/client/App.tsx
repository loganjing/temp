import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AppShell } from './components/AppShell'
import { LoadingBlock, NoPermissionBlock } from './components/ui'
import type { Role } from './domain/types'
import { usePlatformText } from './platform/i18n'
import { roleHome, useSession } from './platform/session'
import { LoginPage } from './pages/LoginPage'
import { TicketDetailRoute, TicketsLayout } from './pages/TicketsLayout'
import { TicketFormPage } from './pages/TicketFormPage'
import { InboxPage } from './pages/InboxPage'
import { DashboardPage } from './pages/DashboardPage'
import { OrgPage } from './pages/OrgPage'
import { UsersPage } from './pages/UsersPage'
import { CompaniesPage } from './pages/CompaniesPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { AssignmentRulesPage } from './pages/AssignmentRulesPage'
import { SlaPoliciesPage } from './pages/SlaPoliciesPage'
import { CalendarPage } from './pages/CalendarPage'
import { AuditLogsPage } from './pages/AuditLogsPage'
import { EmbedWorkbenchPage } from './pages/embed/EmbedWorkbenchPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const t = usePlatformText()
  const { status } = useSession()
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingBlock label={t('common.loading')} />
      </div>
    )
  }
  if (status === 'anonymous') return <Navigate to="/login" replace />
  return <>{children}</>
}

function GuardedShell() {
  return (
    <RequireAuth>
      <AppShell />
    </RequireAuth>
  )
}

/** 入口按角色显隐（体验层）；服务端独立强制校验（需求 §2.3） */
function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const t = usePlatformText()
  const { me } = useSession()
  if (!me) return null
  if (!roles.includes(me.role)) return <NoPermissionBlock label={t('common.noPermission')} />
  return <>{children}</>
}

function HomeRedirect() {
  const { me } = useSession()
  if (!me) return null
  return <Navigate to={roleHome(me.role)} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* 嵌入式工作台：无应用外壳，不进入 GuardedShell */}
      <Route path="/embed/workbench" element={<EmbedWorkbenchPage />} />
      <Route element={<GuardedShell />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/tickets" element={<TicketsLayout />}>
          <Route path=":id" element={<TicketDetailRoute />} />
        </Route>
        <Route path="/tickets/new" element={<TicketFormPage />} />
        <Route path="/tickets/:id/edit" element={<TicketFormPage />} />
        <Route
          path="/inbox"
          element={
            <RoleGate roles={['manager', 'admin']}>
              <InboxPage />
            </RoleGate>
          }
        />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/org"
          element={
            <RoleGate roles={['manager', 'admin']}>
              <OrgPage />
            </RoleGate>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RoleGate roles={['admin']}>
              <UsersPage />
            </RoleGate>
          }
        />
        <Route
          path="/admin/companies"
          element={
            <RoleGate roles={['admin']}>
              <CompaniesPage />
            </RoleGate>
          }
        />
        <Route
          path="/admin/categories"
          element={
            <RoleGate roles={['admin']}>
              <CategoriesPage />
            </RoleGate>
          }
        />
        <Route
          path="/settings/assignment-rules"
          element={
            <RoleGate roles={['admin']}>
              <AssignmentRulesPage />
            </RoleGate>
          }
        />
        <Route
          path="/settings/sla"
          element={
            <RoleGate roles={['admin']}>
              <SlaPoliciesPage />
            </RoleGate>
          }
        />
        <Route
          path="/settings/calendar"
          element={
            <RoleGate roles={['admin']}>
              <CalendarPage />
            </RoleGate>
          }
        />
        <Route
          path="/admin/audit-logs"
          element={
            <RoleGate roles={['admin']}>
              <AuditLogsPage />
            </RoleGate>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
