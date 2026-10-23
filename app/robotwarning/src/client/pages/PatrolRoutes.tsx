import { useState, useEffect, useCallback } from 'react'
import { apiRequest, ApiRequestError } from '../platform/api-client'
import type { PatrolRoute, Waypoint } from '../../shared/types'

type View = 'list' | 'create' | 'edit' | 'detail'

export default function PatrolRoutes() {
  const [routes, setRoutes] = useState<PatrolRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('list')
  const [selected, setSelected] = useState<PatrolRoute | null>(null)
  const [formName, setFormName] = useState('')
  const [formWaypoints, setFormWaypoints] = useState<Waypoint[]>([{ name: '', lat: 0, lng: 0 }])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PatrolRoute | null>(null)

  const fetchRoutes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiRequest<{ items: PatrolRoute[] }>('/api/patrol-routes')
      setRoutes(data.items)
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : '获取路线列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRoutes() }, [fetchRoutes])

  function resetForm() {
    setFormName('')
    setFormWaypoints([{ name: '', lat: 0, lng: 0 }])
    setSuccess(null)
    setError(null)
  }

  function startCreate() {
    resetForm()
    setView('create')
  }

  function startEdit(route: PatrolRoute) {
    setFormName(route.name)
    setFormWaypoints(route.waypoints.map((w) => ({ ...w })))
    setSelected(route)
    setView('edit')
  }

  function showDetail(route: PatrolRoute) {
    setSelected(route)
    setView('detail')
  }

  function updateWaypoint(index: number, field: keyof Waypoint, value: string | number) {
    setFormWaypoints((prev) => prev.map((w, i) => i === index ? { ...w, [field]: value } : w))
  }

  function addWaypoint() {
    setFormWaypoints((prev) => [...prev, { name: '', lat: 0, lng: 0 }])
  }

  function removeWaypoint(index: number) {
    setFormWaypoints((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)
  }

  async function handleSubmit() {
    if (!formName.trim() || formWaypoints.length === 0) {
      setError('路线名称和路径点不能为空')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload = { name: formName.trim(), waypoints: formWaypoints }
      if (view === 'edit' && selected) {
        await apiRequest(`/api/patrol-routes/${selected.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        setSuccess('路线更新成功')
      } else {
        await apiRequest('/api/patrol-routes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        setSuccess('路线创建成功')
      }
      await fetchRoutes()
      setView('list')
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSubmitting(true)
    try {
      await apiRequest(`/api/patrol-routes/${deleteTarget.id}`, { method: 'DELETE' })
      await fetchRoutes()
      setDeleteTarget(null)
      if (view === 'detail' || view === 'edit') setView('list')
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : '删除失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-slate-500">加载中…</div>
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-800">巡逻路线配置</h2>
        {view === 'list' && (
          <button onClick={startCreate} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
            创建路线
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">×</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{success}</div>
      )}

      {view === 'list' && (
        routes.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p>暂无巡逻路线</p>
            <button onClick={startCreate} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              创建第一条路线
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 px-3">路线名称</th>
                <th className="py-2 px-3">路径点数</th>
                <th className="py-2 px-3">创建时间</th>
                <th className="py-2 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((route) => (
                <tr key={route.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-3 font-medium text-slate-700 cursor-pointer" onClick={() => showDetail(route)}>
                    {route.name}
                  </td>
                  <td className="py-2 px-3 text-slate-500">{route.waypoints.length}</td>
                  <td className="py-2 px-3 text-slate-500">{new Date(route.createdAt).toLocaleString('zh-CN')}</td>
                  <td className="py-2 px-3 text-right space-x-2">
                    <button onClick={() => startEdit(route)} className="text-blue-600 hover:underline">编辑</button>
                    <button onClick={() => setDeleteTarget(route)} className="text-red-500 hover:underline">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {(view === 'create' || view === 'edit') && (
        <div className="bg-white rounded border border-slate-200 p-6 max-w-2xl">
          <h3 className="text-lg font-medium mb-4">{view === 'create' ? '创建巡逻路线' : '编辑巡逻路线'}</h3>
          <div className="mb-4">
            <label className="block text-sm text-slate-600 mb-1">路线名称</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="如：厂区A栋巡逻线"
            />
          </div>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-slate-600">路径点</label>
              <button onClick={addWaypoint} className="text-sm text-blue-600 hover:underline">+ 添加路径点</button>
            </div>
            {formWaypoints.map((wp, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={wp.name}
                  onChange={(e) => updateWaypoint(i, 'name', e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm"
                  placeholder="位置名称"
                />
                <input
                  type="number"
                  value={wp.lat}
                  onChange={(e) => updateWaypoint(i, 'lat', parseFloat(e.target.value) || 0)}
                  className="w-28 px-3 py-1.5 border border-slate-300 rounded text-sm"
                  placeholder="纬度"
                  step="0.000001"
                />
                <input
                  type="number"
                  value={wp.lng}
                  onChange={(e) => updateWaypoint(i, 'lng', parseFloat(e.target.value) || 0)}
                  className="w-28 px-3 py-1.5 border border-slate-300 rounded text-sm"
                  placeholder="经度"
                  step="0.000001"
                />
                {formWaypoints.length > 1 && (
                  <button onClick={() => removeWaypoint(i)} className="text-red-400 hover:text-red-600 px-2">×</button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? '保存中…' : '保存'}
            </button>
            <button onClick={() => { setView('list'); resetForm() }} className="px-4 py-2 border border-slate-300 rounded text-sm text-slate-600 hover:bg-slate-50">
              取消
            </button>
          </div>
        </div>
      )}

      {view === 'detail' && selected && (
        <div className="bg-white rounded border border-slate-200 p-6 max-w-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">路线详情</h3>
            <button onClick={() => setView('list')} className="text-sm text-slate-500 hover:underline">返回列表</button>
          </div>
          <dl className="space-y-2 mb-4">
            <div><dt className="text-sm text-slate-500 inline">名称：</dt><dd className="inline font-medium">{selected.name}</dd></div>
            <div><dt className="text-sm text-slate-500 inline">创建时间：</dt><dd className="inline">{new Date(selected.createdAt).toLocaleString('zh-CN')}</dd></div>
          </dl>
          <h4 className="text-sm font-medium text-slate-600 mb-2">路径点</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-1 px-2">#</th>
                <th className="py-1 px-2">位置名称</th>
                <th className="py-1 px-2">纬度</th>
                <th className="py-1 px-2">经度</th>
              </tr>
            </thead>
            <tbody>
              {selected.waypoints.map((wp, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="py-1 px-2 text-slate-400">{i + 1}</td>
                  <td className="py-1 px-2">{wp.name}</td>
                  <td className="py-1 px-2">{wp.lat}</td>
                  <td className="py-1 px-2">{wp.lng}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex gap-2">
            <button onClick={() => startEdit(selected)} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">编辑</button>
            <button onClick={() => setDeleteTarget(selected)} className="px-4 py-2 border border-red-300 text-red-600 rounded text-sm hover:bg-red-50">删除</button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm">
            <h3 className="text-lg font-medium mb-2">确认删除</h3>
            <p className="text-sm text-slate-600 mb-4">确定要删除路线「{deleteTarget.name}」吗？此操作不可撤销。</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 border border-slate-300 rounded text-sm text-slate-600 hover:bg-slate-50">取消</button>
              <button onClick={handleDelete} disabled={submitting} className="px-4 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50">确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
