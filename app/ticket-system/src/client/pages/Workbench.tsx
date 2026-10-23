import { useState } from 'react'
import { useWorkbenchTickets, defaultFilters, type WorkbenchFilters } from '../hooks/useTickets'
import type { CurrentUser } from '../api/ticket-api'
import TicketList from '../components/TicketList'
import TicketDetail from '../components/TicketDetail'
import { useTicketDetail } from '../hooks/useTickets'

interface Props {
  user: CurrentUser
}

export default function Workbench({ user }: Props) {
  const [filters, setFilters] = useState<WorkbenchFilters>(defaultFilters)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { items, total, loading, error, reload } = useWorkbenchTickets(filters)
  const { detail, loading: detailLoading, error: detailError, reload: reloadDetail } = useTicketDetail(selectedId)

  const updateFilter = (patch: Partial<WorkbenchFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch, page: 1 }))
  }

  const isAdmin = user.role === 'admin' || (user.roles?.includes('admin') ?? false)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: '1rem', alignItems: 'start' }}>
      {/* Left: List + Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <section className="card">
          <div className="section-heading" style={{ marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>工单工作台</h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{total} 条</span>
          </div>
          <div className="form-grid">
            <label className="search" style={{ gridColumn: '1 / -1' }}>
              搜索
              <input
                value={filters.search}
                onChange={(event) => updateFilter({ search: event.currentTarget.value })}
                placeholder="搜索主题/描述"
              />
            </label>
            <label>状态
              <select value={filters.status} onChange={(event) => updateFilter({ status: event.currentTarget.value })}>
                <option value="">全部</option>
                <option value="pending_assign">待分配</option>
                <option value="pending_handle">待处理</option>
                <option value="completed">完成</option>
                <option value="cancelled">已取消</option>
              </select>
            </label>
            <label>优先级
              <select value={filters.priority} onChange={(event) => updateFilter({ priority: event.currentTarget.value })}>
                <option value="">全部</option>
                {['P0', 'P1', 'P2', 'P3', 'P4'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>分类
              <input
                value={filters.category}
                onChange={(event) => updateFilter({ category: event.currentTarget.value })}
                placeholder="输入分类"
              />
            </label>
            <label>排序
              <select value={filters.sort} onChange={(event) => updateFilter({ sort: event.currentTarget.value as WorkbenchFilters['sort'] })}>
                <option value="created_desc">创建时间 ↓</option>
                <option value="created_asc">创建时间 ↑</option>
                <option value="priority">按优先级</option>
              </select>
            </label>
            {isAdmin && (
              <label>公司
                <input
                  value={filters.companyId}
                  onChange={(event) => updateFilter({ companyId: event.currentTarget.value })}
                  placeholder="公司 ID"
                />
              </label>
            )}
          </div>
          {error && <p className="error" style={{ marginTop: '0.5rem' }}>{error}</p>}
        </section>

        <TicketList
          items={items}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          total={total}
          page={filters.page}
          pageSize={filters.pageSize}
          onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
        />
      </div>

      {/* Right: Detail */}
      <div style={{ minHeight: '60vh' }}>
        {detailError && <p className="error">{detailError}</p>}
        {!selectedId && !detailLoading && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ color: 'var(--muted)' }}>选择左侧工单查看详情</p>
          </div>
        )}
        {selectedId && detailLoading && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ color: 'var(--muted)' }}>加载工单详情…</p>
          </div>
        )}
        {detail && !detailLoading && (
          <TicketDetail detail={detail} currentUser={user} onUpdated={reloadDetail} />
        )}
      </div>
    </div>
  )
}
