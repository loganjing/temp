import { useState, useEffect, useCallback } from 'react'
import { apiRequest, ApiRequestError } from '../platform/api-client'
import type { AlertListItem, AlertDetail } from '../../shared/types'
import { useWebSocket, type AlertNewData } from '../hooks/useWebSocket'

const STATUS_LABELS: Record<string, string> = { pending: '未处置', handled: '已处置' }
const STATUS_CLASSES: Record<string, string> = { pending: 'bg-amber-50 text-amber-700 border-amber-200', handled: 'bg-green-50 text-green-700 border-green-200' }

export default function AlertWorkbench() {
  const [alerts, setAlerts] = useState<AlertListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AlertDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [filter, setFilter] = useState<'pending' | 'handled' | ''>('')
  const [showHandleForm, setShowHandleForm] = useState(false)
  const [handlerName, setHandlerName] = useState('')
  const [handlingResult, setHandlingResult] = useState('')
  const [handlingNote, setHandlingNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const path = filter ? `/api/alerts?status=${filter}` : '/api/alerts'
      const data = await apiRequest<{ items: AlertListItem[] }>(path)
      setAlerts(data.items)
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : '获取告警列表失败')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  const pendingCount = alerts.filter((a) => a.status === 'pending').length

  const onAlertNew = useCallback((data: AlertNewData) => {
    setAlerts((prev) => {
      if (prev.some((a) => a.id === data.id)) return prev
      const newItem: AlertListItem = {
        id: data.id, eventId: data.eventId, alertTime: data.alertTime, status: 'pending',
        eventType: data.eventType, location: data.location, routeName: data.routeName,
        handlerName: null, handledAt: null,
      }
      return [newItem, ...prev]
    })
  }, [])

  const { connected } = useWebSocket(onAlertNew)

  async function fetchDetail(id: string) {
    setDetailLoading(true)
    setSelectedId(id)
    setShowHandleForm(false)
    try {
      const data = await apiRequest<AlertDetail>(`/api/alerts/${id}`)
      setDetail(data)
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : '获取告警详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleAlert() {
    if (!detail || !handlerName.trim() || !handlingResult.trim() || !handlingNote.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await apiRequest(`/api/alerts/${detail.id}/handle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handlerName: handlerName.trim(), handlingResult: handlingResult.trim(), handlingNote: handlingNote.trim() }),
      })
      setSuccess('告警处置成功')
      await fetchAlerts()
      await fetchDetail(detail.id)
      setHandlerName('')
      setHandlingResult('')
      setHandlingNote('')
      setShowHandleForm(false)
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : '处置失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-800">告警处置</h2>
          <span className={`px-2 py-0.5 text-xs rounded-full border ${connected ? 'bg-green-50 text-green-600 border-green-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
            {connected ? 'WS 已连接' : 'WS 断开'}
          </span>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">{pendingCount} 条未处置</span>
          )}
        </div>
        <div className="flex gap-1">
          {[['', '全部'], ['pending', '未处置'], ['handled', '已处置']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val as '' | 'pending' | 'handled')}
              className={`px-3 py-1 text-xs rounded ${filter === val ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400">×</button>
        </div>
      )}
      {success && (
        <div className="mx-6 mt-3 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{success}</div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Alert list */}
        <div className="w-2/5 overflow-auto border-r border-slate-200">
          {loading ? (
            <div className="p-8 text-center text-slate-400">加载中…</div>
          ) : alerts.length === 0 ? (
            <div className="p-8 text-center text-slate-400">暂无告警</div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                onClick={() => fetchDetail(alert.id)}
                className={`p-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${selectedId === alert.id ? 'bg-blue-50' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{alert.eventType}</span>
                  <span className={`px-2 py-0.5 text-xs rounded border ${STATUS_CLASSES[alert.status]}`}>
                    {STATUS_LABELS[alert.status]}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1">{alert.location} · {alert.routeName}</div>
                <div className="text-xs text-slate-400 mt-0.5">{new Date(alert.alertTime).toLocaleString('zh-CN')}</div>
              </div>
            ))
          )}
        </div>

        {/* Alert detail */}
        <div className="flex-1 overflow-auto p-6">
          {!detail && !detailLoading && <div className="text-center text-slate-400 py-16">请从左侧选择一条告警</div>}
          {detailLoading && <div className="text-center text-slate-400 py-16">加载中…</div>}
          {detail && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-800">告警详情</h3>
                <span className={`px-2 py-0.5 text-xs rounded border ${STATUS_CLASSES[detail.status]}`}>
                  {STATUS_LABELS[detail.status]}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-3 mb-6 text-sm">
                <div><dt className="text-slate-400">告警时间</dt><dd>{new Date(detail.alertTime).toLocaleString('zh-CN')}</dd></div>
                <div><dt className="text-slate-400">路线</dt><dd>{detail.routeName}</dd></div>
                <div><dt className="text-slate-400">事件类型</dt><dd>{detail.event.eventType}</dd></div>
                <div><dt className="text-slate-400">位置</dt><dd>{detail.event.location}</dd></div>
                <div><dt className="text-slate-400">发生时间</dt><dd>{new Date(detail.event.occurredAt).toLocaleString('zh-CN')}</dd></div>
                <div><dt className="text-slate-400">视频片段</dt><dd className="font-mono text-xs">{detail.event.videoSegmentRef ?? '—'}</dd></div>
              </dl>

              {detail.status === 'handled' && (
                <div className="bg-slate-50 rounded p-4 text-sm space-y-1">
                  <div><span className="text-slate-400">处置人：</span>{detail.handlerName}</div>
                  <div><span className="text-slate-400">处置结果：</span>{detail.handlingResult}</div>
                  <div><span className="text-slate-400">处置说明：</span>{detail.handlingNote}</div>
                  <div><span className="text-slate-400">处置时间：</span>{detail.handledAt ? new Date(detail.handledAt).toLocaleString('zh-CN') : '—'}</div>
                </div>
              )}

              {detail.status === 'pending' && !showHandleForm && (
                <button
                  onClick={() => setShowHandleForm(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  处置告警
                </button>
              )}

              {detail.status === 'pending' && showHandleForm && (
                <div className="bg-white border border-slate-200 rounded p-4 space-y-3">
                  <h4 className="font-medium text-slate-700">告警处置</h4>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">处置人姓名</label>
                    <input value={handlerName} onChange={(e) => setHandlerName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" placeholder="处置人" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">处置结果</label>
                    <select value={handlingResult} onChange={(e) => setHandlingResult(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm">
                      <option value="">请选择</option>
                      <option value="resolved">已解决</option>
                      <option value="escalated">已上报</option>
                      <option value="false-alarm">误报</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">处置说明</label>
                    <textarea value={handlingNote} onChange={(e) => setHandlingNote(e.target.value)} rows={3}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm" placeholder="处置说明" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleAlert} disabled={submitting}
                      className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                      {submitting ? '提交中…' : '提交处置'}
                    </button>
                    <button onClick={() => setShowHandleForm(false)}
                      className="px-4 py-2 border border-slate-300 rounded text-sm text-slate-600">取消</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
