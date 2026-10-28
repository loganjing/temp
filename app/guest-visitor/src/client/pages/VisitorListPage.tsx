import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { VisitorStatus, VisitorListItem } from '../../shared/visitor-types'
import { fetchVisitors } from '../api/visitors'
import VisitorCard from '../components/VisitorCard'

const TABS: { key: VisitorStatus; label: string }[] = [
  { key: 'pending', label: '待审批' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已驳回' },
]

const PAGE_LIMIT = 20

export default function VisitorListPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<VisitorStatus>('pending')
  const [items, setItems] = useState<VisitorListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestIdRef = useRef(0)

  useEffect(() => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    setItems([])
    setPage(1)
    fetchVisitors({ status: activeTab, page: 1, limit: PAGE_LIMIT })
      .then((res) => {
        if (reqId !== requestIdRef.current) return
        setItems(res.items)
        setTotal(res.total)
      })
      .catch((err) => {
        if (reqId !== requestIdRef.current) return
        setError(err instanceof Error ? err.message : '加载失败')
      })
      .finally(() => {
        if (reqId !== requestIdRef.current) return
        setLoading(false)
      })
  }, [activeTab])

  const hasMore = items.length < total

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return
    const nextPage = page + 1
    const reqId = requestIdRef.current
    setLoadingMore(true)
    fetchVisitors({ status: activeTab, page: nextPage, limit: PAGE_LIMIT })
      .then((res) => {
        if (reqId !== requestIdRef.current) return
        setItems((prev) => [...prev, ...res.items])
        setPage(nextPage)
      })
      .catch((err) => {
        if (reqId !== requestIdRef.current) return
        setError(err instanceof Error ? err.message : '加载更多失败')
      })
      .finally(() => {
        if (reqId !== requestIdRef.current) return
        setLoadingMore(false)
      })
  }, [activeTab, page, loadingMore, hasMore])

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white">
        <h1 className="px-4 py-3 text-center text-base font-semibold text-neutral-900">访客审批</h1>
        <nav className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 border-b-2 py-2.5 text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-3 p-3">
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg border border-neutral-200 bg-white p-3.5">
                <div className="flex justify-between">
                  <div className="space-y-2">
                    <div className="h-4 w-24 rounded bg-neutral-200" />
                    <div className="h-3 w-32 rounded bg-neutral-100" />
                  </div>
                  <div className="h-5 w-14 rounded-full bg-neutral-100" />
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="h-3 w-40 rounded bg-neutral-100" />
                  <div className="h-3 w-48 rounded bg-neutral-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-400">
            暂无{activeTab === 'pending' ? '待审批' : activeTab === 'approved' ? '已通过' : '已驳回'}申请
          </div>
        )}

        {!loading && !error && items.map((visitor) => (
          <VisitorCard key={visitor.id} visitor={visitor} onClick={() => navigate(`/visitors/${visitor.id}`)} />
        ))}

        {!loading && !error && hasMore && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            {loadingMore ? '加载中…' : '加载更多'}
          </button>
        )}
      </main>
    </div>
  )
}
