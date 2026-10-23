// 工单工作台页 — 待处理工单列表，支持筛选/搜索/排序/分页
import { useCallback, useEffect, useState } from 'react'
import { workbenchApi, categoriesApi } from '../api'
import type { Ticket, TicketCategory, WorkbenchParams } from '../types'
import {
  EmptyState,
  ErrorBanner,
  Loading,
  Pagination,
  PriorityBadge,
  SkeletonRows,
  SortSelect,
  StatusBadge,
  formatTime,
  useToast,
} from '../components'

export default function WorkbenchPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [categories, setCategories] = useState<TicketCategory[]>([])

  const [companyId, setCompanyId] = useState('')
  const [priority, setPriority] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('createdAt:desc')

  const [toast, showToast, toastView] = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: WorkbenchParams = {
        companyId: companyId || undefined,
        priority: priority || undefined,
        categoryId: categoryId || undefined,
        search: search || undefined,
        sort,
        page,
        pageSize,
      }
      const result = await workbenchApi.list(params)
      setTickets(result.items)
      setTotal(result.total)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载工作台工单失败')
    } finally {
      setLoading(false)
    }
  }, [companyId, priority, categoryId, search, sort, page, pageSize])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    categoriesApi
      .list()
      .then(setCategories)
      .catch(() => {})
  }, [])

  const resetFilters = () => {
    setCompanyId('')
    setPriority('')
    setCategoryId('')
    setSearch('')
    setSort('createdAt:desc')
    setPage(1)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>工单工作台</h1>
        <p>查看待处理工单列表，支持筛选、搜索和排序</p>
      </div>
      {toastView}
      <ErrorBanner error={error} onClose={() => setError('')} />

      <section className="card filter-bar">
        <div className="form-grid">
          <label>
            公司筛选
            <input
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.currentTarget.value)
                setPage(1)
              }}
              placeholder="公司 ID（留空不限）"
            />
          </label>
          <label>
            优先级
            <select
              value={priority}
              onChange={(e) => {
                setPriority(e.currentTarget.value)
                setPage(1)
              }}
            >
              <option value="">全部</option>
              <option value="P0">P0 紧急</option>
              <option value="P1">P1 高</option>
              <option value="P2">P2 中</option>
              <option value="P3">P3 低</option>
              <option value="P4">P4 最低</option>
            </select>
          </label>
          <label>
            分类
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.currentTarget.value)
                setPage(1)
              }}
            >
              <option value="">全部分类</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            关键词搜索
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.currentTarget.value)
                setPage(1)
              }}
              placeholder="搜索工单主题"
            />
          </label>
          <label>
            排序
            <SortSelect
              value={sort}
              onChange={(v) => {
                setSort(v)
                setPage(1)
              }}
            />
          </label>
          <button className="secondary" onClick={resetFilters}>
            重置筛选
          </button>
        </div>
      </section>

      <section className="card">
        {loading ? (
          <SkeletonRows />
        ) : tickets.length === 0 ? (
          <EmptyState message="暂无待处理工单" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>主题</th>
                  <th>状态</th>
                  <th>优先级</th>
                  <th>提交人</th>
                  <th>公司</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.subject}</strong>
                      <span className="subtext">
                        {t.categoryName ?? '—'}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td>
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td>
                      <strong>{t.submitterName}</strong>
                      <span className="subtext">{t.submitterEmail}</span>
                    </td>
                    <td>{t.submitterCompany}</td>
                    <td>{formatTime(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
      </section>
    </div>
  )
}
