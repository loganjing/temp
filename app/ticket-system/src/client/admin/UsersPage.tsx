import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '../platform/api-client'
import { getCompanies } from '../platform/ticket-api'
import type { Company } from '../types'
import { useToast } from '../components/Toast'

type User = { id: string; name: string; email: string; phone: string | null; enabled: boolean; company_id: string | null }

export default function UsersPage({ onSetCompany, companies: propCompanies }: {
  onSetCompany?: (userId: string, companyId: string | null) => void
  companies?: Company[]
}) {
  const toast = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [companies, setCompanies] = useState<Company[]>(propCompanies ?? [])

  const load = useCallback(async () => {
    const result = await apiRequest<{ users: User[]; total: number }>(`/api/admin/users?search=${encodeURIComponent(search)}&limit=50&offset=${offset}`)
    setUsers(result.users)
    setTotal(result.total)
  }, [search, offset])

  useEffect(() => {
    if (!propCompanies) {
      void getCompanies().then((r) => setCompanies(r.companies)).catch(() => {})
    } else {
      setCompanies(propCompanies)
    }
  }, [propCompanies])

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : '加载失败 / Load failed')) }, [load])

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    try {
      await apiRequest('/api/admin/users', { method: 'POST', body: JSON.stringify(body) })
      form.reset()
      toast('用户已创建')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败 / Create failed')
    } finally {
      setBusy(false)
    }
  }

  const setEnabled = async (user: User) => {
    setError('')
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/status`, { method: 'PATCH', body: JSON.stringify({ enabled: !user.enabled }) })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新失败 / Update failed')
    }
  }

  const updateUser = async (event: FormEvent<HTMLFormElement>, user: User) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    setError('')
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body: JSON.stringify(body) })
      toast(`已更新 ${user.email}`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新失败 / Update failed')
    }
  }

  const resetPassword = async (event: FormEvent<HTMLFormElement>, user: User) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    setError('')
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/password`, { method: 'POST', body: JSON.stringify(body) })
      form.reset()
      toast(`已重置 ${user.email} 的密码`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重置失败 / Reset failed')
    }
  }

  const handleSetCompany = async (user: User, companyId: string) => {
    setError('')
    try {
      if (onSetCompany) {
        onSetCompany(user.id, companyId || null)
      } else {
        await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/company`, { method: 'PATCH', body: JSON.stringify({ company_id: companyId || null }) })
      }
      toast(`已设置 ${user.email} 的公司`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新失败 / Update failed')
    }
  }

  return (
    <div className="admin-grid" style={{ display: 'grid', gap: '1.5rem' }}>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>添加用户</h2>
        <form className="form-grid" onSubmit={(event) => void submitCreate(event)}>
          <label>姓名<input name="name" required maxLength={200} /></label>
          <label>邮箱<input name="email" type="email" required maxLength={320} /></label>
          <label>手机号（可选）<input name="phone" type="tel" /></label>
          <label>临时密码<input name="password" type="password" minLength={12} required /></label>
          <button disabled={busy}>创建</button>
        </form>
      </section>

      <section className="card">
        <div className="section-heading"><h2 style={{ margin: 0 }}>用户 ({total})</h2><label className="search">搜索<input value={search} onChange={(event) => { setSearch(event.currentTarget.value); setOffset(0) }} /></label></div>
        {message && <p role="status" className="success">{message}</p>}
        {error && <p role="alert" className="error">{error}</p>}
        <div className="table-scroll">
          <table>
            <thead><tr><th>用户</th><th>手机号</th><th>状态</th><th>公司</th><th>操作</th></tr></thead>
            <tbody>{users.map((user) => <tr key={user.id}>
              <td><strong title={user.name}>{user.name}</strong><span className="subtext" title={user.email}>{user.email}</span></td>
              <td title={user.phone ?? ''}>{user.phone || '—'}</td>
              <td>{user.enabled ? '启用' : '停用'}</td>
              <td>
                <select value={user.company_id ?? ''} onChange={(e) => void handleSetCompany(user, e.target.value)} style={{ minHeight: 32, fontSize: '0.8rem' }}>
                  <option value="">未分配</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </td>
              <td><div className="row-actions">
                <button className="secondary" onClick={() => void setEnabled(user)}>{user.enabled ? '停用' : '启用'}</button>
                <details><summary>编辑</summary><form className="reset-form" onSubmit={(event) => void updateUser(event, user)}>
                  <input aria-label="姓名" name="name" defaultValue={user.name} required maxLength={200} />
                  <input aria-label="邮箱" name="email" type="email" defaultValue={user.email} required maxLength={320} />
                  <input aria-label="手机号" name="phone" type="tel" defaultValue={user.phone ?? ''} />
                  <button className="secondary">保存</button>
                </form></details>
                <form className="reset-form" onSubmit={(event) => void resetPassword(event, user)}><input aria-label="新密码" name="password" type="password" minLength={12} placeholder="新密码" required /><button className="secondary">重置密码</button></form>
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="section-heading pagination"><span>{total === 0 ? '无用户' : `${offset + 1}–${Math.min(offset + users.length, total)} / ${total}`}</span><div className="row-actions"><button className="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(offset - 50, 0))}>上一页</button><button className="secondary" disabled={offset + users.length >= total} onClick={() => setOffset(offset + 50)}>下一页</button></div></div>
      </section>
    </div>
  )
}
