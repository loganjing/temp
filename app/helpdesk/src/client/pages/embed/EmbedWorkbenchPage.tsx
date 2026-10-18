import { useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../../domain/api'
import { errorText, formatHours, localizedName, subjectOf } from '../../domain/format'
import { useAsync } from '../../domain/hooks'
import { LINGEE_AGENT_URL } from '../../domain/constants'
import type { TicketSummary, TicketStatus } from '../../domain/types'
import {
  Button,
  EmptyBlock,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  NoPermissionBlock,
  Pagination,
  PriorityBadge,
  SlaBadgeView,
  StatusBadge,
} from '../../components/ui'
import { Icon } from '../../components/icons'
import { TicketTable } from '../../components/TicketTable'
import { TicketForm } from '../../components/TicketForm'
import { TicketDetail } from '../../components/TicketDetail'
import { useLocale, usePlatformText } from '../../platform/i18n'
import { useSession } from '../../platform/session'

type Selection = { kind: 'draft' | 'detail'; id: number } | null

/** 嵌入式工作台（需求 §7）：无应用外壳、仅提交人、站内不跳转，唯一外跳是灵基智能体入口 */
export function EmbedWorkbenchPage() {
  const t = usePlatformText()
  const { status, me, login } = useSession()
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [selection, setSelection] = useState<Selection>(null)
  const [version, setVersion] = useState(0)

  if (status === 'loading') {
    return (
      <EmbedFrame>
        <LoadingBlock label={t('common.loading')} />
      </EmbedFrame>
    )
  }
  if (status === 'anonymous') {
    return (
      <EmbedFrame>
        <EmbedLogin onLogin={login} />
      </EmbedFrame>
    )
  }
  if (me && me.role !== 'requester') {
    return (
      <EmbedFrame>
        <NoPermissionBlock label={t('embed.forbidden')} />
      </EmbedFrame>
    )
  }

  function bump() {
    setVersion((value) => value + 1)
  }

  function closeSelection(refresh: boolean) {
    setSelection(null)
    if (refresh) bump()
  }

  if (selection?.kind === 'draft') {
    return (
      <EmbedFrame>
        <Button icon="arrowLeft" onClick={() => closeSelection(false)}>
          {t('common.back')}
        </Button>
        <TicketForm ticketId={selection.id} embedded onDone={() => closeSelection(true)} />
      </EmbedFrame>
    )
  }
  if (selection?.kind === 'detail') {
    return (
      <EmbedFrame>
        <TicketDetail
          ticketId={selection.id}
          embedded
          onClose={() => closeSelection(true)}
          onUpdated={bump}
        />
      </EmbedFrame>
    )
  }

  return (
    <EmbedFrame>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-800">{t('embed.title')}</h1>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setView('kanban')}
              className={`flex items-center gap-1 rounded-md px-3 py-1 text-sm font-medium ${
                view === 'kanban' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Icon name="kanban" className="h-4 w-4" />
              {t('embed.view.kanban')}
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`flex items-center gap-1 rounded-md px-3 py-1 text-sm font-medium ${
                view === 'list' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Icon name="list" className="h-4 w-4" />
              {t('embed.view.list')}
            </button>
          </div>
          {/* 唯一对外跳转：灵基 AI 智能体入口，在最外层窗口打开，避免灵基页面嵌套 */}
          <Button icon="external" onClick={() => window.open(LINGEE_AGENT_URL, '_top')}>
            {t('embed.agent')}
          </Button>
        </div>
      </header>

      <EmbedSummaryBar version={version} />
      {view === 'kanban' ? (
        <EmbedKanban version={version} onSelect={setSelection} />
      ) : (
        <EmbedList onSelect={setSelection} />
      )}
    </EmbedFrame>
  )
}

function EmbedFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-6xl space-y-4 p-4">{children}</div>
    </div>
  )
}

function EmbedLogin({ onLogin }: { onLogin: (email: string, password: string) => Promise<unknown> }) {
  const t = usePlatformText()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onLogin(email, password)
    } catch (reason) {
      setError(errorText(reason, t('login.failed')))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Icon name="ticket" className="h-8 w-8 text-indigo-600" />
          <p className="text-sm text-slate-500">{t('embed.loginHint')}</p>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <Field label={t('login.email')} required>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </Field>
          <Field label={t('login.password')} required>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button variant="primary" type="submit" disabled={busy} className="w-full justify-center">
            {busy ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </div>
    </div>
  )
}

function EmbedSummaryBar({ version }: { version: number }) {
  const t = usePlatformText()
  const summary = useAsync(() => api.embedSummary(), [version])
  if (summary.loading && !summary.data) return <LoadingBlock label={t('common.loading')} />
  if (summary.error) return <ErrorBlock error={summary.error} onRetry={summary.reload} retryLabel={t('common.retry')} />
  if (!summary.data) return null
  const { kpis } = summary.data
  const chips: { label: string; value: string }[] = [
    { label: t('embed.kpi.toProcess'), value: String(kpis.toProcess) },
    { label: t('embed.kpi.inProgress'), value: String(kpis.inProgress) },
    { label: t('embed.kpi.completed'), value: String(kpis.completed) },
    { label: t('embed.kpi.avgResolution'), value: formatHours(kpis.avgResolutionHours) },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {chips.map((chip) => (
        <div key={chip.label} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium text-slate-500">{chip.label}</div>
          <div className="mt-0.5 text-xl font-semibold text-slate-800">{chip.value}</div>
        </div>
      ))}
    </div>
  )
}

const KANBAN_COLUMNS: { key: 'drafts' | 'teamProcessing' | 'toConfirm' | 'done'; labelKey: string }[] = [
  { key: 'drafts', labelKey: 'embed.col.drafts' },
  { key: 'teamProcessing', labelKey: 'embed.col.teamProcessing' },
  { key: 'toConfirm', labelKey: 'embed.col.toConfirm' },
  { key: 'done', labelKey: 'embed.col.done' },
]

function EmbedKanban({ version, onSelect }: { version: number; onSelect: (selection: Selection) => void }) {
  const t = usePlatformText()
  const kanban = useAsync(() => api.embedKanban(), [version])

  if (kanban.loading && !kanban.data) return <LoadingBlock label={t('common.loading')} />
  if (kanban.error) return <ErrorBlock error={kanban.error} onRetry={kanban.reload} retryLabel={t('common.retry')} />
  if (!kanban.data) return null

  const open = (ticket: TicketSummary) =>
    onSelect({ kind: ticket.status === 'draft' ? 'draft' : 'detail', id: ticket.id })

  return (
    <div className="space-y-3">
      {kanban.data.truncated && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {t('embed.truncated', { limit: kanban.data.limit })}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {KANBAN_COLUMNS.map((column) => (
          <section key={column.key} className="space-y-2 rounded-xl bg-slate-100 p-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-slate-600">{t(column.labelKey)}</h2>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">
                {kanban.data!.columns[column.key].length}
              </span>
            </div>
            {kanban.data!.columns[column.key].length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-slate-400">{t('common.empty')}</p>
            ) : (
              kanban.data!.columns[column.key].map((ticket) => <KanbanCard key={ticket.id} ticket={ticket} onClick={() => open(ticket)} />)
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

function KanbanCard({ ticket, onClick }: { ticket: TicketSummary; onClick: () => void }) {
  const t = usePlatformText()
  const { locale } = useLocale()
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-indigo-300"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-slate-400">{ticket.ticketNo ?? t('detail.draftNo')}</span>
        <StatusBadge status={ticket.status} label={t(`ticket.status.${ticket.status}`)} />
      </div>
      <div className="mt-1.5 text-sm font-medium text-slate-800">{subjectOf(ticket, locale)}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={ticket.priority} label={t(`ticket.priority.${ticket.priority}`)} />
        <span className="text-xs text-slate-500">{localizedName(ticket.category, locale)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <SlaBadgeView badge={ticket.slaFirstResponse} />
        <SlaBadgeView badge={ticket.slaResolution} />
      </div>
    </button>
  )
}

type Tab = 'all' | 'drafts' | 'teamProcessing' | 'toConfirm' | 'done'

const TABS: Tab[] = ['all', 'drafts', 'teamProcessing', 'toConfirm', 'done']

const TAB_STATUSES: Record<Tab, TicketStatus[] | undefined> = {
  all: undefined,
  drafts: ['draft'],
  teamProcessing: ['pending_assign', 'assigned', 'in_progress', 'on_hold'],
  toConfirm: ['pending_confirm'],
  done: ['closed', 'cancelled'],
}

function EmbedList({ onSelect }: { onSelect: (selection: Selection) => void }) {
  const t = usePlatformText()
  const [q, setQ] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [page, setPage] = useState(1)
  const list = useAsync(
    () =>
      api.listTickets({
        q: q || undefined,
        status: TAB_STATUSES[tab],
        page,
        pageSize: 20,
        sort: 'updated_at:desc',
      }),
    [q, tab, page],
  )

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    setQ(searchInput.trim())
    setPage(1)
  }

  return (
    <div className="space-y-3">
      <form className="flex items-center gap-2" onSubmit={submitSearch}>
        <div className="relative w-64">
          <Icon name="search" className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('tickets.filter.searchPlaceholder')}
            className="pl-8"
          />
        </div>
        <Button type="submit" icon="search">
          {t('common.search')}
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setTab(value)
              setPage(1)
            }}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              tab === value
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {t(`embed.tab.${value}`)}
          </button>
        ))}
      </div>
      {list.loading && !list.data ? (
        <LoadingBlock label={t('common.loading')} />
      ) : list.error ? (
        <ErrorBlock error={list.error} onRetry={list.reload} retryLabel={t('common.retry')} />
      ) : list.data && list.data.items.length === 0 ? (
        <EmptyBlock label={t('embed.empty')} icon="inbox" />
      ) : list.data ? (
        <>
          <TicketTable
            tickets={list.data.items}
            onOpen={(ticket) =>
              onSelect({ kind: ticket.status === 'draft' ? 'draft' : 'detail', id: ticket.id })
            }
          />
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            unit={t('common.items')}
            onPage={setPage}
            pageSizeOptions={[10, 20, 50]}
            onPageSize={() => undefined}
          />
        </>
      ) : null}
    </div>
  )
}
