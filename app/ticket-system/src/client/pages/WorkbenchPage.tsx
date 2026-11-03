import { useCallback, useEffect, useMemo, useState } from 'react'
import { workbenchApi, companyApi, type TicketListItem, type TicketStatus, type Priority, type Company, type CurrentUser } from '../platform/api-client'
import { StatusBadge, PriorityBadge, formatDate, Spinner, EmptyState, ErrorBanner, STATUS_VALUES, STATUS_LABELS, PRIORITIES } from '../components/ui'
import TicketDetailPage from './TicketDetailPage'

type Tab = { key: TicketStatus | ''; label: string }
const TABS: Tab[] = [
  { key: 'pending_processing', label: '待处理' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
  { key: '', label: '全部' },
]

const SORT_OPTIONS = [
  { value: 'created_at', label: '创建时间' },
  { value: 'priority', label: '优先级' },
  { value: 'status', label: '状态' },
]

export default function WorkbenchPage({ currentUser }: { currentUser: CurrentUser }) {
  const [tab, setTab] = useState<TicketStatus | ''>('pending_processing')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [category, setCategory] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('created_at')
  const [items, setItems] = useState<TicketListItem[]>([])
  const [total, setTotal] = useState(0)
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    void companyApi.list().then((r) => setCompanies(r.items)).catch(() => setCompanies([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await workbenchApi.list({ status: tab || undefined, priority: priority || undefined, category, companyId: companyId || undefined, search, sort })
      setItems(r.items); setTotal(r.total)
      if (!r.items.some((i) => i.id === selectedId)) setSelectedId(r.items[0]?.id ?? null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    } finally { setLoading(false) }
  }, [tab, priority, category, companyId, search, sort, selectedId])

  useEffect(() => { void load() }, [load])

  const resetFilters = () => { setPriority(''); setCategory(''); setCompanyId(''); setSearch(''); setSort('created_at') }

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId])

  return (
    <div className="split-layout">
      <section className="split-list card">
        <div className="filters">
          <div className="tab-row">
            {TABS.map((t) => (
              <button key={t.key} className={tab === t.key ? 'tab active' : 'tab secondary'} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>
          <div className="form-grid">
            <label>优先级<select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')}>
              <option value="">全部</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select></label>
            <label>分类<input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="按分类筛选" /></label>
            <label>公司<select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">当前公司</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
            <label>排序<select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></label>
            <label className="search">关键词搜索<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="主题/描述" /></label>
            <button className="secondary" onClick={resetFilters}>重置</button>
          </div>
        </div>
        {error && <ErrorBanner message={error} />}
        {loading ? <Spinner /> : items.length === 0 ? <EmptyState message="暂无工单" /> : (
          <ul className="ticket-list">
            {items.map((t) => (
              <li key={t.id} className={t.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(t.id)}>
                <div className="ticket-row">
                  <div className="ticket-subject"><PriorityBadge priority={t.priority} /><strong>{t.subject}</strong></div>
                  <div className="muted">{t.submitterName} · {STATUS_LABELS[t.status]} · {formatDate(t.createdAt)}</div>
                  <div className="muted">{t.category}{t.assigneeName ? ` · ${t.assigneeName}` : ''}</div>
                </div>
                <StatusBadge status={t.status} />
              </li>
            ))}
          </ul>
        )}
        <p className="muted list-foot">共 {total} 条</p>
      </section>
      <section className="split-detail">
        {selected ? <TicketDetailPage ticketId={selected.id} currentUser={currentUser} onUpdated={() => void load()} /> : <EmptyState message="请选择左侧工单查看详情" />}
      </section>
    </div>
  )
}
