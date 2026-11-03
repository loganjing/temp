import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { listCompanies, listGroups, listAssignmentRules, createAssignmentRule } from '../api/org-api'
import type { Company, BusinessGroup, AssignmentRule } from '../api/types'
import { Loading, EmptyState, ErrorState } from '../components/States'
import { ToastProvider, useToast } from '../components/Toast'
import { formatDateTime } from '../components/format'

function AssignmentRulesInner() {
  const toast = useToast()
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [category, setCategory] = useState('')
  const [groupId, setGroupId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void listCompanies().then((cs) => {
      setCompanies(cs)
      if (cs.length > 0) setSelectedCompanyId(cs[0].id)
    }).catch((cause) => setError(cause instanceof Error ? cause.message : '加载公司失败'))
  }, [])

  const load = useCallback(async () => {
    if (!selectedCompanyId) { setRules([]); setGroups([]); return }
    setLoading(true)
    setError('')
    try {
      const [gs, rs] = await Promise.all([
        listGroups(selectedCompanyId),
        listAssignmentRules(selectedCompanyId),
      ])
      setGroups(gs)
      setRules(rs)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载规则失败')
    } finally {
      setLoading(false)
    }
  }, [selectedCompanyId])

  useEffect(() => { void load() }, [load])

  const doCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedCompanyId || !category.trim() || !groupId) return
    setBusy(true)
    try {
      await createAssignmentRule(selectedCompanyId, category.trim(), groupId)
      setCategory('')
      setGroupId('')
      toast('success', '分配规则已创建')
      await load()
    } catch (cause) {
      toast('error', cause instanceof Error ? cause.message : '创建规则失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rules-page">
      <div className="filter-bar">
        <label className="filter-item">
          <span>公司</span>
          <select value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      <section className="card">
        <h3>新建分类分配规则</h3>
        <form className="inline-form" onSubmit={(e) => void doCreate(e)}>
          <label>分类<input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="问题分类" required maxLength={100} /></label>
          <label>目标业务组
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
              <option value="">选择业务组</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <button disabled={busy || !selectedCompanyId}>创建规则</button>
        </form>
      </section>

      <section className="card">
        <h3>已配置规则（{rules.length}）</h3>
        {loading ? <Loading /> : error ? <ErrorState message={error} /> : rules.length === 0 ? <EmptyState message="暂无分配规则" hint="配置后，新工单将按分类自动分配" /> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>分类</th><th>目标业务组</th><th>创建时间</th></tr></thead>
              <tbody>{rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.category}</td>
                  <td>{r.groupName}</td>
                  <td>{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default function AssignmentRulesPage() {
  return (
    <ToastProvider>
      <AssignmentRulesInner />
    </ToastProvider>
  )
}
