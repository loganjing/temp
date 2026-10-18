import { type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useSession } from './platform/session'
import AppShell from './AppShell'
import { ForbiddenNotice } from './components/ui'
import LoginPage from './pages/LoginPage'
import QuotesList from './pages/quotes/QuotesList'
import QuoteForm from './pages/quotes/QuoteForm'
import QuoteDetail from './pages/quotes/QuoteDetail'
import ReceivablesPage from './pages/receivables/ReceivablesPage'
import AdjustmentsList from './pages/adjustments/AdjustmentsList'
import AdjustmentCreate from './pages/adjustments/AdjustmentCreate'
import AdjustmentDetail from './pages/adjustments/AdjustmentDetail'
import ReconList from './pages/recon/ReconList'
import ReconDetail from './pages/recon/ReconDetail'
import SettlementsList from './pages/settlements/SettlementsList'
import SettlementDetail from './pages/settlements/SettlementDetail'
import ReportsPage from './pages/reports/ReportsPage'
import MasterdataPage from './pages/masterdata/MasterdataPage'
import UsersPage from './pages/admin/UsersPage'
import JobsPage from './pages/system/JobsPage'
import AuditPage from './pages/system/AuditPage'

// 路由权限守卫：按会话 permissions 控制页面入口，越权直达给出 403 中文提示。
function Guard({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useSession()
  if (!can(permission)) return <ForbiddenNotice />
  return <>{children}</>
}

export default function App() {
  const { status, can } = useSession()

  if (status === 'checking') return <div className="boot-screen">加载中…</div>
  if (status === 'anonymous') return <LoginPage />

  const defaultPath =
    can('quote:view') ? '/quotes'
      : can('receivable:view') ? '/receivables'
        : can('adjustment:view') ? '/adjustments'
          : can('recon:view') ? '/recon-statements'
            : can('settlement:view') ? '/settlements'
              : can('job:view') ? '/system/jobs'
                : can('audit:view') ? '/system/audit'
                  : can('user:manage') ? '/system/users'
                    : '/no-access'

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to={defaultPath} replace />} />
        <Route path="/login" element={<Navigate to={defaultPath} replace />} />
        <Route path="/no-access" element={<ForbiddenNotice />} />

        <Route path="/quotes" element={<Guard permission="quote:view"><QuotesList /></Guard>} />
        <Route path="/quotes/new" element={<Guard permission="quote:create"><QuoteForm mode="create" /></Guard>} />
        <Route path="/quotes/:id" element={<Guard permission="quote:view"><QuoteDetail /></Guard>} />
        <Route path="/quotes/:id/edit" element={<Guard permission="quote:edit"><QuoteForm mode="edit" /></Guard>} />

        <Route path="/receivables" element={<Guard permission="receivable:view"><ReceivablesPage /></Guard>} />

        <Route path="/adjustments" element={<Guard permission="adjustment:view"><AdjustmentsList /></Guard>} />
        <Route path="/adjustments/new" element={<Guard permission="adjustment:create"><AdjustmentCreate /></Guard>} />
        <Route path="/adjustments/:id" element={<Guard permission="adjustment:view"><AdjustmentDetail /></Guard>} />

        <Route path="/recon-statements" element={<Guard permission="recon:view"><ReconList /></Guard>} />
        <Route path="/recon-statements/:id" element={<Guard permission="recon:view"><ReconDetail /></Guard>} />

        <Route path="/settlements" element={<Guard permission="settlement:view"><SettlementsList /></Guard>} />
        <Route path="/settlements/:id" element={<Guard permission="settlement:view"><SettlementDetail /></Guard>} />

        <Route path="/reports" element={<Guard permission="report:export"><ReportsPage /></Guard>} />
        <Route path="/masterdata" element={<Guard permission="masterdata:maintain"><MasterdataPage /></Guard>} />

        <Route path="/system/users" element={<Guard permission="user:manage"><UsersPage /></Guard>} />
        <Route path="/system/jobs" element={<Guard permission="job:view"><JobsPage /></Guard>} />
        <Route path="/system/audit" element={<Guard permission="audit:view"><AuditPage /></Guard>} />

        <Route path="*" element={<Navigate to={defaultPath} replace />} />
      </Routes>
    </AppShell>
  )
}
