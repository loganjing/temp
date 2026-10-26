import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { companyApi, ApiRequestError } from '../platform/api'
import type { CategoryAssignmentRule } from '../../shared/types'

export default function AdminRules() {
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [selectedCompany, setSelectedCompany] = useState('')
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [rules, setRules] = useState<CategoryAssignmentRule[]>([])
  const [category, setCategory] = useState('')
  const [groupId, setGroupId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadCompanies = useCallback(async () => {
    try { const result = await companyApi.list(); setCompanies(result.items); if (result.items[0]) setSelectedCompany(result.items[0].id) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '加载失败') }
  }, [])

  useEffect(() => { void loadCompanies() }, [loadCompanies])

  const loadGroupsAndRules = useCallback(async () => {
    if (!selectedCompany) return
    try {
      const [groupsResult, rulesResult] = await Promise.all([
        companyApi.groups(selectedCompany),
        companyApi.rules(selectedCompany),
      ])
      setGroups(groupsResult.items.map((g) => ({ id: g.id, name: g.name })))
      setRules(rulesResult.items)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '加载失败') }
  }, [selectedCompany])

  useEffect(() => { void loadGroupsAndRules() }, [loadGroupsAndRules])

  const createRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(''); setMessage('')
    if (!selectedCompany || !category.trim() || !groupId) { setError('请填写完整'); return }
    try { await companyApi.createRule({ company_id: selectedCompany, category: category.trim(), group_id: groupId }); setCategory(''); setGroupId(''); setMessage('规则已创建'); await loadGroupsAndRules() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败') }
  }

  return (
    <section className="card">
      <h2>分类分配规则</h2>
      <div className="form-grid">
        <label>选择公司<select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
      </div>
      <form className="form-grid" style={{ marginTop: '1rem' }} onSubmit={(event) => void createRule(event)}>
        <label>分类名称<input value={category} onChange={(e) => setCategory(e.target.value)} required maxLength={100} placeholder="如：技术问题" /></label>
        <label>分配到业务组<select value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
          <option value="">选择业务组</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select></label>
        <button>创建规则</button>
      </form>
      {message && <p role="status" className="success">{message}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="table-scroll" style={{ marginTop: '1rem' }}>
        <table>
          <thead><tr><th>分类</th><th>分配到</th><th>创建时间</th></tr></thead>
          <tbody>{rules.map((r) => (
            <tr key={r.id}><td><strong>{r.category}</strong></td><td>{r.group_name}</td><td className="subtext">{new Date(r.created_at).toLocaleString('zh-CN')}</td></tr>
          ))}</tbody>
        </table>
        {rules.length === 0 && <p className="empty">暂无分配规则</p>}
      </div>
    </section>
  )
}
