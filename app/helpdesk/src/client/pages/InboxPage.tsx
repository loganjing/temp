import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, fetchAllPages } from '../domain/api'
import { useAsync, type AsyncState } from '../domain/hooks'
import { localizedName } from '../domain/format'
import type { Page, TicketSummary } from '../domain/types'
import { EmptyBlock, ErrorBlock, LoadingBlock, Select } from '../components/ui'
import { TicketTable } from '../components/TicketTable'
import { useLocale, usePlatformText } from '../platform/i18n'
import { useSession } from '../platform/session'

/** 部门工单箱（需求 §6.3）：待分配 + SLA 告警聚合视图；管理员可切全部部门 */
export function InboxPage() {
  const t = usePlatformText()
  const { locale } = useLocale()
  const { me } = useSession()
  const navigate = useNavigate()
  const [departmentId, setDepartmentId] = useState<number | ''>('')

  const isAdmin = me?.role === 'admin'
  const departments = useAsync(
    () => (isAdmin ? fetchAllPages((page) => api.departments(page)) : Promise.resolve([])),
    [isAdmin],
  )
  const department = departmentId || undefined

  // 聚合视图两段：待分配（状态筛选）与 SLA 告警（sla=alert，服务端按 §7.2 双维度口径过滤）
  const pending = useAsync(
    () => api.listTickets({ status: ['pending_assign'], department, page: 1, pageSize: 20, sort: 'updated_at:desc' }),
    [department],
  )
  const alerts = useAsync(
    () => api.listTickets({ sla: 'alert', department, page: 1, pageSize: 20, sort: 'updated_at:desc' }),
    [department],
  )

  const departmentSuffix = department ? `&department=${department}` : ''
  const openTicket = (ticket: TicketSummary) => void navigate(`/tickets/${ticket.id}`)

  return (
    <div className="space-y-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-800">{t('inbox.title')}</h1>
        {isAdmin && (
          <Select
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value ? Number(event.target.value) : '')}
            className="w-56"
            aria-label={t('common.department')}
          >
            <option value="">{t('inbox.allDepartments')}</option>
            {(departments.data ?? []).map((dept) => (
              <option key={dept.id} value={dept.id}>
                {localizedName(dept, locale)}
              </option>
            ))}
          </Select>
        )}
      </header>
      <InboxSection
        title={t('inbox.pendingSection')}
        result={pending}
        viewAllTo={`/tickets?status=pending_assign${departmentSuffix}`}
        onOpen={openTicket}
      />
      <InboxSection
        title={t('inbox.slaAlertSection')}
        result={alerts}
        viewAllTo={`/tickets?sla=alert${departmentSuffix}`}
        onOpen={openTicket}
      />
    </div>
  )
}

function InboxSection({
  title,
  result,
  viewAllTo,
  onOpen,
}: {
  title: string
  result: AsyncState<Page<TicketSummary>>
  viewAllTo: string
  onOpen: (ticket: TicketSummary) => void
}) {
  const t = usePlatformText()
  const total = result.data?.total ?? 0
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-slate-700">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{total}</span>
        <Link to={viewAllTo} className="text-sm text-indigo-600 hover:underline">
          {t('inbox.viewAll')}
        </Link>
      </div>
      {result.loading && !result.data ? (
        <LoadingBlock label={t('common.loading')} />
      ) : result.error ? (
        <ErrorBlock error={result.error} onRetry={result.reload} retryLabel={t('common.retry')} />
      ) : result.data && result.data.items.length === 0 ? (
        <EmptyBlock label={t('tickets.empty')} icon="inbox" />
      ) : result.data ? (
        <TicketTable tickets={result.data.items} onOpen={onOpen} />
      ) : null}
    </section>
  )
}
