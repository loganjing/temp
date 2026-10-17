import { useCallback, useEffect, useState } from 'react'
import { api } from '../platform/api'
import type { AssignmentRule } from '../platform/contracts'
import { useApp } from '../app-context'

export default function RulesPage() {
  const { companyId, currentGroups } = useApp()

  const [rules, setRules] = useState<AssignmentRule[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState('')
  const [groupId, setGroupId] = useState('')

  const load = useCallback(() => {
    if (!companyId) return
    setError(null)
    api.assignmentRules(companyId)
      .then((result) => setRules(result.rules))
      .catch((cause: unknown) => {
        setRules([])
        setError(cause instanceof Error ? cause.message : '加载自动分配规则失败')
      })
  }, [companyId])

  useEffect(() => {
    setRules(null)
    setGroupId(currentGroups[0]?.id ?? '')
    load()
  }, [load, currentGroups])

  function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    if (!companyId || !category.trim() || !groupId) return
    setError(null)
    api.createAssignmentRule(companyId, category.trim(), groupId)
      .then(() => { setCategory(''); load() })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '新建规则失败'))
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-lg font-semibold">自动分配规则</h1>
      <p className="mt-1 text-sm text-slate-500">配置“问题分类 → 业务组”规则后，该公司新创建的该分类工单自动归属对应业务组并进入待处理。</p>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

      <form className="mt-4 flex flex-wrap gap-2" onSubmit={handleCreate}>
        <input
          className="w-56 rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="问题分类，如：网络故障"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
        >
          {currentGroups.map((group) => (
            <option key={group.id} value={group.id}>{group.name}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          disabled={!category.trim() || !groupId}
        >
          新建规则
        </button>
      </form>

      {rules === null && !error && <p className="mt-4 text-sm text-slate-400">加载中…</p>}
      {rules?.length === 0 && <p className="mt-4 text-sm text-slate-400">暂无规则</p>}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-600">
            <th className="py-2 pr-4 font-medium">问题分类</th>
            <th className="py-2 font-medium">自动分配业务组</th>
          </tr>
        </thead>
        <tbody>
          {rules?.map((rule) => (
            <tr key={rule.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{rule.category}</td>
              <td className="py-2">{rule.groupName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
