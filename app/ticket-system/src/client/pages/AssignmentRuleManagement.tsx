import { useState, type FormEvent } from 'react'
import { apiRequest } from '../platform/api-client'
import { useCategories } from '../hooks/useCategories'
import { useBusinessGroups } from '../hooks/useBusinessGroups'
import { useAssignmentRules } from '../hooks/useAssignmentRules'

export default function AssignmentRuleManagement() {
  const { categories, loading: catLoading, error: catError, refresh: refreshCategories } = useCategories()
  const { groups, loading: grpLoading, error: grpError } = useBusinessGroups()
  const { rules, loading: ruleLoading, error: ruleError, refresh: refreshRules } = useAssignmentRules()
  const [catFormError, setCatFormError] = useState('')
  const [ruleFormError, setRuleFormError] = useState('')
  const [catBusy, setCatBusy] = useState(false)
  const [ruleBusy, setRuleBusy] = useState(false)

  const handleCreateCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    setCatBusy(true)
    setCatFormError('')
    try {
      await apiRequest('/api/categories', { method: 'POST', body: JSON.stringify(body) })
      form.reset()
      await refreshCategories()
    } catch (cause) {
      setCatFormError(cause instanceof Error ? cause.message : '创建分类失败')
    } finally {
      setCatBusy(false)
    }
  }

  const handleCreateRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    setRuleBusy(true)
    setRuleFormError('')
    try {
      await apiRequest('/api/assignment-rules', { method: 'POST', body: JSON.stringify(body) })
      form.reset()
      await refreshRules()
    } catch (cause) {
      setRuleFormError(cause instanceof Error ? cause.message : '创建规则失败')
    } finally {
      setRuleBusy(false)
    }
  }

  return (
    <main className="shell">
      <div className="admin-page">
        {/* Create category */}
        <section className="card">
          <h2>创建分类</h2>
          <form className="form-grid" onSubmit={(e) => void handleCreateCategory(e)}>
            <label>分类名称<input name="name" required maxLength={200} /></label>
            <button disabled={catBusy}>{catBusy ? '创建中…' : '创建'}</button>
          </form>
          {catFormError && <p role="alert" className="error">{catFormError}</p>}
        </section>

        {/* Category list */}
        <section className="card">
          <div className="section-heading"><h2>分类列表 ({categories.length})</h2></div>
          {catLoading && <p className="subtext">加载中…</p>}
          {catError && <p className="error">{catError}</p>}
          {!catLoading && !catError && categories.length === 0 && <p className="subtext">暂无分类</p>}
          {categories.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead><tr><th>分类名称</th></tr></thead>
                <tbody>
                  {categories.map(c => <tr key={c.id}><td><strong>{c.name}</strong></td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Create assignment rule */}
        <section className="card">
          <h2>创建分配规则</h2>
          <form className="form-grid" onSubmit={(e) => void handleCreateRule(e)}>
            <label>分类
              <select name="categoryId" required defaultValue="">
                <option value="">— 选择分类 —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>目标业务组
              <select name="groupId" required defaultValue="">
                <option value="">— 选择业务组 —</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <button disabled={ruleBusy || grpLoading}>{ruleBusy ? '创建中…' : '创建规则'}</button>
          </form>
          {ruleFormError && <p role="alert" className="error">{ruleFormError}</p>}
          {grpError && <p className="error">{grpError}</p>}
        </section>

        {/* Rules list */}
        <section className="card">
          <div className="section-heading"><h2>分配规则列表 ({rules.length})</h2></div>
          {ruleLoading && <p className="subtext">加载中…</p>}
          {ruleError && <p className="error">{ruleError}</p>}
          {!ruleLoading && !ruleError && rules.length === 0 && <p className="subtext">暂无规则</p>}
          {rules.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead><tr><th>分类</th><th>目标业务组</th></tr></thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id}>
                      <td><strong>{r.categoryName}</strong></td>
                      <td>{r.groupName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
