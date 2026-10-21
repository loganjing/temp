import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAsyncData, type AsyncHandle } from '../app/useAsyncData'
import { useCurrentUser } from '../app/session'
import { createTicket, fetchTickets } from '../api'
import {
  CATEGORY_OPTIONS,
  PRIORITIES,
  TICKET_STATUSES,
  type Category,
  type CreateTicketPayload,
  type Priority,
  type SortOrder,
  type Ticket,
  type TicketListResult,
  type TicketSortField,
  type TicketStatus,
} from '../contract'
import { STATUS_LABELS, formatDateTime } from '../labels'
import { describeError } from '../platform/api-client'
import { Card, CategoryChip, DataState, Field, Feedback, Pagination, PriorityBadge, StatusBadge, type FeedbackMessage } from '../components/ui'
import { TicketDetailSection } from './TicketDetailView'

const MY_TICKETS_PAGE_SIZE = 20

export default function MyTicketsPage() {
  const me = useCurrentUser()
  const navigate = useNavigate()
  const routeParams = useParams()
  const selectedTicketId = /^\d+$/.test(routeParams.ticketId ?? '') ? Number(routeParams.ticketId) : null
  const [status, setStatus] = useState<TicketStatus | ''>('')
  const [searchDraft, setSearchDraft] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [sort, setSort] = useState<TicketSortField>('createdAt')
  const [order, setOrder] = useState<SortOrder>('desc')
  const [page, setPage] = useState(1)
  const list = useAsyncData(
    () =>
      fetchTickets({
        scope: 'mine',
        status: status === '' ? undefined : status,
        q: appliedSearch.trim() === '' ? undefined : appliedSearch.trim(),
        sort,
        order,
        page,
        pageSize: MY_TICKETS_PAGE_SIZE,
      }),
    [status, appliedSearch, sort, order, page],
    { enabled: selectedTicketId === null },
  )
  const [createFeedback, setCreateFeedback] = useState<FeedbackMessage | null>(null)
  const [creating, setCreating] = useState(false)

  const submitCreate = async (payload: CreateTicketPayload) => {
    setCreating(true)
    setCreateFeedback(null)
    try {
      const ticket = await createTicket(payload)
      void navigate(`/mine/${ticket.id}`)
    } catch (cause) {
      setCreateFeedback({ tone: 'error', message: describeError(cause) })
    } finally {
      setCreating(false)
    }
  }

  if (selectedTicketId !== null) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <TicketDetailSection
          me={me}
          mode="mine"
          ticketId={selectedTicketId}
          onTicketChanged={() => { list.reload() }}
          onOpenTicket={(ticketId) => { void navigate(`/mine/${ticketId}`) }}
          onBack={() => { void navigate('/mine') }}
          backLabel="返回我的工单"
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <CreateTicketCard onSubmit={(payload) => { void submitCreate(payload) }} busy={creating} feedback={createFeedback} />
      <MyTicketsListCard
        list={list}
        status={status}
        onStatusChange={(value) => { setStatus(value); setPage(1) }}
        searchDraft={searchDraft}
        onSearchDraftChange={setSearchDraft}
        onSearchSubmit={() => { setAppliedSearch(searchDraft.trim()); setPage(1) }}
        onSearchClear={() => { setSearchDraft(''); setAppliedSearch(''); setPage(1) }}
        appliedSearch={appliedSearch}
        sort={sort}
        onSortChange={(value) => { setSort(value); setPage(1) }}
        order={order}
        onOrderToggle={() => { setOrder(order === 'desc' ? 'asc' : 'desc'); setPage(1) }}
        onPageChange={setPage}
        onSelectTicket={(ticketId) => { void navigate(`/mine/${ticketId}`) }}
      />
    </div>
  )
}

