import { useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '../platform/api-client'
import TicketDetailPanel from '../components/TicketDetailPanel'
import { TicketRow } from '../components/TicketRow'
import { useAsyncData } from '../components/useAsyncData'
import {
  EmptyState,
  ErrorNotice,
  PageHeader,
  Pagination,
  PRIORITIES,
  SkeletonList,
  STATUS_META,
  SuccessNotice,
  buildQuery,
} from '../components/ui'
import type { Page, TicketDetail, TicketListItem } from '../types'

const PAGE_SIZE = 20

type SubmitForm = {
  subject: string
  description: string
  category: string
  priority: string
}

const EMPTY_FORM: SubmitForm = { subject: '', description: '', category: '', priority: '' }

/** 我的工单：提交表单（分类/优先级）+ 本人提交列表 + 详情查看、回复与满意度评价。 */
export default function MyTicketsPage() {
  const [form, setForm] = useState<SubmitForm>(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [notice, setNotice] = useState('')

  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const categories = useAsyncData<{ items: string[] }>(() => apiRequest('/api/categories'), [])
  const query = buildQuery({ mine: 'true', q: search, page, pageSize: PAGE_SIZE })
  const tickets = useAsyncData<Page<TicketListItem>>(() => apiRequest(`/api/tickets?${query}`), [query])

  const canSubmit =
    form.subject.trim().length > 0 &&
    form.description.trim().length > 0 &&
    form.category.trim().length > 0 &&
    form.priority !== ''

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setSubmitError('')
    setNotice('')
    try {
      const created = await apiRequest<TicketDetail>('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          subject: form.subject.trim(),
          description: form.description.trim(),
          category: form.category.trim(),
          priority: form.priority,
        }),
      })
      setNotice(
        `工单 ${created.ticket.ticketNo} 已提交，当前状态：${
          STATUS_META[created.ticket.status].label
        }${created.ticket.assignedGroupName ? `（已自动分配到 ${created.ticket.assignedGroupName}）` : ''}`,
      )
      setForm(EMPTY_FORM)
      setSelectedId(created.ticket.ticketId)
      tickets.reload()
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : '提交失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const items = tickets.data?.items ?? []

  return (
    <div>
      <PageHeader title="我的工单" description="提交新工单、跟踪处理进度，完成后可进行满意度评价。" />

      <section className="card mb-4 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">提交工单</h2>
        <form className="grid gap-3 lg:grid-cols-2" onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span className="label">主题（必填，最多 200 字）</span>
            <input
              className="input"
              maxLength={200}
              required
              value={form.subject}
              onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
              disabled={busy}
              placeholder="简要描述问题主题"
            />
          </label>
          <label className="field">
            <span className="label">分类（必填，最多 50 字，可选择已有分类或输入新分类）</span>
            <input
              className="input"
              list="my-ticket-categories"
              maxLength={50}
              required
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              disabled={busy}
              placeholder="如：账户登录"
            />
            <datalist id="my-ticket-categories">
              {(categories.data?.items ?? []).map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>
          <label className="field lg:col-span-2">
            <span className="label">描述（必填，最多 5000 字）</span>
            <textarea
              className="input"
              rows={4}
              maxLength={5000}
              required
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              disabled={busy}
              placeholder="详细描述问题现象、影响范围与期望结果"
            />
          </label>
          <div className="flex items-end gap-3">
            <label className="field">
              <span className="label">SLA 优先级（必填，P0–P4）</span>
              <select
                className="input"
                required
                value={form.priority}
                onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))}
                disabled={busy}
              >
                <option value="">请选择优先级</option>
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn" disabled={busy || !canSubmit}>
              {busy ? '提交中…' : '提交工单'}
            </button>
          </div>
        </form>
        {(submitError || notice) && (
          <div className="mt-3 space-y-2">
            {notice && <SuccessNotice>{notice}</SuccessNotice>}
            <ErrorNotice error={submitError} />
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="card flex min-w-0 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
            <h2 className="text-sm font-semibold text-slate-700">
              我提交的工单（{tickets.data?.total ?? 0}）
            </h2>
            <input
              type="search"
              className="input max-w-[14rem]"
              placeholder="搜索工单号 / 主题"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              aria-label="搜索我的工单"
            />
          </div>
          {tickets.loading ? (
            <SkeletonList rows={5} />
          ) : tickets.error ? (
            <div className="p-4">
              <ErrorNotice error={tickets.error} onRetry={tickets.reload} />
            </div>
          ) : items.length === 0 ? (
            <EmptyState title="还没有提交过工单" hint="使用上方表单提交第一张工单。" />
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((ticket) => (
                <TicketRow
                  key={ticket.ticketId}
                  ticket={ticket}
                  selected={selectedId === ticket.ticketId}
                  onSelect={() => setSelectedId(ticket.ticketId)}
                />
              ))}
            </div>
          )}
          {!tickets.loading && !tickets.error && (
            <Pagination
              page={tickets.data?.page ?? page}
              pageSize={tickets.data?.pageSize ?? PAGE_SIZE}
              total={tickets.data?.total ?? 0}
              onPage={setPage}
            />
          )}
        </section>

        <section className="min-w-0">
          {selectedId == null ? (
            <div className="card">
              <div className="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center">
                <p className="text-sm font-medium text-slate-600">选择左侧工单查看详情</p>
                <p className="text-xs text-slate-400">提交后可多轮回复；工单完成后可提交满意度评价。</p>
              </div>
            </div>
          ) : (
            <TicketDetailPanel ticketId={selectedId} onTicketChanged={() => tickets.reload()} />
          )}
        </section>
      </div>
    </div>
  )
}

