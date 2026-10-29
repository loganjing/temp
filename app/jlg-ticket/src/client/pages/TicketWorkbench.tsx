import { useState, useEffect, useCallback } from 'react'
import { ticketApi } from '../platform/api-client'
import type { TicketSummary } from '../types'
import {
  Skeleton, EmptyState, ErrorBanner, StatusBadge, PriorityBadge,
  PrimaryButton, TextInput, SelectInput, formatTime,
  STATUSES, STATUS_LABELS, PRIORITIES, PRIORITY_LABELS,
} from '../components/ui'
import TicketDetailPanel from './TicketDetailPanel'
import CreateTicketModal from './CreateTicketModal'

interface Filters {
  status: string
  slaPriority: string
  category: string
  q: string
}

export default function TicketWorkbench() {
  const [filters, setFilters] = useState<Filters>({ status: '', slaPriority: '', category: '', q: '' })
  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const loadTickets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await ticketApi.list(filters)
      setTickets(res.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载工单列表失败')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { loadTickets() }, [loadTickets])

  return (
    <div className="flex h-full">
      {/* Left panel: ticket list */}
      <div className="w-96 flex flex-col border-r border-gray-200 bg-white shrink-0">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">工单队列</h2>
            <PrimaryButton onClick={() => setShowCreate(true)}>创建工单</PrimaryButton>
          </div>
          <div className="space-y-2">
            <TextInput
              placeholder="搜索主题/描述..."
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
            <div className="flex gap-2">
              <SelectInput
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="">全部状态</option>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </SelectInput>
              <SelectInput
                value={filters.slaPriority}
                onChange={(e) => setFilters((f) => ({ ...f, slaPriority: e.target.value }))}
              >
                <option value="">全部优先级</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </SelectInput>
            </div>
            <TextInput
              placeholder="按分类筛选..."
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {loading ? (
            <Skeleton lines={5} />
          ) : error ? (
            <ErrorBanner message={error} onRetry={loadTickets} />
          ) : tickets.length === 0 ? (
            <EmptyState message="暂无工单" />
          ) : (
            tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  t.id === selectedId ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-900 line-clamp-1">{t.subject}</span>
                  <PriorityBadge priority={t.slaPriority} />
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <StatusBadge status={t.status} />
                  <span>{t.submitterName}</span>
                  <span>·</span>
                  <span>{t.currentGroupName ?? '未分配'}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">{formatTime(t.createdAt)}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel: ticket detail */}
      <div className="flex-1 overflow-auto bg-gray-50">
        {selectedId ? (
          <TicketDetailPanel ticketId={selectedId} onUpdated={loadTickets} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState message="选择左侧工单查看详情" />
          </div>
        )}
      </div>

      {showCreate && (
        <CreateTicketModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setSelectedId(id)
            setShowCreate(false)
            loadTickets()
          }}
        />
      )}
    </div>
  )
}