export function CreateTicketCard(props: {
  onSubmit: (payload: CreateTicketPayload) => void
  busy: boolean
  feedback: FeedbackMessage | null
}) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<Category | ''>('')
  const [priority, setPriority] = useState<Priority | ''>('')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (category === '' || priority === '') return
    props.onSubmit({ subject: subject.trim(), description, category, priority })
  }

  return (
    <Card title="提交工单">
      <form className="space-y-3" onSubmit={submit}>
        <Field label="主题">
          <input
            className="input-base"
            value={subject}
            onChange={(event) => setSubject(event.currentTarget.value)}
            maxLength={200}
            required
            placeholder="简要描述问题（1-200 字）"
          />
        </Field>
        <Field label="描述">
          <textarea
            className="input-base"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
            required
            placeholder="补充问题细节、复现步骤等"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="分类">
            <select className="input-base" value={category} onChange={(event) => setCategory(event.currentTarget.value as Category | '')} required>
              <option value="" disabled>选择问题分类</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="SLA 优先级">
            <select className="input-base" value={priority} onChange={(event) => setPriority(event.currentTarget.value as Priority | '')} required>
              <option value="" disabled>选择优先级</option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
          </Field>
        </div>
        {props.feedback !== null && <Feedback tone={props.feedback.tone}>{props.feedback.message}</Feedback>}
        <button type="submit" className="btn-primary" disabled={props.busy || category === '' || priority === ''}>
          {props.busy ? '提交中…' : '提交工单'}
        </button>
      </form>
    </Card>
  )
}

export interface MyTicketsListCardProps {
  list: AsyncHandle<TicketListResult>
  status: TicketStatus | ''
  onStatusChange: (status: TicketStatus | '') => void
  searchDraft: string
  onSearchDraftChange: (value: string) => void
  onSearchSubmit: () => void
  onSearchClear: () => void
  appliedSearch: string
  sort: TicketSortField
  onSortChange: (sort: TicketSortField) => void
  order: SortOrder
  onOrderToggle: () => void
  onPageChange: (page: number) => void
  onSelectTicket: (ticketId: number) => void
}

export function MyTicketsListCard(props: MyTicketsListCardProps) {
  const { list } = props
  return (
    <Card
      title="我的工单"
      actions={list.phase === 'ready' ? <span className="text-xs text-slate-500">{`共 ${list.data.total} 条`}</span> : null}
    >
      <div className="mb-4 space-y-2.5">
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="状态">
            <select className="input-base" value={props.status} onChange={(event) => props.onStatusChange(event.currentTarget.value as TicketStatus | '')}>
              <option value="">全部状态</option>
              {TICKET_STATUSES.map((status) => (
                <option key={status} value={status}>{STATUS_LABELS[status]}</option>
              ))}
            </select>
          </Field>
          <Field label="排序">
            <select className="input-base" value={props.sort} onChange={(event) => props.onSortChange(event.currentTarget.value as TicketSortField)}>
              <option value="createdAt">创建时间</option>
              <option value="priority">优先级</option>
              <option value="status">状态</option>
              <option value="firstReplyAt">首次回复时间</option>
            </select>
          </Field>
          <div className="flex items-end">
            <button type="button" className="btn-secondary w-full" onClick={props.onOrderToggle}>
              {props.order === 'desc' ? '降序' : '升序'}
            </button>
          </div>
        </div>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); props.onSearchSubmit() }}>
          <input
            className="input-base"
            placeholder="搜索主题 / 描述 / 工单ID"
            value={props.searchDraft}
            onChange={(event) => props.onSearchDraftChange(event.currentTarget.value)}
          />
          <button type="submit" className="btn-secondary shrink-0">搜索</button>
          {props.appliedSearch !== '' && (
            <button type="button" className="btn-secondary shrink-0" onClick={props.onSearchClear}>清除</button>
          )}
        </form>
      </div>
      <DataState state={list} isEmpty={(result) => result.items.length === 0} empty="你还没有提交过工单，可在上方提交第一张工单">
        {(result) => (
          <ul className="divide-y divide-slate-100">
            {result.items.map((ticket) => (
              <li key={ticket.id}>
                <MineTicketRow ticket={ticket} onSelect={props.onSelectTicket} />
              </li>
            ))}
          </ul>
        )}
      </DataState>
      {list.phase === 'ready' && (
        <div className="mt-3 border-t border-slate-100">
          <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={props.onPageChange} />
        </div>
      )}
    </Card>
  )
}

function MineTicketRow(props: { ticket: Ticket; onSelect: (ticketId: number) => void }) {
  const { ticket } = props
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 py-2.5 text-left transition hover:bg-slate-50"
      onClick={() => props.onSelect(ticket.id)}
      title={ticket.subject}
    >
      <span className="w-14 shrink-0 text-xs font-medium text-slate-400">#{ticket.id}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{ticket.subject}</span>
      <StatusBadge status={ticket.status} />
      <PriorityBadge priority={ticket.priority} />
      <CategoryChip category={ticket.category} />
      <span className="w-32 shrink-0 text-right text-xs text-slate-500">{formatDateTime(ticket.createdAt)}</span>
    </button>
  )
}
