import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { companiesApi, usersApi } from '../api/admin'
import { describeApiError } from '../api/errors'
import type { Company, Department, UserSummary } from '../api/types'
import { EmptyState, FieldError, Loading, Notice } from '../components/ui'

function useDepartments(companyId: string): Department[] {
  const [departments, setDepartments] = useState<Department[]>([])
  useEffect(() => {
    if (!companyId) {
      setDepartments([])
      return
    }
    let active = true
    companiesApi.departments(Number(companyId))
      .then((result) => { if (active) setDepartments(result.items) })
      .catch(() => { if (active) setDepartments([]) })
    return () => { active = false }
  }, [companyId])
  return departments
}

function UserCreateForm({ companies, onCreated }: { companies: Company[]; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const departments = useDepartments(companyId)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!email.trim() || !password || !displayName.trim()) { setError('请填写邮箱、初始密码与姓名。'); return }
    setBusy(true)
    try {
      await usersApi.create({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        companyId: companyId ? Number(companyId) : null,
        departmentId: departmentId ? Number(departmentId) : null,
      })
      setEmail(''); setPassword(''); setDisplayName(''); setCompanyId(''); setDepartmentId('')
      onCreated()
    } catch (cause) {
      setError(describeApiError(cause, '创建用户失败。'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={(event) => void submit(event)}>
      <h3>新增用户</h3>
      <div className="form-grid">
        <label>邮箱<input value={email} onChange={(event) => setEmail(event.currentTarget.value)} type="email" maxLength={320} required /></label>
        <label>初始密码<input value={password} onChange={(event) => setPassword(event.currentTarget.value)} type="password" autoComplete="new-password" required /></label>
        <label>姓名<input value={displayName} onChange={(event) => setDisplayName(event.currentTarget.value)} maxLength={200} required /></label>
        <label>所属公司<select value={companyId} onChange={(event) => { setCompanyId(event.currentTarget.value); setDepartmentId('') }}>
          <option value="">未关联</option>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select></label>
        <label>所属部门<select value={departmentId} onChange={(event) => setDepartmentId(event.currentTarget.value)} disabled={!companyId}>
          <option value="">未关联</option>
          {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select></label>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <button disabled={busy}>创建用户</button>
    </form>
  )
}

function UserEditForm({ user, companies, onSaved, onCancel }: { user: UserSummary; companies: Company[]; onSaved: () => void; onCancel: () => void }) {
  const [displayName, setDisplayName] = useState(user.profile.displayName)
  const [companyId, setCompanyId] = useState(user.profile.companyId ? String(user.profile.companyId) : '')
  const [departmentId, setDepartmentId] = useState(user.profile.departmentId ? String(user.profile.departmentId) : '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const departments = useDepartments(companyId)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!displayName.trim()) { setError('请填写姓名。'); return }
    setBusy(true)
    try {
      await usersApi.update(user.id, {
        displayName: displayName.trim(),
        companyId: companyId ? Number(companyId) : null,
        departmentId: departmentId ? Number(departmentId) : null,
      })
      onSaved()
    } catch (cause) {
      setError(describeApiError(cause, '更新用户失败。'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack edit-form" onSubmit={(event) => void submit(event)}>
      <label>姓名<input value={displayName} onChange={(event) => setDisplayName(event.currentTarget.value)} maxLength={200} required /></label>
      <label>所属公司<select value={companyId} onChange={(event) => { setCompanyId(event.currentTarget.value); setDepartmentId('') }}>
        <option value="">未关联</option>
        {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select></label>
      <label>所属部门<select value={departmentId} onChange={(event) => setDepartmentId(event.currentTarget.value)} disabled={!companyId}>
        <option value="">未关联</option>
        {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
      </select></label>
      {error && <FieldError>{error}</FieldError>}
      <div className="row-actions horizontal">
        <button disabled={busy}>保存</button>
        <button type="button" className="secondary" onClick={onCancel}>取消</button>
      </div>
    </form>
  )
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserSummary[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [userResult, companyResult] = await Promise.all([usersApi.list(), companiesApi.list()])
      setUsers(userResult.items)
      setCompanies(companyResult.items)
      setError('')
    } catch (cause) {
      setError(describeApiError(cause, '无法加载用户列表。'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const keyword = search.trim().toLowerCase()
  const visible = keyword
    ? users.filter((user) => user.profile.displayName.toLowerCase().includes(keyword) || user.email.toLowerCase().includes(keyword))
    : users

  const companyName = (id: number | null) => companies.find((company) => company.id === id)?.name ?? '未关联'

  const created = () => { setFeedback('用户已创建。'); void load() }
  const saved = () => { setFeedback('用户业务属性已更新。'); setEditingId(null); void load() }

  return (
    <div className="stack">
      <section className="card">
        <div className="section-heading"><h2>用户管理</h2>
          <label className="search">搜索<input value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="姓名或邮箱" /></label>
        </div>
        {feedback && <Notice>{feedback}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <UserCreateForm companies={companies} onCreated={created} />
      </section>

      <section className="card">
        <h3>用户列表（{visible.length}）</h3>
        {loading ? <Loading label="加载用户…" /> : visible.length === 0 ? <EmptyState>暂无用户。</EmptyState> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>用户</th><th>公司</th><th>部门</th><th>操作</th></tr></thead>
              <tbody>
                {visible.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.profile.displayName}</strong><span className="subtext">{user.email}</span></td>
                    <td>{companyName(user.profile.companyId)}</td>
                    <td>{user.profile.departmentId ?? '未关联'}</td>
                    <td>
                      {editingId === user.id
                        ? <UserEditForm user={user} companies={companies} onSaved={saved} onCancel={() => setEditingId(null)} />
                        : <button className="secondary" onClick={() => { setFeedback(''); setEditingId(user.id) }}>编辑业务属性</button>}
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