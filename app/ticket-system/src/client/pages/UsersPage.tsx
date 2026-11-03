import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { userApi, companyApi, type UserListItem, type Company, type Department } from '../platform/api-client'
import { Spinner, EmptyState, ErrorBanner, SectionCard } from '../components/ui'

export default function UsersPage() {
  const [users, setUsers] = useState<UserListItem[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [companyId, setCompanyId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await userApi.list({ search, page: 1, pageSize: 50 })
      setUsers(r.items); setTotal(r.total)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    void companyApi.list().then((r) => setCompanies(r.items)).catch(() => setCompanies([]))
  }, [])
  useEffect(() => {
    if (!companyId) { setDepartments([]); setDepartmentId(''); return }
    void companyApi.departments(companyId).then((r) => { setDepartments(r.items); setDepartmentId('') }).catch(() => setDepartments([]))
  }, [companyId])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!companyId || !departmentId) { setError('请选择公司与部门'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await userApi.create({
        name: form.name.trim(), email: form.email.trim(),
        phone: form.phone.trim() || undefined, password: form.password,
        companyId, departmentId,
      })
      setForm({ name: '', email: '', phone: '', password: '' })
      setMessage('用户已创建')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败')
    } finally { setBusy(false) }
  }

  return (
    <div className="detail-stack">
      <SectionCard title="添加用户">
        {error && <ErrorBanner message={error} />}
        {message && <p role="status" className="success">{message}</p>}
        <form className="form-grid" onSubmit={(e) => void submit(e)}>
          <label>姓名<input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required maxLength={200} /></label>
          <label>邮箱<input type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} required maxLength={320} /></label>
          <label>手机号（可选）<input type="tel" value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} /></label>
          <label>初始密码<input type="password" value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} minLength={12} required /></label>
          <label>公司<select value={companyId} onChange={(e) => setCompanyId(e.target.value)} required>
            <option value="">选择公司</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
          <label>部门<select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required disabled={!companyId}>
            <option value="">选择部门</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select></label>
          <button disabled={busy}>{busy ? '创建中…' : '创建用户'}</button>
        </form>
      </SectionCard>

      <SectionCard title={`用户列表（${total}）`} actions={
        <label className="search">搜索<input value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      }>
        {loading ? <Spinner /> : users.length === 0 ? <EmptyState message="暂无用户" /> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>用户</th><th>邮箱</th><th>手机号</th><th>部门</th></tr></thead>
              <tbody>{users.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td>{u.email}</td>
                  <td>{u.phone || '—'}</td>
                  <td>{u.departmentName ?? '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
