import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { categoryApi, assignmentRuleApi } from '../api'
import type { AssignmentRule, Category, BusinessGroup } from '../types'
import { businessGroupApi } from '../api'
import { useToast } from '../hooks/useToast'
import { EmptyState, ErrorState, PageCard, Skeleton } from '../components/common'

export default function CategoriesPage() {
  const { notify } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [catName, setCatName] = useState('')
  const [ruleCategory, setRuleCategory] = useState('')
  const [ruleGroup, setRuleGroup] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [catResult, ruleResult, groupResult] = await Promise.all([
        categoryApi.list(),
        assignmentRuleApi.list(),
        businessGroupApi.list(),
      ])
      setCategories(catResult.items)
      setRules(ruleResult.items)
      setGroups(groupResult.items)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const createCategory = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!catName.trim()) return
    setBusy(true)
    setError('')
    try {
      await categoryApi.create(catName.trim())
      notify('分类已创建', 'success')
      setCatName('')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建分类失败')
    } finally {
      setBusy(false)
    }
  }

  const createRule = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!ruleCategory || !ruleGroup) return
    setBusy(true)
    setError('')
    try {
      await assignmentRuleApi.create({
        categoryId: ruleCategory,
        businessGroupId: ruleGroup,
      })
      notify('分配规则已创建', 'success')
      setRuleCategory('')
      setRuleGroup('')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建规则失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-grid">
      <PageCard title="创建分类">
        <form className="form-grid" onSubmit={createCategory}>
          <label>分类名称<input value={catName} onChange={(e) => setCatName(e.target.value)} required maxLength={100} /></label>
          <button disabled={busy}>{busy ? '创建中…' : '创建分类'}</button>
        </form>
      </PageCard>

      <PageCard title="分类列表">
        {loading ? <Skeleton lines={3} /> : categories.length === 0 ? <EmptyState message="暂无分类" /> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>ID</th><th>名称</th></tr></thead>
              <tbody>{categories.map((c) => <tr key={c.id}><td>{c.id}</td><td>{c.name}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </PageCard>

      <PageCard title="分配规则配置">
        <form className="form-grid" onSubmit={createRule}>
          <label>分类
            <select value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)} required defaultValue="">
              <option value="" disabled>选择分类…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>业务组
            <select value={ruleGroup} onChange={(e) => setRuleGroup(e.target.value)} required defaultValue="">
              <option value="" disabled>选择业务组…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <button disabled={busy || !ruleCategory || !ruleGroup}>{busy ? '创建中…' : '创建规则'}</button>
        </form>
      </PageCard>

      <PageCard title={`分配规则列表 (${rules.length})`}>
        {error && <ErrorState message={error} />}
        {loading ? <Skeleton lines={3} /> : rules.length === 0 ? <EmptyState message="暂无分配规则" /> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>分类</th><th>分配到业务组</th></tr></thead>
              <tbody>{rules.map((r) => <tr key={r.id}><td>{r.categoryName}</td><td>{r.businessGroupName}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </PageCard>
    </div>
  )
}
