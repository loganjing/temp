// 分配规则页 — 配置分类→业务组自动分配规则
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { assignmentRulesApi, categoriesApi, businessGroupsApi } from '../api'
import type { AssignmentRule, BusinessGroup, TicketCategory } from '../types'
import { ErrorBanner, EmptyState, Loading, useToast } from '../components'

export default function AssignmentRulesPage() {
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [categories, setCategories] = useState<TicketCategory[]>([])
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, showToast, toastView] = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [r, c, g] = await Promise.all([
        assignmentRulesApi.list(),
        categoriesApi.list(),
        businessGroupsApi.list(),
      ])
      setRules(r)
      setCategories(c)
      setGroups(g)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载分配规则失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())
    try {
      await assignmentRulesApi.create({
        categoryId: String(data.categoryId),
        groupId: String(data.groupId),
      })
      form.reset()
      showToast('分配规则已创建')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建分配规则失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>分配规则</h1>
        <p>配置分类到业务组的自动分配规则，工单创建后按分类自动匹配</p>
      </div>
      {toastView}
      <ErrorBanner error={error} onClose={() => setError('')} />

      {/* 创建规则 */}
      <section className="card">
        <h2>创建分配规则</h2>
        <form className="form-grid" onSubmit={handleCreate}>
          <label>
            问题分类
            <select name="categoryId" required>
              <option value="">请选择分类</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            业务组
            <select name="groupId" required>
              <option value="">请选择业务组</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy}>
            {busy ? '处理中…' : '创建规则'}
          </button>
        </form>
      </section>

      {/* 规则列表 */}
      <section className="card">
        <div className="section-heading">
          <h2>分配规则列表 ({rules.length})</h2>
        </div>
        {loading ? (
          <Loading />
        ) : rules.length === 0 ? (
          <EmptyState message="暂无分配规则" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>问题分类</th>
                  <th>分配到业务组</th>
                  <th>规则 ID</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.categoryName}</strong>
                    </td>
                    <td>{r.groupName}</td>
                    <td>
                      <span className="subtext">{r.id}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
