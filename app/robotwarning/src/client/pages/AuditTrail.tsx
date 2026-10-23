import { useState, useEffect, useCallback } from 'react'
import { apiRequest, ApiRequestError } from '../platform/api-client'
import type { AuditTrailItem } from '../../shared/types'

const EVENT_TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'video_event_detected', label: '视频事件识别' },
  { value: 'alert_created', label: '告警生成' },
  { value: 'alert_handled', label: '告警处置' },
]

export default function AuditTrail() {
  const [items, setItems] = useState<AuditTrailItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [eventType, setEventType] = useState('')
  const [selected, setSelected] = useState<AuditTrailItem | null>(null)

  const fetchTrail = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (startTime) params.set('startTime', new Date(startTime).toISOString())
      if (endTime) params.set('endTime', new Date(endTime + 'T23:59:59').toISOString())
      if (eventType) params.set('eventType', eventType)
      const query = params.toString()
      const data = await apiRequest<{ items: AuditTrailItem[] }>(`/api/audit-trail${query ? `?${query}` : ''}`)
      setItems(data.items)
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : '查询留痕记录失败')
    } finally {
      setLoading(false)
    }
  }, [startTime, endTime, eventType])

  useEffect(() => { fetchTrail() }, [fetchTrail])

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-xl font-semibold text-slate-800 mb-6">事件留痕</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400">×</button>
        </div>
      )}

      {/* Filter form */}
      <div className="bg-white rounded border border-slate-200 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">起始日期</label>
          <input type="date" value={startTime} onChange={(e) => setStartTime(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">截止日期</label>
          <input type="date" value={endTime} onChange={(e) => setEndTime(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">事件类型</label>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded text-sm">
            {EVENT_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <button onClick={fetchTrail}
          className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
          查询
        </button>
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-center py-8 text-slate-400">查询中…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-slate-400">暂无留痕记录</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 px-3">事件类型</th>
              <th className="py-2 px-3">时间戳</th>
              <th className="py-2 px-3">关联实体</th>
              <th className="py-2 px-3">摘要</th>
              <th className="py-2 px-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 px-3">
                  <span className="inline-block px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-600">
                    {item.eventType}
                  </span>
                </td>
                <td className="py-2 px-3 text-slate-500">{new Date(item.timestamp).toLocaleString('zh-CN')}</td>
                <td className="py-2 px-3 font-mono text-xs text-slate-400">{item.entityId ?? '—'}</td>
                <td className="py-2 px-3 text-slate-600">{item.summary}</td>
                <td className="py-2 px-3 text-right">
                  <button onClick={() => setSelected(item)} className="text-blue-600 hover:underline text-xs">详情</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Detail dialog */}
      {selected && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">留痕详情</h3>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">×</button>
            </div>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-slate-400 inline">ID：</dt><dd className="inline font-mono text-xs">{selected.id}</dd></div>
              <div><dt className="text-slate-400 inline">事件类型：</dt><dd className="inline">{selected.eventType}</dd></div>
              <div><dt className="text-slate-400 inline">时间戳：</dt><dd className="inline">{new Date(selected.timestamp).toLocaleString('zh-CN')}</dd></div>
              <div><dt className="text-slate-400 inline">关联实体：</dt><dd className="inline font-mono text-xs">{selected.entityId ?? '—'}</dd></div>
              <div><dt className="text-slate-400 inline">摘要：</dt><dd className="inline">{selected.summary}</dd></div>
            </dl>
            <div className="mt-4">
              <dt className="text-slate-400 text-sm mb-1">详细信息</dt>
              <pre className="bg-slate-50 rounded p-3 text-xs overflow-auto max-h-48">
                {JSON.stringify(selected.details, null, 2)}
              </pre>
            </div>
            <p className="mt-4 text-xs text-slate-400">留痕记录不可修改或删除，保证审计完整性。</p>
          </div>
        </div>
      )}
    </div>
  )
}
