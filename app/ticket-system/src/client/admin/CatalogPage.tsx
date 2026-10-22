import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { categoriesApi, companiesApi } from '../api/admin'
import { describeApiError } from '../api/errors'
import type { Category, Company, Department } from '../api/types'
import { EmptyState, Loading, Notice } from '../components/ui'

export default function CatalogPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [categoryName, setCategoryName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [departmentNames, setDepartmentNames] = useState<Record<number, string>>({})
  const [departments, setDepartments] = useState<Record<number, Department[]>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [categoryResult, companyResult] = await Promise.all([categoriesApi.list(), companiesApi.list()])
      setCategories(categoryResult.items)
      setCompanies(companyResult.items)
    } catch (cause) {
      setError(describeApiError(cause, '无法加载基础数据。'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const loadDepartments = async (companyId: number) => {
    try {
      const result = await companiesApi.departments(companyId)
      setDepartments((current) => ({ ...current, [companyId]: result.items }))
    } catch (cause) {
      setError(describeApiError(cause, '无法加载部门列表。'))
    }
  }

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await action()
      setFeedback(success)
      await load()
    } catch (cause) {
      setError(describeApiError(cause, '操作失败，请重试。'))
    } finally {
      setBusy(false)
    }
  }

  const createCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!categoryName.trim()) { setError('请填写分类名称。'); return }
    await run(async () => {
      await categoriesApi.create(categoryName.trim())
      setCategoryName('')
    }, '分类已创建。')
  }

  const createCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!companyName.trim()) { setError('请填写公司名称。'); return }
    await run(async () => {
      await companiesApi.create(companyName.trim())
      setCompanyName('')
    }, '公司已创建。')
  }

  const createDepartment = async (event: FormEvent<HTMLFormElement>, company: Company) => {
    event.preventDefault()
    const name = (departmentNames[company.id] ?? '').trim()
    if (!name) { setError('请填写部门名称。'); return }
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await companiesApi.createDepartment(company.id, name)
      setDepartmentNames((current) => ({ ...current, [company.id]: '' }))
      setFeedback('部门已创建。')
      await loadDepartments(company.id)
    } catch (cause) {
      setError(describeApiError(cause, '创建部门失败。'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="section-heading"><h2>分类管理</h2></div>
        {feedback && <Notice>{feedback}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {loading ? <Loading label="加载分类…" /> : (
          <div className="stack">
            <form className="inline-form" onSubmit={(event) => void createCategory(event)}>
              <label>新增分类<input value={categoryName} onChange={(event) => setCategoryName(event.currentTarget.value)} maxLength={200} required /></label>
              <button disabled={busy}>创建分类</button>
            </form>
            {categories.length === 0 ? <EmptyState>暂无分类，请先创建分类。</EmptyState> : (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>分类</th><th>标识</th></tr></thead>
                  <tbody>{categories.map((category) => <tr key={category.id}><td>{category.name}</td><td className="muted">#{category.id}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h3>公司与部门</h3>
        <form className="inline-form" onSubmit={(event) => void createCompany(event)}>
          <label>新增公司<input value={companyName} onChange={(event) => setCompanyName(event.currentTarget.value)} maxLength={200} required /></label>
          <button disabled={busy}>创建公司</button>
        </form>
        {companies.length === 0 ? <EmptyState>暂无公司。</EmptyState> : (
          <ul className="group-list">
            {companies.map((company) => (
              <li key={company.id} className="group-item">
                <div className="reply-head"><strong>{company.name}</strong><span className="muted">#{company.id}</span></div>
                <details onToggle={() => { if (!departments[company.id]) void loadDepartments(company.id) }}>
                  <summary>部门维护</summary>
                  <div className="stack">
                    {!departments[company.id] ? <Loading label="加载部门…" /> : departments[company.id].length === 0 ? <EmptyState>暂无部门。</EmptyState> : (
                      <div className="member-row">{departments[company.id].map((department) => <span key={department.id} className="chip">{department.name}</span>)}</div>
                    )}
                    <form className="inline-form" onSubmit={(event) => void createDepartment(event, company)}>
                      <label>新增部门<input value={departmentNames[company.id] ?? ''} onChange={(event) => setDepartmentNames({ ...departmentNames, [company.id]: event.currentTarget.value })} maxLength={200} required /></label>
                      <button className="secondary" disabled={busy}>创建部门</button>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}