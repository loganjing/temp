import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listBills, type BillListResult } from '../api'
import { formatDateTime, statusBadgeClass } from '../format'

const PAGE_SIZE = 20

interface BillFilters {
  billno: string
  picker: string
  pick_date: string
}

const EMPTY_FILTERS: BillFilters = { billno: '', picker: '', pick_date: '' }

export default function BillListPage() {
  const [draft, setDraft] = useState<BillFilters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<BillFilters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [reloadTick, setReloadTick] = useState(0)
  const [result, setResult] = useState<BillListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listBills({ ...applied, page, pageSize: PAGE_SIZE })
      .then((data) => {
        if (cancelled) return
        setResult(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '查询失败')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [applied, page, reloadTick])

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    setApplied({ ...draft })
  }

  const updateDraft = (field: keyof BillFilters, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }))
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">领用单列表</h1>
          <p className="page-subtitle">按领用单号、领用人、领用日期查询已保存的领用单。</p>
        </div>
        <Link to="/bills/new" className="btn btn-primary">新建领用单</Link>
      </div>

      <form className="card filter-bar" onSubmit={handleSearch}>
        <div className="filter-field">
          <label htmlFor="filter-billno">领用单号</label>
          <input
            id="filter-billno"
            type="text"
            value={draft.billno}
            placeholder="如 LY202610180001"
            onChange={(event) => updateDraft('billno', event.target.value)}
          />
        </div>
        <div className="filter-field">
          <label htmlFor="filter-picker">领用人</label>
          <input
            id="filter-picker"
            type="text"
            value={draft.picker}
            onChange={(event) => updateDraft('picker', event.target.value)}
          />
        </div>
        <div className="filter-field">
          <label htmlFor="filter-pick-date">领用日期</label>
          <input
            id="filter-pick-date"
            type="date"
            value={draft.pick_date}
            onChange={(event) => updateDraft('pick_date', event.target.value)}
          />
        </div>
        <div className="filter-actions">
          <button type="submit" className="btn btn-primary">查询</button>
        </div>
      </form>

      <div className="card table-card">
        {loading ? (
          <div className="table-state" role="status">加载中…</div>
        ) : error ? (
          <div className="table-state table-state-error" role="alert">
            <span>查询失败：{error}</span>
            <button type="button" className="btn btn-secondary" onClick={() => setReloadTick((tick) => tick + 1)}>
              重试
            </button>
          </div>
        ) : result && result.items.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">暂无领用单</p>
            <p className="empty-state-hint">没有符合条件的领用单，可新建第一张领用单。</p>
            <Link to="/bills/new" className="btn btn-primary">新建领用单</Link>
          </div>
        ) : result ? (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>领用单号</th>
                  <th>领用日期</th>
                  <th>领用人</th>
                  <th>领用部门</th>
                  <th>组织</th>
                  <th>单据状态</th>
                  <th>创建时间</th>
                  <th className="th-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={item.id}>
                    <td><Link className="link-billno" to={`/bills/${item.id}`}>{item.billno}</Link></td>
                    <td>{item.pickDate}</td>
                    <td>{item.picker}</td>
                    <td>{item.pickDept}</td>
                    <td>{item.org}</td>
                    <td><span className={statusBadgeClass(item.billstatus)}>{item.billstatus}</span></td>
                    <td>{formatDateTime(item.createtime)}</td>
                    <td className="td-actions">
                      <Link to={`/bills/${item.id}`}>详情</Link>
                      <Link to={`/bills/${item.id}/print`}>打印</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pagination">
              <button type="button" className="btn btn-secondary" disabled={result.page <= 1} onClick={() => setPage((current) => current - 1)}>
                上一页
              </button>
              <span className="pagination-info">
                第 {result.page} / {totalPages} 页 · 共 {result.total} 条
              </span>
              <button type="button" className="btn btn-secondary" disabled={result.page >= totalPages} onClick={() => setPage((current) => current + 1)}>
                下一页
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
