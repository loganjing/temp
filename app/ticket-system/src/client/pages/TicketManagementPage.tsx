/** 工单管理 — 创建工单表单 + 全部工单列表 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ticketApi } from '../platform/ticket-api'
import type { Ticket, Priority, SortField, SortOrder, Role } from '../types'
import {
  Skeleton, EmptyState, ErrorState, PriorityBadge, StatusBadge,
  Pagination, formatTime,
} from '../components'
import { PlusIcon, ChevronUpIcon, ChevronDownIcon, SearchIcon } from '../icons'

const priorities: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

interface Props {
  role: Role
  companyId: string
}

export default function TicketManagementPage({ role, companyId }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sort, setSort] = useState<SortField>('created_at')
  const [order, setOrder] = useState<SortOrder>('desc')

  const [showForm, setShowForm] = useState(false)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  const canCreate = role === 'submitter' || role === 'admin'

  const loadList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await ticketApi.list({
        companyId: role === 'admin' ? undefined : companyId,
        keyword: keyword || undefined,
        sort,
        order,
        page,
        pageSize,
      })
      setTickets(res.items)
      setTotal(res.total)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载工单列表失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, sort, order, page, pageSize, role, companyId])

  useEffect(() => { void loadList() }, [loadList])

  const toggleSort = (col: SortField) => {
    if (sort === col) setOrder(order === 'asc' ? 'desc' : 'asc')
    else { setSort(col); setOrder('desc') }
    setPage(1)
  }

  const sortIcon = (col: SortField) =>
    sort === col ? (order === 'asc' ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />) : null

  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    setKeyword(searchInput)
    setPage(1)
  }

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormBusy(true)
    setFormError('')
    setFormSuccess('')
    const form = e.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())
    try {
      await ticketApi.create({
        subject: String(data.subject),
        description: String(data.description),
        category: String(data.category),
        priority: String(data.priority) as Priority,
      })
      form.reset()
      setShowForm(false)
      setFormSuccess('工单创建成功')
      await loadList()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : '创建工单失败')
    } finally {
      setFormBusy(false)
    }
  }

  return (
    <div className="management-page">
      <div className="section-heading">
        <h2>工单管理</h2>
        {canCreate && (
          <button onClick={() => setShowForm(!showForm)}>
            <PlusIcon size={16} /> {showForm ? '收起表单' : '创建工单'}
          </button>
        )}
      </div>

      {formSuccess && <p role="status" className="success">{formSuccess}</p>}

      {showForm && canCreate && (
        <section className="card create-form-card">
          <h3>创建工单</h3>
          {formError && <p role="alert" className="error">{formError}</p>}
          <form className="form-grid" onSubmit={handleCreate}>
            <label className="full-row">主题
              <input name="subject" required maxLength={200} placeholder="简述问题" />
            </label>
            <label className="full-row">描述
              <textarea name="description" required rows={4} placeholder="详细描述问题" />
            </label>
            <label>分类
              <input name="category" required maxLength={100} placeholder="如：技术问题" />
            </label>
            <label>SLA 优先级
              <select name="priority" defaultValue="P2">
                {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <button type="submit" disabled={formBusy}>{formBusy ? '创建中…' : '提交工单'}</button>
          </form>
        </section>
      )}

      <section className="card">
        <div className="section-heading">
          <h3>全部工单 ({total})</h3>
          <form className="search-box" onSubmit={handleSearch}>
            <SearchIcon size={16} />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="搜索…" />
          </form>
        </div>
        {loading ? (
          <div className="table-scroll"><Skeleton className="skeleton-block" /></div>
        ) : error ? (
          <ErrorState message={error} onRetry={loadList} />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={<PlusIcon size={32} />}
            title="暂无工单"
            hint="创建第一个工单开始使用"
            action={canCreate ? <button onClick={() => setShowForm(true)}><PlusIcon size={16} /> 创建工单</button> : undefined}
          />
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>工单</th>
                    <th>优先级 <button className="sort-link" onClick={() => toggleSort('priority')}>{sortIcon('priority')}</button></th>
                    <th>状态 <button className="sort-link" onClick={() => toggleSort('status')}>{sortIcon('status')}</button></th>
                    <th>提交人</th>
                    <th>分类</th>
                    <th>创建时间 <button className="sort-link" onClick={() => toggleSort('created_at')}>{sortIcon('created_at')}</button></th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id}>
                      <td><strong title={t.subject}>{t.subject}</strong></td>
                      <td><PriorityBadge priority={t.priority} /></td>
                      <td><StatusBadge status={t.status} /></td>
                      <td>{t.submitterName}</td>
                      <td>{t.category}</td>
                      <td className="subtext">{formatTime(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
          </>
        )}
      </section>
    </div>
  )
}
