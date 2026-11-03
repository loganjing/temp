import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '../platform/api-client'
import { LoadingView, ErrorView, Toast } from '../components/StateViews'
import type { RoutingRule, BusinessGroup } from '../types'

export function RoutingRulesPage() {
  const [rules, setRules] = useState<RoutingRule[]>([])
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [category, setCategory] = useState('')
  const [targetGroupId, setTargetGroupId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ruleResult, groupResult] = await Promise.all([
        apiRequest<RoutingRule[]>('/api/routing-rules'),
        apiRequest<BusinessGroup[]>('/api/business-groups'),
      ])
      setRules(ruleResult)
      setGroups(groupResult)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!category.trim() || !targetGroupId) return
    setBusy(true)
    setActionError('')
    setActionSuccess('')
    try {
      const rule = await apiRequest<RoutingRule>('/api/routing-rules', {
        method: 'POST',
        body: JSON.stringify({ category: category.trim(), targetGroupId }),
      })
      setRules([...rules, rule])
      setCategory('')
      setTargetGroupId('')
      setActionSuccess('路由规则已创建')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-container">
      <div className="page-header"><h1>路由规则管理</h1></div>

      <div className="card form-card">
        <h2>创建路由规则</h2>
        <form className="form-grid" onSubmit={(event) => void handleCreate(event)}>
          <label>问题分类<input value={category} onChange={(e) => setCategory(e.currentTarget.value)} maxLength={100} required placeholder="例如：网络故障" /></label>
          <label>目标业务组
            <select value={targetGroupId} onChange={(e) => setTargetGroupId(e.currentTarget.value)} required>
              <option value="">选择业务组…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <button disabled={busy || !category.trim() || !targetGroupId}>创建规则</button>
        </form>
        {groups.length === 0 && <p className="muted hint-text">提示：请先创建业务组，再配置路由规则。</p>}
      </div>

      <Toast message={actionError} type="error" />
      <Toast message={actionSuccess} />

      {loading ? <LoadingView /> :
       error ? <ErrorView message={error} onRetry={load} /> :
       rules.length === 0 ? (
         <div className="card"><p className="muted">暂无路由规则。</p></div>
       ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>分类</th><th>目标业务组</th></tr></thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td><strong>{rule.category}</strong></td>
                  <td>{rule.targetGroupName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
