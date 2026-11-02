import { useEffect, useState } from 'react'
import { categoriesApi } from '../api/company'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States'
import { PlusIcon, RefreshIcon } from '../components/Icon'
import { formatDate } from '../lib/format'
import type { TicketCategory, UserInfo } from '../types'

export function CategoryManagementPage({ user }: { user: UserInfo }) {
  const companyId = user.companyId
  const [items, setItems] = useState<TicketCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await categoriesApi.list(companyId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载分类失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [companyId])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setMsg('')
    try {
      await categoriesApi.create(companyId, name.trim())
      setName('')
      setMsg('分类已创建')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建分类失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-800">新建分类</h2>
        <form onSubmit={create} className="space-y-3">
          <label className="text-xs text-slate-500">
            分类名称
            <input className="mt-1" value={name} maxLength={80} placeholder="如：账务问题" onChange={(e) => setName(e.target.value)} required />
          </label>
          {msg && <p className="text-xs text-emerald-600">{msg}</p>}
          <button disabled={busy} className="inline-flex items-center gap-1.5">
            <PlusIcon size={15} /> 创建分类
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">问题分类 ({items.length})</h2>
          <button type="button" className="secondary !min-h-0 !px-2.5 !py-1.5 inline-flex items-center gap-1.5" onClick={load}>
            <RefreshIcon size={14} /> 刷新
          </button>
        </div>
        {error && <ErrorState message={error} onRetry={load} />}
        {!error && loading ? (
          <SkeletonRows count={4} />
        ) : !error && items.length === 0 ? (
          <EmptyState title="暂无分类" description="创建第一个问题分类以用于工单标记和自动分配" />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr><th className="px-2 py-2">名称</th><th className="px-2 py-2">创建时间</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c) => (
                <tr key={c.id}>
                  <td className="px-2 py-2.5 font-medium text-slate-800">{c.name}</td>
                  <td className="px-2 py-2.5 text-slate-500">{formatDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
