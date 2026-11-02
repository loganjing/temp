import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { apiRequest, readList } from '../platform/api-client'
import { describeError } from '../platform/errors'
import { useApiResource } from '../platform/use-api'
import { useSession } from '../platform/session'
import { EmptyState, ErrorNotice, LoadingBlock, Pagination, PriorityBadge, RatingBadge, StatusBadge } from '../components/Feedback'
import { formatDateTime } from './format'
import TicketDetailPanel from './TicketDetailPanel'
import type { Category, TicketDetail, TicketListItem } from './types'
import { priorities, priorityLabels } from './types'

type TicketListResponse = { items: TicketListItem[]; total: number }
const pageSize = 20

export function MyTicketsPage() {
  const [page, setPage] = useState(1)
  const list = useApiResource<TicketListResponse>(`/api/tickets?page=${page}&pageSize=${pageSize}`)

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>我的工单</h1>
          <p className="page-hint">这里只显示你本人提交的工单，可随时新建并跟踪处理进度。</p>
        </div>
        <div className="row-actions">
          <button type="button" className="secondary" onClick={list.reload} disabled={list.loading}>刷新</button>
          <Link className="button-primary" to="/my-tickets/new">新建工单</Link>
        </div>
      </header>

      {list.error ? <ErrorNotice error={list.error} title="工单列表加载失败" onRetry={list.reload} /> : null}

      {list.loading && !list.data
        ? <LoadingBlock label="正在加载我的工单…" rows={5} />
        : !list.data || list.data.items.length === 0
          ? <EmptyState title="暂无工单" hint="你提交的工单会显示在这里。" action={<Link className="button-primary" to="/my-tickets/new">提交第一个工单</Link>} />
          : <>
            <div className="card table-card">
              <div className="table-scroll">
                <table className="ticket-table">
                  <thead>
                    <tr>
                      <th>工单 ID</th>
                      <th>主题</th>
                      <th>分类</th>
                      <th>优先级</th>
                      <th>状态</th>
                      <th>承接业务组</th>
                      <th>处理人</th>
                      <th>创建时间</th>
                      <th>满意度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.items.map((ticket) => (
                      <tr key={ticket.id}>
                        <td className="mono"><Link to={`/my-tickets/${encodeURIComponent(ticket.id)}`}>{ticket.id}</Link></td>
                        <td className="clip" title={ticket.title}><Link to={`/my-tickets/${encodeURIComponent(ticket.id)}`}>{ticket.title}</Link></td>
                        <td>{ticket.categoryName}</td>
                        <td><PriorityBadge priority={ticket.priority} /></td>
                        <td><StatusBadge status={ticket.status} /></td>
                        <td>{ticket.groupName ?? '—'}</td>
                        <td>{ticket.assigneeName ?? '—'}</td>
                        <td className="nowrap">{formatDateTime(ticket.createdAt)}</td>
                        <td>{ticket.status === 'completed' ? <RatingBadge score={ticket.satisfactionScore} /> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <Pagination page={page} pageSize={pageSize} total={list.data.total} onChange={setPage} />
          </>}
    </div>
  )
}

export function NewTicketPage() {
  const navigate = useNavigate()
  const categories = useApiResource<Category[] | { items: Category[] }>('/api/categories')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    setBusy(true)
    setError('')
    try {
      const created = await apiRequest<TicketDetail>('/api/tickets', { method: 'POST', body: JSON.stringify(body) })
      navigate(`/my-tickets/${encodeURIComponent(created.id)}`, { state: { created: true } })
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page page-narrow">
      <Link className="back-link" to="/my-tickets">← 返回我的工单</Link>
      <header className="page-header">
        <div>
          <h1>新建工单</h1>
          <p className="page-hint">工单 ID、提交人信息和创建时间由系统生成，提交后可立即读回。</p>
        </div>
      </header>

      <section className="card">
        {categories.error ? <ErrorNotice error={categories.error} title="问题分类加载失败" onRetry={categories.reload} /> : null}
        {categories.loading && !categories.data
          ? <LoadingBlock label="正在加载问题分类…" rows={3} />
          : <form className="stack" onSubmit={(event) => void submit(event)}>
            <label>主题
              <input name="title" required maxLength={200} placeholder="用一句话概括问题" />
            </label>
            <label>问题描述
              <textarea name="description" rows={6} required maxLength={5000} placeholder="说明问题现象、影响范围和期望结果" />
            </label>
            <div className="form-grid">
              <label>问题分类
                <select name="categoryId" required defaultValue="">
                  <option value="" disabled>请选择问题分类</option>
                  {readList(categories.data).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label>SLA 优先级
                <select name="priority" required defaultValue="P3">
                  {priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
                </select>
              </label>
            </div>
            {error && <p className="notice notice-error" role="alert">{error}</p>}
            <div className="form-actions">
              <Link className="button-secondary" to="/my-tickets">取消</Link>
              <button disabled={busy || categories.loading}>{busy ? '提交中…' : '提交工单'}</button>
            </div>
          </form>}
      </section>
    </div>
  )
}

export function MyTicketDetailPage() {
  const { ticketId } = useParams()
  const location = useLocation()
  const user = useSession()
  const created = Boolean((location.state as { created?: boolean } | null)?.created)

  if (!ticketId) return <EmptyState title="缺少工单编号" hint="请从我的工单列表打开工单。" />

  return (
    <div className="page">
      <Link className="back-link" to="/my-tickets">← 返回我的工单</Link>
      <TicketDetailPanel ticketId={ticketId} currentUser={user} initialNotice={created ? '工单已创建，以下是系统生成的工单 ID、提交人信息与当前状态。' : undefined} />
    </div>
  )
}
